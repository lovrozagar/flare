import type { FlareHistory } from "../history/index.ts"

type PopDeps = {
	history: FlareHistory
	restore: (url: string, index: number) => Promise<void>
	// `moved`: the entry is one the browser just wrote for a fragment, and it may have scrolled there already.
	save: (index: number, moved: boolean) => void
	current: () => string
}

// A popstate that moves several entries advances the history index over each of them, and restores only the entry it
// lands on, the URL the browser now shows: an entry passed on the way runs no loader, no check, and no request, in
// every engine, whether the browser reports the move as one event or several (BUGS.md 378). An entry with no Flare
// index is not Flare's and is ignored. The window still shows the page being left, so its scroll is saved under its
// index before the index moves (B84).
export function createPopstate(deps: PopDeps): (state: unknown) => Promise<void> {
	return async (state) => {
		deps.save(deps.history.index(), state === null)
		// The bar's URL is the entry it lands on, one another document wrote included (BUGS.md 296).
		const landed = deps.history.pop(state, deps.current())?.at(-1)
		if (landed !== undefined) await deps.restore(deps.current(), landed)
	}
}
