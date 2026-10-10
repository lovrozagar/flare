import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dedupe, disableFetchDedupe, enableFetchDedupe, isFetchDedupeEnabled } from "../../../src/dedupe/index.ts";
import { runWithServerContext } from "../../../src/server-context/index.ts";

describe("dedupe", () => {
	it("same fn + same args + same request → same promise", () => {
		const fn = vi.fn(async (id: string) => ({ id }));
		const deduped = dedupe(fn);

		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			const p1 = deduped("1");
			const p2 = deduped("1");
			expect(p1).toBe(p2);
		});
	});

	it("same fn + different args → different promises", () => {
		const fn = vi.fn(async (id: string) => ({ id }));
		const deduped = dedupe(fn);

		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			const p1 = deduped("1");
			const p2 = deduped("2");
			expect(p1).not.toBe(p2);
		});
	});

	it("same args + different request → different promises (isolated)", async () => {
		const fn = vi.fn(async (id: string) => ({ id }));
		const deduped = dedupe(fn);

		let p1: Promise<{ id: string }> | undefined;
		let p2: Promise<{ id: string }> | undefined;

		await Promise.all([
			runWithServerContext({ nonce: "a", request: new Request("http://localhost/") }, async () => {
				p1 = deduped("1");
				await p1;
			}),
			runWithServerContext({ nonce: "b", request: new Request("http://localhost/") }, async () => {
				p2 = deduped("1");
				await p2;
			}),
		]);

		expect(p1).not.toBe(p2);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("original function called once per unique key", async () => {
		const fn = vi.fn(async (id: string) => ({ id }));
		const deduped = dedupe(fn);

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			await Promise.all([deduped("1"), deduped("1"), deduped("1")]);
		});

		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("concurrent calls → single execution", async () => {
		let callCount = 0;
		const fn = async (id: string) => {
			callCount++;
			await new Promise((r) => setTimeout(r, 10));
			return { id };
		};
		const deduped = dedupe(fn);

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			const results = await Promise.all([deduped("1"), deduped("1"), deduped("1")]);
			expect(results[0]).toEqual({ id: "1" });
			expect(results[1]).toEqual({ id: "1" });
			expect(results[2]).toEqual({ id: "1" });
		});

		expect(callCount).toBe(1);
	});

	it("cache per-request (not global)", async () => {
		const fn = vi.fn(async () => "result");
		const deduped = dedupe(fn);

		await runWithServerContext({ nonce: "a", request: new Request("http://localhost/") }, async () => {
			await deduped();
		});

		await runWithServerContext({ nonce: "b", request: new Request("http://localhost/") }, async () => {
			await deduped();
		});

		expect(fn).toHaveBeenCalledTimes(2);
	});
});

