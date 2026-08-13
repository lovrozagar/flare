/**
 * HTML Navigation Integration Tests
 *
 * Tests full HTML nav flow: CSR data request → server renders HTML → client parses state.
 * Focuses on state management and parsing - DOM swap is browser-specific.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createHtmlNavFetcher,
	extractAppContent,
	parseFlareStateFromHtml,
	toNavState,
} from "../../src/client/html-nav"
import { createFlareClient } from "../../src/client/init"
import { createFlareProvider } from "../../src/client/provider"
import { NAV_FORMAT } from "../../src/server/handler/constants"
import { FlareStateBuilder } from "../utils/flare-state"
import { createNDJSONResponse, ndjson } from "../utils/ndjson"

/* Mock document for DOM swap tests */
const mockDocument = {
	getElementById: vi.fn(),
	head: {
		appendChild: vi.fn(),
		querySelector: vi.fn(() => null),
		querySelectorAll: vi.fn(() => []),
	},
	querySelectorAll: vi.fn(() => []),
}

beforeEach(() => {
	vi.resetAllMocks()
	mockDocument.head.querySelector.mockReturnValue(null)
	mockDocument.head.querySelectorAll.mockReturnValue([])
	mockDocument.querySelectorAll.mockReturnValue([])
	globalThis.document = mockDocument as unknown as Document
})

describe("HTML nav fetcher", () => {
	it("returns HTML content in result", async () => {
		const mockHtml = `
			<!DOCTYPE html>
			<html>
			<body>
				<div id="app"><h1>About Page</h1></div>
				<script>self.flare = {"c":{},"q":[],"r":{"matches":[{"id":"_root_/about","loaderData":{"page":"about"}}],"params":{},"pathname":"/about"}};</script>
			</body>
			</html>
		`

		const mockFetch = vi.fn(() => {
			return Promise.resolve(
				new Response(mockHtml, {
					headers: {
						"Content-Type": "text/html; charset=utf-8",
						"x-flare-nav-format": "html",
					},
				}),
			)
		})

		const fetcher = createHtmlNavFetcher({
			baseUrl: "",
			fetch: mockFetch,
		})

		const result = await fetcher.fetch({ url: "/about" })

		expect(result.success).toBe(true)
		expect(result.html).toBeDefined()
		expect(result.html).toContain("<h1>About Page</h1>")
		expect(result.state).toBeDefined()
		expect(result.state?.pathname).toBe("/about")
	})

	it("sends correct headers for HTML nav", async () => {
		const mockFetch = vi.fn(() => {
			return Promise.resolve(
				new Response(
					`<div id="app"></div><script>self.flare = {"c":{},"q":[],"r":{"matches":[],"params":{},"pathname":"/"}};</script>`,
					{ headers: { "Content-Type": "text/html" } },
				),
			)
		})

		const fetcher = createHtmlNavFetcher({
			baseUrl: "",
			fetch: mockFetch,
		})

		await fetcher.fetch({ url: "/test" })

		expect(mockFetch).toHaveBeenCalledWith(
			"/test",
			expect.objectContaining({
				headers: expect.objectContaining({
					"x-d": "1",
					"x-f": NAV_FORMAT.HTML,
				}),
			}),
		)
	})

	it("adds prefetch header when prefetch option set", async () => {
		const mockFetch = vi.fn(() => {
			return Promise.resolve(
				new Response(
					`<div id="app"></div><script>self.flare = {"c":{},"q":[],"r":{"matches":[],"params":{},"pathname":"/"}};</script>`,
					{ headers: { "Content-Type": "text/html" } },
				),
			)
		})

		const fetcher = createHtmlNavFetcher({
			baseUrl: "",
			fetch: mockFetch,
		})

		await fetcher.fetch({ prefetch: true, url: "/test" })

		expect(mockFetch).toHaveBeenCalledWith(
			"/test",
			expect.objectContaining({
				headers: expect.objectContaining({
					"x-p": "1",
				}),
			}),
		)
	})

	it("returns error for non-ok response", async () => {
		const mockFetch = vi.fn(() => {
			return Promise.resolve(new Response("Not Found", { status: 404 }))
		})

		const fetcher = createHtmlNavFetcher({
			baseUrl: "",
			fetch: mockFetch,
		})

		const result = await fetcher.fetch({ url: "/not-found" })

		expect(result.success).toBe(false)
		expect(result.error).toBeDefined()
		expect(result.error?.message).toContain("404")
	})

	it("returns error when flare state cannot be parsed", async () => {
		const mockFetch = vi.fn(() => {
			return Promise.resolve(
				new Response("<html><body>No flare state</body></html>", {
					headers: { "Content-Type": "text/html" },
				}),
			)
		})

		const fetcher = createHtmlNavFetcher({
			baseUrl: "",
			fetch: mockFetch,
		})

		const result = await fetcher.fetch({ url: "/test" })

		expect(result.success).toBe(false)
		expect(result.error?.message).toContain("parse flare state")
	})
})

