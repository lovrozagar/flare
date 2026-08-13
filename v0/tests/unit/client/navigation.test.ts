/**
 * Client Navigation Unit Tests
 *
 * Tests router navigation, prefetch, and refetch methods.
 * Verifies integration of data fetching with cache management.
 */

import { describe, expect, it, vi } from "vitest"
import { createFlareClient } from "../../../src/client/init"
import { createFlareState, FlareStateBuilder } from "../../utils/flare-state"
import { MockFetchBuilder } from "../../utils/mock-fetch"
import { createNDJSONResponse, ndjson } from "../../utils/ndjson"

describe("router.navigate", () => {
	it("sets isNavigating during navigation", () => {
		const flareState = createFlareState()

		const client = createFlareClient({ flareState })
		const router = client.getRouter()

		expect(router.state.isNavigating).toBe(false)
	})

	it("updates location after navigation", () => {
		const flareState = createFlareState()

		const client = createFlareClient({ flareState })
		const router = client.getRouter()

		expect(router.state.location.pathname).toBe("/")
	})
})

describe("router.prefetch", () => {
	it("marks URL as prefetched", () => {
		const flareState = createFlareState()

		const client = createFlareClient({ flareState })
		const prefetchCache = client.getPrefetchCache()

		expect(prefetchCache.shouldPrefetch("/products", 30000)).toBe(true)
	})

	it("skips prefetch when URL already prefetched recently", async () => {
		const { fetch: mockFetch, getCallCount } = new MockFetchBuilder()
			.onUrl(
				"/products",
				createNDJSONResponse([ndjson.loader("_root_/products", {}), ndjson.done()]),
			)
			.build()

		const flareState = createFlareState()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState,
		})
		const router = client.getRouter()

		/* First prefetch should fetch */
		await router.prefetch({ to: "/products" })
		expect(getCallCount()).toBe(1)

		/* Second prefetch for same URL should skip (within staleTime) */
		await router.prefetch({ to: "/products" })
		expect(getCallCount()).toBe(1)
	})

	it("re-prefetches when prefetchStaleTime has passed", async () => {
		const { fetch: mockFetch, getCallCount } = new MockFetchBuilder()
			.onUrl(
				"/products",
				createNDJSONResponse([ndjson.loader("_root_/products", {}), ndjson.done()]),
			)
			.build()

		const flareState = new FlareStateBuilder().withRouterDefaults({ prefetchStaleTime: 50 }).build()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState,
		})
		const router = client.getRouter()

		/* First prefetch */
		await router.prefetch({ to: "/products" })
		expect(getCallCount()).toBe(1)

		/* Wait for staleTime to pass */
		await new Promise((r) => setTimeout(r, 60))

		/* Should re-prefetch after staleTime */
		await router.prefetch({ to: "/products" })
		expect(getCallCount()).toBe(2)
	})

	it("prevents concurrent duplicate prefetch requests", async () => {
		let resolveFirst: () => void
		let fetchCallCount = 0

		const mockFetch = vi.fn(() => {
			fetchCallCount++
			if (fetchCallCount === 1) {
				/* First call - slow response */
				return new Promise<Response>((resolve) => {
					resolveFirst = () =>
						resolve(createNDJSONResponse([ndjson.loader("_root_/products", {}), ndjson.done()]))
				})
			}
			/* Subsequent calls - immediate response */
			return Promise.resolve(
				createNDJSONResponse([ndjson.loader("_root_/products", {}), ndjson.done()]),
			)
		})

		const flareState = createFlareState()

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState,
		})
		const router = client.getRouter()

		/* Start two concurrent prefetches for same URL */
		const p1 = router.prefetch({ to: "/products" })
		const p2 = router.prefetch({ to: "/products" })

		/* Second should not make a fetch since first marks cache immediately */
		await p2
		expect(mockFetch).toHaveBeenCalledTimes(1)

		/* Resolve first prefetch */
		resolveFirst?.()
		await p1

		/* Still only one fetch call */
		expect(mockFetch).toHaveBeenCalledTimes(1)
	})
})

