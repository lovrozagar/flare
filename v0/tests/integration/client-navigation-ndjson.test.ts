/**
 * Client NDJSON Navigation Integration Tests
 *
 * Tests server-to-client NDJSON protocol compatibility.
 * Uses actual server NDJSON generation with client fetcher.
 */

import { describe, expect, it, vi } from "vitest"
import { createNdjsonNavFetcher } from "../../src/client/ndjson-nav"
import {
	createNDJSONResponse,
	createStreamingNDJSONResponse,
	type DeferContext,
	type LoaderResult,
	type RouteHead,
} from "../../src/server/handler/ndjson-nav"

/* ============================================================================
 * Helper Functions
 * ============================================================================ */

function createLoaderResult(
	matchId: string,
	data?: unknown,
	preloaderContext?: unknown,
): LoaderResult {
	return {
		data,
		matchId,
		preloaderContext,
		status: "success",
	}
}

function createErrorResult(matchId: string, error: Error): LoaderResult {
	return {
		error,
		matchId,
		status: "error",
	}
}

function createDeferContext(
	deferred: Array<{ key: string; matchId?: string; promise: Promise<unknown>; stream?: boolean }>,
): DeferContext {
	return {
		getDeferred: () =>
			deferred.map((d) => ({
				key: d.key,
				matchId: d.matchId ?? null,
				promise: d.promise,
				stream: d.stream ?? true,
			})),
	}
}

/* ============================================================================
 * Protocol Compatibility - Static Responses
 * ============================================================================ */

describe("server-client protocol compatibility (static)", () => {
	describe("basic loader data", () => {
		it("client consumes server-generated loader response", async () => {
			const serverResponse = createNDJSONResponse([
				createLoaderResult("_root_", { user: "alice" }),
				createLoaderResult("_root_/products", { items: [1, 2, 3] }),
			])

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/products" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.matches).toHaveLength(2)
				expect(result.state.matches[0].id).toBe("_root_")
				expect(result.state.matches[0].loaderData).toEqual({ user: "alice" })
				expect(result.state.matches[1].id).toBe("_root_/products")
				expect(result.state.matches[1].loaderData).toEqual({ items: [1, 2, 3] })
			}
		})

		it("client receives preloader context from server", async () => {
			const serverResponse = createNDJSONResponse([
				createLoaderResult("_root_", { data: "test" }, { auth: { role: "admin" } }),
			])

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/test" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.matches[0].preloaderContext).toEqual({ auth: { role: "admin" } })
			}
		})

		it("client handles undefined loader data", async () => {
			const serverResponse = createNDJSONResponse([createLoaderResult("_root_", undefined)])

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.matches[0].loaderData).toBeUndefined()
			}
		})

		it("client handles null loader data", async () => {
			const serverResponse = createNDJSONResponse([createLoaderResult("_root_", null)])

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.matches[0].loaderData).toBeNull()
			}
		})
	})

	describe("head config", () => {
		it("client receives merged head config", async () => {
			const serverResponse = createNDJSONResponse([createLoaderResult("_root_", {})], {
				description: "Page description",
				title: "Page Title",
			})

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/" })

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.head).toEqual({ description: "Page description", title: "Page Title" })
			}
		})

		it("client receives per-route head configs", async () => {
			const perRouteHeads: RouteHead[] = [
				{ head: { title: "Root Layout" }, matchId: "_root_" },
				{ head: { description: "Products page", title: "Products" }, matchId: "_root_/products" },
			]

			const serverResponse = createNDJSONResponse(
				[createLoaderResult("_root_", {}), createLoaderResult("_root_/products", {})],
				undefined,
				undefined,
				perRouteHeads,
			)

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/products" })

			expect(result.success).toBe(true)
			if (result.success && result.perRouteHeads) {
				expect(result.perRouteHeads).toHaveLength(2)
				expect(result.perRouteHeads).toContainEqual({
					head: { title: "Root Layout" },
					matchId: "_root_",
				})
				expect(result.perRouteHeads).toContainEqual({
					head: { description: "Products page", title: "Products" },
					matchId: "_root_/products",
				})
			}
		})

		it("per-route heads take precedence over merged head", async () => {
			const perRouteHeads: RouteHead[] = [{ head: { title: "Per-Route Title" }, matchId: "_root_" }]

			const serverResponse = createNDJSONResponse(
				[createLoaderResult("_root_", {})],
				{ title: "Merged Title (ignored)" },
				undefined,
				perRouteHeads,
			)

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/" })

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.head).toBeUndefined()
				expect(result.perRouteHeads).toContainEqual({
					head: { title: "Per-Route Title" },
					matchId: "_root_",
				})
			}
		})
	})

	describe("query state", () => {
		it("client receives query state for hydration", async () => {
			const queries = [
				{ data: { name: "Alice" }, key: ["user", 1] },
				{ data: [1, 2, 3], key: ["items"] },
			]

			const serverResponse = createNDJSONResponse(
				[createLoaderResult("_root_", {})],
				undefined,
				queries,
			)

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.queries).toHaveLength(2)
				expect(result.state.queries[0]).toEqual({ data: { name: "Alice" }, key: ["user", 1] })
				expect(result.state.queries[1]).toEqual({ data: [1, 2, 3], key: ["items"] })
			}
		})
	})

	describe("error handling", () => {
		it("client receives loader error from server", async () => {
			const serverResponse = createNDJSONResponse([
				createErrorResult("_root_", new Error("Loader failed")),
			])

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.matches).toHaveLength(0)
			}
		})
	})
})

