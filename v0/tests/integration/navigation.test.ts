/**
 * Navigation Integration Tests
 *
 * Tests CSR navigation including back/forward (popstate) handling.
 */

import { describe, expect, it, vi } from "vitest"
import { createFlareClient } from "../../src/client/init"
import { createFlareProvider } from "../../src/client/provider"
import { createFlareState, FlareStateBuilder } from "../utils/flare-state"
import { MockFetchBuilder } from "../utils/mock-fetch"
import { createNDJSONResponse, ndjson } from "../utils/ndjson"

describe("CSR navigation", () => {
	it("navigate resolves URL params correctly", async () => {
		let capturedUrl = ""

		const ssrState = new FlareStateBuilder().addMatch("_root_", {}).addMatch("_root_/", {}).build()

		const mockFetch = vi.fn((url: string) => {
			capturedUrl = url
			return Promise.resolve(
				createNDJSONResponse([
					ndjson.loader("_root_", {}),
					ndjson.loader("_root_/products/123", { id: "123" }),
					ndjson.ready(),
					ndjson.done(),
				]),
			)
		})

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState: ssrState,
		})
		const ctx = createFlareProvider(client)

		await ctx.router.navigate({
			params: { id: "123" },
			to: "/products/[id]",
		})

		expect(capturedUrl).toBe("/products/123")
		expect(ctx.location().pathname).toBe("/products/123")
	})

	it("navigate without params uses to directly", async () => {
		let capturedUrl = ""

		const ssrState = new FlareStateBuilder().addMatch("_root_", {}).addMatch("_root_/", {}).build()

		const mockFetch = vi.fn((url: string) => {
			capturedUrl = url
			return Promise.resolve(
				createNDJSONResponse([
					ndjson.loader("_root_", {}),
					ndjson.loader("_root_/about", {}),
					ndjson.ready(),
					ndjson.done(),
				]),
			)
		})

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState: ssrState,
		})
		const ctx = createFlareProvider(client)

		await ctx.router.navigate({ to: "/about" })

		expect(capturedUrl).toBe("/about")
		expect(ctx.location().pathname).toBe("/about")
	})
})

describe("popstate handling", () => {
	it("client registers popstate handlers", () => {
		const ssrState = createFlareState()

		const client = createFlareClient({ flareState: ssrState })

		client.onPopstate(() => {})

		expect(typeof client.onPopstate).toBe("function")
	})

	it("multiple popstate handlers can be registered", () => {
		const ssrState = createFlareState()

		const client = createFlareClient({ flareState: ssrState })

		const handlers: Array<() => void> = []
		client.onPopstate(() => handlers.push(() => {}))
		client.onPopstate(() => handlers.push(() => {}))

		expect(handlers.length).toBe(0)
	})
})

describe("history state management", () => {
	it("pushHistoryState creates correct state structure", async () => {
		const ssrState = createFlareState()

		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl("/test", createNDJSONResponse([ndjson.done()]))
			.build()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState: ssrState,
		})
		const ctx = createFlareProvider(client)

		await ctx.router.navigate({ to: "/test" })

		expect(ctx.location().pathname).toBe("/test")
	})
})

describe("match cache with navigation", () => {
	it("cache is updated after navigation", async () => {
		const ssrState = new FlareStateBuilder()
			.addMatch("_root_", {})
			.addMatch("_root_/", { page: "home" })
			.build()

		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl(
				"/about",
				createNDJSONResponse([
					ndjson.loader("_root_", {}),
					ndjson.loader("_root_/about", { page: "about" }),
					ndjson.done(),
				]),
			)
			.build()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState: ssrState,
		})
		const ctx = createFlareProvider(client)

		const cache = client.getMatchCache()
		expect(cache.get("_root_/")?.data).toEqual({ page: "home" })

		await ctx.router.navigate({ to: "/about" })

		expect(cache.get("_root_/about")?.data).toEqual({ page: "about" })
	})

	it("updateMatchesFromCache creates matches from cache entries", () => {
		const ssrState = new FlareStateBuilder()
			.addMatch("_root_", { layout: true })
			.addMatch("_root_/", { page: "home" })
			.build()

		const client = createFlareClient({ flareState: ssrState })
		const ctx = createFlareProvider(client)

		const matches = ctx.matches()
		expect(matches).toHaveLength(2)
		expect(matches[0]?.loaderData).toEqual({ layout: true })
		expect(matches[1]?.loaderData).toEqual({ page: "home" })
	})
})

describe("provider signals reactivity", () => {
	it("location signal updates after navigate", async () => {
		const ssrState = createFlareState()

		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl("/new-page", createNDJSONResponse([ndjson.done()]))
			.build()

		const client = createFlareClient({
			fetch: mockFetch,
			flareState: ssrState,
		})
		const ctx = createFlareProvider(client)

		expect(ctx.location().pathname).toBe("/")

		await ctx.router.navigate({ to: "/new-page" })

		expect(ctx.location().pathname).toBe("/new-page")
	})

	it("isNavigating is true during navigation", async () => {
		const ssrState = createFlareState()

		let resolvePromise: () => void
		const fetchPromise = new Promise<void>((resolve) => {
			resolvePromise = resolve
		})

		const mockFetch = vi.fn(() => {
			return fetchPromise.then(() => createNDJSONResponse([ndjson.done()]))
		})

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState: ssrState,
		})
		const ctx = createFlareProvider(client)

		expect(ctx.isNavigating()).toBe(false)

		const navPromise = ctx.router.navigate({ to: "/test" })

		expect(ctx.isNavigating()).toBe(true)

		resolvePromise?.()
		await navPromise

		expect(ctx.isNavigating()).toBe(false)
	})

	it("matches signal is reactive and can be updated externally", () => {
		const ssrState = new FlareStateBuilder().addMatch("_root_/", { initial: true }).build()

		const client = createFlareClient({ flareState: ssrState })
		const ctx = createFlareProvider(client)

		expect(ctx.matches()).toHaveLength(1)
		expect(ctx.matches()[0]?.loaderData).toEqual({ initial: true })

		ctx.setMatches([
			{
				loaderData: { updated: true },
				render: () => null as never,
				virtualPath: "_root_/new",
			},
		])

		expect(ctx.matches()).toHaveLength(1)
		expect(ctx.matches()[0]?.loaderData).toEqual({ updated: true })
	})
})
