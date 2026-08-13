/**
 * useIsMutating Unit Tests
 *
 * Tests active mutation counting.
 */

import { QueryClient } from "@tanstack/query-core"
import { describe, expect, it } from "vitest"

describe("isMutating", () => {
	it("returns 0 when no mutations are in progress", () => {
		const client = new QueryClient()
		const count = client.isMutating()
		expect(count).toBe(0)
	})

	it("counts with filters", () => {
		const client = new QueryClient()
		const count = client.isMutating({ mutationKey: ["createPost"] })
		expect(count).toBe(0)
	})
})

describe("MutationCache subscription", () => {
	it("subscribes to cache events", () => {
		const client = new QueryClient()
		const cache = client.getMutationCache()

		const unsubscribe = cache.subscribe(() => {
			/* callback */
		})

		expect(typeof unsubscribe).toBe("function")
		unsubscribe()
	})
})
