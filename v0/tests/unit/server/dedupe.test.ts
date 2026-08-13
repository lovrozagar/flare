/**
 * Server Dedupe Unit Tests
 *
 * Tests per-request async deduplication.
 * Same function + same args + same request = same promise.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runWithServerContext } from "../../../src/server/context/request-context"
import {
	dedupe,
	disableFetchDedupe,
	enableFetchDedupe,
	isFetchDedupeEnabled,
} from "../../../src/server/dedupe"

function createTestContext() {
	return {
		nonce: "test-nonce",
		request: new Request("https://example.com"),
	}
}

describe("dedupe", () => {
	it("returns a function", () => {
		const fn = dedupe(async () => "result")
		expect(typeof fn).toBe("function")
	})

	it("executes wrapped function", async () => {
		await runWithServerContext(createTestContext(), async () => {
			const fn = dedupe(async () => "result")
			const result = await fn()
			expect(result).toBe("result")
		})
	})

	it("passes arguments to wrapped function", async () => {
		await runWithServerContext(createTestContext(), async () => {
			const fn = dedupe(async (a: number, b: number) => a + b)
			const result = await fn(2, 3)
			expect(result).toBe(5)
		})
	})

	it("deduplicates same args within request", async () => {
		await runWithServerContext(createTestContext(), async () => {
			const spy = vi.fn().mockResolvedValue("result")
			const fn = dedupe(spy)

			const [r1, r2, r3] = await Promise.all([fn("a"), fn("a"), fn("a")])

			expect(spy).toHaveBeenCalledTimes(1)
			expect(r1).toBe("result")
			expect(r2).toBe("result")
			expect(r3).toBe("result")
		})
	})

	it("executes separately for different args", async () => {
		await runWithServerContext(createTestContext(), async () => {
			const spy = vi.fn().mockImplementation((x: string) => Promise.resolve(x.toUpperCase()))
			const fn = dedupe(spy)

			const [r1, r2] = await Promise.all([fn("a"), fn("b")])

			expect(spy).toHaveBeenCalledTimes(2)
			expect(r1).toBe("A")
			expect(r2).toBe("B")
		})
	})

	it("returns same promise for concurrent calls", async () => {
		await runWithServerContext(createTestContext(), async () => {
			const fn = dedupe(async () => ({ id: Math.random() }))

			const p1 = fn()
			const p2 = fn()

			expect(p1).toBe(p2)
		})
	})

	it("isolates cache between requests", async () => {
		const spy = vi.fn().mockResolvedValue("result")
		const fn = dedupe(spy)

		await runWithServerContext(createTestContext(), async () => {
			await fn("x")
		})

		await runWithServerContext(createTestContext(), async () => {
			await fn("x")
		})

		expect(spy).toHaveBeenCalledTimes(2)
	})

	it("handles complex arguments via JSON serialization", async () => {
		await runWithServerContext(createTestContext(), async () => {
			const spy = vi.fn().mockResolvedValue("result")
			const fn = dedupe(spy)

			await Promise.all([fn({ id: 1, name: "test" }), fn({ id: 1, name: "test" })])

			expect(spy).toHaveBeenCalledTimes(1)
		})
	})

	it("treats different object references with same values as same key", async () => {
		await runWithServerContext(createTestContext(), async () => {
			const spy = vi.fn().mockResolvedValue("result")
			const fn = dedupe(spy)

			const obj1 = { id: 1 }
			const obj2 = { id: 1 }

			await Promise.all([fn(obj1), fn(obj2)])

			expect(spy).toHaveBeenCalledTimes(1)
		})
	})

	it("propagates errors", async () => {
		await runWithServerContext(createTestContext(), async () => {
			const fn = dedupe(async () => {
				throw new Error("test error")
			})

			await expect(fn()).rejects.toThrow("test error")
		})
	})

	it("caches rejected promises (same error for all callers)", async () => {
		await runWithServerContext(createTestContext(), async () => {
			let callCount = 0
			const fn = dedupe(async () => {
				callCount++
				throw new Error("fail")
			})

			const results = await Promise.allSettled([fn(), fn(), fn()])

			expect(callCount).toBe(1)
			expect(results.every((r) => r.status === "rejected")).toBe(true)
		})
	})

	it("throws when called outside request context", () => {
		const fn = dedupe(async () => "result")

		expect(() => fn()).toThrow("getServerRequestContext called outside request context")
	})
})

describe("dedupe with multiple wrapped functions", () => {
	it("each wrapped function has its own cache", async () => {
		await runWithServerContext(createTestContext(), async () => {
			const spy1 = vi.fn().mockResolvedValue("fn1")
			const spy2 = vi.fn().mockResolvedValue("fn2")

			const fn1 = dedupe(spy1)
			const fn2 = dedupe(spy2)

			const [r1, r2] = await Promise.all([fn1("x"), fn2("x")])

			expect(spy1).toHaveBeenCalledTimes(1)
			expect(spy2).toHaveBeenCalledTimes(1)
			expect(r1).toBe("fn1")
			expect(r2).toBe("fn2")
		})
	})

	it("maintains separate caches across requests", async () => {
		const spy1 = vi.fn().mockResolvedValue("fn1")
		const spy2 = vi.fn().mockResolvedValue("fn2")

		const fn1 = dedupe(spy1)
		const fn2 = dedupe(spy2)

		await runWithServerContext(createTestContext(), async () => {
			await fn1("a")
			await fn2("a")
		})

		await runWithServerContext(createTestContext(), async () => {
			await fn1("a")
			await fn2("a")
		})

		expect(spy1).toHaveBeenCalledTimes(2)
		expect(spy2).toHaveBeenCalledTimes(2)
	})
})

describe("fetch deduplication", () => {
	let originalFetch: typeof fetch
	let fetchSpy: ReturnType<typeof vi.fn>

	beforeEach(() => {
		originalFetch = globalThis.fetch
		fetchSpy = vi.fn().mockImplementation(async (url: string) => {
			return new Response(JSON.stringify({ url }), {
				headers: { "Content-Type": "application/json" },
			})
		})
		globalThis.fetch = fetchSpy
	})

	afterEach(() => {
		disableFetchDedupe()
		globalThis.fetch = originalFetch
	})

	it("enableFetchDedupe patches global fetch", () => {
		const before = globalThis.fetch
		enableFetchDedupe()
		expect(globalThis.fetch).not.toBe(before)
		expect(isFetchDedupeEnabled()).toBe(true)
	})

	it("disableFetchDedupe restores original fetch", () => {
		enableFetchDedupe()
		disableFetchDedupe()
		expect(globalThis.fetch).toBe(fetchSpy)
		expect(isFetchDedupeEnabled()).toBe(false)
	})

	it("deduplicates GET requests with same URL", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			const [r1, r2, r3] = await Promise.all([
				fetch("https://api.example.com/users"),
				fetch("https://api.example.com/users"),
				fetch("https://api.example.com/users"),
			])

			expect(fetchSpy).toHaveBeenCalledTimes(1)

			const [d1, d2, d3] = await Promise.all([r1.json(), r2.json(), r3.json()])
			expect(d1).toEqual({ url: "https://api.example.com/users" })
			expect(d2).toEqual({ url: "https://api.example.com/users" })
			expect(d3).toEqual({ url: "https://api.example.com/users" })
		})
	})

	it("does not dedupe different URLs", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await Promise.all([
				fetch("https://api.example.com/users"),
				fetch("https://api.example.com/posts"),
			])

			expect(fetchSpy).toHaveBeenCalledTimes(2)
		})
	})

	it("does not dedupe POST requests", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await Promise.all([
				fetch("https://api.example.com/users", { method: "POST" }),
				fetch("https://api.example.com/users", { method: "POST" }),
			])

			expect(fetchSpy).toHaveBeenCalledTimes(2)
		})
	})

	it("does not dedupe PUT requests", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await Promise.all([
				fetch("https://api.example.com/users", { method: "PUT" }),
				fetch("https://api.example.com/users", { method: "PUT" }),
			])

			expect(fetchSpy).toHaveBeenCalledTimes(2)
		})
	})

	it("deduplicates HEAD requests", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await Promise.all([
				fetch("https://api.example.com/users", { method: "HEAD" }),
				fetch("https://api.example.com/users", { method: "HEAD" }),
			])

			expect(fetchSpy).toHaveBeenCalledTimes(1)
		})
	})

	it("isolates cache between requests", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await fetch("https://api.example.com/users")
		})

		await runWithServerContext(createTestContext(), async () => {
			await fetch("https://api.example.com/users")
		})

		expect(fetchSpy).toHaveBeenCalledTimes(2)
	})

	it("works with URL objects", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			const url = new URL("https://api.example.com/users")
			await Promise.all([fetch(url), fetch(url)])

			expect(fetchSpy).toHaveBeenCalledTimes(1)
		})
	})

	it("works with Request objects", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await Promise.all([
				fetch(new Request("https://api.example.com/users")),
				fetch(new Request("https://api.example.com/users")),
			])

			expect(fetchSpy).toHaveBeenCalledTimes(1)
		})
	})

	it("does not dedupe Request objects with non-GET method", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await Promise.all([
				fetch(new Request("https://api.example.com/users", { method: "POST" })),
				fetch(new Request("https://api.example.com/users", { method: "POST" })),
			])

			expect(fetchSpy).toHaveBeenCalledTimes(2)
		})
	})

	it("falls back to original fetch outside request context", async () => {
		enableFetchDedupe()

		/* Call fetch outside of runWithServerContext */
		await fetch("https://api.example.com/users")
		await fetch("https://api.example.com/users")

		/* Should not dedupe - no request context */
		expect(fetchSpy).toHaveBeenCalledTimes(2)
	})

	it("each response has independent body stream", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			const [r1, r2] = await Promise.all([
				fetch("https://api.example.com/users"),
				fetch("https://api.example.com/users"),
			])

			/* Both responses should be readable independently */
			const text1 = await r1.text()
			const text2 = await r2.text()

			expect(text1).toBe(text2)
		})
	})

	it("does not dedupe requests with different Authorization headers", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await Promise.all([
				fetch("https://api.example.com/users", {
					headers: { Authorization: "Bearer token-1" },
				}),
				fetch("https://api.example.com/users", {
					headers: { Authorization: "Bearer token-2" },
				}),
			])

			expect(fetchSpy).toHaveBeenCalledTimes(2)
		})
	})

	it("dedupes requests with same Authorization header", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await Promise.all([
				fetch("https://api.example.com/users", {
					headers: { Authorization: "Bearer same-token" },
				}),
				fetch("https://api.example.com/users", {
					headers: { Authorization: "Bearer same-token" },
				}),
			])

			expect(fetchSpy).toHaveBeenCalledTimes(1)
		})
	})

	it("does not dedupe requests with different custom headers", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await Promise.all([
				fetch("https://api.example.com/users", {
					headers: { "Accept-Language": "en" },
				}),
				fetch("https://api.example.com/users", {
					headers: { "Accept-Language": "fr" },
				}),
			])

			expect(fetchSpy).toHaveBeenCalledTimes(2)
		})
	})

	it("ignores trace headers in cache key (traceparent)", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await Promise.all([
				fetch("https://api.example.com/users", {
					headers: { traceparent: "00-trace1-span1-01" },
				}),
				fetch("https://api.example.com/users", {
					headers: { traceparent: "00-trace2-span2-01" },
				}),
			])

			/* Should dedupe - traceparent excluded from key */
			expect(fetchSpy).toHaveBeenCalledTimes(1)
		})
	})

	it("ignores x-request-id in cache key", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await Promise.all([
				fetch("https://api.example.com/users", {
					headers: { "x-request-id": "req-1" },
				}),
				fetch("https://api.example.com/users", {
					headers: { "x-request-id": "req-2" },
				}),
			])

			/* Should dedupe - x-request-id excluded from key */
			expect(fetchSpy).toHaveBeenCalledTimes(1)
		})
	})

	it("handles Headers object", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			const headers1 = new Headers({ Authorization: "Bearer token" })
			const headers2 = new Headers({ Authorization: "Bearer token" })

			await Promise.all([
				fetch("https://api.example.com/users", { headers: headers1 }),
				fetch("https://api.example.com/users", { headers: headers2 }),
			])

			expect(fetchSpy).toHaveBeenCalledTimes(1)
		})
	})

	it("handles array-style headers", async () => {
		enableFetchDedupe()

		await runWithServerContext(createTestContext(), async () => {
			await Promise.all([
				fetch("https://api.example.com/users", {
					headers: [["Authorization", "Bearer token"]],
				}),
				fetch("https://api.example.com/users", {
					headers: [["Authorization", "Bearer token"]],
				}),
			])

			expect(fetchSpy).toHaveBeenCalledTimes(1)
		})
	})
})
