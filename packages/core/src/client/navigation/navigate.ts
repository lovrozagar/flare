import { navigationRequests } from "./requests.ts"
import { flush } from "solid-js"
import type { DevErrorPayload } from "../../shared/errors/index.ts"
import type { Intercept } from "../../shared/route-builder/chain.ts"
import type { LoadedEntry, Router, ViewTransitionOptions } from "../../shared/router/create-router.ts"
import type { FlareHistory } from "../history/index.ts"
import type { Location } from "../../shared/url/index.ts"
import type { CachePlan, MatchCache } from "../router/match-cache.ts"
import { swappedDepth, type RouterStore, type StoreSnapshot } from "../router/store.ts"
import {
	runTransition,
	stepDirection,
	transitionInfo,
	transitionOption,
	type Direction,
} from "../view-transition/index.ts"
import { allowsNavigation, type Blockers } from "./blocker.ts"
import { inPlace, keepPosition, land, scrollFor } from "./steps.ts"
import { follow, leaveable, type Leaving } from "./leaving.ts"
import { endOf, type Landed, type Pending } from "./frames.ts"
import { closesOverlay, overlayFor, showOverlay, type Mode } from "./overlay.ts"
import type { NavigationState } from "./pending.ts"
import type { ScrollStore } from "./scroll.ts"
import {
	arrive,
	fillOptions,
	holeWatch,
	commitQueries,
	committedSnapshot,
	sameUrl,
	type Arrival,
	type DataTarget,
	type Trip,
} from "./request.ts"
import { hashAgain, resolveTarget, resolveUrl, type NavigateInput, type Target } from "./target.ts"

export type Landing = Landed

export type NavigateOptions = NavigateInput & {
	replace?: boolean | undefined
	revalidate?: boolean | undefined
	scroll?: boolean | undefined
	state?: unknown | undefined
	viewTransition?: boolean | ViewTransitionOptions | undefined
}

export type NavigatorDeps = {
	router: Router
	store: RouterStore
	history: FlareHistory
	scroll: ScrollStore
	blockers: Blockers
	navigation: NavigationState
	cache: MatchCache
	fetch: (url: string, init: RequestInit) => Promise<Response>
	origin: string
	assign: (href: string) => void
	reload: (href: string) => boolean
	build: string
	dev: boolean
	send?: ((payload: DevErrorPayload) => void) | undefined
	prefetched?: (dataUrl: string) => Promise<Landing | undefined> | undefined
	arrived?: ((location: DataTarget["location"]) => void) | undefined
}

type Trigger = "initial" | "navigation" | "revalidation"

// The redirects a navigation follows before it loads the last as a document, under the browser's own limit (3.10).
const MAX_REDIRECTS = 10

// `revalidate` refetches the page on screen in place, as `revalidate: true` does (B133). `visit` goes to a URL the
// server built, fresh with `revalidate`, as a server function's redirect after a mutation needs (plan 21 8.6).
export type Navigator = Leaving & {
	navigate: (options: NavigateOptions) => Promise<void>
	visit: (url: string, replace: boolean, revalidate?: boolean) => Promise<void>
	restore: (url: string, index: number) => Promise<void>
	fill: (pending: Pending) => Promise<void>
	refresh: (initial: CachePlan) => Promise<void>
	revalidate: () => Promise<void>
}