describe("HTML nav state parsing", () => {
	it("parseFlareStateFromHtml extracts state correctly", () => {
		const html = `
			<html>
			<body>
				<div id="app">Content</div>
				<script>self.flare = {"c":{},"q":[{"key":["user"],"data":{"name":"Bob"}}],"r":{"matches":[{"id":"_root_/page","loaderData":{"x":1}}],"params":{"id":"123"},"pathname":"/page"}};</script>
			</body>
			</html>
		`

		const state = parseFlareStateFromHtml(html)

		expect(state).not.toBeNull()
		expect(state?.r.pathname).toBe("/page")
		expect(state?.r.params).toEqual({ id: "123" })
		expect(state?.r.matches).toHaveLength(1)
		expect(state?.r.matches[0]?.loaderData).toEqual({ x: 1 })
		expect(state?.q).toHaveLength(1)
		expect(state?.q[0]?.data).toEqual({ name: "Bob" })
	})

	it("toNavState converts parsed state to nav state", () => {
		const parsed = {
			c: {},
			q: [{ data: { items: [] }, key: ["list"], staleTime: 5000 }],
			r: {
				matches: [{ id: "_root_/products", loaderData: { products: ["A", "B"] } }],
				params: { category: "all" },
				pathname: "/products",
			},
		}

		const navState = toNavState(parsed)

		expect(navState.pathname).toBe("/products")
		expect(navState.params).toEqual({ category: "all" })
		expect(navState.matches).toHaveLength(1)
		expect(navState.matches[0]?.loaderData).toEqual({ products: ["A", "B"] })
		expect(navState.queries).toHaveLength(1)
		expect(navState.queries[0]?.key).toEqual(["list"])
	})

	it("extractAppContent extracts app div content", () => {
		const html = `<html><body><div id="app"><h1>Hello</h1><p>World</p></div><script></script></body></html>`
		const content = extractAppContent(html)
		expect(content).toBe("<h1>Hello</h1><p>World</p>")
	})

	it("extractAppContent handles root div", () => {
		const html = `<html><body><div id="root"><span>Content</span></div></body></html>`
		const content = extractAppContent(html)
		expect(content).toBe("<span>Content</span>")
	})
})

