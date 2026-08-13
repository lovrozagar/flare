import { describe, expect, it, vi } from "vitest"
import type { MiddlewareContext } from "../../../../src/server/middleware"
import { staticAssets } from "../../../../src/server/middleware/static-assets"

function createMockContext(
	pathname: string,
	env: { ASSETS: { fetch: typeof fetch } } = { ASSETS: { fetch: vi.fn() } },
): MiddlewareContext<{ ASSETS: { fetch: typeof fetch } }> {
	const store = new Map()
	return {
		applyResponseHandlers: vi.fn(),
		env,
		executionContext: { passThroughOnException: vi.fn(), waitUntil: vi.fn() },
		nonce: "test-nonce",
		onResponse: vi.fn(),
		request: new Request(`https://example.com${pathname}`),
		serverRequestContext: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) },
		url: new URL(`https://example.com${pathname}`),
	}
}

describe("staticAssets", () => {
	describe("exact path matching", () => {
		it("matches exact path and returns bypass", async () => {
			const mockResponse = new Response("favicon content")
			const mockFetch = vi.fn().mockResolvedValue(mockResponse)
			const middleware = staticAssets({ paths: ["/favicon.ico"] })

			const ctx = createMockContext("/favicon.ico", { ASSETS: { fetch: mockFetch } })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			expect(result).toHaveProperty("response", mockResponse)
			expect(mockFetch).toHaveBeenCalledWith(ctx.request)
			expect(next).not.toHaveBeenCalled()
		})

		it("does not match different exact path", async () => {
			const middleware = staticAssets({ paths: ["/favicon.ico"] })
			const ctx = createMockContext("/robots.txt")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(result).not.toHaveProperty("response")
		})

		it("matches multiple exact paths", async () => {
			const mockResponse = new Response("robots content")
			const mockFetch = vi.fn().mockResolvedValue(mockResponse)
			const middleware = staticAssets({ paths: ["/favicon.ico", "/robots.txt", "/sitemap.xml"] })

			const ctx = createMockContext("/robots.txt", { ASSETS: { fetch: mockFetch } })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			expect(result).toHaveProperty("response", mockResponse)
		})
	})

	describe("prefix path matching", () => {
		it("matches path with prefix", async () => {
			const mockResponse = new Response("asset content")
			const mockFetch = vi.fn().mockResolvedValue(mockResponse)
			const middleware = staticAssets({ paths: ["/assets/"] })

			const ctx = createMockContext("/assets/styles.css", { ASSETS: { fetch: mockFetch } })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			expect(result).toHaveProperty("response", mockResponse)
			expect(mockFetch).toHaveBeenCalledWith(ctx.request)
		})

		it("matches nested path with prefix", async () => {
			const mockResponse = new Response("nested asset")
			const mockFetch = vi.fn().mockResolvedValue(mockResponse)
			const middleware = staticAssets({ paths: ["/assets/"] })

			const ctx = createMockContext("/assets/images/logo.png", { ASSETS: { fetch: mockFetch } })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			expect(result).toHaveProperty("response", mockResponse)
		})

		it("does not match path not starting with prefix", async () => {
			const middleware = staticAssets({ paths: ["/assets/"] })
			const ctx = createMockContext("/api/users")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
		})

		it("matches multiple prefixes", async () => {
			const mockResponse = new Response("static content")
			const mockFetch = vi.fn().mockResolvedValue(mockResponse)
			const middleware = staticAssets({ paths: ["/assets/", "/static/", "/public/"] })

			const ctx = createMockContext("/static/bundle.js", { ASSETS: { fetch: mockFetch } })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
		})
	})

	describe("mixed exact and prefix paths", () => {
		it("matches exact path in mixed config", async () => {
			const mockResponse = new Response("favicon")
			const mockFetch = vi.fn().mockResolvedValue(mockResponse)
			const middleware = staticAssets({ paths: ["/assets/", "/favicon.ico", "/robots.txt"] })

			const ctx = createMockContext("/favicon.ico", { ASSETS: { fetch: mockFetch } })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
		})

		it("matches prefix path in mixed config", async () => {
			const mockResponse = new Response("asset")
			const mockFetch = vi.fn().mockResolvedValue(mockResponse)
			const middleware = staticAssets({ paths: ["/assets/", "/favicon.ico", "/robots.txt"] })

			const ctx = createMockContext("/assets/app.js", { ASSETS: { fetch: mockFetch } })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
		})

		it("returns next for unmatched path in mixed config", async () => {
			const middleware = staticAssets({ paths: ["/assets/", "/favicon.ico", "/robots.txt"] })
			const ctx = createMockContext("/api/data")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
		})
	})

	describe("edge cases", () => {
		it("handles empty paths config", async () => {
			const middleware = staticAssets({ paths: [] })
			const ctx = createMockContext("/anything")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
		})

		it("exact match takes priority (checked first)", async () => {
			const mockResponse = new Response("exact match")
			const mockFetch = vi.fn().mockResolvedValue(mockResponse)
			/* Both /assets and /assets/ could match /assets */
			const middleware = staticAssets({ paths: ["/assets/", "/assets"] })

			const ctx = createMockContext("/assets", { ASSETS: { fetch: mockFetch } })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			/* Should only call fetch once */
			expect(mockFetch).toHaveBeenCalledTimes(1)
		})

		it("prefix does not match exact path without trailing content", async () => {
			const middleware = staticAssets({ paths: ["/assets/"] })
			const ctx = createMockContext("/assets")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			/* /assets/ prefix requires trailing slash, /assets does not match */
			expect(result.type).toBe("next")
		})
	})
})