// Same-origin only. The DOM commits, then history is written; a revalidation of the current URL writes none. A new
// navigation aborts the previous one, and only the latest may commit (02-system). A restore is one popstate step: the
// browser already moved, so no blocker runs, nothing is written, the saved scroll comes back, and one that commits
// nothing loads its URL (stuck). Back onto an overlay's background clears it, with no fetch and no scroll.
// After a document load it began, the page is leaving (leaving.ts, BUGS.md 129).
export function createNavigator(given: NavigatorDeps): Navigator {
	const { deps, away, leaving, ...leave } = leaveable(given)
	const requests = navigationRequests()
	// The history index the screen shows, so a popstate step knows its view-transition direction.
	let at = deps.history.index()
	const context = () => ({ router: deps.router, origin: deps.origin, current: deps.store.snapshot().location })
	const go = async (target: Target, options: NavigateOptions, mode: Mode = {}): Promise<void> => {
		if (target.kind === "document") return void deps.assign(target.url)
		if (away(target)) return
		const snapshot = deps.store.snapshot()
		const pop = mode.pop === true
		if (target.kind !== "data")
			return void (at = stay(deps, target, { options, snapshot, pop, cancel: requests.cancel }) ?? at)
		const plan = planOf({ target, options, snapshot, mode: { ...mode, at }, here: barOf(deps.history) })
		const move = { current: snapshot.location, next: target.location, trigger: plan.trigger }
		if (!pop && !allowsNavigation(deps.blockers, deps.router, move)) return
		const controller = requests.start(plan.fill)
		// A stored landing's `"stream"` hole: once this page commits, one fill asks for its values.
		const watch = holeWatch(deps, target.location, (pending) => again({ fill: pending }))
		const trip = { ...plan, signal: controller.signal, reuse: mode.fill, holes: plan.fill ? undefined : watch.holes }
		const outcome = await travel(deps, plan, { trip, current: () => requests.latest(controller), leaving })
		// The target takes the entry this navigation would have taken: a push pushes it, and a replace or a Back or
		// Forward step, which the browser already took, replaces. A loop stops after MAX_REDIRECTS (plan 21 3.10).
		if (outcome.kind === "redirect") {
			const follows = (mode.redirects ?? 0) + 1
			if (follows > MAX_REDIRECTS) return void deps.assign(outcome.url)
			const next = { ...options, replace: pop || options.replace === true }
			return follow(deps, outcome.url, () => go(resolveUrl(outcome.url, context()), next, { redirects: follows }))
		}
		if (outcome.kind !== "committed") return
		requests.committed(controller)
		at = deps.history.index()
		watch.committed()
		if (outcome.stale) void again({}, { ...fillOptions(deps), viewTransition: false })
	}
	// The page on screen again, in place: a fill, hydrate's refresh, or a held Back step's, which does not animate (B137).
	const again = (mode: Mode, options = fillOptions(deps)) => go(resolveUrl(options.to, context()), options, mode)
	return {
		fill: (pending) => again({ fill: pending }),
		refresh: (initial) => again({ initial }),
		revalidate: () => again({}),
		...leave,
		navigate: (options) => go(userTarget(deps, resolveTarget(options, context()), options.revalidate), options),
		visit: (url, replace, revalidate = false) =>
			go(userTarget(deps, resolveUrl(url, context()), revalidate), { to: url, replace, revalidate }),
		restore: async (url, index) => {
			const closed = closesOverlay(deps.store.snapshot(), url)
			if (closed !== undefined) {
				at = index
				return void deps.store.commit(closed)
			}
			const mode = { pop: true, overlay: deps.history.interceptedAt(index), index }
			return go(resolveUrl(url, context()), { to: url }, mode)
		},
	}
}

// A hash or shallow move that goes ahead is the latest navigation: the pending request is aborted (BUGS.md 311).
function stay(
	deps: NavigatorDeps,
	target: Parameters<typeof inPlace>[1],
	step: Parameters<typeof inPlace>[2] & { cancel: () => void },
): number | undefined {
	const moved = inPlace(deps, target, step)
	if (moved !== undefined) step.cancel()
	return moved
}

// A Link's, navigate()'s, or an anchor's target: the page on screen at a hash goes to its target again (BUGS.md 148).
function userTarget(deps: NavigatorDeps, target: Target, revalidate: boolean | undefined): Target {
	return hashAgain(target, deps.store.snapshot().location, revalidate)
}

// One data navigation from its request to its commit: a redirect to follow, a commit, or nothing (aborted, superseded,
// a failure that commits nothing). Pending runs from the fetch to the commit, inside the transition's update when one
// runs, so the old capture shows the page as it was while pending (dx/navigate.md `useNavigation()`, B124); every other
// end lowers it here.
type Outcome = { kind: "redirect"; url: string } | { kind: "committed"; stale: boolean } | { kind: "none" }

async function travel(
	deps: NavigatorDeps,
	plan: Plan,
	input: { trip: Trip; current: () => boolean; leaving: () => boolean },
): Promise<Outcome> {
	const end = deps.navigation.begin()
	try {
		const settled = await arrived(deps, input.trip, end)
		if (!input.current() || settled === undefined || settled.arrival.kind === "none") return stuck(deps, plan, input)
		const redirect = settled.arrival.kind === "landed" ? settled.arrival.landing.redirect : undefined
		if (redirect !== undefined) return { kind: "redirect", url: redirect.url }
		const landed = { chain: settled.chain, arrival: settled.arrival, signal: input.trip.signal, end }
		return await settle(deps, plan, landed)
	} finally {
		end()
	}
}

// A Back or Forward step the browser already took that commits nothing, a failed request or a bad input, and is still
// the latest, loads its URL as a document, so the screen matches the URL; one a document load already overtook does
// not (plan 21 12.4).
function stuck(deps: NavigatorDeps, plan: Plan, input: { current: () => boolean; leaving: () => boolean }): Outcome {
	if (plan.pop && input.current() && !input.leaving()) deps.assign(plan.target.url)
	return { kind: "none" }
}

