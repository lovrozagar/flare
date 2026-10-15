import { createServerOnlyFn } from "@lovrozagar/flare";

// The longest a held changelog `stats` waits for its release.
const HOLD_MS = 10_000;

// One gate per server process. The e2e `defer two skeletons` holds the changelog's `stats` until it has seen that
// value's skeleton beside the fast boundary's content, so a slow machine cannot settle `stats` first (BUGS.md 69).
export const statsHold: { held: boolean } = { held: false };

// The gate works only under the e2e boot, which sets FLARE_E2E=1: in the process env of the Node and Bun servers, and
// as a Miniflare binding, the fetch env, in workerd. A deployed docs app refuses it, so no visitor can hold the
// changelog for everyone.
export function e2eBoot(env: unknown): boolean {
	if (Reflect.get(Object(env), "FLARE_E2E") === "1") return true;
	return typeof process !== "undefined" && process.env["FLARE_E2E"] === "1";
}

// The held render checks the gate on its own timer, as the playground's `buildLog` gate does. A promise the release
// request resolved would cross requests, and workerd cancelled `buildLog`'s continuation that way (BUGS.md 100); this
// gate passed 15 of 15 on workerd that way and polls anyway, so no gate in the app depends on one.
export const statsGate = createServerOnlyFn(async (): Promise<void> => {
	const until = Date.now() + HOLD_MS;
	while (statsHold.held && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 10));
});