/* ============================================================================
 * Protocol Compatibility - Streaming Responses
 * ============================================================================ */

describe("server-client protocol compatibility (streaming)", () => {
	describe("deferred data", () => {
		it("client hydrates deferred markers into promises", async () => {
			/* Server creates response with deferred data */
			const deferredPromise = Promise.resolve({ resolved: true })
			const loaderData = {
				__deferred: true,
				__key: "lazyKey",
				promise: deferredPromise,
			}

			const deferContext = createDeferContext([{ key: "lazyKey", promise: deferredPromise }])

			const serverResponse = createStreamingNDJSONResponse(
				[createLoaderResult("_root_", { immediate: "value", lazy: loaderData })],
				new Map([["_root_", deferContext]]),
			)

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				const data = result.state.matches[0].loaderData as Record<string, unknown>
				expect(data.immediate).toBe("value")
				expect(data.lazy).toHaveProperty("promise")
				expect(data.lazy).toHaveProperty("__deferred", true)
			}
		})

		it("client resolves deferred promise when chunk arrives", async () => {
			const deferredPromise = new Promise<unknown>((resolve) => {
				setTimeout(() => resolve({ slowData: "loaded" }), 10)
			})

			const loaderData = {
				__deferred: true,
				__key: "slow",
				promise: deferredPromise,
			}

			const deferContext = createDeferContext([{ key: "slow", promise: deferredPromise }])

			const serverResponse = createStreamingNDJSONResponse(
				[createLoaderResult("_root_", { deferred: loaderData })],
				new Map([["_root_", deferContext]]),
			)

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				const data = result.state.matches[0].loaderData as Record<
					string,
					{ promise: Promise<unknown> }
				>
				const resolved = await data.deferred.promise
				expect(resolved).toEqual({ slowData: "loaded" })
			}
		})

		it("client handles multiple deferred values independently", async () => {
			const firstPromise = new Promise<unknown>((resolve) =>
				setTimeout(() => resolve("first-value"), 20),
			)
			const secondPromise = new Promise<unknown>((resolve) =>
				setTimeout(() => resolve("second-value"), 10),
			)

			const loaderData = {
				first: { __deferred: true, __key: "first", promise: firstPromise },
				second: { __deferred: true, __key: "second", promise: secondPromise },
			}

			const deferContext = createDeferContext([
				{ key: "first", promise: firstPromise },
				{ key: "second", promise: secondPromise },
			])

			const serverResponse = createStreamingNDJSONResponse(
				[createLoaderResult("_root_", loaderData)],
				new Map([["_root_", deferContext]]),
			)

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				const data = result.state.matches[0].loaderData as Record<
					string,
					{ promise: Promise<unknown> }
				>
				const [first, second] = await Promise.all([data.first.promise, data.second.promise])
				expect(first).toBe("first-value")
				expect(second).toBe("second-value")
			}
		})

		it("client handles deferred in nested routes", async () => {
			const nestedPromise = Promise.resolve([1, 2, 3])

			const nestedLoaderData = {
				items: { __deferred: true, __key: "items", promise: nestedPromise },
			}

			const deferContext = createDeferContext([{ key: "items", promise: nestedPromise }])

			const serverResponse = createStreamingNDJSONResponse(
				[
					createLoaderResult("_root_", { user: "alice" }),
					createLoaderResult("_root_/products", nestedLoaderData),
				],
				new Map([["_root_/products", deferContext]]),
			)

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/products" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.matches[0].loaderData).toEqual({ user: "alice" })
				const productsData = result.state.matches[1].loaderData as Record<
					string,
					{ promise: Promise<unknown> }
				>
				const items = await productsData.items.promise
				expect(items).toEqual([1, 2, 3])
			}
		})
	})

	describe("streaming with head and queries", () => {
		it("client receives head config in streaming response", async () => {
			const serverResponse = createStreamingNDJSONResponse(
				[createLoaderResult("_root_", {})],
				new Map(),
				{ title: "Streaming Page" },
			)

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/" })

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.head).toEqual({ title: "Streaming Page" })
			}
		})

		it("client receives per-route heads in streaming response", async () => {
			const perRouteHeads: RouteHead[] = [
				{ head: { title: "Layout" }, matchId: "_root_" },
				{ head: { title: "Page" }, matchId: "_root_/page" },
			]

			const serverResponse = createStreamingNDJSONResponse(
				[createLoaderResult("_root_", {}), createLoaderResult("_root_/page", {})],
				new Map(),
				undefined,
				undefined,
				perRouteHeads,
			)

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/page" })

			expect(result.success).toBe(true)
			if (result.success && result.perRouteHeads) {
				expect(result.perRouteHeads).toHaveLength(2)
			}
		})

		it("client receives queries in streaming response", async () => {
			const queries = [{ data: { cached: true }, key: ["cache", "entry"] }]

			const serverResponse = createStreamingNDJSONResponse(
				[createLoaderResult("_root_", {})],
				new Map(),
				undefined,
				queries,
			)

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.queries).toHaveLength(1)
				expect(result.state.queries[0]).toEqual({ data: { cached: true }, key: ["cache", "entry"] })
			}
		})
	})

	describe("fallback to static response", () => {
		it("falls back to static when no streaming deferred", async () => {
			/* No deferred in loader data, no defer contexts */
			const serverResponse = createStreamingNDJSONResponse(
				[createLoaderResult("_root_", { immediate: "data" })],
				new Map(),
			)

			const mockFetch = vi.fn().mockResolvedValue(serverResponse)
			const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
			const result = await fetcher.fetch({ url: "/" })

			expect(result.success).toBe(true)
			if (result.success && result.state) {
				expect(result.state.matches[0].loaderData).toEqual({ immediate: "data" })
			}
		})
	})
})