describe("fetch deduplication", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		if (isFetchDedupeEnabled()) {
			disableFetchDedupe();
		}
		globalThis.fetch = originalFetch;
	});

	it("GET same URL → single fetch, responses cloned", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			return new Response("ok");
		};

		enableFetchDedupe();

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			const [r1, r2] = await Promise.all([fetch("http://example.com/api"), fetch("http://example.com/api")]);
			expect(await r1.text()).toBe("ok");
			expect(await r2.text()).toBe("ok");
		});

		expect(callCount).toBe(1);
	});

	it("GET same URL different headers → separate fetches", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			return new Response("ok");
		};

		enableFetchDedupe();

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			await Promise.all([
				fetch("http://example.com/api", { headers: { authorization: "a" } }),
				fetch("http://example.com/api", { headers: { authorization: "b" } }),
			]);
		});

		expect(callCount).toBe(2);
	});

	it("POST → not deduplicated", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			return new Response("ok");
		};

		enableFetchDedupe();

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			await Promise.all([
				fetch("http://example.com/api", { method: "POST" }),
				fetch("http://example.com/api", { method: "POST" }),
			]);
		});

		expect(callCount).toBe(2);
	});

	it("PUT → not deduplicated", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			return new Response("ok");
		};

		enableFetchDedupe();

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			await Promise.all([
				fetch("http://example.com/api", { method: "PUT" }),
				fetch("http://example.com/api", { method: "PUT" }),
			]);
		});

		expect(callCount).toBe(2);
	});

	it("HEAD same URL → deduplicated", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			return new Response(null);
		};

		enableFetchDedupe();

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			await Promise.all([
				fetch("http://example.com/api", { method: "HEAD" }),
				fetch("http://example.com/api", { method: "HEAD" }),
			]);
		});

		expect(callCount).toBe(1);
	});

	it("trace headers excluded from key", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			return new Response("ok");
		};

		enableFetchDedupe();

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			await Promise.all([
				fetch("http://example.com/api", { headers: { traceparent: "abc" } }),
				fetch("http://example.com/api", { headers: { "x-request-id": "xyz" } }),
			]);
		});

		expect(callCount).toBe(1);
	});

	it("each caller gets own Response body stream (cloned)", async () => {
		globalThis.fetch = async () => new Response("body-content");

		enableFetchDedupe();

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			const [r1, r2] = await Promise.all([fetch("http://example.com/api"), fetch("http://example.com/api")]);
			const t1 = await r1.text();
			const t2 = await r2.text();
			expect(t1).toBe("body-content");
			expect(t2).toBe("body-content");
		});
	});

	it("GET with Request object input → deduplicated", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			return new Response("ok");
		};

		enableFetchDedupe();

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			await Promise.all([fetch(new Request("http://example.com/api")), fetch(new Request("http://example.com/api"))]);
		});

		expect(callCount).toBe(1);
	});

	it("GET with URL object input → deduplicated", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			return new Response("ok");
		};

		enableFetchDedupe();

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			await Promise.all([fetch(new URL("http://example.com/api")), fetch(new URL("http://example.com/api"))]);
		});

		expect(callCount).toBe(1);
	});

	it("GET same URL with Headers instance → deduplicated when same headers", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			return new Response("ok");
		};

		enableFetchDedupe();

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			const h1 = new Headers({ "x-custom": "val" });
			const h2 = new Headers({ "x-custom": "val" });
			await Promise.all([
				fetch("http://example.com/api", { headers: h1 }),
				fetch("http://example.com/api", { headers: h2 }),
			]);
		});

		expect(callCount).toBe(1);
	});

	it("outside request context → original fetch (no error)", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			return new Response("ok");
		};
		const _savedFetch = globalThis.fetch;

		enableFetchDedupe();

		/* outside any runWithServerContext */
		const r = await fetch("http://example.com/api");
		expect(await r.text()).toBe("ok");
		expect(callCount).toBe(1);
	});

	it("failed fetch evicted from cache → retry succeeds", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			if (callCount === 1) throw new Error("network error");
			return new Response("ok");
		};

		enableFetchDedupe();

		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, async () => {
			await expect(fetch("http://example.com/api")).rejects.toThrow("network error");
			/* Allow microtask for .catch() cleanup to run */
			await new Promise((r) => setTimeout(r, 0));
			/* Second call should retry (not get cached rejection) */
			const r = await fetch("http://example.com/api");
			expect(await r.text()).toBe("ok");
		});

		expect(callCount).toBe(2);
	});
});

describe("enableFetchDedupe", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		while (isFetchDedupeEnabled()) {
			disableFetchDedupe();
		}
		globalThis.fetch = originalFetch;
	});

	it("patches globalThis.fetch", () => {
		const before = globalThis.fetch;
		enableFetchDedupe();
		expect(globalThis.fetch).not.toBe(before);
	});

	it("second enable keeps same patched fetch", () => {
		enableFetchDedupe();
		const after1 = globalThis.fetch;
		enableFetchDedupe();
		expect(globalThis.fetch).toBe(after1);
	});

	it("disableFetchDedupe restores original", () => {
		const before = globalThis.fetch;
		enableFetchDedupe();
		disableFetchDedupe();
		expect(globalThis.fetch).toBe(before);
	});

	it("ref-counted: enable twice, disable once → still enabled", () => {
		enableFetchDedupe();
		enableFetchDedupe();
		disableFetchDedupe();
		expect(isFetchDedupeEnabled()).toBe(true);
		expect(globalThis.fetch).not.toBe(originalFetch);
	});

	it("ref-counted: enable twice, disable twice → disabled", () => {
		enableFetchDedupe();
		enableFetchDedupe();
		disableFetchDedupe();
		disableFetchDedupe();
		expect(isFetchDedupeEnabled()).toBe(false);
		expect(globalThis.fetch).toBe(originalFetch);
	});

	it("extra disable calls are safe (no negative count)", () => {
		enableFetchDedupe();
		disableFetchDedupe();
		disableFetchDedupe();
		disableFetchDedupe();
		expect(isFetchDedupeEnabled()).toBe(false);
		expect(globalThis.fetch).toBe(originalFetch);
	});

	it("re-enable after full disable works", () => {
		enableFetchDedupe();
		disableFetchDedupe();
		expect(isFetchDedupeEnabled()).toBe(false);
		enableFetchDedupe();
		expect(isFetchDedupeEnabled()).toBe(true);
		expect(globalThis.fetch).not.toBe(originalFetch);
	});
});

describe("isFetchDedupeEnabled", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		if (isFetchDedupeEnabled()) {
			disableFetchDedupe();
		}
		globalThis.fetch = originalFetch;
	});

	it("before enable → false", () => {
		expect(isFetchDedupeEnabled()).toBe(false);
	});

	it("after enable → true", () => {
		enableFetchDedupe();
		expect(isFetchDedupeEnabled()).toBe(true);
	});

	it("after disable → false", () => {
		enableFetchDedupe();
		disableFetchDedupe();
		expect(isFetchDedupeEnabled()).toBe(false);
	});
});
