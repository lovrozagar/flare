import { createServerFn } from "@lovrozagar/flare/server-fn";
import { statsHold } from "../stats-gate.ts";

// The e2e controls for the changelog's `stats` gate (BUGS.md 69).
export const holdStats = createServerFn().handler(() => {
	statsHold.held = true;
	return { held: true };
});

export const releaseStats = createServerFn().handler(() => {
	statsHold.held = false;
	for (const resolve of statsHold.waiting.splice(0)) resolve();
	return { held: false };
});
