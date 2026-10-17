import type { OutletMatch } from "../../shared/components/index.ts"
import { rawParams } from "../../shared/components/outlet-nodes.ts"
import { BUILD_HEADER, FAILED_HEADER, KIND_PARAM, registeredQuery, STALE_PARAM } from "../../shared/protocol/index.ts"
import type { LoadedEntry } from "../../shared/router/create-router.ts"
import { loadChain } from "../../shared/router/load-chain.ts"
import { cachedMatches, defined, holds, remember, type CachePlan } from "../router/match-cache.ts"
import { defined as required } from "../../shared/errors/index.ts"
import { landedFailure, statusFailure, type StoreSnapshot } from "../router/store.ts"
import { framesOf, landFrames, type Landed, type Pending } from "./frames.ts"
import type { NavigateOptions, NavigatorDeps } from "./navigate.ts"
import { readSearch, type Location } from "../../shared/url/index.ts"
import { isChunkError } from "./reload.ts"
import type { Target } from "./target.ts"

// A navigation target that asks the server for data.
export type DataTarget = Extract<Target, { kind: "data" }>

// What came back for one navigation: frames to commit, a bare status to paint, or nothing to do.
// A status names the failed match when the server did (`flare-failed`), else the page paints it.
export type Arrival =
	| { kind: "landed"; landing: Landed; stale?: boolean }
	| { kind: "status"; status: number; failed?: string; landing: Landed }
	| { kind: "none" }

// One data request. `fill` asks for the stored page's `"stream"` values with `_flare=fill`, and its landing settles
// the `reuse` slots those holes left (dx/defer.md). `holes` hears that a landing ended with placeholders no frame
// settled, which only a stored body leaves.
export type Trip = {
	target: DataTarget
	options: NavigateOptions
	trigger: "initial" | "navigation" | "revalidation"
	signal: AbortSignal
	fill: boolean
	// A Back or Forward step: what the cache holds paints at once, whatever its age (B137).
	pop?: boolean
	reuse?: Pending | undefined
	holes?: ((pending: Pending) => void) | undefined
	// Hydrate's plan, already asked, so a page's shouldRefetch sees "initial" once (BUGS.md 139).
	planned?: CachePlan | undefined
}

// The route modules load in parallel with the data request. An aborted request and a network failure commit
// nothing. A missing chunk or a build mismatch is a guarded document load. A chunk error wins whichever of the
// two fails first. A trip a newer navigation aborted loads no document for either: its target is no longer where the
// user is going, and that navigation decides (BUGS.md 121).
export async function arrive(
	deps: NavigatorDeps,
	trip: Trip,
): Promise<{ chain: LoadedEntry[]; arrival: Arrival } | undefined> {
	const [chain, arrival] = await Promise.allSettled([loadChain(trip.target.match.chain), request(deps, trip)])
	if (chain.status === "rejected") {
		if (isChunkError(chain.reason) && !trip.signal.aborted) deps.reload(trip.target.url)
		return undefined
	}
	return arrival.status === "fulfilled" ? { chain: chain.value, arrival: arrival.value } : undefined
}

async function request(deps: NavigatorDeps, trip: Trip): Promise<Arrival> {
	const plan = planOf(deps, trip)
	// Every page and layout is fresh in the client cache, so the commit reads them all from it (dx/cache.md, B19). A Back
	// or Forward step does so with any match the cache holds, and one past its staleTime is `stale`: the step then
	// revalidates it in place (B137).
	if (plan.held && !trip.fill) return { kind: "landed", landing: { data: {}, heads: {} }, stale: !plan.fresh }
	const reused = trip.options.revalidate === true ? undefined : await deps.prefetched?.(trip.target.dataUrl)
	// A prefetch never ran its deferred functions, so a landing still holding a placeholder needs the enter request.
	if (reused !== undefined && !holds(reused.data)) return { kind: "landed", landing: reused }
	const response = await deps.fetch(dataUrl(trip, plan.stale), { signal: trip.signal })
	const build = response.headers.get(BUILD_HEADER) ?? ""
	if (build !== "" && deps.build !== "" && build !== deps.build) {
		if (!trip.signal.aborted) deps.reload(trip.target.url)
		return { kind: "none" }
	}
	// An input failure does not commit (dx/builder.md). Any other status paints the target's failure.
	if (response.status === 400) return { kind: "none" }
	if (response.status !== 200 || response.body === null) return failedAt(deps, trip, response)
	return land(deps, trip, response.body)
}

