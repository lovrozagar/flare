import { describe, expect, it, vi } from "vitest";
import { containsDeferred, createDeferContext, isDeferred } from "../../../src/defer/index.ts";

describe("createDeferContext", () => {
	it("returns { defer, entries }", () => {
		const ctx = createDeferContext("route-1");
		expect(ctx.defer).toBeTypeOf("function");
		expect(ctx.entries).toBeTypeOf("function");
	});

	it("entries() initially returns []", () => {
		const ctx = createDeferContext("route-1");
		expect(ctx.entries()).toEqual([]);
	});

	it("after defer() call, entries() returns one entry", () => {
		const ctx = createDeferContext("route-1");
		ctx.defer(() => Promise.resolve("data"));
		expect(ctx.entries()).toHaveLength(1);
	});

	it("matchId stored in each entry", () => {
		const ctx = createDeferContext("route-1");
		ctx.defer(() => Promise.resolve("data"));
		expect(ctx.entries()[0]?.matchId).toBe("route-1");
	});
});

describe("defer()", () => {
	it("returns Deferred with __deferred: true", () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => Promise.resolve("x"));
		expect(d.__deferred).toBe(true);
	});

	it("returns Deferred with key field", () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => Promise.resolve("x"));
		expect(d.key).toBeTypeOf("string");
	});

	it("returns Deferred with promise field", () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => Promise.resolve("x"));
		expect(d.promise).toBeInstanceOf(Promise);
	});

	it('auto-generates keys: "d0", "d1", "d2"', () => {
		const ctx = createDeferContext("r1");
		const d0 = ctx.defer(() => Promise.resolve(1));
		const d1 = ctx.defer(() => Promise.resolve(2));
		const d2 = ctx.defer(() => Promise.resolve(3));
		expect(d0.key).toBe("d0");
		expect(d1.key).toBe("d1");
		expect(d2.key).toBe("d2");
	});

	it("custom key: defer(fn, { key: 'reviews' })", () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => Promise.resolve("data"), { key: "reviews" });
		expect(d.key).toBe("reviews");
	});

	it("starts promise immediately: fn() called synchronously", () => {
		const fn = vi.fn(() => Promise.resolve("data"));
		const ctx = createDeferContext("r1");
		ctx.defer(fn);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("promise resolves with fn return value", async () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => Promise.resolve("hello"));
		expect(await d.promise).toBe("hello");
	});

	it("fn throwing → promise rejects", async () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => Promise.reject(new Error("boom")));
		await expect(d.promise).rejects.toThrow("boom");
	});
});

describe("isDeferred", () => {
	it("valid Deferred → true", () => {
		expect(isDeferred({ __deferred: true, key: "x", promise: Promise.resolve() })).toBe(true);
	});

	it("__deferred: false → false", () => {
		expect(isDeferred({ __deferred: false, key: "x" })).toBe(false);
	});

	it("null → false", () => {
		expect(isDeferred(null)).toBe(false);
	});

	it("undefined → false", () => {
		expect(isDeferred(undefined)).toBe(false);
	});

	it("string → false", () => {
		expect(isDeferred("string")).toBe(false);
	});

	it("number → false", () => {
		expect(isDeferred(42)).toBe(false);
	});

	it("empty object → false", () => {
		expect(isDeferred({})).toBe(false);
	});

	it("no __deferred field → false", () => {
		expect(isDeferred({ key: "x" })).toBe(false);
	});

	it("__deferred: true without key → true (guard only checks brand)", () => {
		expect(isDeferred({ __deferred: true })).toBe(true);
	});
});

describe("containsDeferred", () => {
	it("direct deferred marker → true", () => {
		expect(containsDeferred({ __deferred: true, key: "d0" })).toBe(true);
	});

	it("nested deferred marker → true", () => {
		expect(containsDeferred({ items: ["a"], lazy: { __deferred: true, key: "d0" } })).toBe(true);
	});

	it("array of deferred markers → true", () => {
		expect(containsDeferred([{ id: 1 }, { __deferred: true, key: "d1" }])).toBe(true);
	});

	it("plain data → false", () => {
		expect(containsDeferred({ items: ["a", "b"], count: 2 })).toBe(false);
	});

	it("circular object without deferred → false", () => {
		const circular: Record<string, unknown> = { name: "root" };
		circular.self = circular;
		expect(containsDeferred(circular)).toBe(false);
	});
});

describe("deduplication", () => {
	it("same key → same Deferred returned", () => {
		const ctx = createDeferContext("r1");
		const fn1 = vi.fn(() => Promise.resolve("a"));
		const fn2 = vi.fn(() => Promise.resolve("b"));
		const d1 = ctx.defer(fn1, { key: "x" });
		const d2 = ctx.defer(fn2, { key: "x" });
		expect(d1).toBe(d2);
	});

	it("fn2 NOT called — fn1 promise reused", () => {
		const ctx = createDeferContext("r1");
		const fn1 = vi.fn(() => Promise.resolve("a"));
		const fn2 = vi.fn(() => Promise.resolve("b"));
		ctx.defer(fn1, { key: "x" });
		ctx.defer(fn2, { key: "x" });
		expect(fn1).toHaveBeenCalledTimes(1);
		expect(fn2).toHaveBeenCalledTimes(0);
	});

	it("entries() returns one entry, not two", () => {
		const ctx = createDeferContext("r1");
		ctx.defer(() => Promise.resolve("a"), { key: "x" });
		ctx.defer(() => Promise.resolve("b"), { key: "x" });
		expect(ctx.entries()).toHaveLength(1);
	});

	it("auto-generated keys don't collide", () => {
		const ctx = createDeferContext("r1");
		const d0 = ctx.defer(() => Promise.resolve(1));
		const d1 = ctx.defer(() => Promise.resolve(2));
		expect(d0).not.toBe(d1);
		expect(d0.key).not.toBe(d1.key);
	});
});

