import type { FlareHistory } from "../history/index.ts"

type PopDeps = {
	history: FlareHistory
	restore: (url: string, index: number) => Promise<void>
	// `moved`: the entry is one the browser just wrote for a fragment, and it may have scrolled there already.
	save: (index: number, moved: boolean) => void
	current: () => string
}

// A popstate that moves several entries is replayed one entry at a time, oldest step first (B84). An entry
// this document did not write has no known URL and is skipped. The last step is the URL the browser now shows.
// An entry with no Flare index is not Flare's and is ignored. The window still shows the page being left,
// so its scroll is saved under its index before the index moves (B84).
export function createPopstate(deps: PopDeps): (state: unknown) => Promise<void> {
	return async (state) => {
		deps.save(deps.history.index(), state === null)
		// The bar's URL is recorded for the entry it lands on, one another document wrote included (BUGS.md 296).
		const steps = deps.history.pop(state, deps.current())
		if (steps === null) return
		for (const [step, index] of steps.entries()) {
			const url = step === steps.length - 1 ? deps.current() : deps.history.urlAt(index)
			if (url !== undefined) await deps.restore(url, index)
		}
	}
}