// A fill settles its holes through the slots the page already reads, so it commits once its values are all in: a commit
// while one is pending would be held for it, silently (BUGS.md 89). The wait is not tracked as navigation: the fill's
// pending ends with its fetch.
async function arrived(deps: NavigatorDeps, trip: Trip, end: () => void): ReturnType<typeof arrive> {
	const settled = await arrive(deps, trip)
	if (trip.fill && settled?.arrival.kind === "landed") {
		end()
		await endOf(settled.arrival.landing)
	}
	return settled
}

// One navigation before its request: the trigger, whether it is a popstate step, and the overlay it opens.
type Plan = {
	target: DataTarget
	options: NavigateOptions
	trigger: Trigger
	pop: boolean
	previous: StoreSnapshot
	direction: Direction
	intercept?: Intercept
	// A same-URL revalidation that asks for a stored page's `"stream"` values (request.ts).
	fill: boolean
	// Hydrate's cache plan, already asked (BUGS.md 139).
	planned?: CachePlan
}

function planOf(input: {
	target: DataTarget
	options: NavigateOptions
	snapshot: StoreSnapshot
	mode: Mode & { at: number }
	here: Location
}): Plan {
	const { target, snapshot, here } = input
	// A followed redirect writes its entry even to the URL on screen: after a Back step the bar shows another (3.10).
	const revalidates = input.mode.redirects === undefined && sameUrl(here, target.location)
	const same: Trigger = revalidates ? "revalidation" : "navigation"
	const trigger: Trigger = input.mode.initial === undefined ? same : "initial"
	const pop = input.mode.pop === true
	const step = input.mode.index ?? input.mode.at
	// A push moves forward. A popstate step moves by its index. A replace and a revalidation stay.
	const forward = !pop && trigger === "navigation" && input.options.replace !== true
	const direction = forward ? "forward" : stepDirection(input.mode.at, step)
	const fill = input.mode.fill !== undefined
	const plan: Plan = { target, options: input.options, trigger, pop, previous: snapshot, direction, fill }
	if (input.mode.initial !== undefined) plan.planned = input.mode.initial
	const intercept = overlayFor(target, snapshot, { trigger, ...input.mode })
	if (intercept !== undefined) plan.intercept = intercept
	return plan
}

// The URL in the bar, compared with the target: during a Back or Forward that has not committed it is the entry stepped
// to, not the page on screen, and with an overlay open it is the overlay's (BUGS.md 296).
function barOf(history: FlareHistory): Location {
	const parsed = new URL(history.here(), "http://flare.invalid")
	return { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash }
}

// A landed overlay keeps the background. Anything else, a failed overlay fetch included, commits as a visit. A Back or
// Forward step the cache painted with a match past its staleTime commits `stale`, and then revalidates in place (B137).
async function settle(
	deps: NavigatorDeps,
	plan: Plan,
	settled: { chain: LoadedEntry[]; arrival: Exclude<Arrival, { kind: "none" }>; signal: AbortSignal; end: () => void },
): Promise<Outcome> {
	const { target, previous, arrival } = { ...plan, arrival: settled.arrival }
	if (plan.intercept !== undefined && arrival.kind === "landed" && arrival.landing.failure === undefined) {
		const write = !plan.pop && plan.trigger === "navigation"
		showOverlay(deps, {
			target,
			chain: settled.chain,
			landing: arrival.landing,
			previous,
			intercept: plan.intercept,
			write,
			options: plan.options,
		})
		settled.end()
		return { kind: "committed", stale: false }
	}
	const next = committedSnapshot(deps, plan.fill, { target, chain: settled.chain, arrival, previous })
	const arrived = plan.trigger === "navigation" && target.location.pathname !== previous.location.pathname
	const step = { options: plan.options, pop: plan.pop, write: plan.trigger === "navigation", arrived }
	keepPosition(deps, previous.location, step)
	// The DOM updates, in a view transition when one is on, and every scroll is final before the update returns, so the
	// new snapshot shows it (B108). A commit Solid holds scrolls when it shows. History moves once it is on screen (B106).
	let shown = Promise.resolve(false)
	let scrolled = false
	await runTransition({
		option: transitionOption(plan.options.viewTransition, deps.router.viewTransitions),
		info: transitionInfo(plan.direction, previous.overlay?.location ?? previous.location, target.location),
		auto: () => deps.store.scopeAt(swappedDepth(previous, next)),
		update: () => {
			// A navigation started since this transition began aborted this one: it commits nothing (BUGS.md 98).
			if (settled.signal.aborted) return
			commitQueries(arrival.kind === "landed" ? arrival.landing : undefined)
			shown = deps.store.commit(next)
			settled.end()
			flush()
			scrolled = deps.store.onScreen() === next
			if (scrolled) scrollFor(deps, target.location, step)
		},
	})
	if (!(await shown)) return { kind: "none" }
	land(deps, target, { ...step, scrolled })
	return { kind: "committed", stale: arrival.kind === "landed" && arrival.stale === true }
}
