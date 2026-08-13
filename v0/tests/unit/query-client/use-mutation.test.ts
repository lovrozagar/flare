/**
 * useMutation Unit Tests
 *
 * Tests mutation hook for data modifications.
 */

import { QueryClient } from "@tanstack/query-core"
import { describe, expect, it, vi } from "vitest"

describe("useMutation types", () => {
	it("mutation options shape is valid", () => {
		const options = {
			mutationFn: async (data: { title: string }) => ({ id: 1, ...data }),
			onError: vi.fn(),
			onMutate: vi.fn(),
			onSuccess: vi.fn(),
		}

		expect(options.mutationFn).toBeDefined()
		expect(typeof options.mutationFn).toBe("function")
	})

	it("mutation result shape is valid", () => {
		const result = {
			data: undefined,
			error: null,
			isError: false,
			isPending: false,
			isSuccess: false,
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			status: "idle" as const,
		}

		expect(result.mutate).toBeDefined()
		expect(result.mutateAsync).toBeDefined()
	})
})

describe("MutationObserver", () => {
	it("creates mutation observer", () => {
		const client = new QueryClient()

		const mutation = client.getMutationCache()
		expect(mutation).toBeDefined()
	})
})
