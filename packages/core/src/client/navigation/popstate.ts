import type { FlareHistory } from "../history/index.ts";

type PopDeps = {
	history: FlareHistory;
	restore: (url: string) => Promise<void>;
	current: () => string;
};

// A popstate that moves several entries is replayed one entry at a time, oldest step first (B84). An entry
// this document did not write has no known URL and is skipped. The last step is the URL the browser now shows.
// An entry with no Flare index is not Flare's and is ignored.
export function createPopstate(deps: PopDeps): (state: unknown) => Promise<void> {
	return async (state) => {
		const steps = deps.history.pop(state);
		if (steps === null) return;
		for (const [step, index] of steps.entries()) {
			const url = step === steps.length - 1 ? deps.current() : deps.history.urlAt(index);
			if (url !== undefined) await deps.restore(url);
		}
	};
}
