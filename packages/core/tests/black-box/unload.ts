// The chaos run's report of a page being left (BUGS.md 518). When a step loads another document, Firefox tears the
// leaving page down at the new document's commit and warns `Loading failed for the module with source “<url>”` for
// each module import it cut short, whether that module's request was aborted or already answered from the page's
// prefetch. That is the browser's account of the unload, not a missing chunk: the client sends no probe and takes no
// reload for it, and the next page loads the module.

// One step's events, as chaos records them: a request the page made, a main-frame document navigation's start and its
// commit, and Firefox's module warning with the URL it names.
export type StepEvent =
	| { at: number; kind: "request"; url: string }
	| { at: number; kind: "document" }
	| { at: number; kind: "commit" }
	| { at: number; kind: "warning"; url: string }

const MODULE_FAILED = /Loading failed for the module with source “([^”]+)”/

// Each document navigation's window, from its start to the first main-frame commit at or after it, the commit
// included; a navigation with no commit yet has no window. One pass over the events in time order.
function windows(events: readonly StepEvent[]): { from: number; to: number }[] {
	const found: { from: number; to: number }[] = []
	const open: number[] = []
	for (const event of events.toSorted((a, b) => a.at - b.at)) {
		if (event.kind === "document") open.push(event.at)
		else if (event.kind === "commit") for (const from of open.splice(0)) found.push({ from, to: event.at })
	}
	return found
}

// The URL Firefox's module warning names, if the text is one.
export function moduleFailed(text: string): string | undefined {
	return MODULE_FAILED.exec(text)?.[1]
}

// Whether a module warning, the `nth` for its URL, is the leaving page's: it came inside a navigation's window, and the
// page asked for that module before the navigation started. A module the new document asked for, a real 404 among
// them, was asked for after the start, so it stays even at the commit.
function leaving(events: readonly StepEvent[], url: string, nth: number): boolean {
	const warning = events.filter((event) => event.kind === "warning" && event.url === url)[nth]
	if (warning === undefined) return false
	return windows(events).some(
		(window) =>
			window.from <= warning.at &&
			warning.at <= window.to &&
			events.some((event) => event.kind === "request" && event.url === url && event.at < window.from),
	)
}

// A step's problems without Firefox's module warnings that are the leaving page's teardown; every other problem stays,
// a module warning included when it came outside every navigation's window or names a module the old page never asked
// for before the navigation.
export function leftBehind(problems: readonly string[], events: readonly StepEvent[]): string[] {
	const seen = new Map<string, number>()
	return problems.filter((problem) => {
		const url = moduleFailed(problem)
		if (url === undefined) return true
		const nth = seen.get(url) ?? 0
		seen.set(url, nth + 1)
		return !leaving(events, url, nth)
	})
}
