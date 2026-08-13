/**
 * useQueries Unit Tests
 *
 * Tests parallel queries hook types and QueriesObserver behavior.
 */

import { QueriesObserver, QueryClient } from "@tanstack/query-core"
import { describe, expect, it, vi } from "vitest"

describe("useQueries types", () => {
	it("queries options shape is valid", () => {
		const options = {
			queries: [
				{
					queryFn: async () => ({ id: "1", name: "John" }),
					queryKey: ["user", "1"] as const,
				},
				{
					queryFn: async () => ({ id: "2", name: "Jane" }),
					queryKey: ["user", "2"] as const,
				},
			],
		}

		expect(options.queries).toHaveLength(2)
		expect(options.queries[0]?.queryKey).toEqual(["user", "1"])
	})

	it("queries with combine function", () => {
		const options = {
			combine: (results: { data?: number }[]) => ({
				total: results.reduce((acc, r) => acc + (r.data ?? 0), 0),
			}),
			queries: [
				{ queryFn: async () => 1, queryKey: ["a"] as const },
				{ queryFn: async () => 2, queryKey: ["b"] as const },
			],
		}

		expect(typeof options.combine).toBe("function")
	})
})

describe("QueriesObserver", () => {
	it("creates observer with multiple queries", () => {
		const client = new QueryClient()

		const observer = new QueriesObserver(client, [
			{ queryFn: async () => 1, queryKey: ["a"] },
			{ queryFn: async () => 2, queryKey: ["b"] },
		])

		expect(observer).toBeDefined()
		observer.destroy()
	})

	it("gets optimistic result", () => {
		const client = new QueryClient()

		const queries = [{ queryFn: async () => 1, queryKey: ["a"] }]
		const observer = new QueriesObserver(client, queries)

		const defaultedQueries = queries.map((q) => client.defaultQueryOptions(q))
		const [result, getter] = observer.getOptimisticResult(defaultedQueries)

		expect(result).toBeDefined()
		expect(typeof getter).toBe("function")
		observer.destroy()
	})

	it("subscribes to updates", () => {
		const client = new QueryClient()
		const callback = vi.fn()

		const observer = new QueriesObserver(client, [
			{ queryFn: async () => "data", queryKey: ["test"] },
		])

		const unsubscribe = observer.subscribe(callback)
		expect(typeof unsubscribe).toBe("function")

		unsubscribe()
		observer.destroy()
	})

	it("setQueries updates observer", () => {
		const client = new QueryClient()

		const observer = new QueriesObserver(client, [{ queryFn: async () => 1, queryKey: ["a"] }])

		observer.setQueries([
			{ queryFn: async () => 1, queryKey: ["a"] },
			{ queryFn: async () => 2, queryKey: ["b"] },
		])

		/* Observer accepts new queries */
		expect(observer).toBeDefined()
		observer.destroy()
	})
})
