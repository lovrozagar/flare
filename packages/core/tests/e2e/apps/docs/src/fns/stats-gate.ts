import { createServerFn } from "@lovrozagar/flare/server-fn";
import { e2eBoot, statsHold } from "../stats-gate.ts";

// The e2e controls for the changelog's `stats` gate (BUGS.md 69). Outside the e2e boot they change nothing.
export const holdStats = createServerFn().handler(({ env }) => {
	if (!e2eBoot(env)) return { held: false };
	statsHold.held = true;
	return { held: true };
});

export const releaseStats = createServerFn().handler(() => {
	statsHold.held = false;
	return { held: false };
});