// A named failure's answer carries the frames of the matches above it, so those layouts paint their own data for this
// URL over the failure (plan 21 12.5, B132).
async function above(deps: NavigatorDeps, trip: Trip, response: Response): Promise<Landed | Arrival> {
	if (response.body === null || !(response.headers.get("content-type") ?? "").startsWith(NDJSON)) return none
	const landed = await land(deps, trip, response.body)
	return landed.kind === "landed" ? landed.landing : landed
}

const none: Landed = { data: {}, heads: {} }

const NDJSON = "application/x-ndjson"

// A failed root renders the document, which the client cannot swap in place: the URL loads as a document, and the
// server answers its minimal one (B77, BUGS.md 134). Any other failed match paints where the server says.
async function failedAt(deps: NavigatorDeps, trip: Trip, response: Response): Promise<Arrival> {
	const failed = response.headers.get(FAILED_HEADER) ?? undefined
	if (failed !== undefined && failed === trip.target.match.chain[0]?.id) {
		if (!trip.signal.aborted) deps.assign(trip.target.url)
		return { kind: "none" }
	}
	const landing = await above(deps, trip, response)
	if ("kind" in landing) return landing
	return failed === undefined
		? { kind: "status", status: response.status, landing }
		: { kind: "status", status: response.status, failed, landing }
}

// A body that fails to read or land, other than by the trip's own abort, would leave the user on the old page with no
// sign: it is logged and the target loads as a document instead, under the reload guard (BUGS.md 123).
async function land(deps: NavigatorDeps, trip: Trip, body: ReadableStream<Uint8Array>): Promise<Arrival> {
	const options = { dev: deps.dev, send: deps.send, holes: trip.holes, reuse: trip.reuse, signal: trip.signal }
	try {
		return { kind: "landed", landing: await landFrames(framesOf(body), options) }
	} catch (error) {
		if (trip.signal.aborted) throw error
		console.error("[flare] a client navigation failed; loading the page instead", error)
		deps.reload(trip.target.url)
		return { kind: "none" }
	}
}

// The cache's verdict for this trip: hydrate's, already asked, or a new plan.
function planOf(deps: NavigatorDeps, trip: Trip): CachePlan {
	if (trip.planned !== undefined) return trip.planned
	const current = deps.store.snapshot().location
	return deps.cache.plan({
		matches: cachedMatches(trip.target.match, trip.target.location),
		trigger: trip.trigger,
		revalidate: trip.options.revalidate === true,
		pop: trip.pop === true,
		current: { ...current, params: rawParams(deps.router, current.pathname) },
		next: { ...trip.target.location, params: defined(trip.target.match.params) },
	})
}

// The page ids the client holds fresh ride along as _flare_stale, so the server skips those loaders (B30). A fill
// asks for the same URL as its own kind.
function dataUrl(trip: Trip, stale: readonly string[]): string {
	const url = trip.fill ? trip.target.dataUrl.replace(`${KIND_PARAM}=data`, `${KIND_PARAM}=fill`) : trip.target.dataUrl
	if (stale.length === 0) return url
	return `${url}&${STALE_PARAM}=${encodeURIComponent(stale.join(" "))}`
}

// The values of the page on screen, through a same-URL revalidation that writes no history (dx/defer.md).
export function fillOptions(deps: NavigatorDeps): NavigateOptions & { to: string } {
	const here = deps.store.snapshot().location
	return { to: `${here.pathname}${here.search}${here.hash}`, revalidate: true, replace: true, scroll: false }
}

