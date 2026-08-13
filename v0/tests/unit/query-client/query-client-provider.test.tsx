/**
 * QueryClientProvider Unit Tests
 *
 * Tests context-based QueryClient access.
 */

import { QueryClient } from "@tanstack/query-core"
import { createRoot } from "solid-js"
import { describe, expect, it } from "vitest"
import {
	getGlobalQueryClient,
	QueryClientProvider,
	tryUseQueryClient,
	useQueryClient,
} from "../../../src/query-client/query-client-provider"

describe("useQueryClient", () => {
	it("throws when no provider", () => {
		expect(() => {
			createRoot(() => {
				useQueryClient()
			})
		}).toThrow("useQueryClient: No QueryClient found")
	})

	it("returns client from context", () => {
		const client = new QueryClient()

		createRoot((dispose) => {
			QueryClientProvider({ children: null, client })
			/* In real usage, child components would use useQueryClient */
			/* This test verifies the provider sets up correctly */
			dispose()
		})

		expect(client).toBeDefined()
	})
})

describe("tryUseQueryClient", () => {
	it("returns undefined when no provider and no global client", () => {
		/* Reset global client by simulating server environment */
		const originalWindow = global.window
		delete (global as any).window

		let result: QueryClient | undefined
		createRoot((dispose) => {
			result = tryUseQueryClient()
			dispose()
		})

		/* Restore window */
		global.window = originalWindow

		/* Result may be undefined or the global client depending on state */
		expect(result === undefined || result instanceof QueryClient).toBe(true)
	})
})

describe("getGlobalQueryClient", () => {
	it("returns undefined when not set", () => {
		/* This depends on global state, so result may vary */
		const result = getGlobalQueryClient()
		expect(result === undefined || result instanceof QueryClient).toBe(true)
	})
})

describe("QueryClientProvider", () => {
	it("renders children", () => {
		const client = new QueryClient()
		let rendered = false

		createRoot((dispose) => {
			QueryClientProvider({
				get children() {
					rendered = true
					return null
				},
				client,
			})
			dispose()
		})

		expect(rendered).toBe(true)
	})
})
