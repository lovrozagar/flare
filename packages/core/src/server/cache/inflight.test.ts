import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { inflight, type Landing } from "./inflight.ts";

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// Two misses of one key share one render. The slot holds until the render's write settles, then frees, a failed
// render or write included (BUGS.md B31).
it("coalesce", async () => {
	const held = Promise.withResolvers<Landing>();
	const write = Promise.withResolvers<void>();
	const render = vi.fn<() => Promise<Landing>>(() => held.promise);
	const first = inflight("k", render);
	const second = inflight("k", render);
	expect(second).toBe(first);
	held.resolve({ flight: undefined, written: write.promise });
	await Promise.all([first, second]);
	expect(inflight("k", render)).toBe(first);
	write.resolve();
	await settled();
	expect(render).toHaveBeenCalledOnce();
	const quick = vi.fn<() => Promise<Landing>>(async () => ({ flight: undefined, written: Promise.resolve() }));
	await inflight("k", quick);
	await settled();
	await expect(inflight("k", () => Promise.reject(new Error("broke")))).rejects.toThrow("broke");
	await settled();
	await inflight("k", async () => ({ flight: undefined, written: Promise.reject(new Error("disk")) }));
	await settled();
	await inflight("k", quick);
	expect(quick).toHaveBeenCalledTimes(2);
});

it("different keys", async () => {
	const render = vi.fn<() => Promise<Landing>>(async () => ({ flight: undefined, written: Promise.resolve() }));
	await Promise.all([inflight("a", render), inflight("b", render)]);
	expect(render).toHaveBeenCalledTimes(2);
});

// The one permitted process-scoped map says why it is one (00-rules.md `no-module-state`).
it("annotation", () => {
	const source = readFileSync(new URL("./inflight.ts", import.meta.url), "utf8");
	expect(source).toContain("// per-process-constant: in-flight renders");
});
