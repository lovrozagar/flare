/**
 * Layout Integration Tests
 *
 * Tests layout hierarchy, loader data flow, and match caching.
 */

import { describe, expect, it, vi } from "vitest"
import { createFlareClient } from "../../src/client/init"
import { createFlareProvider } from "../../src/client/provider"
import { FlareStateBuilder } from "../utils/flare-state"
import { MockFetchBuilder } from "../utils/mock-fetch"
import { createNDJSONResponse, ndjson } from "../utils/ndjson"

describe("Layout hierarchy with match cache", () => {
	it("maintains parent layout when navigating between child pages", async () => {
		const ssrState = new FlareStateBuilder()
			.withPathname("/page-a")
			.addMatch("_root_", { app: "test" })
			.addMatch("_root_/(layout)", { layoutData: "from-layout" })
			.addMatch("_root_/(layout)/page-a", { pageData: "page-a" })
			.build()

		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl(
				"/page-b",
				createNDJSONResponse([
					ndjson.loader("_root_", { app: "test" }),
					ndjson.loader("_root_/(layout)", { layoutData: "from-layout" }),
					ndjson.loader("_root_/(layout)/page-b", { pageData: "page-b" }),
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

		expect(ctx.matches()).toHaveLength(3)
		expect(ctx.matches()[1]?.loaderData).toEqual({ layoutData: "from-layout" })
		expect(ctx.matches()[2]?.loaderData).toEqual({ pageData: "page-a" })

		await ctx.router.navigate({ to: "/page-b" })

		expect(cache.get("_root_/(layout)")?.data).toEqual({ layoutData: "from-layout" })
		expect(cache.get("_root_/(layout)/page-b")?.data).toEqual({ pageData: "page-b" })
	})

	it("replaces nested layouts when switching layout groups", async () => {
		const ssrState = new FlareStateBuilder()
			.withPathname("/login")
			.addMatch("_root_", {})
			.addMatch("_root_/(auth)", { auth: true })
			.addMatch("_root_/(auth)/login", {})
			.build()

		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl(
				"/about",
				createNDJSONResponse([
					ndjson.loader("_root_", {}),
					ndjson.loader("_root_/(public)", { public: true }),
					ndjson.loader("_root_/(public)/about", {}),
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

		expect(cache.get("_root_/(auth)")?.data).toEqual({ auth: true })

		await ctx.router.navigate({ to: "/about" })

		expect(cache.get("_root_/(public)")?.data).toEqual({ public: true })
		expect(cache.get("_root_/(public)/about")?.data).toEqual({})
	})

	it("deep nested layouts all update on navigation", async () => {
		const ssrState = new FlareStateBuilder()
			.withPathname("/page")
			.addMatch("_root_", { level: 0 })
			.addMatch("_root_/(group-a)", { level: 1 })
			.addMatch("_root_/(group-a)/(sub-a)", { level: 2 })
			.addMatch("_root_/(group-a)/(sub-a)/page", { level: 3 })
			.build()

		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl(
				"/other",
				createNDJSONResponse([
					ndjson.loader("_root_", { level: 0 }),
					ndjson.loader("_root_/(group-b)", { group: "b", level: 1 }),
					ndjson.loader("_root_/(group-b)/(sub-b)", { level: 2, sub: "b" }),
					ndjson.loader("_root_/(group-b)/(sub-b)/(deep)", { deep: true, level: 3 }),
					ndjson.loader("_root_/(group-b)/(sub-b)/(deep)/other", { level: 4 }),
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

		expect(ctx.matches()).toHaveLength(4)

		await ctx.router.navigate({ to: "/other" })

		expect(cache.get("_root_/(group-b)")?.data).toEqual({ group: "b", level: 1 })
		expect(cache.get("_root_/(group-b)/(sub-b)")?.data).toEqual({ level: 2, sub: "b" })
		expect(cache.get("_root_/(group-b)/(sub-b)/(deep)")?.data).toEqual({ deep: true, level: 3 })
		expect(cache.get("_root_/(group-b)/(sub-b)/(deep)/other")?.data).toEqual({ level: 4 })
	})
})

describe("Layout loader data in cache", () => {
	it("cache stores layout loader data by match id", () => {
		const ssrState = new FlareStateBuilder()
			.withPathname("/home")
			.addMatch("_root_", { root: true })
			.addMatch("_root_/(dashboard)", { dashboard: true, user: "test-user" })
			.addMatch("_root_/(dashboard)/home", { page: "home" })
			.build()

		const client = createFlareClient({ flareState: ssrState })
		const cache = client.getMatchCache()

		expect(cache.get("_root_")?.data).toEqual({ root: true })
		expect(cache.get("_root_/(dashboard)")?.data).toEqual({ dashboard: true, user: "test-user" })
		expect(cache.get("_root_/(dashboard)/home")?.data).toEqual({ page: "home" })
	})

	it("cache updates layout data after navigation", async () => {
		const ssrState = new FlareStateBuilder()
			.withPathname("/page")
			.addMatch("_root_", {})
			.addMatch("_root_/(layout)", { version: 1 })
			.addMatch("_root_/(layout)/page", {})
			.build()

		const { fetch: mockFetch } = new MockFetchBuilder()
			.onUrl(
				"/other",
				createNDJSONResponse([
					ndjson.loader("_root_", {}),
					ndjson.loader("_root_/(layout)", { reloaded: true, version: 2 }),
					ndjson.loader("_root_/(layout)/other", {}),
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

		expect(cache.get("_root_/(layout)")?.data).toEqual({ version: 1 })

		await ctx.router.navigate({ to: "/other" })

		expect(cache.get("_root_/(layout)")?.data).toEqual({ reloaded: true, version: 2 })
	})
})

describe("Layout with params", () => {
	it("layout receives params in loader context", async () => {
		let capturedUrl = ""
		const ssrState = new FlareStateBuilder()
			.withPathname("/acme/dashboard")
			.withParams({ orgId: "acme" })
			.addMatch("_root_", {})
			.addMatch("_root_/(org)/[orgId]", { orgId: "acme", orgName: "Acme Corp" })
			.addMatch("_root_/(org)/[orgId]/dashboard", {})
			.build()

		const mockFetch = vi.fn((url: string) => {
			capturedUrl = url
			return Promise.resolve(
				createNDJSONResponse([
					ndjson.loader("_root_", {}),
					ndjson.loader("_root_/(org)/[orgId]", { orgId: "globex", orgName: "Globex Inc" }),
					ndjson.loader("_root_/(org)/[orgId]/dashboard", {}),
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
			params: { orgId: "globex" },
			to: "/[orgId]/dashboard",
		})

		expect(capturedUrl).toBe("/globex/dashboard")
		expect(ctx.matches()[1]?.loaderData).toEqual({ orgId: "globex", orgName: "Globex Inc" })
	})
})

describe("Layout navigation optimization", () => {
	it("superseded navigation is ignored", async () => {
		const ssrState = new FlareStateBuilder()
			.addMatch("_root_", {})
			.addMatch("_root_/", { initial: true })
			.build()

		const resolvers: Array<() => void> = []

		const mockFetch = vi.fn(() => {
			return new Promise<Response>((resolve) => {
				resolvers.push(() => {
					resolve(
						createNDJSONResponse([
							ndjson.loader("_root_", {}),
							ndjson.loader("_root_/slow", {}),
							ndjson.done(),
						]),
					)
				})
			})
		})

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState: ssrState,
		})
		const ctx = createFlareProvider(client)

		const nav1 = ctx.router.navigate({ to: "/slow" })

		const mockFetch2 = vi.fn(() => {
			return Promise.resolve(
				createNDJSONResponse([
					ndjson.loader("_root_", {}),
					ndjson.loader("_root_/fast", { fast: true }),
					ndjson.done(),
				]),
			)
		})

		client.getRouter().navigate = async (opts) => {
			await mockFetch2(opts.to as string)
			if (typeof opts === "object" && opts !== null && "onUpdate" in opts) {
				;(opts as { onUpdate?: () => void }).onUpdate?.()
			}
		}

		const nav2 = ctx.router.navigate({ to: "/fast" })

		resolvers[0]?.()

		await Promise.all([nav1, nav2])

		expect(ctx.location().pathname).toBe("/fast")
	})
})

describe("Layout match ID generation", () => {
	it("layout match IDs include group paths", () => {
		const ssrState = new FlareStateBuilder()
			.withPathname("/users")
			.addMatch("_root_", {})
			.addMatch("_root_/(auth)/(admin)", { admin: true })
			.addMatch("_root_/(auth)/(admin)/users", {})
			.build()

		const client = createFlareClient({ flareState: ssrState })
		const cache = client.getMatchCache()

		expect(cache.get("_root_/(auth)/(admin)")?.data).toEqual({ admin: true })
	})

	it("parameterized layout match IDs use bracket notation", () => {
		const ssrState = new FlareStateBuilder()
			.withPathname("/t1/settings")
			.withParams({ tenantId: "t1" })
			.addMatch("_root_", {})
			.addMatch("_root_/(tenant)/[tenantId]", { tenantId: "t1" })
			.addMatch("_root_/(tenant)/[tenantId]/settings", {})
			.build()

		const client = createFlareClient({ flareState: ssrState })
		const cache = client.getMatchCache()

		expect(cache.get("_root_/(tenant)/[tenantId]")?.data).toEqual({ tenantId: "t1" })
	})
})