/* ============================================================================
 * Complex Data Types
 * ============================================================================ */

describe("complex data serialization", () => {
	it("handles nested objects through round-trip", async () => {
		const complexData = {
			level1: {
				level2: {
					level3: {
						value: "deep",
					},
				},
			},
		}

		const serverResponse = createNDJSONResponse([createLoaderResult("_root_", complexData)])
		const mockFetch = vi.fn().mockResolvedValue(serverResponse)
		const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
		const result = await fetcher.fetch({ url: "/" })

		expect(result.success).toBe(true)
		if (result.success && result.state) {
			expect(result.state.matches[0].loaderData).toEqual(complexData)
		}
	})

	it("handles arrays through round-trip", async () => {
		const arrayData = {
			items: [
				{ id: 1, name: "One" },
				{ id: 2, name: "Two" },
				{ id: 3, name: "Three" },
			],
		}

		const serverResponse = createNDJSONResponse([createLoaderResult("_root_", arrayData)])
		const mockFetch = vi.fn().mockResolvedValue(serverResponse)
		const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
		const result = await fetcher.fetch({ url: "/" })

		expect(result.success).toBe(true)
		if (result.success && result.state) {
			expect(result.state.matches[0].loaderData).toEqual(arrayData)
		}
	})

	it("handles mixed types through round-trip", async () => {
		const mixedData = {
			array: [1, "two", true, null],
			boolean: true,
			nested: { a: 1, b: "two" },
			null: null,
			number: 42,
			string: "hello",
		}

		const serverResponse = createNDJSONResponse([createLoaderResult("_root_", mixedData)])
		const mockFetch = vi.fn().mockResolvedValue(serverResponse)
		const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
		const result = await fetcher.fetch({ url: "/" })

		expect(result.success).toBe(true)
		if (result.success && result.state) {
			expect(result.state.matches[0].loaderData).toEqual(mixedData)
		}
	})

	it("handles special characters in strings", async () => {
		const specialChars = {
			emoji: "Hello 👋 World 🌍",
			escaped: 'Line1\nLine2\tTabbed"Quoted"',
			unicode: "日本語テキスト",
		}

		const serverResponse = createNDJSONResponse([createLoaderResult("_root_", specialChars)])
		const mockFetch = vi.fn().mockResolvedValue(serverResponse)
		const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
		const result = await fetcher.fetch({ url: "/" })

		expect(result.success).toBe(true)
		if (result.success && result.state) {
			expect(result.state.matches[0].loaderData).toEqual(specialChars)
		}
	})
})

