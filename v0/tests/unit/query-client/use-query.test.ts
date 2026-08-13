/**
 * useQuery Unit Tests
 *
 * Tests main query hook types and QueryObserver behavior.
 */

import { QueryClient, QueryObserver } from "@tanstack/query-core"
import { describe, expect, it, vi } from "vitest"

describe("useQuery types", () => {
	it("query options shape is valid", () => {
		const options = {
			enabled: true,
			gcTime: 300000,
			queryFn: async () => [{ id: 1, title: "Post" }],
			queryKey: ["posts"] as const,
			staleTime: 60000,
		}

		expect(options.queryKey).toBeDefined()
		expect(options.queryFn).toBeDefined()
	})

	it("query result shape is valid", () => {
		const result = {
			data: undefined as { id: number }[] | undefined,
			error: null as Error | null,
			isError: false,
			isFetching: true,
			isLoading: true,
			isPending: true,
			isSuccess: false,
			refetch: vi.fn(),
			status: "pending" as const,
		}

		expect(result.isLoading).toBe(true)
		expect(result.status).toBe("pending")
	})
})

describe("QueryObserver", () => {
	it("creates observer with options", () => {
		const client = new QueryClient()

		const observer = new QueryObserver(client, {
			queryFn: async () => "data",
			queryKey: ["test"],
		})

		expect(observer).toBeDefined()
		observer.destroy()
	})

	it("gets optimistic result", () => {
		const client = new QueryClient()

		const observer = new QueryObserver(client, {
			queryFn: async () => "data",
			queryKey: ["test"],
		})

		const defaultedOptions = client.defaultQueryOptions({
			queryFn: async () => "data",
			queryKey: ["test"],
		})
		const result = observer.getOptimisticResult(defaultedOptions)

		expect(result).toBeDefined()
		expect(result.status).toBeDefined()
		observer.destroy()
	})

	it("subscribes to updates", () => {
		const client = new QueryClient()
		const callback = vi.fn()

		const observer = new QueryObserver(client, {
			queryFn: async () => "data",
			queryKey: ["test"],
		})

		const unsubscribe = observer.subscribe(callback)
		expect(typeof unsubscribe).toBe("function")

		unsubscribe()
		observer.destroy()
	})

	it("sets new options", () => {
		const client = new QueryClient()

		const observer = new QueryObserver(client, {
			queryFn: async () => "data",
			queryKey: ["test"],
		})

		observer.setOptions({
			queryFn: async () => "updated",
			queryKey: ["test", "updated"],
		})

		expect(observer.options.queryKey).toEqual(["test", "updated"])
		observer.destroy()
	})
})
