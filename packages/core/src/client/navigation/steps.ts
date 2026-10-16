import type { Location } from "../../shared/url/index.ts"
import type { NavigateOptions, NavigatorDeps } from "./navigate.ts"

// What a committed navigation does to history and scroll (navigate.ts).

// `scrolled`: the scroll already ran inside the transition's update (B108).
export type Step = { options: NavigateOptions; pop: boolean; write: boolean; scrolled?: boolean }

// The page being left keeps its position, read before the DOM changes. A pop's was kept at popstate.
export function keepPosition(deps: NavigatorDeps, left: Location, step: Step): void {
	if (!step.pop && step.write) deps.scroll.save(deps.history.index(), left)
}

// After a commit: a step forward writes history, then the page goes to its hash, its top, or a pop's saved position.
export function land(deps: NavigatorDeps, target: { url: string; location: Location }, step: Step): void {
	if (!step.pop && step.write) writeHistory(deps, target.url, step.options)
	if (step.scrolled !== true) scrollFor(deps, target.location, step)
}

export function scrollFor(deps: NavigatorDeps, location: Location, step: Step): void {
	if (step.pop) return deps.scroll.restore(deps.history.index(), location)
	deps.scroll.afterCommit({ hash: location.hash, scroll: step.options.scroll !== false })
}

function writeHistory(deps: NavigatorDeps, url: string, options: NavigateOptions): void {
	if (options.replace === true) deps.history.replace(url, options.state)
	else deps.history.push(url, options.state)
}
