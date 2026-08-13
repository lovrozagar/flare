/**
 * Client Initialization Unit Tests
 *
 * Tests flareClient() initialization for client-side hydration.
 * Reads self.flare state and sets up router.
 */

import { describe, expect, it, vi } from "vitest"
import {
	createFlareClient,
	type FlareClientConfig,
	parseFlareState,
} from "../../../src/client/init"
import { createFlareState, FlareStateBuilder } from "../../utils/flare-state"

/* ============================================================================
 * parseFlareState
 * ============================================================================ */

describe("parseFlareState", () => {
	describe("valid input", () => {
		it("parses valid flare state", () => {
			const raw = new FlareStateBuilder()
				.withContext({ locale: "en-US" })
				.addMatch("_root_", {})
				.addQuery(["product", "123"], { name: "Widget" })
				.build()

			const state = parseFlareState(raw)

			expect(state).toEqual(raw)
		})

		it("parses state with all context fields", () => {
			const raw = new FlareStateBuilder()
				.withContext({
					dir: "ltr",
					locale: "en-US",
					theme: "dark",
				})
				.withRouterDefaults({
					gcTime: 300000,
					navFormat: "html",
					prefetchIntent: "hover",
					prefetchStaleTime: 10000,
					staleTime: 60000,
					viewTransitions: true,
				})
				.build()

			const state = parseFlareState(raw)
			expect(state?.c.routerDefaults?.navFormat).toBe("html")
			expect(state?.c.routerDefaults?.viewTransitions).toBe(true)
		})

		it("parses state with matches and loader data", () => {
			const raw = new FlareStateBuilder()
				.withPathname("/products")
				.withParams({ category: "tech" })
				.addMatch("_root_", { user: "Alice" })
				.addMatch("_root_/products", { items: [1, 2, 3] })
				.build()

			const state = parseFlareState(raw)
			expect(state?.r.matches).toHaveLength(2)
			expect(state?.r.matches[0]?.loaderData).toEqual({ user: "Alice" })
		})

		it("parses state with preloader context in matches", () => {
			const raw = new FlareStateBuilder().addMatch("_root_", {}, { auth: { userId: 1 } }).build()

			const state = parseFlareState(raw)
			expect(state?.r.matches[0]?.preloaderContext).toEqual({ auth: { userId: 1 } })
		})

		it("parses state with multiple queries", () => {
			const raw = new FlareStateBuilder()
				.addQuery(["product", "123"], { name: "Widget" }, { staleTime: 60000 })
				.addQuery(["categories"], ["cat1", "cat2"])
				.build()

			const state = parseFlareState(raw)
			expect(state?.q).toHaveLength(2)
			expect(state?.q[0]?.staleTime).toBe(60000)
		})

		it("parses state with dev errors", () => {
			const raw = new FlareStateBuilder()
				.addDevError({ message: "Test error", name: "Error", source: "loader" })
				.build()

			const state = parseFlareState(raw)
			expect(state?.e).toHaveLength(1)
			expect(state?.e?.[0]?.source).toBe("loader")
		})
	})

	describe("invalid input", () => {
		it("returns null for null", () => {
			expect(parseFlareState(null)).toBeNull()
		})

		it("returns null for undefined", () => {
			expect(parseFlareState(undefined)).toBeNull()
		})

		it("returns null for string", () => {
			expect(parseFlareState("invalid")).toBeNull()
		})

		it("returns null for number", () => {
			expect(parseFlareState(123)).toBeNull()
		})

		it("returns null for array", () => {
			expect(parseFlareState([])).toBeNull()
		})

		it("returns null for empty object", () => {
			expect(parseFlareState({})).toBeNull()
		})
	})

	describe("missing required fields", () => {
		it("returns null when missing c field", () => {
			expect(parseFlareState({ q: [], r: { matches: [], params: {}, pathname: "/" } })).toBeNull()
		})

		it("returns null when missing q field", () => {
			expect(parseFlareState({ c: {}, r: { matches: [], params: {}, pathname: "/" } })).toBeNull()
		})

		it("returns null when missing r field", () => {
			expect(parseFlareState({ c: {}, q: [] })).toBeNull()
		})

		it("returns null when r missing matches", () => {
			expect(parseFlareState({ c: {}, q: [], r: { params: {}, pathname: "/" } })).toBeNull()
		})

		it("returns null when r missing params", () => {
			expect(parseFlareState({ c: {}, q: [], r: { matches: [], pathname: "/" } })).toBeNull()
		})

		it("returns null when r missing pathname", () => {
			expect(parseFlareState({ c: {}, q: [], r: { matches: [], params: {} } })).toBeNull()
		})
	})
})

