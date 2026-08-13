/**
 * Tracked QueryClient Unit Tests
 *
 * Tests automatic query tracking for SSR hydration.
 * Wraps QueryClient to intercept data-fetching methods.
 */

import { describe, expect, it, vi } from "vitest"
import {
	createTrackedQueryClient,
	type TrackedQuery,
} from "../../../src/query-client/tracked-client"

/* Mock QueryClient interface for testing */
interface MockQueryClient {
	ensureInfiniteQueryData: (options: {
		queryFn: () => unknown
		queryKey: unknown[]
	}) => Promise<unknown>
	ensureQueryData: (options: {
		queryFn: () => unknown
		queryKey: unknown[]
		staleTime?: number
	}) => Promise<unknown>
	fetchInfiniteQuery: (options: { queryFn: () => unknown; queryKey: unknown[] }) => Promise<unknown>
	fetchQuery: (options: { queryFn: () => unknown; queryKey: unknown[] }) => Promise<unknown>
	getQueryCache: () => unknown
	getQueryData: (key: unknown[]) => unknown
	prefetchInfiniteQuery: (options: { queryFn: () => unknown; queryKey: unknown[] }) => Promise<void>
	prefetchQuery: (options: { queryFn: () => unknown; queryKey: unknown[] }) => Promise<void>
	setQueryData: (key: unknown[], data: unknown) => void
}

function createMockQueryClient(): MockQueryClient {
	const cache = new Map<string, unknown>()

	return {
		ensureInfiniteQueryData: vi.fn(async (opts) => {
			const data = await opts.queryFn()
			cache.set(JSON.stringify(opts.queryKey), data)
			return data
		}),
		ensureQueryData: vi.fn(async (opts) => {
			const data = await opts.queryFn()
			cache.set(JSON.stringify(opts.queryKey), data)
			return data
		}),
		fetchInfiniteQuery: vi.fn(async (opts) => {
			const data = await opts.queryFn()
			cache.set(JSON.stringify(opts.queryKey), data)
			return data
		}),
		fetchQuery: vi.fn(async (opts) => {
			const data = await opts.queryFn()
			cache.set(JSON.stringify(opts.queryKey), data)
			return data
		}),
		getQueryCache: vi.fn(() => cache),
		getQueryData: vi.fn((key) => cache.get(JSON.stringify(key))),
		prefetchInfiniteQuery: vi.fn(async (opts) => {
			const data = await opts.queryFn()
			cache.set(JSON.stringify(opts.queryKey), data)
		}),
		prefetchQuery: vi.fn(async (opts) => {
			const data = await opts.queryFn()
			cache.set(JSON.stringify(opts.queryKey), data)
		}),
		setQueryData: vi.fn((key, data) => {
			cache.set(JSON.stringify(key), data)
		}),
	}
}

describe("createTrackedQueryClient", () => {
	it("wraps QueryClient", () => {
		const mockQc = createMockQueryClient()
		const tracked = createTrackedQueryClient(mockQc)

		expect(tracked).toBeDefined()
		expect(typeof tracked.ensureQueryData).toBe("function")
	})

	it("starts with empty tracked queries", () => {
		const mockQc = createMockQueryClient()
		const tracked = createTrackedQueryClient(mockQc)

		expect(tracked.getTrackedQueries()).toEqual([])
	})
})

describe("tracked methods", () => {
	describe("ensureQueryData", () => {
		it("tracks query after call", async () => {
			const mockQc = createMockQueryClient()
			const tracked = createTrackedQueryClient(mockQc)

			await tracked.ensureQueryData({
				queryFn: () => Promise.resolve({ name: "Widget" }),
				queryKey: ["product", "123"],
			})

			const queries = tracked.getTrackedQueries()
			expect(queries).toHaveLength(1)
			expect(queries[0]?.key).toEqual(["product", "123"])
			expect(queries[0]?.data).toEqual({ name: "Widget" })
		})

		it("tracks staleTime when provided", async () => {
			const mockQc = createMockQueryClient()
			const tracked = createTrackedQueryClient(mockQc)

			await tracked.ensureQueryData({
				queryFn: () => Promise.resolve("data"),
				queryKey: ["test"],
				staleTime: 60000,
			})

			const queries = tracked.getTrackedQueries()
			expect(queries[0]?.staleTime).toBe(60000)
		})

		it("returns data from original method", async () => {
			const mockQc = createMockQueryClient()
			const tracked = createTrackedQueryClient(mockQc)

			const result = await tracked.ensureQueryData({
				queryFn: () => Promise.resolve({ id: "123" }),
				queryKey: ["item"],
			})

			expect(result).toEqual({ id: "123" })
		})
	})

	describe("ensureInfiniteQueryData", () => {
		it("tracks infinite query after call", async () => {
			const mockQc = createMockQueryClient()
			const tracked = createTrackedQueryClient(mockQc)

			await tracked.ensureInfiniteQueryData({
				queryFn: () => Promise.resolve({ pageParams: [0], pages: [1, 2, 3] }),
				queryKey: ["list"],
			})

			const queries = tracked.getTrackedQueries()
			expect(queries).toHaveLength(1)
			expect(queries[0]?.key).toEqual(["list"])
		})
	})

	describe("fetchQuery", () => {
		it("tracks query after fetch", async () => {
			const mockQc = createMockQueryClient()
			const tracked = createTrackedQueryClient(mockQc)

			await tracked.fetchQuery({
				queryFn: () => Promise.resolve("fetched"),
				queryKey: ["fetch-test"],
			})

			const queries = tracked.getTrackedQueries()
			expect(queries).toHaveLength(1)
			expect(queries[0]?.data).toBe("fetched")
		})
	})

	describe("fetchInfiniteQuery", () => {
		it("tracks infinite query after fetch", async () => {
			const mockQc = createMockQueryClient()
			const tracked = createTrackedQueryClient(mockQc)

			await tracked.fetchInfiniteQuery({
				queryFn: () => Promise.resolve({ pageParams: [], pages: ["a"] }),
				queryKey: ["infinite-fetch"],
			})

			const queries = tracked.getTrackedQueries()
			expect(queries).toHaveLength(1)
		})
	})

	describe("prefetchQuery", () => {
		it("tracks query after prefetch (reads from cache)", async () => {
			const mockQc = createMockQueryClient()
			const tracked = createTrackedQueryClient(mockQc)

			await tracked.prefetchQuery({
				queryFn: () => Promise.resolve("prefetched"),
				queryKey: ["prefetch-test"],
			})

			const queries = tracked.getTrackedQueries()
			expect(queries).toHaveLength(1)
			expect(queries[0]?.data).toBe("prefetched")
		})
	})

	describe("prefetchInfiniteQuery", () => {
		it("tracks infinite query after prefetch", async () => {
			const mockQc = createMockQueryClient()
			const tracked = createTrackedQueryClient(mockQc)

			await tracked.prefetchInfiniteQuery({
				queryFn: () => Promise.resolve({ pageParams: [], pages: [] }),
				queryKey: ["infinite-prefetch"],
			})

			const queries = tracked.getTrackedQueries()
			expect(queries).toHaveLength(1)
		})
	})
})

