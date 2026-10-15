import { flush } from "solid-js"
import type { OutletMatch } from "../../shared/components/index.ts"
import type { DevErrorPayload } from "../../shared/errors/index.ts"
import type { Intercept } from "../../shared/route-builder/chain.ts"
import type { LoadedEntry, Router, ViewTransitionOptions } from "../../shared/router/create-router.ts"
import type { Location } from "../../shared/url/index.ts"
import type { FlareHistory } from "../history/index.ts"
import type { MatchCache } from "../router/match-cache.ts"
import { swappedDepth, type RouterStore, type StoreSnapshot } from "../router/store.ts"
import {
	runTransition,
	stepDirection,
	transitionInfo,
	transitionOption,
	type Direction,
} from "../view-transition/index.ts"
import { allowsNavigation, type Blockers } from "./blocker.ts"
import { endOf, type Landed, type Pending } from "./frames.ts"
import { closesOverlay, overlayFor, showOverlay, type Mode } from "./overlay.ts"
import type { NavigationState } from "./pending.ts"
import type { ScrollStore } from "./scroll.ts"
import {
	arrive,
	fillOptions,
	holeWatch,
	nextSnapshot,
	sameUrl,
	type Arrival,
	type DataTarget,
	type Trip,
} from "./request.ts"
import { resolveTarget, resolveUrl, type NavigateInput, type Target } from "./target.ts"

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
}

type Trigger = "navigation" | "revalidation"

// Same-origin only. The DOM commits, then history is written. A revalidation of the current URL writes no
// history. Starting a navigation aborts the previous one, and only the latest may commit (02-system). A
// restore is one popstate step: the browser already moved, so no blocker runs, nothing is written, and the
// saved scroll comes back. Back onto an overlay's background clears the overlay, with no fetch and no scroll.
export function createNavigator(deps: NavigatorDeps): {
	navigate: (options: NavigateOptions) => Promise<void>
	visit: (url: string, replace: boolean) => Promise<void>
	restore: (url: string, index: number) => Promise<void>
	fill: (pending: Pending) => Promise<void>
} {
	let latest: AbortController | undefined
	// The history index the screen shows, so a popstate step knows its view-transition direction.
	let at = deps.history.index()
	const context = () => ({ router: deps.router, origin: deps.origin, current: deps.store.snapshot().location })
	const go = async (target: Target, options: NavigateOptions, mode: Mode = {}): Promise<void> => {
		if (target.kind === "document") return void deps.assign(target.url)
		const snapshot = deps.store.snapshot()
		const pop = mode.pop === true
		if (target.kind !== "data") {
			at = inPlace(deps, target, { options, snapshot, pop }) ?? at
			return
		}
		const plan = planOf({ target, options, snapshot, mode: { ...mode, at } })
		const move = { current: snapshot.location, next: target.location, trigger: plan.trigger }
		if (!pop && !allowsNavigation(deps.blockers, move)) return
		latest?.abort()
		const controller = new AbortController()
		latest = controller
		// A stored landing can end with a `"stream"` hole. Once this page commits, one fill asks for its values.
		const watch = holeWatch(deps, target.location, fill)
		const trip = { ...plan, signal: controller.signal, reuse: mode.fill, holes: plan.fill ? undefined : watch.holes }
		const outcome = await travel(deps, plan, { trip, current: () => latest === controller })
		if (outcome.kind === "redirect") {
			const redirect = outcome
			return follow(deps, redirect.url, () =>
				go(resolveUrl(redirect.url, context()), { ...options, replace: redirect.replace }),
			)
		}
		if (outcome.kind !== "committed") return
		at = deps.history.index()
		return watch.committed()
	}
	const fill = (pending: Pending): Promise<void> => {
		const options = fillOptions(deps)
		return go(resolveUrl(options.to, context()), options, { fill: pending })
	}
	return {
		fill,
		navigate: (options) => go(resolveTarget(options, context()), options),
		visit: (url, replace) => go(resolveUrl(url, context()), { to: url, replace }),
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

// One data navigation from its request to its commit: a redirect to follow, a commit, or nothing (aborted, superseded,
// a failure that commits nothing). Pending runs from the fetch to the commit, inside the transition's update when one
// runs, so the old capture shows the page as it was while pending (dx/navigate.md `useNavigation()`, B124); every other
// end lowers it here.
type Outcome =
	| { kind: "redirect"; url: string; replace: boolean | undefined }
	| { kind: "committed" }
	| { kind: "none" }

async function travel(
	deps: NavigatorDeps,
	plan: Plan,
	input: { trip: Trip; current: () => boolean },
): Promise<Outcome> {
	const end = deps.navigation.begin()
	try {
		const settled = await arrived(deps, input.trip, end)
		if (!input.current() || settled === undefined || settled.arrival.kind === "none") return { kind: "none" }
		const redirect = settled.arrival.kind === "landed" ? settled.arrival.landing.redirect : undefined
		if (redirect !== undefined) return { kind: "redirect", url: redirect.url, replace: redirect.replace }
		const landed = { chain: settled.chain, arrival: settled.arrival, signal: input.trip.signal, end }
		return { kind: (await settle(deps, plan, landed)) ? "committed" : "none" }
	} finally {
		end()
	}
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
}

function planOf(input: {
	target: DataTarget
	options: NavigateOptions
	snapshot: StoreSnapshot
	mode: Mode & { at: number }
}): Plan {
	const { target, snapshot } = input
	// With an overlay open, the URL in the bar is the overlay's.
	const here = snapshot.overlay?.location ?? snapshot.location
	const trigger: Trigger = sameUrl(here, target.location) ? "revalidation" : "navigation"
	const pop = input.mode.pop === true
	const step = input.mode.index ?? input.mode.at
	// A push moves forward. A popstate step moves by its index. A replace and a revalidation stay.
	const forward = !pop && trigger === "navigation" && input.options.replace !== true
	const direction = forward ? "forward" : stepDirection(input.mode.at, step)
	const fill = input.mode.fill !== undefined
	const plan: Plan = { target, options: input.options, trigger, pop, previous: snapshot, direction, fill }
	const intercept = overlayFor(target, snapshot, { trigger, ...input.mode })
	if (intercept !== undefined) plan.intercept = intercept
	return plan
}

// A landed overlay keeps the background. Anything else, a failed overlay fetch included, commits as a visit.
async function settle(
	deps: NavigatorDeps,
	plan: Plan,
	settled: { chain: LoadedEntry[]; arrival: Exclude<Arrival, { kind: "none" }>; signal: AbortSignal; end: () => void },
): Promise<boolean> {
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
			state: plan.options.state,
		})
		settled.end()
		return true
	}
	const next = nextSnapshot(deps, { target, chain: settled.chain, arrival, previous })
	const step = { options: plan.options, pop: plan.pop, write: plan.trigger === "navigation" }
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
			shown = deps.store.commit(next)
			settled.end()
			flush()
			scrolled = deps.store.onScreen() === next
			if (scrolled) scrollFor(deps, target.location, step)
		},
	})
	if (!(await shown)) return false
	land(deps, target, { ...step, scrolled })
	return true
}

