import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { inflight, type Flight } from "./inflight.ts";

// Two misses of one key share one render, and the slot frees once it settles, a failure included.
it("coalesce", async () => {
	const held = Promise.withResolvers<Flight>();
	const render = vi.fn<() => Promise<Flight>>(() => held.promise);
	const first = inflight("k", render);
	const second = inflight("k", render);
	expect(second).toBe(first);
	held.resolve(undefined);
	await Promise.all([first, second]);
	expect(render).toHaveBeenCalledOnce();
	await inflight("k", render);
	expect(render).toHaveBeenCalledTimes(2);
	await expect(inflight("k", () => Promise.reject(new Error("broke")))).rejects.toThrow("broke");
	await inflight("k", render);
	expect(render).toHaveBeenCalledTimes(3);
});

it("different keys", async () => {
	const render = vi.fn<() => Promise<Flight>>(async () => undefined);
	await Promise.all([inflight("a", render), inflight("b", render)]);
	expect(render).toHaveBeenCalledTimes(2);
});

// The one permitted process-scoped map says why it is one (00-rules.md `no-module-state`).
it("annotation", () => {
	const source = readFileSync(new URL("./inflight.ts", import.meta.url), "utf8");
	expect(source).toContain("// per-process-constant: in-flight renders");
});
