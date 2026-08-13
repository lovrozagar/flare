/**
 * QueryClient Unit Tests
 *
 * Tests extended QueryClient with Solid-specific options.
 */

import { describe, expect, it } from "vitest"
import { QueryClient } from "../../../src/query-client/query-client"

describe("QueryClient", () => {
	it("creates instance with default config", () => {
		const client = new QueryClient()
		expect(client).toBeDefined()
		expect(client.getQueryCache()).toBeDefined()
		expect(client.getMutationCache()).toBeDefined()
	})

	it("creates instance with custom config", () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: {
					gcTime: 300000,
					staleTime: 60000,
				},
			},
		})
		expect(client).toBeDefined()
	})

	it("accepts reconcile option in config", () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: {
					reconcile: "id",
				},
			},
		})
		expect(client).toBeDefined()
	})

	it("accepts false reconcile option", () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: {
					reconcile: false,
				},
			},
		})
		expect(client).toBeDefined()
	})

	it("accepts function reconcile option", () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: {
					reconcile: (_oldData, newData) => newData,
				},
			},
		})
		expect(client).toBeDefined()
	})
})