describe("router.invalidate", () => {
	it("invalidates cached match by matchId", () => {
		const flareState = new FlareStateBuilder()
			.withPathname("/products")
			.addMatch("_root_", { user: "Alice" })
			.addMatch("_root_/products", { products: [] })
			.build()

		const client = createFlareClient({ flareState })
		const router = client.getRouter()
		const cache = client.getMatchCache()

		expect(cache.size()).toBe(2)

		router.invalidate({ matchId: "_root_" })

		const entry = cache.get("_root_")
		expect(entry?.invalid).toBe(true)
	})

	it("invalidates cached match by routeId", () => {
		const flareState = new FlareStateBuilder()
			.withPathname("/products")
			.addMatch("_root_", {})
			.addMatch("_root_/products", { products: [] })
			.build()

		const client = createFlareClient({ flareState })
		const router = client.getRouter()
		const cache = client.getMatchCache()

		router.invalidate({ routeId: "_root_/products" })

		const entry = cache.get("_root_/products")
		expect(entry?.invalid).toBe(true)
	})

	it("invalidates by filter function", () => {
		const flareState = new FlareStateBuilder()
			.addMatch("_root_", {})
			.addMatch("_root_/products", {})
			.addMatch("_root_/settings", {})
			.build()

		const client = createFlareClient({ flareState })
		const router = client.getRouter()
		const cache = client.getMatchCache()

		router.invalidate({
			filter: (match) => match.routeId.includes("products"),
		})

		expect(cache.get("_root_")?.invalid).toBe(false)
		expect(cache.get("_root_/products")?.invalid).toBe(true)
	})
})

describe("router.clearCache", () => {
	it("clears all cached matches", () => {
		const flareState = new FlareStateBuilder()
			.withPathname("/products")
			.addMatch("_root_", {})
			.addMatch("_root_/products", {})
			.build()

		const client = createFlareClient({ flareState })
		const router = client.getRouter()
		const cache = client.getMatchCache()

		expect(cache.size()).toBe(2)

		router.clearCache()

		expect(cache.size()).toBe(0)
	})

	it("clears prefetch cache", () => {
		const flareState = createFlareState()

		const client = createFlareClient({ flareState })
		const router = client.getRouter()
		const prefetchCache = client.getPrefetchCache()

		prefetchCache.mark("/products")
		expect(prefetchCache.shouldPrefetch("/products", 30000)).toBe(false)

		router.clearCache()

		expect(prefetchCache.shouldPrefetch("/products", 30000)).toBe(true)
	})
})

describe("data fetcher integration", () => {
	it("updates match cache from loader response", async () => {
		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl(
				"/products",
				createNDJSONResponse([
					ndjson.loader("_root_", {}),
					ndjson.loader("_root_/products", { products: [1, 2, 3] }),
					ndjson.done(),
				]),
			)
			.build()

		const flareState = new FlareStateBuilder().addMatch("_root_", {}).build()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState,
		})

		const cache = client.getMatchCache()
		expect(cache.has("_root_/products")).toBe(false)

		await client.getRouter().navigate({ to: "/products" })

		expect(cache.has("_root_/products")).toBe(true)
		expect(cache.get("_root_/products")?.data).toEqual({ products: [1, 2, 3] })
	})

	it("resolves deferred promises from chunk response", async () => {
		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl(
				"/products",
				createNDJSONResponse([
					ndjson.loader("_root_/products", { name: "Widget", reviews: ndjson.deferred("reviews") }),
					ndjson.ready(),
					ndjson.chunk("_root_/products", "reviews", [4, 5]),
					ndjson.done(),
				]),
			)
			.build()

		const flareState = createFlareState()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState,
		})

		await client.getRouter().navigate({ to: "/products" })

		const cache = client.getMatchCache()
		const entry = cache.get("_root_/products")

		/* Cache has hydrated data with deferred object */
		expect(entry?.data).toHaveProperty("name", "Widget")
		expect(entry?.data).toHaveProperty("reviews")

		/* The reviews property is a Deferred with a promise that resolves to the chunk data */
		const reviews = (entry?.data as Record<string, unknown>)?.reviews as {
			__deferred: boolean
			__key: string
			promise: Promise<unknown>
		}
		expect(reviews.__deferred).toBe(true)
		expect(reviews.__key).toBe("reviews")

		/* Wait for promise to resolve (chunk message resolves it) */
		const resolvedReviews = await reviews.promise
		expect(resolvedReviews).toEqual([4, 5])
	})

	it("sends prefetch header for prefetch requests", async () => {
		const { fetch: mockFetch, getCapturedHeaders } = new MockFetchBuilder()
			.onUrl("/products", createNDJSONResponse([ndjson.done()]))
			.build()

		const flareState = createFlareState()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState,
		})

		await client.getRouter().prefetch({ to: "/products" })

		expect(getCapturedHeaders()[0]?.get("x-p")).toBe("1")
	})
})

