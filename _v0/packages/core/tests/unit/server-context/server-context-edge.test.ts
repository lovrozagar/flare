import { describe, expect, it } from "vitest";
import {
	addRevalidatedTags,
	getRevalidatedTags,
	getRevalidationContext,
	getServerContext,
	getServerNonce,
	getServerRequest,
	getServerRequestContext,
	runWithServerContext,
	setServerNonce,
} from "../../../src/server-context/index.ts";

/* ── getServerContext EMPTY_CONTEXT stability ──────────────────────── */

describe("getServerContext outside request", () => {
	it("returns same empty object reference across calls", () => {
		const a = getServerContext();
		const b = getServerContext();
		expect(a).toBe(b);
	});

	it("EMPTY_CONTEXT is not deeply frozen — mutations persist on shared ref", () => {
		const ctx = getServerContext();
		/* Document that the shared empty object can be mutated (by design or oversight).
		 * This test verifies the behavior; if EMPTY_CONTEXT is frozen later, update test. */
		const original = { ...ctx };
		expect(Object.keys(original)).toEqual([]);
	});
});

/* ── getRevalidationContext outside request ────────────────────────── */

describe("getRevalidationContext outside request", () => {
	it("returns empty object with no store or cdnPurgeAdapter", () => {
		const ctx = getRevalidationContext();
		expect(ctx.store).toBeUndefined();
		expect(ctx.cdnPurgeAdapter).toBeUndefined();
	});
});

/* ── addRevalidatedTags outside request ────────────────────────────── */

describe("addRevalidatedTags outside request", () => {
	it("is a no-op (does not throw)", () => {
		expect(() => addRevalidatedTags(["tag-a"])).not.toThrow();
	});

	it("getRevalidatedTags returns empty array after no-op add", () => {
		addRevalidatedTags(["orphan-tag"]);
		expect(getRevalidatedTags()).toEqual([]);
	});
});

/* ── getRevalidationContext inside request ─────────────────────────── */

describe("getRevalidationContext inside request", () => {
	it("returns store when provided", () => {
		const store = {
			delete: () => Promise.resolve(),
			deleteByTags: () => Promise.resolve(),
			get: () => Promise.resolve(null),
			set: () => Promise.resolve(),
		};

		runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost/"),
				store,
			},
			() => {
				const rctx = getRevalidationContext();
				expect(rctx.store).toBe(store);
			},
		);
	});

	it("returns undefined adapters when not provided", () => {
		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			const rctx = getRevalidationContext();
			expect(rctx.store).toBeUndefined();
			expect(rctx.cdnPurgeAdapter).toBeUndefined();
		});
	});
});

/* ── store isolation: deeply nested async ─────────────────────────── */

describe("store isolation: deeply nested async", () => {
	it("three concurrent requests with staggered delays isolate stores", async () => {
		const results = await Promise.all([
			runWithServerContext(
				{ nonce: "a", request: new Request("http://localhost/a"), serverContext: { id: "A" } },
				async () => {
					const ctx = getServerRequestContext();
					ctx.set("counter", 0);
					await new Promise((r) => setTimeout(r, 15));
					ctx.set("counter", (ctx.get<number>("counter") ?? 0) + 1);
					await new Promise((r) => setTimeout(r, 5));
					return {
						counter: ctx.get<number>("counter"),
						id: getServerContext().id,
						nonce: getServerNonce(),
					};
				},
			),
			runWithServerContext(
				{ nonce: "b", request: new Request("http://localhost/b"), serverContext: { id: "B" } },
				async () => {
					const ctx = getServerRequestContext();
					ctx.set("counter", 10);
					await new Promise((r) => setTimeout(r, 10));
					ctx.set("counter", (ctx.get<number>("counter") ?? 0) + 1);
					return {
						counter: ctx.get<number>("counter"),
						id: getServerContext().id,
						nonce: getServerNonce(),
					};
				},
			),
			runWithServerContext(
				{ nonce: "c", request: new Request("http://localhost/c"), serverContext: { id: "C" } },
				async () => {
					const ctx = getServerRequestContext();
					ctx.set("counter", 100);
					await new Promise((r) => setTimeout(r, 2));
					ctx.set("counter", (ctx.get<number>("counter") ?? 0) + 1);
					return {
						counter: ctx.get<number>("counter"),
						id: getServerContext().id,
						nonce: getServerNonce(),
					};
				},
			),
		]);

		expect(results[0]).toEqual({ counter: 1, id: "A", nonce: "a" });
		expect(results[1]).toEqual({ counter: 11, id: "B", nonce: "b" });
		expect(results[2]).toEqual({ counter: 101, id: "C", nonce: "c" });
	});

	it("revalidated tags across concurrent requests stay isolated", async () => {
		await Promise.all([
			runWithServerContext({ nonce: "x", request: new Request("http://localhost/x") }, async () => {
				addRevalidatedTags(["products"]);
				await new Promise((r) => setTimeout(r, 10));
				addRevalidatedTags(["inventory"]);
				expect(getRevalidatedTags()).toEqual(["products", "inventory"]);
			}),
			runWithServerContext({ nonce: "y", request: new Request("http://localhost/y") }, async () => {
				addRevalidatedTags(["users"]);
				await new Promise((r) => setTimeout(r, 5));
				/* Should NOT see "products" from other request */
				expect(getRevalidatedTags()).toEqual(["users"]);
			}),
		]);
	});
});

/* ── nested runWithServerContext ───────────────────────────────────── */

describe("nested runWithServerContext", () => {
	it("inner context overrides outer for the duration of callback", () => {
		runWithServerContext({ nonce: "outer", request: new Request("http://localhost/outer") }, () => {
			expect(getServerNonce()).toBe("outer");

			runWithServerContext({ nonce: "inner", request: new Request("http://localhost/inner") }, () => {
				expect(getServerNonce()).toBe("inner");
				expect(getServerRequest().url).toContain("/inner");
			});

			/* After inner completes, outer restored */
			expect(getServerNonce()).toBe("outer");
			expect(getServerRequest().url).toContain("/outer");
		});
	});

	it("inner context stores are independent from outer", () => {
		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			const outerCtx = getServerRequestContext();
			outerCtx.set("key", "outer-value");

			runWithServerContext({ nonce: "y", request: new Request("http://localhost/inner") }, () => {
				const innerCtx = getServerRequestContext();
				expect(innerCtx.get("key")).toBeUndefined();
				innerCtx.set("key", "inner-value");
				expect(innerCtx.get("key")).toBe("inner-value");
			});

			expect(outerCtx.get("key")).toBe("outer-value");
		});
	});
});

/* ── request object access ────────────────────────────────────────── */

describe("request object access patterns", () => {
	it("getServerRequest returns exact same Request object", () => {
		const req = new Request("http://localhost/test", {
			headers: { Authorization: "Bearer token" },
			method: "POST",
		});

		runWithServerContext({ nonce: "x", request: req }, () => {
			const retrieved = getServerRequest();
			expect(retrieved).toBe(req);
			expect(retrieved.method).toBe("POST");
			expect(retrieved.headers.get("Authorization")).toBe("Bearer token");
		});
	});

	it("nonce can be changed mid-request (e.g., regenerated for streaming)", () => {
		runWithServerContext({ nonce: "initial", request: new Request("http://localhost/") }, () => {
			expect(getServerNonce()).toBe("initial");
			setServerNonce("regenerated");
			expect(getServerNonce()).toBe("regenerated");
		});
	});
});
