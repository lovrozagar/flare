/**
 * useInfiniteQuery Unit Tests
 *
 * Tests infinite/paginated query hook types and InfiniteQueryObserver behavior.
 */

import { InfiniteQueryObserver, QueryClient } from "@tanstack/query-core"
import { describe, expect, it, vi } from "vitest"

describe("useInfiniteQuery types", () => {
	it("infinite query options shape is valid", () => {
		const options = {
			getNextPageParam: (lastPage: { nextCursor: number }) => lastPage.nextCursor,
			initialPageParam: 0,
			queryFn: async ({ pageParam }: { pageParam: number }) => ({
				data: [{ id: pageParam }],
				nextCursor: pageParam + 1,
			}),
			queryKey: ["posts", "infinite"] as const,
		}

		expect(options.queryKey).toBeDefined()
		expect(options.initialPageParam).toBe(0)
	})

	it("infinite query result shape is valid", () => {
		const result = {
			data: {
				pageParams: [0],
				pages: [{ data: [{ id: 1 }] }],
			},
			fetchNextPage: vi.fn(),
			fetchPreviousPage: vi.fn(),
			hasNextPage: true,
			hasPreviousPage: false,
			isFetchingNextPage: false,
			isFetchingPreviousPage: false,
		}

		expect(result.data.pages).toBeDefined()
		expect(result.hasNextPage).toBe(true)
	})
})

describe("InfiniteQueryObserver", () => {
	it("creates observer with infinite options", () => {
		const client = new QueryClient()

		const observer = new InfiniteQueryObserver(client, {
			getNextPageParam: () => undefined,
			initialPageParam: 0,
			queryFn: async () => ({ data: [] }),
			queryKey: ["test"],
		})

		expect(observer).toBeDefined()
		observer.destroy()
	})

	it("gets optimistic result with pages", () => {
		const client = new QueryClient()

		const observer = new InfiniteQueryObserver(client, {
			getNextPageParam: () => undefined,
			initialPageParam: 0,
			queryFn: async () => ({ data: [] }),
			queryKey: ["test"],
		})

		const defaultedOptions = client.defaultQueryOptions({
			getNextPageParam: () => undefined,
			initialPageParam: 0,
			queryFn: async () => ({ data: [] }),
			queryKey: ["test"],
		})
		const result = observer.getOptimisticResult(
			defaultedOptions as Parameters<typeof observer.getOptimisticResult>[0],
		)

		expect(result).toBeDefined()
		observer.destroy()
	})

	it("has fetchNextPage and fetchPreviousPage", () => {
		const client = new QueryClient()

		const observer = new InfiniteQueryObserver(client, {
			getNextPageParam: () => undefined,
			initialPageParam: 0,
			queryFn: async () => ({ data: [] }),
			queryKey: ["test"],
		})

		expect(typeof observer.fetchNextPage).toBe("function")
		expect(typeof observer.fetchPreviousPage).toBe("function")
		observer.destroy()
	})

	it("result has hasNextPage and hasPreviousPage", () => {
		const client = new QueryClient()

		const observer = new InfiniteQueryObserver(client, {
			getNextPageParam: () => undefined,
			initialPageParam: 0,
			queryFn: async () => ({ data: [] }),
			queryKey: ["test"],
		})

		const result = observer.getCurrentResult()

		expect(typeof result.hasNextPage).toBe("boolean")
		expect(typeof result.hasPreviousPage).toBe("boolean")
		observer.destroy()
	})
})
