import type { HistoryState } from "./state.ts";

type Target = Pick<History, "state" | "pushState" | "replaceState">;

export type FlareHistory = {
	adopt: () => void;
	push: (url: string, usr?: unknown) => void;
	replace: (url: string, usr?: unknown) => void;
	pop: (state: unknown) => number[] | null;
	index: () => number;
};

// The entries of one document carry an increasing index. Hydrate adopts the entry it lands on and never
// pushes, so a reload or a restored tab keeps its place.
export function createHistory(target: Target): FlareHistory {
	let current = 0;
	return {
		adopt() {
			const state: unknown = target.state;
			if (isFlareState(state)) current = state.index;
			else target.replaceState({ index: 0, usr: undefined } satisfies HistoryState, "");
		},
		push(url, usr) {
			current += 1;
			target.pushState({ index: current, usr } satisfies HistoryState, "", url);
		},
		replace(url, usr) {
			target.replaceState({ index: current, usr } satisfies HistoryState, "", url);
		},
		// A popstate moves to an entry the browser already holds: nothing is pushed or replaced. A jump of
		// several entries is replayed one entry at a time, and an entry with no index is not Flare's.
		pop(state) {
			if (!isFlareState(state)) return null;
			const direction = Math.sign(state.index - current);
			const steps = Array.from(
				{ length: Math.abs(state.index - current) },
				(_, step) => current + direction * (step + 1),
			);
			current = state.index;
			return steps;
		},
		index: () => current,
	};
}

function isFlareState(state: unknown): state is HistoryState {
	return typeof state === "object" && state !== null && "index" in state && typeof state.index === "number";
}