/* ============================================================================
 * Route Hierarchy
 * ============================================================================ */

describe("route hierarchy", () => {
	it("preserves order of matches from server", async () => {
		const serverResponse = createNDJSONResponse([
			createLoaderResult("_root_", { level: 0 }),
			createLoaderResult("_root_/users", { level: 1 }),
			createLoaderResult("_root_/users/[id]", { level: 2 }),
			createLoaderResult("_root_/users/[id]/settings", { level: 3 }),
		])

		const mockFetch = vi.fn().mockResolvedValue(serverResponse)
		const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
		const result = await fetcher.fetch({ url: "/users/123/settings" })

		expect(result.success).toBe(true)
		if (result.success && result.state) {
			expect(result.state.matches).toHaveLength(4)
			expect(result.state.matches.map((m) => m.id)).toEqual([
				"_root_",
				"_root_/users",
				"_root_/users/[id]",
				"_root_/users/[id]/settings",
			])
		}
	})

	it("each match has independent data and preloader context", async () => {
		const serverResponse = createNDJSONResponse([
			createLoaderResult("_root_", { rootData: true }, { rootContext: true }),
			createLoaderResult("_root_/page", { pageData: true }, { pageContext: true }),
		])

		const mockFetch = vi.fn().mockResolvedValue(serverResponse)
		const fetcher = createNdjsonNavFetcher({ baseUrl: "", fetch: mockFetch })
		const result = await fetcher.fetch({ url: "/page" })

		expect(result.success).toBe(true)
		if (result.success && result.state) {
			expect(result.state.matches[0].loaderData).toEqual({ rootData: true })
			expect(result.state.matches[0].preloaderContext).toEqual({ rootContext: true })
			expect(result.state.matches[1].loaderData).toEqual({ pageData: true })
			expect(result.state.matches[1].preloaderContext).toEqual({ pageContext: true })
		}
	})
})
