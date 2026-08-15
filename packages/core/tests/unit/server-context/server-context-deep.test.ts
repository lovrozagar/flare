import { describe, expect, it, vi } from "vitest";
import {
	addRevalidatedTags,
	generateNonce,
	getRevalidatedTags,
	getRevalidationContext,
	getServerContext,
	getServerNonce,
	getServerRequest,
	getServerRequestContext,
	runWithServerContext,
	setServerNonce,
} from "../../../src/server-context/index.ts";

/* ── generateNonce ── */

describe("generateNonce deep", () => {
	it("produces 32-char hex string", () => {
		const nonce = generateNonce();
		expect(nonce).toMatch(/^[a-f0-9]{32}$/);
	});

	it("produces unique values across 100 calls", () => {
		const nonces = new Set<string>();
		for (let i = 0; i < 100; i++) {
			nonces.add(generateNonce());
		}
		expect(nonces.size).toBe(100);
	});

	it("only contains lowercase hex characters", () => {
		for (let i = 0; i < 10; i++) {
			const nonce = generateNonce();
			expect(nonce).not.toMatch(/[A-F]/);
			expect(nonce).not.toMatch(/[^a-f0-9]/);
		}
	});
});

/* ── runWithServerContext isolation ── */

describe("runWithServerContext isolation", () => {
	it("nonce accessible within context", () => {
		const result = runWithServerContext({ nonce: "test-nonce", request: new Request("http://localhost") }, () =>
			getServerNonce(),
		);
		expect(result).toBe("test-nonce");
	});

	it("request accessible within context", () => {
		const req = new Request("http://localhost/test");
		const result = runWithServerContext({ nonce: "n", request: req }, () => getServerRequest());
		expect(result).toBe(req);
	});

	it("getServerNonce throws outside context", () => {
		expect(() => getServerNonce()).toThrow("called outside request context");
	});

	it("getServerRequest throws outside context", () => {
		expect(() => getServerRequest()).toThrow("called outside request context");
	});

	it("getServerRequestContext throws outside context", () => {
		expect(() => getServerRequestContext()).toThrow("called outside request context");
	});

	it("setServerNonce modifies nonce within same request", () => {
		const result = runWithServerContext({ nonce: "original", request: new Request("http://localhost") }, () => {
			expect(getServerNonce()).toBe("original");
			setServerNonce("modified");
			return getServerNonce();
		});
		expect(result).toBe("modified");
	});

	it("concurrent contexts are isolated", async () => {
		const results = await Promise.all([
			new Promise<string>((resolve) => {
				runWithServerContext({ nonce: "ctx-1", request: new Request("http://localhost/1") }, async () => {
					await new Promise((r) => setTimeout(r, 10));
					resolve(getServerNonce());
				});
			}),
			new Promise<string>((resolve) => {
				runWithServerContext({ nonce: "ctx-2", request: new Request("http://localhost/2") }, async () => {
					await new Promise((r) => setTimeout(r, 5));
					resolve(getServerNonce());
				});
			}),
		]);
		expect(results).toEqual(["ctx-1", "ctx-2"]);
	});
});

/* ── ServerRequestContextStore ── */

describe("ServerRequestContextStore operations", () => {
	it("set and get store values", () => {
		runWithServerContext({ nonce: "n", request: new Request("http://localhost") }, () => {
			const store = getServerRequestContext();
			store.set("key", "value");
			expect(store.get<string>("key")).toBe("value");
		});
	});

	it("get non-existent key returns undefined", () => {
		runWithServerContext({ nonce: "n", request: new Request("http://localhost") }, () => {
			const store = getServerRequestContext();
			expect(store.get<string>("missing")).toBeUndefined();
		});
	});

	it("store values isolated between requests", async () => {
		await Promise.all([
			new Promise<void>((resolve) => {
				runWithServerContext({ nonce: "n1", request: new Request("http://localhost") }, () => {
					const store = getServerRequestContext();
					store.set("val", "request-1");
					expect(store.get<string>("val")).toBe("request-1");
					resolve();
				});
			}),
			new Promise<void>((resolve) => {
				runWithServerContext({ nonce: "n2", request: new Request("http://localhost") }, () => {
					const store = getServerRequestContext();
					expect(store.get<string>("val")).toBeUndefined();
					store.set("val", "request-2");
					expect(store.get<string>("val")).toBe("request-2");
					resolve();
				});
			}),
		]);
	});

	it("overwrite existing store key", () => {
		runWithServerContext({ nonce: "n", request: new Request("http://localhost") }, () => {
			const store = getServerRequestContext();
			store.set("key", "first");
			store.set("key", "second");
			expect(store.get<string>("key")).toBe("second");
		});
	});
});

