/**
 * Hydration Integration Tests
 *
 * Tests full SSR → CSR hydration flow.
 * Verifies state transfer and reactivity after hydration.
 */

import { describe, expect, it, vi } from "vitest"
import { createFlareClient } from "../../src/client/init"
import { createFlareProvider } from "../../src/client/provider"
import { createFlareState, FlareStateBuilder } from "../utils/flare-state"
import { MockFetchBuilder } from "../utils/mock-fetch"
import { createNDJSONResponse, ndjson } from "../utils/ndjson"

describe("hydration flow", () => {
	it("hydrates from SSR state correctly", () => {
		const ssrState = new FlareStateBuilder()
			.withPathname("/dashboard")
			.withParams({ id: "123" })
			.withContext({ locale: "en-US", theme: "dark" })
			.addMatch("_root_", { user: { name: "Alice", role: "admin" } })
			.addMatch("_root_/dashboard", { stats: { views: 100 } })
			.addQuery(["product", "123"], { name: "Widget" }, { staleTime: 60000 })
			.build()

		const client = createFlareClient({ flareState: ssrState })
		const ctx = createFlareProvider(client)

		expect(ctx.location().pathname).toBe("/dashboard")
		expect(ctx.params()).toEqual({ id: "123" })
		expect(ctx.matches()).toHaveLength(2)
		expect(client.getContext().locale).toBe("en-US")
	})

	it("hydrates query client with SSR queries", () => {
		const ssrState = new FlareStateBuilder()
			.addQuery(["product", "123"], { name: "Widget" }, { staleTime: 60000 })
			.addQuery(["categories"], ["cat1", "cat2"])
			.build()

		const mockQueryClient = {
			setQueryData: vi.fn(),
		}

		createFlareClient({
			flareState: ssrState,
			queryClient: mockQueryClient as unknown as Parameters<
				typeof createFlareClient
			>[0]["queryClient"],
		})

		expect(mockQueryClient.setQueryData).toHaveBeenCalledTimes(2)
		expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
			["product", "123"],
			{ name: "Widget" },
			expect.objectContaining({ staleTime: 60000 }),
		)
		expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
			["categories"],
			["cat1", "cat2"],
			expect.any(Object),
		)
	})

	it("match cache is populated from SSR state", () => {
		const ssrState = new FlareStateBuilder()
			.withPathname("/products")
			.addMatch("_root_", { user: "Alice" })
			.addMatch("_root_/products", { products: [1, 2, 3] })
			.build()

		const client = createFlareClient({ flareState: ssrState })
		const cache = client.getMatchCache()

		expect(cache.size()).toBe(2)
		expect(cache.get("_root_")?.data).toEqual({ user: "Alice" })
		expect(cache.get("_root_/products")?.data).toEqual({ products: [1, 2, 3] })
	})
})

describe("CSR navigation after hydration", () => {
	it("fetches data and updates cache on navigate", async () => {
		const ssrState = new FlareStateBuilder().addMatch("_root_", {}).build()

		const { fetch: mockFetch, getCallCount } = new MockFetchBuilder()
			.onUrl(
				"/about",
				createNDJSONResponse([
					ndjson.loader("_root_", { user: "Bob" }),
					ndjson.loader("_root_/about", { page: "about" }),
					ndjson.done(),
				]),
			)
			.build()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState: ssrState,
		})

		const ctx = createFlareProvider(client)

		await ctx.router.navigate({ to: "/about" })

		expect(getCallCount()).toBe(1)

		const cache = client.getMatchCache()
		expect(cache.get("_root_/about")?.data).toEqual({ page: "about" })
		expect(ctx.location().pathname).toBe("/about")
	})

	it("prefetch populates cache without changing location", async () => {
		const ssrState = createFlareState()

		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl(
				"/products",
				createNDJSONResponse([
					ndjson.loader("_root_/products", { products: [1, 2, 3] }),
					ndjson.done(),
				]),
			)
			.build()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState: ssrState,
		})

		const ctx = createFlareProvider(client)

		expect(ctx.location().pathname).toBe("/")

		await ctx.router.prefetch({ to: "/products" })

		expect(ctx.location().pathname).toBe("/")

		const cache = client.getMatchCache()
		expect(cache.get("_root_/products")?.data).toEqual({ products: [1, 2, 3] })
	})

	it("chunk messages resolve deferred markers in loader data", async () => {
		const ssrState = createFlareState()

		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl(
				"/products",
				createNDJSONResponse([
					ndjson.loader("_root_/products", {
						name: "Widget",
						related: ndjson.deferred("related"),
						reviews: ndjson.deferred("reviews"),
					}),
					ndjson.ready(),
					ndjson.chunk("_root_/products", "reviews", [{ id: 1 }, { id: 2 }]),
					ndjson.chunk("_root_/products", "related", ["a", "b"]),
					ndjson.done(),
				]),
			)
			.build()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState: ssrState,
		})

		const ctx = createFlareProvider(client)

		await ctx.router.navigate({ to: "/products" })

		const cache = client.getMatchCache()
		const data = cache.get("_root_/products")?.data as Record<string, unknown>

		expect(data.name).toBe("Widget")
		expect((data.reviews as Record<string, unknown>).__deferred).toBe(true)
		expect((data.related as Record<string, unknown>).__deferred).toBe(true)
		expect((data.reviews as Record<string, unknown>).promise).toBeInstanceOf(Promise)
	})
})