/* ============================================================================
 * createFlareClient - basic creation
 * ============================================================================ */

describe("createFlareClient", () => {
	describe("basic creation", () => {
		it("creates client with empty config", () => {
			const client = createFlareClient({})

			expect(client).toBeDefined()
			expect(typeof client.getMatchCache).toBe("function")
			expect(typeof client.getRouter).toBe("function")
		})

		it("creates client with flare state", () => {
			const flareState = new FlareStateBuilder().withPathname("/products").build()

			const client = createFlareClient({ flareState })

			expect(client.getRouter().state.location.pathname).toBe("/products")
		})

		it("returns all required methods", () => {
			const client = createFlareClient({})

			expect(typeof client.cleanup).toBe("function")
			expect(typeof client.getContext).toBe("function")
			expect(typeof client.getMatchCache).toBe("function")
			expect(typeof client.getNavFormat).toBe("function")
			expect(typeof client.getParams).toBe("function")
			expect(typeof client.getPrefetchCache).toBe("function")
			expect(typeof client.getRouter).toBe("function")
			expect(typeof client.getScrollStore).toBe("function")
			expect(typeof client.onPopstate).toBe("function")
		})
	})

	describe("match cache initialization", () => {
		it("initializes match cache from flare state", () => {
			const flareState = new FlareStateBuilder()
				.withPathname("/products/123")
				.withParams({ id: "123" })
				.addMatch("_root_", { user: { name: "Alice" } })
				.addMatch("_root_/products", { products: [] })
				.build()

			const client = createFlareClient({ flareState })
			const cache = client.getMatchCache()

			expect(cache.size()).toBe(2)
		})

		it("stores loader data in cache entries", () => {
			const flareState = new FlareStateBuilder().addMatch("_root_", { user: "Bob" }).build()

			const client = createFlareClient({ flareState })
			const cache = client.getMatchCache()

			expect(cache.get("_root_")?.data).toEqual({ user: "Bob" })
		})

		it("stores preloader context in cache entries", () => {
			const flareState = new FlareStateBuilder().addMatch("_root_", {}, { auth: true }).build()

			const client = createFlareClient({ flareState })
			const cache = client.getMatchCache()

			expect(cache.get("_root_")?.preloaderContext).toEqual({ auth: true })
		})

		it("cache entries are marked as valid", () => {
			const flareState = new FlareStateBuilder().addMatch("_root_", {}).build()

			const client = createFlareClient({ flareState })
			const cache = client.getMatchCache()

			expect(cache.get("_root_")?.invalid).toBe(false)
		})
	})

	describe("router initialization", () => {
		it("initializes router with location from flare state", () => {
			const flareState = new FlareStateBuilder().withPathname("/products/123").build()

			const client = createFlareClient({ flareState })
			const router = client.getRouter()

			expect(router.state.location.pathname).toBe("/products/123")
		})

		it("initializes location with empty hash and search", () => {
			const flareState = createFlareState()
			const client = createFlareClient({ flareState })
			const router = client.getRouter()

			expect(router.state.location.hash).toBe("")
			expect(router.state.location.search).toBe("")
		})

		it("initializes isNavigating to false", () => {
			const client = createFlareClient({})
			const router = client.getRouter()

			expect(router.state.isNavigating).toBe(false)
		})

		it("defaults pathname to / when no flare state", () => {
			const client = createFlareClient({})
			const router = client.getRouter()

			expect(router.state.location.pathname).toBe("/")
		})
	})

	describe("context initialization", () => {
		it("stores context from flare state", () => {
			const flareState = new FlareStateBuilder()
				.withContext({
					dir: "ltr",
					locale: "en-US",
					theme: "light",
				})
				.withRouterDefaults({ prefetchIntent: "viewport", staleTime: 30000 })
				.build()

			const client = createFlareClient({ flareState })
			const ctx = client.getContext()

			expect(ctx.locale).toBe("en-US")
			expect(ctx.routerDefaults?.staleTime).toBe(30000)
		})

		it("returns empty context when no flare state", () => {
			const client = createFlareClient({})
			const ctx = client.getContext()

			expect(ctx).toEqual({})
		})

		it("stores all context fields", () => {
			const flareState = new FlareStateBuilder()
				.withContext({
					dir: "rtl",
					locale: "ar-SA",
					theme: "dark",
				})
				.build()

			const client = createFlareClient({ flareState })
			const ctx = client.getContext()

			expect(ctx.dir).toBe("rtl")
			expect(ctx.locale).toBe("ar-SA")
			expect(ctx.theme).toBe("dark")
		})
	})

	describe("params initialization", () => {
		it("stores params from flare state", () => {
			const flareState = new FlareStateBuilder()
				.withPathname("/products/123")
				.withParams({ id: "123", slug: "widget" })
				.build()

			const client = createFlareClient({ flareState })
			const params = client.getParams()

			expect(params).toEqual({ id: "123", slug: "widget" })
		})

		it("handles array params (catch-all routes)", () => {
			const flareState = new FlareStateBuilder()
				.withPathname("/blog/2024/01/post-title")
				.withParams({ slug: ["2024", "01", "post-title"] })
				.build()

			const client = createFlareClient({ flareState })
			const params = client.getParams()

			expect(params.slug).toEqual(["2024", "01", "post-title"])
		})

		it("returns empty params when no flare state", () => {
			const client = createFlareClient({})
			const params = client.getParams()

			expect(params).toEqual({})
		})
	})

	describe("nav format", () => {
		it("returns ndjson as default nav format", () => {
			const client = createFlareClient({})

			expect(client.getNavFormat()).toBe("ndjson")
		})

		it("returns nav format from router defaults", () => {
			const flareState = new FlareStateBuilder().withNavFormat("html").build()

			const client = createFlareClient({ flareState })

			expect(client.getNavFormat()).toBe("html")
		})
	})

	describe("prefetch cache", () => {
		it("returns prefetch cache instance", () => {
			const client = createFlareClient({})
			const prefetchCache = client.getPrefetchCache()

			expect(prefetchCache).toBeDefined()
			expect(typeof prefetchCache.mark).toBe("function")
			expect(typeof prefetchCache.shouldPrefetch).toBe("function")
		})
	})

	describe("scroll store", () => {
		it("returns scroll store instance", () => {
			const client = createFlareClient({})
			const scrollStore = client.getScrollStore()

			expect(scrollStore).toBeDefined()
			expect(typeof scrollStore.save).toBe("function")
			expect(typeof scrollStore.get).toBe("function")
		})
	})

	describe("cleanup", () => {
		it("cleanup method can be called", () => {
			const client = createFlareClient({})

			expect(() => client.cleanup()).not.toThrow()
		})
	})

	describe("popstate handler registration", () => {
		it("onPopstate registers handler", () => {
			const client = createFlareClient({})
			const handler = vi.fn()

			expect(() => client.onPopstate(handler)).not.toThrow()
		})

		it("can register multiple popstate handlers", () => {
			const client = createFlareClient({})
			const handler1 = vi.fn()
			const handler2 = vi.fn()

			client.onPopstate(handler1)
			client.onPopstate(handler2)

			/* Both handlers registered without error */
			expect(true).toBe(true)
		})
	})
})

