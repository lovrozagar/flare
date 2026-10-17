import type { HistoryState } from "./state.ts"

type Target = Pick<History, "state" | "pushState" | "replaceState">

export type FlareHistory = {
	adopt: (url: string) => void
	push: (url: string, usr?: unknown, intercepted?: boolean) => void
	replace: (url: string, usr?: unknown, intercepted?: boolean) => void
	// `url` is the one the browser shows for the entry it lands on, recorded for that entry (BUGS.md 296). Nothing is
	// pushed, and a jump of several entries is replayed one entry at a time. An entry with no state is one the browser
	// just wrote, for a hash typed in the bar or a fragment link, on top of the one on screen: it is stamped as the next
	// index, with no step to replay since the browser went to the fragment itself, so a Back off it is a step that
	// restores (BUGS.md 318). Flare owns its document's history, so an entry another script pushed with no state reads
	// the same way, a Back onto it included (BUGS.md 325). Any other state another script wrote is not Flare's: null.
	pop: (state: unknown, url: string) => number[] | null
	index: () => number
	// The URL the bar shows: of the entry adopted, pushed, replaced, or stepped to, one that is not Flare's included.
	// During a Back or Forward that has not committed it is the entry stepped to, not the page on screen (BUGS.md 296).
	here: () => string
	urlAt: (index: number) => string | undefined
	interceptedAt: (index: number) => boolean
}

// The entries of one document carry an increasing index. Hydrate adopts the entry it lands on and never
// pushes, so a reload or a restored tab keeps its place.
export function createHistory(target: Target): FlareHistory {
	let current = 0
	let bar = ""
	// The URL of each entry this document wrote, so a popstate over several entries can replay each one.
	const urls = new Map<number, string>()
	// The overlay entries this document pushed. An adopted entry is never one: a reload renders the page.
	const overlays = new Set<number>()
	// The entry at `current` now holds `url`, an overlay's or not.
	const holds = (url: string, intercepted: boolean): void => {
		urls.set(current, url)
		bar = url
		if (intercepted) overlays.add(current)
		else overlays.delete(current)
	}
	return {
		adopt(url) {
			const state: unknown = target.state
			if (isFlareState(state)) current = state.index
			else target.replaceState({ index: 0, usr: undefined } satisfies HistoryState, "")
			urls.set(current, url)
			bar = url
		},
		push(url, usr, intercepted = false) {
			current += 1
			const state: HistoryState = intercepted ? { index: current, usr, intercepted: true } : { index: current, usr }
			target.pushState(state, "", url)
			holds(url, intercepted)
		},
		replace(url, usr, intercepted = false) {
			const state: HistoryState = intercepted ? { index: current, usr, intercepted: true } : { index: current, usr }
			target.replaceState(state, "", url)
			holds(url, intercepted)
		},
		// A popstate moves to an entry the browser already holds. See `FlareHistory.pop`.
		pop(state, url) {
			bar = url
			if (state === null) {
				current += 1
				target.replaceState({ index: current, usr: undefined } satisfies HistoryState, "")
				holds(url, false)
				return []
			}
			if (!isFlareState(state)) return null
			urls.set(state.index, url)
			const direction = Math.sign(state.index - current)
			const steps = Array.from(
				{ length: Math.abs(state.index - current) },
				(_, step) => current + direction * (step + 1),
			)
			current = state.index
			return steps
		},
		index: () => current,
		here: () => bar,
		urlAt: (index) => urls.get(index),
		interceptedAt: (index) => overlays.has(index),
	}
}

function isFlareState(state: unknown): state is HistoryState {
	return typeof state === "object" && state !== null && "index" in state && typeof state.index === "number"
}
