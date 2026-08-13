import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MiddlewareContext } from "../../../../src/server/middleware"
import { htmlCache } from "../../../../src/server/middleware/html-cache"

function createMockContext(
	pathname: string,
	options: {
		headers?: Record<string, string>
		method?: string
	} = {},
): MiddlewareContext {
	const url = new URL(`https://example.com${pathname}`)
	const headers = new Headers(options.headers)
	const store = new Map()
	return {
		applyResponseHandlers: vi.fn(),
		env: {},
		executionContext: { passThroughOnException: vi.fn(), waitUntil: vi.fn() },
		nonce: "test-nonce",
		onResponse: vi.fn(),
		request: new Request(url.toString(), { headers, method: options.method ?? "GET" }),
		serverRequestContext: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) },
		url,
	}
}

const defaultConfig = {
	files: [
		{ cacheControl: "public, max-age=3600", path: "sitemap.xml" },
		{ cacheControl: "public, max-age=3600", path: "robots.txt" },
	],
	html: { cacheControl: "public, max-age=60, stale-while-revalidate=86400" },
	name: "test-cache",
}

describe("htmlCache", () => {
	let mockCache: {
		delete: ReturnType<typeof vi.fn>
		match: ReturnType<typeof vi.fn>
		put: ReturnType<typeof vi.fn>
	}
	let originalCaches: typeof globalThis.caches

	beforeEach(() => {
		mockCache = {
			delete: vi.fn(),
			match: vi.fn().mockResolvedValue(undefined),
			put: vi.fn().mockResolvedValue(undefined),
		}
		originalCaches = globalThis.caches
		;(globalThis as unknown as { caches: { open: ReturnType<typeof vi.fn> } }).caches = {
			open: vi.fn().mockResolvedValue(mockCache),
		}
	})

	afterEach(() => {
		;(globalThis as unknown as { caches: typeof originalCaches }).caches = originalCaches
	})

	describe("cache API availability", () => {
		it("skips when caches API unavailable", async () => {
			;(globalThis as unknown as { caches: undefined }).caches = undefined

			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
		})
	})

	describe("enabled option", () => {
		it("skips when enabled is false", async () => {
			const middleware = htmlCache({ ...defaultConfig, enabled: false })
			const ctx = createMockContext("/about")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(mockCache.match).not.toHaveBeenCalled()
		})

		it("skips when enabled function returns false", async () => {
			const middleware = htmlCache({
				...defaultConfig,
				enabled: () => false,
			})
			const ctx = createMockContext("/about")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
		})

		it("caches when enabled function returns true", async () => {
			const middleware = htmlCache({
				...defaultConfig,
				enabled: () => true,
			})
			const ctx = createMockContext("/about")
			const next = vi.fn()

			await middleware(ctx, next)

			expect(mockCache.match).toHaveBeenCalled()
		})
	})

	describe("request method filtering", () => {
		it("only caches GET requests", async () => {
			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about", { method: "POST" })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(mockCache.match).not.toHaveBeenCalled()
		})
	})

	describe("skip pattern", () => {
		it("skips paths matching skip regex", async () => {
			const middleware = htmlCache({
				...defaultConfig,
				skip: /^\/api\//,
			})
			const ctx = createMockContext("/api/users")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(mockCache.match).not.toHaveBeenCalled()
		})

		it("does not skip non-matching paths", async () => {
			const middleware = htmlCache({
				...defaultConfig,
				skip: /^\/api\//,
			})
			const ctx = createMockContext("/about")
			const next = vi.fn()

			await middleware(ctx, next)

			expect(mockCache.match).toHaveBeenCalled()
		})
	})

	describe("path matching", () => {
		it("caches HTML paths (no extension)", async () => {
			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about")
			const next = vi.fn()

			await middleware(ctx, next)

			expect(mockCache.match).toHaveBeenCalled()
		})

		it("caches file paths matching rules", async () => {
			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/sitemap.xml")
			const next = vi.fn()

			await middleware(ctx, next)

			expect(mockCache.match).toHaveBeenCalled()
		})

		it("skips paths with extensions not in file rules", async () => {
			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/styles.css")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(mockCache.match).not.toHaveBeenCalled()
		})
	})

	describe("cache miss", () => {
		it("registers onResponse handler on cache miss", async () => {
			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(ctx.onResponse).toHaveBeenCalled()
		})

		it("onResponse handler caches successful responses", async () => {
			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about")
			const next = vi.fn()

			await middleware(ctx, next)

			/* Get the onResponse handler */
			const handler = (ctx.onResponse as ReturnType<typeof vi.fn>).mock.calls[0][0]
			const response = new Response("content", { status: 200 })

			handler(response)

			expect(ctx.executionContext.waitUntil).toHaveBeenCalled()
		})

		it("onResponse handler skips non-ok responses", async () => {
			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about")
			const next = vi.fn()

			await middleware(ctx, next)

			const handler = (ctx.onResponse as ReturnType<typeof vi.fn>).mock.calls[0][0]
			const response = new Response("error", { status: 500 })

			handler(response)

			/* waitUntil should not be called for non-ok responses */
			expect(ctx.executionContext.waitUntil).not.toHaveBeenCalled()
		})
	})

	describe("cache hit - fresh", () => {
		it("returns cached response when fresh", async () => {
			const cachedResponse = new Response("cached content", {
				headers: {
					"Content-Type": "text/html",
					"x-cached-at": Date.now().toString(),
				},
			})
			mockCache.match.mockResolvedValue(cachedResponse)

			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("respond")
			if (result.type === "respond") {
				expect(result.response.headers.get("x-swr-status")).toBe("HIT")
			}
		})

		it("removes x-cached-at header from response", async () => {
			const cachedResponse = new Response("cached", {
				headers: {
					"x-cached-at": Date.now().toString(),
				},
			})
			mockCache.match.mockResolvedValue(cachedResponse)

			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			if (result.type === "respond") {
				expect(result.response.headers.get("x-cached-at")).toBeNull()
			}
		})
	})

	describe("cache hit - stale (SWR)", () => {
		it("returns stale response with STALE header", async () => {
			/* Cached 2 minutes ago (past 60s max-age) */
			const cachedAt = Date.now() - 120000
			const cachedResponse = new Response("stale content", {
				headers: {
					"Content-Type": "text/html",
					"x-cached-at": cachedAt.toString(),
				},
			})
			mockCache.match.mockResolvedValue(cachedResponse)

			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("respond")
			if (result.type === "respond") {
				expect(result.response.headers.get("x-swr-status")).toBe("STALE")
			}
		})

		it("triggers background revalidation for stale content", async () => {
			const cachedAt = Date.now() - 120000
			const cachedResponse = new Response("stale", {
				headers: {
					"x-cached-at": cachedAt.toString(),
				},
			})
			mockCache.match.mockResolvedValue(cachedResponse)

			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about")
			const next = vi.fn()

			await middleware(ctx, next)

			expect(ctx.executionContext.waitUntil).toHaveBeenCalled()
		})
	})

	describe("cache expired", () => {
		it("treats response as miss when beyond SWR window", async () => {
			/* Cached 2 days ago (past 60s + 86400s SWR window) */
			const cachedAt = Date.now() - 200000000
			const cachedResponse = new Response("expired", {
				headers: {
					"x-cached-at": cachedAt.toString(),
				},
			})
			mockCache.match.mockResolvedValue(cachedResponse)

			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(ctx.onResponse).toHaveBeenCalled()
		})
	})

	describe("nonce extraction", () => {
		it("extracts nonce from cached HTML", async () => {
			const htmlWithNonce = '<html><head><script nonce="abc123">test</script></head></html>'
			const cachedResponse = new Response(htmlWithNonce, {
				headers: {
					"Content-Type": "text/html",
					"x-cached-at": Date.now().toString(),
				},
			})
			mockCache.match.mockResolvedValue(cachedResponse)

			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about")
			const next = vi.fn()

			await middleware(ctx, next)

			expect(ctx.serverRequestContext.get("nonce")).toBe("abc123")
		})
	})

	describe("file cache rules", () => {
		it("uses file-specific cache control", async () => {
			const cachedResponse = new Response("sitemap content", {
				headers: {
					"x-cached-at": Date.now().toString(),
				},
			})
			mockCache.match.mockResolvedValue(cachedResponse)

			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/sitemap.xml")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			if (result.type === "respond") {
				expect(result.response.headers.get("Cache-Control")).toBe("public, max-age=3600")
			}
		})
	})

	describe("skip cache", () => {
		it("skips cache lookup when x-skip-cache header is set", async () => {
			const cachedResponse = new Response("cached", {
				headers: { "x-cached-at": Date.now().toString() },
			})
			mockCache.match.mockResolvedValue(cachedResponse)

			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about", { headers: { "x-skip-cache": "1" } })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(mockCache.match).not.toHaveBeenCalled()
			expect(ctx.onResponse).toHaveBeenCalled()
		})

		it("skips cache lookup when xskipcache query param is set", async () => {
			const cachedResponse = new Response("cached", {
				headers: { "x-cached-at": Date.now().toString() },
			})
			mockCache.match.mockResolvedValue(cachedResponse)

			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about?xskipcache=1")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(mockCache.match).not.toHaveBeenCalled()
			expect(ctx.onResponse).toHaveBeenCalled()
		})

		it("does not skip cache when header value is not 1", async () => {
			const middleware = htmlCache(defaultConfig)
			const ctx = createMockContext("/about", { headers: { "x-skip-cache": "0" } })
			const next = vi.fn()

			await middleware(ctx, next)

			expect(mockCache.match).toHaveBeenCalled()
		})
	})
})