/* ============================================================================
 * Client router methods
 * ============================================================================ */

describe("client router", () => {
	describe("method availability", () => {
		it("provides navigate method", () => {
			const client = createFlareClient({})
			const router = client.getRouter()

			expect(typeof router.navigate).toBe("function")
		})

		it("provides prefetch method", () => {
			const client = createFlareClient({})
			const router = client.getRouter()

			expect(typeof router.prefetch).toBe("function")
		})

		it("provides refetch method", () => {
			const client = createFlareClient({})
			const router = client.getRouter()

			expect(typeof router.refetch).toBe("function")
		})

		it("provides clearCache method", () => {
			const client = createFlareClient({})
			const router = client.getRouter()

			expect(typeof router.clearCache).toBe("function")
		})

		it("provides invalidate method", () => {
			const client = createFlareClient({})
			const router = client.getRouter()

			expect(typeof router.invalidate).toBe("function")
		})

		it("provides state property", () => {
			const client = createFlareClient({})
			const router = client.getRouter()

			expect(router.state).toBeDefined()
			expect(router.state.location).toBeDefined()
			expect(typeof router.state.isNavigating).toBe("boolean")
		})
	})

	describe("clearCache", () => {
		it("clears match cache", () => {
			const flareState = new FlareStateBuilder().addMatch("_root_", {}).build()

			const client = createFlareClient({ flareState })
			const cache = client.getMatchCache()

			expect(cache.size()).toBe(1)

			client.getRouter().clearCache()

			expect(cache.size()).toBe(0)
		})

		it("clears prefetch cache", () => {
			const client = createFlareClient({})
			const prefetchCache = client.getPrefetchCache()

			prefetchCache.mark("/test")
			expect(prefetchCache.shouldPrefetch("/test", 30000)).toBe(false)

			client.getRouter().clearCache()

			expect(prefetchCache.shouldPrefetch("/test", 30000)).toBe(true)
		})
	})

	describe("invalidate", () => {
		it("invalidates specific match by matchId", () => {
			const flareState = new FlareStateBuilder()
				.withPathname("/products")
				.addMatch("_root_", {})
				.addMatch("_root_/products", {})
				.build()

			const client = createFlareClient({ flareState })
			const cache = client.getMatchCache()

			expect(cache.get("_root_/products")?.invalid).toBe(false)

			client.getRouter().invalidate({ matchId: "_root_/products" })

			expect(cache.get("_root_/products")?.invalid).toBe(true)
			expect(cache.get("_root_")?.invalid).toBe(false)
		})

		it("invalidates all matches when no options", () => {
			const flareState = new FlareStateBuilder()
				.withPathname("/products")
				.addMatch("_root_", {})
				.addMatch("_root_/products", {})
				.build()

			const client = createFlareClient({ flareState })
			const cache = client.getMatchCache()

			client.getRouter().invalidate()

			expect(cache.get("_root_")?.invalid).toBe(true)
			expect(cache.get("_root_/products")?.invalid).toBe(true)
		})
	})
})

