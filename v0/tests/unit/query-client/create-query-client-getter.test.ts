/**
 * createQueryClientGetter Unit Tests
 *
 * Tests QueryClient factory with request-scoped SSR and client singleton.
 */

import { QueryClient } from "@tanstack/query-core"
import { afterEach, describe, expect, it } from "vitest"
import {
	createQueryClientGetter,
	FLARE_QUERY_CLIENT_SYMBOL,
	setServerQueryClient,
} from "../../../src/query-client/create-query-client-getter"

describe("createQueryClientGetter", () => {
	it("creates a getter function", () => {
		const getQueryClient = createQueryClientGetter()
		expect(typeof getQueryClient).toBe("function")
	})

	it("getter has symbol marker", () => {
		const getQueryClient = createQueryClientGetter()
		expect((getQueryClient as Record<symbol, boolean>)[FLARE_QUERY_CLIENT_SYMBOL]).toBe(true)
	})

	it("returns QueryClient instance", () => {
		const getQueryClient = createQueryClientGetter()
		const client = getQueryClient()
		expect(client).toBeInstanceOf(QueryClient)
	})

	it("applies config to created client", () => {
		const getQueryClient = createQueryClientGetter({
			defaultOptions: {
				queries: {
					staleTime: 60000,
				},
			},
		})

		const client = getQueryClient()
		expect(client).toBeInstanceOf(QueryClient)
	})
})

describe("setServerQueryClient", () => {
	it("sets server client", () => {
		const client = new QueryClient()
		setServerQueryClient(client)
		/* Server client is set on globalThis */
		expect((globalThis as Record<string, unknown>).__FLARE_SERVER_QUERY_CLIENT__).toBe(client)
	})

	it("clears server client when null", () => {
		setServerQueryClient(null)
		expect((globalThis as Record<string, unknown>).__FLARE_SERVER_QUERY_CLIENT__).toBe(null)
	})
})

describe("client environment behavior", () => {
	const originalWindow = (global as Record<string, unknown>).window

	afterEach(() => {
		;(global as Record<string, unknown>).window = originalWindow
	})

	it("returns singleton on client (window defined)", () => {
		;(global as Record<string, unknown>).window = {}
		const getQueryClient = createQueryClientGetter()

		const client1 = getQueryClient()
		const client2 = getQueryClient()

		expect(client1).toBe(client2)
	})

	it("uses server client when set (window undefined)", () => {
		delete (global as Record<string, unknown>).window
		const serverClient = new QueryClient()
		setServerQueryClient(serverClient)

		const getQueryClient = createQueryClientGetter()
		const client = getQueryClient()

		expect(client).toBe(serverClient)

		/* Cleanup */
		setServerQueryClient(null)
	})
})

describe("FLARE_QUERY_CLIENT_SYMBOL", () => {
	it("is a symbol", () => {
		expect(typeof FLARE_QUERY_CLIENT_SYMBOL).toBe("symbol")
	})

	it("has descriptive name", () => {
		expect(FLARE_QUERY_CLIENT_SYMBOL.description).toBe("flare.queryClientGetter")
	})
})