describe("pass-through methods", () => {
	it("passes through getQueryCache", () => {
		const mockQc = createMockQueryClient()
		const tracked = createTrackedQueryClient(mockQc)

		tracked.getQueryCache()

		expect(mockQc.getQueryCache).toHaveBeenCalled()
	})

	it("passes through setQueryData without tracking", () => {
		const mockQc = createMockQueryClient()
		const tracked = createTrackedQueryClient(mockQc)

		tracked.setQueryData(["manual"], "data")

		expect(mockQc.setQueryData).toHaveBeenCalledWith(["manual"], "data")
		expect(tracked.getTrackedQueries()).toEqual([])
	})
})

describe("multiple queries", () => {
	it("tracks queries in order", async () => {
		const mockQc = createMockQueryClient()
		const tracked = createTrackedQueryClient(mockQc)

		await tracked.ensureQueryData({
			queryFn: () => Promise.resolve("first"),
			queryKey: ["a"],
		})
		await tracked.ensureQueryData({
			queryFn: () => Promise.resolve("second"),
			queryKey: ["b"],
		})
		await tracked.ensureQueryData({
			queryFn: () => Promise.resolve("third"),
			queryKey: ["c"],
		})

		const queries = tracked.getTrackedQueries()
		expect(queries).toHaveLength(3)
		expect(queries.map((q: TrackedQuery) => q.key)).toEqual([["a"], ["b"], ["c"]])
	})

	it("dedupes same query key", async () => {
		const mockQc = createMockQueryClient()
		const tracked = createTrackedQueryClient(mockQc)

		await tracked.ensureQueryData({
			queryFn: () => Promise.resolve("first"),
			queryKey: ["product", "123"],
		})
		await tracked.ensureQueryData({
			queryFn: () => Promise.resolve("second"),
			queryKey: ["product", "123"],
		})

		const queries = tracked.getTrackedQueries()
		expect(queries).toHaveLength(1)
		expect(queries[0]?.data).toBe("second")
	})
})

describe("TrackedQuery shape", () => {
	it("includes key, data, staleTime", async () => {
		const mockQc = createMockQueryClient()
		const tracked = createTrackedQueryClient(mockQc)

		await tracked.ensureQueryData({
			queryFn: () => Promise.resolve({ name: "Test" }),
			queryKey: ["item", "456"],
			staleTime: 30000,
		})

		const query = tracked.getTrackedQueries()[0] as TrackedQuery
		expect(query.key).toEqual(["item", "456"])
		expect(query.data).toEqual({ name: "Test" })
		expect(query.staleTime).toBe(30000)
	})

	it("staleTime is undefined when not provided", async () => {
		const mockQc = createMockQueryClient()
		const tracked = createTrackedQueryClient(mockQc)

		await tracked.ensureQueryData({
			queryFn: () => Promise.resolve("data"),
			queryKey: ["no-stale"],
		})

		const query = tracked.getTrackedQueries()[0] as TrackedQuery
		expect(query.staleTime).toBeUndefined()
	})
})

describe("clearTracked", () => {
	it("clears all tracked queries", async () => {
		const mockQc = createMockQueryClient()
		const tracked = createTrackedQueryClient(mockQc)

		await tracked.ensureQueryData({
			queryFn: () => Promise.resolve("data"),
			queryKey: ["a"],
		})
		await tracked.ensureQueryData({
			queryFn: () => Promise.resolve("data"),
			queryKey: ["b"],
		})

		expect(tracked.getTrackedQueries()).toHaveLength(2)

		tracked.clearTracked()

		expect(tracked.getTrackedQueries()).toHaveLength(0)
	})
})
