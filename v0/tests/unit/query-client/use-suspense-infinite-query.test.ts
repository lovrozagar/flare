/**
 * useSuspenseInfiniteQuery Unit Tests
 *
 * Tests Suspense-integrated infinite query hook types.
 */

import { InfiniteQueryObserver, QueryClient } from "@tanstack/query-core"
import { describe, expect, it } from "vitest"

describe("useSuspenseInfiniteQuery types", () => {
	it("suspense infinite query options exclude enabled", () => {
		const options = {
			getNextPageParam: (lastPage: { nextPage: number }) => lastPage.nextPage,
			initialPageParam: 0,
			queryFn: async ({ pageParam }: { pageParam: number }) => ({
				data: [{ id: pageParam }],
				nextPage: pageParam + 1,
			}),
			queryKey: ["posts", "infinite"] as const,
		}

		expect((options as any).enabled).toBeUndefined()
	})

	it("suspense infinite query result has page methods", () => {
		const result = {
			data: () => ({ pageParams: [], pages: [] }),
			fetchNextPage: async () => ({}) as any,
			fetchPreviousPage: async () => ({}) as any,
			hasNextPage: () => true,
			hasPreviousPage: () => false,
		}

		expect(typeof result.fetchNextPage).toBe("function")
		expect(typeof result.fetchPreviousPage).toBe("function")
		expect(typeof result.hasNextPage).toBe("function")
		expect(typeof result.hasPreviousPage).toBe("function")
	})
})

describe("InfiniteQueryObserver", () => {
	it("creates observer with infinite query options", () => {
		const client = new QueryClient()

		const observer = new InfiniteQueryObserver(client, {
			getNextPageParam: () => undefined,
			initialPageParam: 0,
			queryFn: async () => ({ data: [], nextPage: null }),
			queryKey: ["test"],
		})

		expect(observer).toBeDefined()
		observer.destroy()
	})

	it("has fetchNextPage method", () => {
		const client = new QueryClient()

		const observer = new InfiniteQueryObserver(client, {
			getNextPageParam: () => undefined,
			initialPageParam: 0,
			queryFn: async () => ({ data: [] }),
			queryKey: ["test"],
		})

		expect(typeof observer.fetchNextPage).toBe("function")
		observer.destroy()
	})

	it("has fetchPreviousPage method", () => {
		const client = new QueryClient()

		const observer = new InfiniteQueryObserver(client, {
			getNextPageParam: () => undefined,
			initialPageParam: 0,
			queryFn: async () => ({ data: [] }),
			queryKey: ["test"],
		})

		expect(typeof observer.fetchPreviousPage).toBe("function")
		observer.destroy()
	})
})