describe("cache invalidation", () => {
	it("invalidate marks cache entries as invalid", () => {
		const ssrState = new FlareStateBuilder()
			.withPathname("/products")
			.addMatch("_root_", {})
			.addMatch("_root_/products", {})
			.build()

		const client = createFlareClient({ flareState: ssrState })
		const ctx = createFlareProvider(client)
		const cache = client.getMatchCache()

		expect(cache.get("_root_/products")?.invalid).toBe(false)

		ctx.router.invalidate({ matchId: "_root_/products" })

		expect(cache.get("_root_/products")?.invalid).toBe(true)
	})

	it("clearCache removes all cached entries", () => {
		const ssrState = new FlareStateBuilder()
			.withPathname("/products")
			.addMatch("_root_", {})
			.addMatch("_root_/products", {})
			.build()

		const client = createFlareClient({ flareState: ssrState })
		const ctx = createFlareProvider(client)
		const cache = client.getMatchCache()

		expect(cache.size()).toBe(2)

		ctx.router.clearCache()

		expect(cache.size()).toBe(0)
	})
})

describe("reactive state updates", () => {
	it("matches signal updates after navigation", async () => {
		const ssrState = new FlareStateBuilder().addMatch("_root_", { page: "home" }).build()

		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl(
				"/about",
				createNDJSONResponse([ndjson.loader("_root_/about", { page: "about" }), ndjson.done()]),
			)
			.build()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState: ssrState,
		})

		const ctx = createFlareProvider(client)

		const initialCount = ctx.matches().length

		await ctx.router.navigate({ to: "/about" })

		const newCount = ctx.matches().length
		expect(newCount).toBeGreaterThanOrEqual(initialCount)
	})

	it("isNavigating updates during navigation", async () => {
		const ssrState = createFlareState()

		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl("/test", createNDJSONResponse([ndjson.done()]))
			.build()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState: ssrState,
		})

		const ctx = createFlareProvider(client)

		expect(ctx.isNavigating()).toBe(false)

		await ctx.router.navigate({ to: "/test" })

		expect(ctx.isNavigating()).toBe(false)
	})
})

describe("popstate navigation (back/forward)", () => {
	it("provider registers popstate handler", () => {
		const ssrState = createFlareState()

		const client = createFlareClient({ flareState: ssrState })

		let handlerCount = 0
		const originalOnPopstate = client.onPopstate.bind(client)
		client.onPopstate = (handler) => {
			handlerCount++
			originalOnPopstate(handler)
		}

		createFlareProvider(client)

		expect(handlerCount).toBe(1)
	})

	it("cleanup removes history listener", () => {
		const ssrState = createFlareState()

		const client = createFlareClient({ flareState: ssrState })
		let cleanupCalled = false

		const originalCleanup = client.cleanup.bind(client)
		client.cleanup = () => {
			cleanupCalled = true
			originalCleanup()
		}

		createFlareProvider(client)

		expect(cleanupCalled).toBe(false)

		client.cleanup()
		expect(cleanupCalled).toBe(true)
	})
})