describe("key scoping", () => {
	it("two DeferContexts with same matchId → independent counters", () => {
		const ctx1 = createDeferContext("r1");
		const ctx2 = createDeferContext("r1");
		const d1 = ctx1.defer(() => Promise.resolve(1));
		const d2 = ctx2.defer(() => Promise.resolve(2));
		expect(d1.key).toBe("d0");
		expect(d2.key).toBe("d0");
		expect(d1).not.toBe(d2);
	});

	it("two DeferContexts with different matchIds → entries isolated", () => {
		const ctx1 = createDeferContext("r1");
		const ctx2 = createDeferContext("r2");
		ctx1.defer(() => Promise.resolve(1));
		ctx2.defer(() => Promise.resolve(2));
		expect(ctx1.entries()[0]?.matchId).toBe("r1");
		expect(ctx2.entries()[0]?.matchId).toBe("r2");
	});
});

describe("error scenarios", () => {
	it("fn() throws synchronously → promise rejects", async () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => {
			throw new Error("sync boom");
		});
		await expect(d.promise).rejects.toThrow("sync boom");
	});

	it("fn() returns rejecting promise → promise rejects", async () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => Promise.reject(new Error("async boom")));
		await expect(d.promise).rejects.toThrow("async boom");
	});

	it("multiple deferred, one rejects → others unaffected", async () => {
		const ctx = createDeferContext("r1");
		const d1 = ctx.defer(() => Promise.resolve("ok"));
		const d2 = ctx.defer(() => Promise.reject(new Error("fail")));
		expect(await d1.promise).toBe("ok");
		await expect(d2.promise).rejects.toThrow("fail");
	});

	it("async fn rejection → no unhandled rejection event", async () => {
		const handler = vi.fn();
		process.on("unhandledRejection", handler);
		try {
			const ctx = createDeferContext("r1");
			ctx.defer(async () => {
				throw new Error("async unhandled");
			});
			/* Give event loop time to fire unhandledRejection if .catch() is missing */
			await new Promise((r) => setTimeout(r, 50));
			expect(handler).not.toHaveBeenCalled();
		} finally {
			process.removeListener("unhandledRejection", handler);
		}
	});

	it("sync throw → no unhandled rejection event", async () => {
		const handler = vi.fn();
		process.on("unhandledRejection", handler);
		try {
			const ctx = createDeferContext("r1");
			ctx.defer(() => {
				throw new Error("sync unhandled");
			});
			await new Promise((r) => setTimeout(r, 50));
			expect(handler).not.toHaveBeenCalled();
		} finally {
			process.removeListener("unhandledRejection", handler);
		}
	});
});

describe("prerender option", () => {
	it("prerender: 'resolve' stored on Deferred", () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => Promise.resolve("x"), { prerender: "resolve" });
		expect(d.prerender).toBe("resolve");
	});

	it("prerender: 'stream' stored on Deferred", () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => Promise.resolve("x"), { prerender: "stream" });
		expect(d.prerender).toBe("stream");
	});

	it("no prerender → undefined on Deferred", () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => Promise.resolve("x"));
		expect(d.prerender).toBeUndefined();
	});

	it("prerender propagated to DeferredEntry", () => {
		const ctx = createDeferContext("r1");
		ctx.defer(() => Promise.resolve("x"), { prerender: "resolve" });
		ctx.defer(() => Promise.resolve("y"), { prerender: "stream" });
		ctx.defer(() => Promise.resolve("z"));
		const entries = ctx.entries();
		expect(entries[0]?.prerender).toBe("resolve");
		expect(entries[1]?.prerender).toBe("stream");
		expect(entries[2]?.prerender).toBeUndefined();
	});

	it("prerender + custom key both work", () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => Promise.resolve("x"), { key: "price", prerender: "stream" });
		expect(d.key).toBe("price");
		expect(d.prerender).toBe("stream");
	});
});

describe("defer() error propagation", () => {
	it("rejected deferred sets error field", async () => {
		const ctx = createDeferContext("r1");
		const err = new Error("db connection failed");
		const d = ctx.defer(() => Promise.reject(err));

		/* Wait for rejection to propagate */
		await new Promise((r) => setTimeout(r, 10));

		expect(d.error).toBe(err);
	});

	it("sync throw sets error field", async () => {
		const ctx = createDeferContext("r1");
		const err = new Error("sync throw");
		const d = ctx.defer(() => {
			throw err;
		});

		await new Promise((r) => setTimeout(r, 10));

		expect(d.error).toBe(err);
	});

	it("successful deferred has no error field", async () => {
		const ctx = createDeferContext("r1");
		const d = ctx.defer(() => Promise.resolve("ok"));

		await new Promise((r) => setTimeout(r, 10));

		expect(d.error).toBeUndefined();
	});

	it("error still accessible via promise rejection", async () => {
		const ctx = createDeferContext("r1");
		const err = new Error("test error");
		const d = ctx.defer(() => Promise.reject(err));

		const results = await Promise.allSettled([d.promise]);
		expect(results[0]?.status).toBe("rejected");
		expect((results[0] as PromiseRejectedResult).reason).toBe(err);
	});
});
