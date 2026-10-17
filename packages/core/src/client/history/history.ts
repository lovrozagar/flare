import type { HistoryState } from "./state.ts"

type Target = Pick<History, "state" | "pushState" | "replaceState">

export type FlareHistory = {
	adopt: (url?: string) => void
	push: (url: string, usr?: unknown, intercepted?: boolean) => void
	replace: (url: string, usr?: unknown, intercepted?: boolean) => void
	pop: (state: unknown) => number[] | null
	index: () => number
	urlAt: (index: number) => string | undefined
	interceptedAt: (index: number) => boolean
}

// The entries of one document carry an increasing index. Hydrate adopts the entry it lands on and never
// pushes, so a reload or a restored tab keeps its place.
export function createHistory(target: Target): FlareHistory {
	let current = 0
	// The URL of each entry this document wrote, so a popstate over several entries can replay each one.
	const urls = new Map<number, string>()
	// The overlay entries this document pushed. An adopted entry is never one: a reload renders the page.
	const overlays = new Set<number>()
	return {
		adopt(url) {
			const state: unknown = target.state
			if (isFlareState(state)) current = state.index
			else target.replaceState({ index: 0, usr: undefined } satisfies HistoryState, "")
			if (url !== undefined) urls.set(current, url)
		},
		push(url, usr, intercepted = false) {
			current += 1
			const state: HistoryState = intercepted ? { index: current, usr, intercepted: true } : { index: current, usr }
			target.pushState(state, "", url)
			urls.set(current, url)
			if (intercepted) overlays.add(current)
			else overlays.delete(current)
		},
		replace(url, usr, intercepted = false) {
			const state: HistoryState = intercepted ? { index: current, usr, intercepted: true } : { index: current, usr }
			target.replaceState(state, "", url)
			urls.set(current, url)
			if (intercepted) overlays.add(current)
			else overlays.delete(current)
		},
		// A popstate moves to an entry the browser already holds: nothing is pushed or replaced. A jump of
		// several entries is replayed one entry at a time, and an entry with no index is not Flare's.
		pop(state) {
			if (!isFlareState(state)) return null
			const direction = Math.sign(state.index - current)
			const steps = Array.from(
				{ length: Math.abs(state.index - current) },
				(_, step) => current + direction * (step + 1),
			)
			current = state.index
			return steps
		},
		index: () => current,
		urlAt: (index) => urls.get(index),
		interceptedAt: (index) => overlays.has(index),
	}
}

function isFlareState(state: unknown): state is HistoryState {
	return typeof state === "object" && state !== null && "index" in state && typeof state.index === "number"
}