describe("HTML nav client integration", () => {
	it("client navigates and updates state from HTML response", async () => {
		const mockAppEl = { innerHTML: "" }
		mockDocument.getElementById.mockReturnValue(mockAppEl)

		const ssrState = new FlareStateBuilder()
			.withNavFormat("html")
			.addMatch("_root_", {})
			.addMatch("_root_/", { page: "home" })
			.build()

		const mockHtml = `
			<!DOCTYPE html>
			<html>
			<body>
				<div id="app"><h1>About Page</h1></div>
				<script>self.flare = {"c":{},"q":[],"r":{"matches":[{"id":"_root_","loaderData":{}},{"id":"_root_/about","loaderData":{"page":"about"}}],"params":{},"pathname":"/about"}};</script>
			</body>
			</html>
		`

		const mockFetch = vi.fn(() => {
			return Promise.resolve(
				new Response(mockHtml, {
					headers: {
						"Content-Type": "text/html; charset=utf-8",
						"x-flare-nav-format": "html",
					},
				}),
			)
		})

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState: ssrState,
		})
		const ctx = createFlareProvider(client)

		expect(ctx.location().pathname).toBe("/")

		await ctx.router.navigate({ to: "/about" })

		expect(ctx.location().pathname).toBe("/about")
		const cache = client.getMatchCache()
		expect(cache.get("_root_/about")?.data).toEqual({ page: "about" })
	})

	it("client cache is updated after HTML navigation", async () => {
		const mockAppEl = { innerHTML: "" }
		mockDocument.getElementById.mockReturnValue(mockAppEl)

		const ssrState = new FlareStateBuilder()
			.withNavFormat("html")
			.addMatch("_root_", {})
			.addMatch("_root_/", { page: "home" })
			.build()

		const mockHtml = `
			<!DOCTYPE html>
			<html>
			<body>
				<div id="app"><h1>Products</h1></div>
				<script>self.flare = {"c":{},"q":[],"r":{"matches":[{"id":"_root_","loaderData":{}},{"id":"_root_/products","loaderData":{"products":["A","B"]}}],"params":{},"pathname":"/products"}};</script>
			</body>
			</html>
		`

		const mockFetch = vi.fn(() => {
			return Promise.resolve(
				new Response(mockHtml, {
					headers: {
						"Content-Type": "text/html; charset=utf-8",
						"x-flare-nav-format": "html",
					},
				}),
			)
		})

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState: ssrState,
		})
		const ctx = createFlareProvider(client)
		const cache = client.getMatchCache()

		expect(cache.get("_root_/")?.data).toEqual({ page: "home" })

		await ctx.router.navigate({ to: "/products" })

		expect(cache.get("_root_/products")?.data).toEqual({ products: ["A", "B"] })
	})

	it("HTML nav updates query client with hydrated queries", async () => {
		const mockAppEl = { innerHTML: "" }
		mockDocument.getElementById.mockReturnValue(mockAppEl)

		const ssrState = new FlareStateBuilder()
			.withNavFormat("html")
			.addMatch("_root_", {})
			.addMatch("_root_/", {})
			.build()

		const mockHtml = `
			<!DOCTYPE html>
			<html>
			<body>
				<div id="app"><h1>User</h1></div>
				<script>self.flare = {"c":{},"q":[{"key":["user",123],"data":{"name":"Bob"},"staleTime":60000}],"r":{"matches":[{"id":"_root_","loaderData":{}},{"id":"_root_/user","loaderData":{}}],"params":{},"pathname":"/user"}};</script>
			</body>
			</html>
		`

		const setQueryData = vi.fn()
		const mockQueryClient = { setQueryData }

		const mockFetch = vi.fn(() => {
			return Promise.resolve(
				new Response(mockHtml, {
					headers: {
						"Content-Type": "text/html; charset=utf-8",
						"x-flare-nav-format": "html",
					},
				}),
			)
		})

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState: ssrState,
			queryClient: mockQueryClient,
		})
		const ctx = createFlareProvider(client)

		await ctx.router.navigate({ to: "/user" })

		expect(setQueryData).toHaveBeenCalledWith(
			["user", 123],
			{ name: "Bob" },
			expect.objectContaining({ staleTime: 60000 }),
		)
	})
})

describe("HTML nav vs NDJSON nav format", () => {
	it("default navFormat from routerDefaults is used", async () => {
		const mockAppEl = { innerHTML: "" }
		mockDocument.getElementById.mockReturnValue(mockAppEl)

		const ssrState = new FlareStateBuilder().withNavFormat("html").addMatch("_root_", {}).build()

		const mockHtml = `<div id="app"></div><script>self.flare = {"c":{},"q":[],"r":{"matches":[{"id":"_root_","loaderData":{}}],"params":{},"pathname":"/test"}};</script>`

		const mockFetch = vi.fn(() => {
			return Promise.resolve(
				new Response(mockHtml, {
					headers: { "Content-Type": "text/html" },
				}),
			)
		})

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState: ssrState,
		})
		const ctx = createFlareProvider(client)

		await ctx.router.navigate({ to: "/test" })

		expect(mockFetch).toHaveBeenCalledWith(
			"/test",
			expect.objectContaining({
				headers: expect.objectContaining({
					"x-f": "html",
				}),
			}),
		)
	})

	it("navigate can override navFormat", async () => {
		const ssrState = new FlareStateBuilder().withNavFormat("html").build()

		const mockFetch = vi.fn(() => {
			return Promise.resolve(createNDJSONResponse([ndjson.done()]))
		})

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState: ssrState,
		})
		const ctx = createFlareProvider(client)

		await ctx.router.navigate({ navFormat: "ndjson", to: "/test" })

		expect(mockFetch).toHaveBeenCalledWith(
			"/test",
			expect.objectContaining({
				headers: expect.objectContaining({
					"x-f": "ndjson",
				}),
			}),
		)
	})
})