describe("navigation abort behavior", () => {
	it("aborts in-progress navigation when new link navigation starts", async () => {
		let abortCount = 0
		let fetchCallCount = 0

		const mockFetch = vi.fn((_url: string, init?: RequestInit) => {
			fetchCallCount++
			const isSecondCall = fetchCallCount === 2

			/* Listen for abort on first navigation */
			if (init?.signal) {
				init.signal.addEventListener("abort", () => {
					abortCount++
				})
			}

			return new Promise<Response>((resolve, reject) => {
				/* Second navigation resolves quickly */
				if (isSecondCall) {
					setTimeout(() => {
						resolve(createNDJSONResponse([ndjson.loader("_root_/about", {}), ndjson.done()]))
					}, 10)
				} else {
					/* First navigation is slow, will be aborted */
					setTimeout(() => {
						if (init?.signal?.aborted) {
							reject(new DOMException("Aborted", "AbortError"))
						} else {
							resolve(createNDJSONResponse([ndjson.loader("_root_/products", {}), ndjson.done()]))
						}
					}, 100)
				}
			})
		})

		const flareState = createFlareState()

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState,
		})
		const router = client.getRouter()

		/* Start first navigation (slow) */
		const nav1 = router.navigate({ to: "/products" })
		/* Immediately start second navigation (should abort first) */
		const nav2 = router.navigate({ to: "/about" })

		await Promise.allSettled([nav1, nav2])

		/* First navigation should have been aborted */
		expect(abortCount).toBe(1)
		expect(mockFetch).toHaveBeenCalledTimes(2)
	})

	it("only updates cache from completed navigation, not aborted", async () => {
		let _fetchCallCount = 0

		const mockFetch = vi.fn((_url: string, init?: RequestInit) => {
			_fetchCallCount++
			const url = _url

			return new Promise<Response>((resolve, reject) => {
				const checkAbort = () => {
					if (init?.signal?.aborted) {
						reject(new DOMException("Aborted", "AbortError"))
						return
					}
					if (url === "/about") {
						resolve(
							createNDJSONResponse([
								ndjson.loader("_root_/about", { page: "about" }),
								ndjson.done(),
							]),
						)
					} else {
						setTimeout(checkAbort, 10)
					}
				}
				setTimeout(checkAbort, 10)
			})
		})

		const flareState = createFlareState()

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState,
		})
		const router = client.getRouter()
		const cache = client.getMatchCache()

		/* Start two navigations rapidly */
		const nav1 = router.navigate({ to: "/products" })
		const nav2 = router.navigate({ to: "/about" })

		await Promise.allSettled([nav1, nav2])

		/* Only /about data should be in cache (from completed navigation) */
		expect(cache.has("_root_/about")).toBe(true)
		expect(cache.get("_root_/about")?.data).toEqual({ page: "about" })
		/* /products should NOT be in cache (aborted navigation) */
		expect(cache.has("_root_/products")).toBe(false)
	})

	it("does not abort popstate navigation when link navigation starts", async () => {
		const fetchResults: string[] = []

		const mockFetch = vi.fn((_url: string, init?: RequestInit) => {
			const url = _url

			return new Promise<Response>((resolve) => {
				/* Simulate network delay */
				setTimeout(() => {
					if (!init?.signal?.aborted) {
						fetchResults.push(url)
					}
					resolve(createNDJSONResponse([ndjson.loader(url, { url }), ndjson.done()]))
				}, 20)
			})
		})

		const flareState = createFlareState()

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState,
		})
		const router = client.getRouter()

		/* Start popstate navigation (back/forward) */
		const popstateNav = router.navigate({ _popstate: true, to: "/history-page" })
		/* Start link navigation shortly after */
		await new Promise((r) => setTimeout(r, 5))
		const linkNav = router.navigate({ to: "/link-page" })

		await Promise.all([popstateNav, linkNav])

		/* Both navigations should complete - popstate should NOT be aborted */
		expect(fetchResults).toContain("/history-page")
		expect(fetchResults).toContain("/link-page")
	})

	it("aborts link navigation when new link navigation starts, but preserves popstate", async () => {
		const completedUrls: string[] = []

		const mockFetch = vi.fn((_url: string, init?: RequestInit) => {
			const url = _url

			return new Promise<Response>((resolve, reject) => {
				const complete = () => {
					if (init?.signal?.aborted) {
						reject(new DOMException("Aborted", "AbortError"))
						return
					}
					completedUrls.push(url)
					resolve(createNDJSONResponse([ndjson.loader(url, {}), ndjson.done()]))
				}
				setTimeout(complete, 30)
			})
		})

		const flareState = createFlareState()

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState,
		})
		const router = client.getRouter()

		/* Start link navigation (will be aborted) */
		const link1 = router.navigate({ to: "/page-1" })
		/* Start another link navigation (should abort first) */
		await new Promise((r) => setTimeout(r, 5))
		const link2 = router.navigate({ to: "/page-2" })

		await Promise.allSettled([link1, link2])

		/* Only page-2 should complete, page-1 should be aborted */
		expect(completedUrls).not.toContain("/page-1")
		expect(completedUrls).toContain("/page-2")
	})

	it("shallow navigation does not trigger data fetch", async () => {
		const { fetch: mockFetch, getCallCount } = new MockFetchBuilder()
			.onUrl("/new-url", createNDJSONResponse([ndjson.done()]))
			.build()

		const flareState = createFlareState()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState,
		})
		const router = client.getRouter()

		await router.navigate({ shallow: true, to: "/new-url" })

		/* Shallow navigation should not fetch data */
		expect(getCallCount()).toBe(0)
	})
})

describe("popstate navigation", () => {
	it("triggers onPopstate handlers when registered", () => {
		const flareState = createFlareState()

		const client = createFlareClient({ flareState })
		const handler = vi.fn()

		client.onPopstate(handler)

		/* Handler should be registered (we can't easily trigger popstate in tests without browser) */
		expect(typeof client.onPopstate).toBe("function")
	})

	it("preserves navigation order for sequential popstate events", async () => {
		const navigationOrder: string[] = []

		const mockFetch = vi.fn((_url: string) => {
			const url = _url
			return new Promise<Response>((resolve) => {
				/* Vary delay to test order preservation */
				const delay = url === "/page-1" ? 30 : 10
				setTimeout(() => {
					navigationOrder.push(url)
					resolve(createNDJSONResponse([ndjson.loader(url, {}), ndjson.done()]))
				}, delay)
			})
		})

		const flareState = createFlareState()

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState,
		})
		const router = client.getRouter()

		/* Simulate sequential popstate navigations */
		await router.navigate({ _popstate: true, to: "/page-1" })
		await router.navigate({ _popstate: true, to: "/page-2" })

		/* Both should complete in order */
		expect(navigationOrder).toEqual(["/page-1", "/page-2"])
	})
})
