/**
 * useIsFetching Unit Tests
 *
 * Tests active query counting.
 */

import { QueryClient } from "@tanstack/query-core"
import { describe, expect, it } from "vitest"

describe("isFetching", () => {
	it("returns 0 when no queries are fetching", () => {
		const client = new QueryClient()
		const count = client.isFetching()
		expect(count).toBe(0)
	})

	it("counts with filters", () => {
		const client = new QueryClient()
		const count = client.isFetching({ queryKey: ["posts"] })
		expect(count).toBe(0)
	})
})

describe("QueryCache subscription", () => {
	it("subscribes to cache events", () => {
		const client = new QueryClient()
		const cache = client.getQueryCache()

		const unsubscribe = cache.subscribe(() => {
			/* callback */
		})

		expect(typeof unsubscribe).toBe("function")
		unsubscribe()
	})
})
