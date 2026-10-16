import type { OutletMatch } from "../../shared/components/index.ts"
import { BUILD_HEADER, FAILED_HEADER, KIND_PARAM, STALE_PARAM } from "../../shared/protocol/index.ts"
import type { LoadedEntry } from "../../shared/router/create-router.ts"
import { loadChain } from "../../shared/router/load-chain.ts"
import { cachedMatches, defined, holds, remember, type CachePlan } from "../router/match-cache.ts"
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
	| { kind: "landed"; landing: Landed }
	| { kind: "status"; status: number; failed?: string }
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
	// Every page and layout is fresh in the client cache, so the commit reads them all from it (dx/cache.md, B19).
	if (plan.fresh && !trip.fill) return { kind: "landed", landing: { data: {}, heads: {} } }
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

// A failed root renders the document, which the client cannot swap in place: the URL loads as a document, and the
// server answers its minimal one (B77, BUGS.md 134). Any other failed match paints where the server says.
function failedAt(deps: NavigatorDeps, trip: Trip, response: Response): Arrival {
	const failed = response.headers.get(FAILED_HEADER) ?? undefined
	if (failed !== undefined && failed === trip.target.match.chain[0]?.id) {
		if (!trip.signal.aborted) deps.assign(trip.target.url)
		return { kind: "none" }
	}
	return failed === undefined
		? { kind: "status", status: response.status }
		: { kind: "status", status: response.status, failed }
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
		current: { ...current, params: {} },
		next: { ...trip.target.location, params: {} },
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
	const landing: Landed = next.arrival.kind === "landed" ? next.arrival.landing : { data: {}, heads: {} }
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