/* ── getServerContext ── */

describe("getServerContext deep", () => {
	it("returns empty object outside context", () => {
		const ctx = getServerContext();
		expect(ctx).toEqual({});
	});

	it("returns same reference for EMPTY_CONTEXT across calls", () => {
		const ctx1 = getServerContext();
		const ctx2 = getServerContext();
		expect(ctx1).toBe(ctx2);
	});

	it("returns provided serverContext within request", () => {
		const serverCtx = { db: "postgres", region: "eu" };
		const result = runWithServerContext(
			{ nonce: "n", request: new Request("http://localhost"), serverContext: serverCtx },
			() => getServerContext<{ db: string; region: string }>(),
		);
		expect(result.db).toBe("postgres");
		expect(result.region).toBe("eu");
	});

	it("defaults to empty object when serverContext not provided", () => {
		const result = runWithServerContext({ nonce: "n", request: new Request("http://localhost") }, () =>
			getServerContext(),
		);
		expect(result).toEqual({});
	});
});

/* ── getRevalidationContext ── */

describe("getRevalidationContext deep", () => {
	it("returns empty object outside context", () => {
		const ctx = getRevalidationContext();
		expect(ctx.store).toBeUndefined();
		expect(ctx.cdnPurgeAdapter).toBeUndefined();
	});

	it("returns provided store within context", () => {
		const store = { delete: vi.fn(), deleteByTags: vi.fn(), get: vi.fn(), set: vi.fn() };
		const result = runWithServerContext(
			{
				nonce: "n",
				request: new Request("http://localhost"),
				store: store as never,
			},
			() => getRevalidationContext(),
		);
		expect(result.store).toBe(store);
	});
});

/* ── Revalidated tags ── */

describe("revalidated tags deep", () => {
	it("accumulates tags across multiple calls", () => {
		runWithServerContext({ nonce: "n", request: new Request("http://localhost") }, () => {
			addRevalidatedTags(["blog"]);
			addRevalidatedTags(["users"]);
			expect(getRevalidatedTags()).toEqual(["blog", "users"]);
		});
	});

	it("deduplicates tags", () => {
		runWithServerContext({ nonce: "n", request: new Request("http://localhost") }, () => {
			addRevalidatedTags(["blog", "users"]);
			addRevalidatedTags(["blog", "products"]);
			expect(getRevalidatedTags().sort()).toEqual(["blog", "products", "users"]);
		});
	});

	it("addRevalidatedTags is no-op outside context", () => {
		expect(() => addRevalidatedTags(["test"])).not.toThrow();
	});

	it("getRevalidatedTags returns empty array outside context", () => {
		expect(getRevalidatedTags()).toEqual([]);
	});

	it("tags isolated between concurrent requests", async () => {
		const results = await Promise.all([
			new Promise<string[]>((resolve) => {
				runWithServerContext({ nonce: "n", request: new Request("http://localhost") }, async () => {
					addRevalidatedTags(["tag-a"]);
					await new Promise((r) => setTimeout(r, 5));
					resolve(getRevalidatedTags());
				});
			}),
			new Promise<string[]>((resolve) => {
				runWithServerContext({ nonce: "n", request: new Request("http://localhost") }, async () => {
					addRevalidatedTags(["tag-b"]);
					await new Promise((r) => setTimeout(r, 5));
					resolve(getRevalidatedTags());
				});
			}),
		]);
		expect(results[0]).toEqual(["tag-a"]);
		expect(results[1]).toEqual(["tag-b"]);
	});
});
