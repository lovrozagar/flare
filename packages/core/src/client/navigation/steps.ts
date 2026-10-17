import type { OutletMatch } from "../../shared/components/index.ts"
import type { Location } from "../../shared/url/index.ts"
import type { StoreSnapshot } from "../router/store.ts"
import { allowsNavigation } from "./blocker.ts"
import type { NavigateOptions, NavigatorDeps } from "./navigate.ts"
import type { Target } from "./target.ts"

// What a committed navigation does to history and scroll (navigate.ts).

// `scrolled`: the scroll already ran inside the transition's update (B108). `arrived`: the commit put a new page on
// screen, a navigation to another pathname, so focus moves and its title is announced (B141).
export type Step = { options: NavigateOptions; pop: boolean; write: boolean; scrolled?: boolean; arrived?: boolean }

// The page being left keeps its position, read before the DOM changes. A pop's was kept at popstate.
export function keepPosition(deps: NavigatorDeps, left: Location, step: Step): void {
	if (!step.pop && step.write) deps.scroll.save(deps.history.index(), left)
}

// After a commit: a step forward writes history, then the page goes to its hash, its top, or a pop's saved position.
export function land(deps: NavigatorDeps, target: { url: string; location: Location }, step: Step): void {
	if (!step.pop && step.write) writeHistory(deps, target.url, step.options)
	if (step.scrolled !== true) scrollFor(deps, target.location, step)
	if (step.arrived === true) deps.arrived?.(target.location)
}

export function scrollFor(deps: NavigatorDeps, location: Location, step: Step): void {
	if (step.pop) return deps.scroll.restore(deps.history.index(), location)
	deps.scroll.afterCommit({ hash: location.hash, scroll: step.options.scroll !== false })
}

function writeHistory(deps: NavigatorDeps, url: string, options: NavigateOptions): void {
	if (options.replace === true) deps.history.replace(url, options.state)
	else deps.history.push(url, options.state)
}

// A hash move and a shallow navigation stay on the page: no request and no loader. Each asks the blocker first, unless
// it is a Back or Forward step the browser already took (BUGS.md 312). A shallow one's page search becomes the call's,
// the validator output the URL was written from, since the client graph has no validator. Layouts keep theirs until
// their next loader run (dx/navigate.md `shallow`, BUGS.md B18).
// The returned history index keeps the navigator's `at`: invariant upkeep with no observable effect, since only a
// data pop reads `at` and a pop off a hash entry is a hash move.
export function inPlace(
	deps: NavigatorDeps,
	target: Exclude<Target, { kind: "document" | "data" }>,
	step: { options: NavigateOptions; snapshot: StoreSnapshot; pop: boolean },
): number | undefined {
	const { snapshot } = step
	let matches = snapshot.matches
	const move = { current: snapshot.location, next: target.location, trigger: "navigation" as const }
	if (!step.pop && !allowsNavigation(deps.blockers, deps.router, move)) return undefined
	if (target.kind === "shallow") {
		const search = { ...target.search } as OutletMatch["search"]
		matches = matches.map((match, index) => (index === matches.length - 1 ? { ...match, search } : match))
	}
	// The URL already current replaces its entry, as the browser does (BUGS.md 148).
	const again = target.url === `${snapshot.location.pathname}${snapshot.location.search}${snapshot.location.hash}`
	const moved = { options: again ? { ...step.options, replace: true } : step.options, pop: step.pop, write: true }
	keepPosition(deps, snapshot.location, moved)
	void deps.store.commit({ ...snapshot, location: target.location, matches })
	land(deps, target, moved)
	return deps.history.index()
}

// A hash or shallow move that goes ahead is the latest navigation: the pending request is aborted (BUGS.md 311).
export function stay(
	deps: NavigatorDeps,
	target: Parameters<typeof inPlace>[1],
	step: Parameters<typeof inPlace>[2] & { cancel: () => void },
): number | undefined {
	const moved = inPlace(deps, target, step)
	if (moved !== undefined) step.cancel()
	return moved
}