/* ============================================================================
 * Query hydration
 * ============================================================================ */

describe("query hydration", () => {
	it("hydrates queries from flare state", () => {
		const flareState = new FlareStateBuilder()
			.addQuery(["product", "123"], { name: "Widget" }, { staleTime: 60000 })
			.addQuery(["categories"], ["cat1", "cat2"])
			.build()

		const mockQueryClient = {
			setQueryData: vi.fn(),
		}

		createFlareClient({
			flareState,
			queryClient: mockQueryClient as unknown as FlareClientConfig["queryClient"],
		})

		expect(mockQueryClient.setQueryData).toHaveBeenCalledTimes(2)
		expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
			["product", "123"],
			{ name: "Widget" },
			expect.any(Object),
		)
	})

	it("does not call setQueryData when no queries", () => {
		const flareState = createFlareState()

		const mockQueryClient = {
			setQueryData: vi.fn(),
		}

		createFlareClient({
			flareState,
			queryClient: mockQueryClient as unknown as FlareClientConfig["queryClient"],
		})

		expect(mockQueryClient.setQueryData).not.toHaveBeenCalled()
	})

	it("does not hydrate queries when no queryClient provided", () => {
		const flareState = new FlareStateBuilder()
			.addQuery(["product", "123"], { name: "Widget" })
			.build()

		/* Should not throw even with queries but no queryClient */
		expect(() => createFlareClient({ flareState })).not.toThrow()
	})

	it("passes staleTime option to setQueryData", () => {
		const flareState = new FlareStateBuilder()
			.addQuery(["test"], "test", { staleTime: 120000 })
			.build()

		const mockQueryClient = {
			setQueryData: vi.fn(),
		}

		createFlareClient({
			flareState,
			queryClient: mockQueryClient as unknown as FlareClientConfig["queryClient"],
		})

		expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
			["test"],
			"test",
			expect.objectContaining({ staleTime: 120000 }),
		)
	})
})

/* ============================================================================
 * Custom fetch function
 * ============================================================================ */

describe("custom fetch function", () => {
	it("accepts custom fetch function in config", () => {
		const customFetch = vi.fn()

		expect(() =>
			createFlareClient({
				fetch: customFetch,
				flareState: createFlareState(),
			}),
		).not.toThrow()
	})
})
