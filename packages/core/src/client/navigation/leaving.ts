import type { NavigatorDeps } from "./navigate.ts"
import { sameUrl } from "./request.ts"
import type { Target } from "./target.ts"

// What a page that may be leaving exposes: the document loads that start it, and the back-forward cache restore that
// ends it.
export type Leaving = {
	reload: (href: string) => boolean
	assign: (href: string) => void
	pageshow: (persisted: boolean) => void
}

// Once the navigator has begun a document load the page is leaving: every later navigation to another page loads that
// page as a document, so the latest click's load is the last, and nothing fetches, since the unload would cancel it and
// that cancellation would read as a failure; a navigation to the page on screen does nothing (BUGS.md 129). A guarded
// reload the guard refused leaves the page where it is. A page the back-forward cache restores is not leaving.
export function leaveable(given: NavigatorDeps): Leaving & {
	deps: NavigatorDeps
	away: (target: Exclude<Target, { kind: "document" }>) => boolean
	leaving: () => boolean
} {
	let leaving = false
	const assign = (href: string): void => {
		leaving = true
		given.assign(href)
	}
	const reload = (href: string): boolean => {
		const started = given.reload(href)
		if (started) leaving = true
		return started
	}
	return {
		deps: { ...given, assign, reload },
		assign,
		reload,
		pageshow: (persisted) => {
			if (persisted) leaving = false
		},
		leaving: () => leaving,
		away: (target) => {
			if (!leaving) return false
			if (!sameUrl(given.store.snapshot().location, target.location)) assign(target.url)
			return true
		},
	}
}

// An `x` frame: a same-origin target is the next navigation, another origin a document load.
export function follow(deps: NavigatorDeps, url: string, next: () => Promise<void>): Promise<void> {
	if (new URL(url, deps.origin).origin !== deps.origin) return Promise.resolve(deps.assign(url))
	return next()
}
