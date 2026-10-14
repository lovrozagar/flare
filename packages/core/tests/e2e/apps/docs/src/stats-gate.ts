import { createServerOnlyFn } from "@lovrozagar/flare";

// The longest a held changelog `stats` waits for its release.
const HOLD_MS = 10_000;

// One gate per server process. The e2e `defer two skeletons` holds the changelog's `stats` until it has seen that
// value's skeleton beside the fast boundary's content, so a slow machine cannot settle `stats` first (BUGS.md 69).
export const statsHold: { held: boolean; waiting: (() => void)[] } = { held: false, waiting: [] };

// The gate works only under the e2e boot, which sets FLARE_E2E=1: in the process env of the Node and Bun servers, and
// as a Miniflare binding, the fetch env, in workerd. A deployed docs app refuses it, so no visitor can hold the
// changelog for everyone.
export function e2eBoot(env: unknown): boolean {
	if (Reflect.get(Object(env), "FLARE_E2E") === "1") return true;
	return typeof process !== "undefined" && process.env["FLARE_E2E"] === "1";
}

export const statsGate = createServerOnlyFn((): Promise<void> => {
	if (!statsHold.held) return Promise.resolve();
	return new Promise((resolve) => {
		statsHold.waiting.push(resolve);
		setTimeout(resolve, HOLD_MS);
	});
});
