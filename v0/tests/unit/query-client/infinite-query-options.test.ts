/**
 * infiniteQueryOptions Unit Tests
 *
 * Tests type-safe infinite query options builder.
 */

import { describe, expect, it } from "vitest"
import { infiniteQueryOptions } from "../../../src/query-client/infinite-query-options"

describe("infiniteQueryOptions", () => {
	it("returns same options object", () => {
		const options = {
			getNextPageParam: (lastPage: { nextPage: number }) => lastPage.nextPage,
			initialPageParam: 0,
			queryFn: async ({ pageParam }: { pageParam: number }) => ({
				data: [{ id: pageParam }],
				nextPage: pageParam + 1,
			}),
			queryKey: ["posts", "infinite"] as const,
		}

		const result = infiniteQueryOptions(options)

		expect(result).toBe(options)
	})

	it("preserves queryKey", () => {
		const options = {
			getNextPageParam: () => undefined,
			initialPageParam: 0,
			queryFn: async () => ({ data: [], nextPage: null }),
			queryKey: ["users", "list"] as const,
		}

		const result = infiniteQueryOptions(options)

		expect(result.queryKey).toEqual(["users", "list"])
	})

	it("preserves initialPageParam", () => {
		const options = {
			getNextPageParam: () => undefined,
			initialPageParam: 1,
			queryFn: async () => ({ data: [] }),
			queryKey: ["test"] as const,
		}

		const result = infiniteQueryOptions(options)

		expect(result.initialPageParam).toBe(1)
	})

	it("preserves getNextPageParam", () => {
		const getNextPageParam = (lastPage: { cursor?: string }) => lastPage.cursor
		const options = {
			getNextPageParam,
			initialPageParam: undefined as string | undefined,
			queryFn: async () => ({ cursor: "next", data: [] }),
			queryKey: ["test"] as const,
		}

		const result = infiniteQueryOptions(options)

		expect(result.getNextPageParam).toBe(getNextPageParam)
	})

	it("preserves getPreviousPageParam", () => {
		const getPreviousPageParam = (firstPage: { prevCursor?: string }) => firstPage.prevCursor
		const options = {
			getNextPageParam: () => undefined as string | undefined,
			getPreviousPageParam,
			initialPageParam: undefined as string | undefined,
			queryFn: async () => ({ data: [] }),
			queryKey: ["test"] as const,
		}

		const result = infiniteQueryOptions(options)

		expect(result.getPreviousPageParam).toBe(getPreviousPageParam)
	})
})