// Holes heard before the commit wait for it, so the fill revalidates the page the navigation landed, and only while
// that page is still on screen.
export function holeWatch(
	deps: NavigatorDeps,
	landed: Location,
	fill: (pending: Pending) => Promise<void>,
): { holes: (pending: Pending) => void; committed: () => void } {
	let held: Pending | undefined
	let committed = false
	const run = (pending: Pending): void => {
		if (sameUrl(deps.store.snapshot().location, landed)) void fill(pending)
	}
	return {
		holes: (pending) => {
			if (committed) run(pending)
			else held = pending
		},
		committed: () => {
			committed = true
			if (held !== undefined) run(held)
		},
	}
}

// The same page: pathname and search, whatever the hash.
export function sameUrl(left: Location, right: Location): boolean {
	return left.pathname === right.pathname && left.search === right.search
}

type Next = {
	target: DataTarget
	chain: readonly LoadedEntry[]
	arrival: Exclude<Arrival, { kind: "none" }>
	previous: StoreSnapshot
}

// The match a bare status failed at: the one the server named, else the page.
function failedIndex(matches: readonly OutletMatch[], failed: string | undefined): number {
	const named = matches.findIndex((match) => match.id === failed)
	return named === -1 ? matches.length - 1 : named
}

// A match the response sent nothing for keeps what the client holds: a page skipped as stale takes its cached
// data, head, and `v`, and any other match keeps the previous screen's (B30, B83). No `v` paints the raw records.
export function nextSnapshot(deps: NavigatorDeps, next: Next): StoreSnapshot {
	const params = defined(next.target.match.params)
	const search = readSearch(next.target.location.search)
	const landing: Landed = next.arrival.landing
	const cached = cachedMatches(next.target.match, next.target.location)
	const held = cached.map((match) => (match.route in landing.data ? undefined : deps.cache.read(match)))
	const earlier = (id: string) => next.previous.matches.findIndex((match) => match.id === id)
	const matches = next.chain.map((entry, index): OutletMatch => {
		const previous = next.previous.matches[earlier(entry.id)]
		const landed = entry.id in landing.data
		const data = landed ? landing.data[entry.id] : (held[index] ?? previous)?.data
		const kept = landed ? landing.preloaders?.[entry.id] : (held[index] ?? previous)?.preloader
		const values = (landed ? landing.values?.[entry.id] : held[index]?.values) ?? { params, search }
		return { id: entry.id, kind: entry.kind, module: entry.module, ...values, data, preloader: kept ?? {} }
	})
	const heads = next.chain.map(
		(entry, index) => landing.heads[entry.id] ?? held[index]?.head ?? next.previous.heads[earlier(entry.id)],
	)
	const snapshot: StoreSnapshot = { matches, heads, location: next.target.location }
	const failure =
		next.arrival.kind === "status"
			? statusFailure(next.arrival.status, failedIndex(matches, next.arrival.failed))
			: landedFailure(landing, matches)
	if (failure !== undefined) snapshot.failure = failure
	remember(deps.cache, cached, landing)
	return snapshot
}

// A fill commits its values onto the page as it is when they land: a shallow or hash move made meanwhile keeps its
// URL and the page's search, and the fill only settles the values (plan 21 3.11).
export function onPage(fill: boolean, next: StoreSnapshot, now: StoreSnapshot): StoreSnapshot {
	if (!fill || now.location.pathname !== next.location.pathname) return next
	// The same path is the same chain, so each match has its counterpart on screen.
	const matches = next.matches.map((match, index) => ({
		...match,
		search: required(now.matches[index], "the match on screen").search,
	}))
	return { ...next, location: now.location, matches }
}

// The snapshot a landing commits: the landing's own, laid onto the page as it is now when it is a fill.
export function committedSnapshot(
	deps: NavigatorDeps,
	fill: boolean,
	next: Parameters<typeof nextSnapshot>[1],
): StoreSnapshot {
	return onPage(fill, nextSnapshot(deps, next), deps.store.snapshot())
}

// A landing's query cache goes into the document's client when its navigation commits, never on arrival: a navigation
// that is aborted or superseded, and a prefetch nobody takes, leave the cache alone. TanStack's hydrate keeps a query
// the client holds newer data for (B134).
export function commitQueries(landing: Landed | undefined): void {
	if (landing?.queries !== undefined) registeredQuery()?.hydrate?.(landing.queries)
}
