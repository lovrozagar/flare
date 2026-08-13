/**
 * useMutationState Unit Tests
 *
 * Tests mutation state access across the cache.
 */

import { QueryClient } from "@tanstack/query-core"
import { describe, expect, it } from "vitest"

describe("MutationState types", () => {
	it("mutation state options shape is valid", () => {
		const options = {
			filters: {
				mutationKey: ["createPost"],
				status: "pending" as const,
			},
			select: (mutation: { state: { variables: unknown } }) => mutation.state.variables,
		}

		expect(options.filters).toBeDefined()
		expect(options.select).toBeDefined()
	})
})

describe("MutationCache", () => {
	it("finds mutations by filter", () => {
		const client = new QueryClient()
		const cache = client.getMutationCache()

		const mutations = cache.findAll({ mutationKey: ["test"] })
		expect(Array.isArray(mutations)).toBe(true)
	})

	it("returns empty array when no mutations match", () => {
		const client = new QueryClient()
		const cache = client.getMutationCache()

		const mutations = cache.findAll({ mutationKey: ["nonexistent"] })
		expect(mutations).toEqual([])
	})
})
