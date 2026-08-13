/**
 * queryOptions Unit Tests
 *
 * Tests type-safe query options builder.
 */

import { describe, expect, it } from "vitest"
import { queryOptions } from "../../../src/query-client/query-options"

describe("queryOptions", () => {
	it("returns same options object", () => {
		const options = {
			queryFn: async () => [{ id: 1, title: "Post" }],
			queryKey: ["posts"] as const,
		}

		const result = queryOptions(options)

		expect(result).toBe(options)
	})

	it("preserves queryKey", () => {
		const options = {
			queryFn: async () => ({ id: "123", name: "John" }),
			queryKey: ["user", "123"] as const,
		}

		const result = queryOptions(options)

		expect(result.queryKey).toEqual(["user", "123"])
	})

	it("preserves queryFn", () => {
		const queryFn = async () => "data"
		const options = {
			queryFn,
			queryKey: ["test"] as const,
		}

		const result = queryOptions(options)

		expect(result.queryFn).toBe(queryFn)
	})

	it("preserves staleTime", () => {
		const options = {
			queryFn: async () => "data",
			queryKey: ["test"] as const,
			staleTime: 60000,
		}

		const result = queryOptions(options)

		expect(result.staleTime).toBe(60000)
	})

	it("preserves initialData", () => {
		const initialData = { id: 1 }
		const options = {
			initialData,
			queryFn: async () => initialData,
			queryKey: ["test"] as const,
		}

		const result = queryOptions(options)

		expect(result.initialData).toBe(initialData)
	})
})