// The page being left keeps its position, read before the DOM changes. A pop's was kept at popstate.
function keepPosition(deps: NavigatorDeps, left: Location, step: Step): void {
	if (!step.pop && step.write) deps.scroll.save(deps.history.index(), left)
}

// After a commit: a step forward writes history, then the page goes to its hash, its top, or a pop's saved position.
function land(deps: NavigatorDeps, target: { url: string; location: Location }, step: Step): void {
	if (!step.pop && step.write) writeHistory(deps, target.url, step.options)
	if (step.scrolled !== true) scrollFor(deps, target.location, step)
}

function scrollFor(deps: NavigatorDeps, location: Location, step: Step): void {
	if (step.pop) return deps.scroll.restore(deps.history.index(), location)
	deps.scroll.afterCommit({ hash: location.hash, scroll: step.options.scroll !== false })
}

// `scrolled`: the scroll already ran inside the transition's update (B108).
type Step = { options: NavigateOptions; pop: boolean; write: boolean; scrolled?: boolean }

// A hash move and a shallow navigation stay on the page: no request and no loader. A shallow one asks the blocker
// first, and the page's search becomes the call's, the validator output the URL was written from, since the client
// graph has no validator. Layouts keep theirs until their next loader run (dx/navigate.md `shallow`, BUGS.md B18).
// The returned history index keeps the navigator's `at`: invariant upkeep with no observable effect, since only a
// data pop reads `at` and a pop off a hash entry is a hash move.
function inPlace(
	deps: NavigatorDeps,
	target: Exclude<Target, { kind: "document" | "data" }>,
	step: { options: NavigateOptions; snapshot: StoreSnapshot; pop: boolean },
): number | undefined {
	const { snapshot } = step
	let matches = snapshot.matches
	if (target.kind === "shallow") {
		const move = { current: snapshot.location, next: target.location, trigger: "navigation" as const }
		if (!allowsNavigation(deps.blockers, move)) return undefined
		const search = { ...target.search } as OutletMatch["search"]
		matches = matches.map((match, index) => (index === matches.length - 1 ? { ...match, search } : match))
	}
	const moved = { options: step.options, pop: step.pop, write: true }
	keepPosition(deps, snapshot.location, moved)
	void deps.store.commit({ ...snapshot, location: target.location, matches })
	land(deps, target, moved)
	return deps.history.index()
}

// An `x` frame: a same-origin target is the next navigation, another origin a document load.
function follow(deps: NavigatorDeps, url: string, next: () => Promise<void>): Promise<void> {
	if (new URL(url, deps.origin).origin !== deps.origin) return Promise.resolve(deps.assign(url))
	return next()
}

function writeHistory(deps: NavigatorDeps, url: string, options: NavigateOptions): void {
	if (options.replace === true) deps.history.replace(url, options.state)
	else deps.history.push(url, options.state)
}
