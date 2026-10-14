import { createServerOnlyFn } from "@lovrozagar/flare";

// The longest a held changelog `stats` waits for its release.
const HOLD_MS = 10_000;

// One gate per server process. The e2e `defer two skeletons` holds the changelog's `stats` until it has seen that
// value's skeleton beside the fast boundary's content, so a slow machine cannot settle `stats` first (BUGS.md 69).
export const statsHold: { held: boolean; waiting: (() => void)[] } = { held: false, waiting: [] };

export const statsGate = createServerOnlyFn((): Promise<void> => {
	if (!statsHold.held) return Promise.resolve();
	return new Promise((resolve) => {
		statsHold.waiting.push(resolve);
		setTimeout(resolve, HOLD_MS);
	});
});
