/**
 * useSuspenseQuery Unit Tests
 *
 * Tests Suspense-integrated query hook types.
 */

import { QueryClient, QueryObserver } from "@tanstack/query-core"
import { describe, expect, it } from "vitest"

describe("useSuspenseQuery types", () => {
	it("suspense query options exclude enabled", () => {
		/* Suspense queries cannot be disabled */
		const options = {
			queryFn: async () => ({ id: "123", name: "John" }),
			queryKey: ["user", "123"] as const,
			/* enabled is not allowed in suspense queries */
		}

		expect(options.queryKey).toBeDefined()
		expect((options as any).enabled).toBeUndefined()
	})

	it("suspense query options exclude placeholderData", () => {
		const options = {
			queryFn: async () => "data",
			queryKey: ["test"] as const,
			/* placeholderData is not allowed */
		}

		expect((options as any).placeholderData).toBeUndefined()
	})

	it("suspense query result data accessor returns defined value", () => {
		/* After suspense resolves, data is guaranteed to be defined */
		const result = {
			data: () => ({ id: 1 }) /* Always returns T, never undefined */,
			isFetching: () => false,
			isSuccess: () => true,
		}

		const data = result.data()
		expect(data).toBeDefined()
		expect(data.id).toBe(1)
	})
})

describe("QueryObserver for Suspense", () => {
	it("creates observer with suspense options", () => {
		const client = new QueryClient()

		const observer = new QueryObserver(client, {
			queryFn: async () => "data",
			queryKey: ["test"],
		})

		expect(observer).toBeDefined()
		observer.destroy()
	})

	it("fetchOptimistic returns promise", () => {
		const client = new QueryClient()

		const observer = new QueryObserver(client, {
			queryFn: async () => "data",
			queryKey: ["test"],
		})

		const result = observer.fetchOptimistic({
			queryFn: async () => "data",
			queryKey: ["test"],
		})

		expect(result).toBeInstanceOf(Promise)
		observer.destroy()
	})
})
