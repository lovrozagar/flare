import { describe, expect, it, vi } from "vitest"
import type { MiddlewareContext } from "../../../../src/server/middleware"
import { cdnProxy, type R2BucketBinding } from "../../../../src/server/middleware/cdn-proxy"

interface TestEnv {
	CDN_BUCKET: R2BucketBinding
}

function createMockR2Object(body: string, contentType = "text/plain") {
	return {
		body: new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(body))
				controller.close()
			},
		}),
		etag: '"abc123"',
		httpMetadata: { contentType },
		size: body.length,
	}
}

function createMockContext(pathname: string, bucket: R2BucketBinding): MiddlewareContext<TestEnv> {
	const store = new Map()
	return {
		applyResponseHandlers: vi.fn(),
		env: { CDN_BUCKET: bucket },
		executionContext: { passThroughOnException: vi.fn(), waitUntil: vi.fn() },
		nonce: "test-nonce",
		onResponse: vi.fn(),
		request: new Request(`https://example.com${pathname}`),
		serverRequestContext: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) },
		url: new URL(`https://example.com${pathname}`),
	}
}

describe("cdnProxy", () => {
	describe("path matching", () => {
		it("matches path with prefix and returns bypass", async () => {
			const mockGet = vi.fn().mockResolvedValue(createMockR2Object("file content"))
			const bucket: R2BucketBinding = { get: mockGet }
			const middleware = cdnProxy<TestEnv>({
				bucket: ({ env }) => env.CDN_BUCKET,
				pathPrefix: "/cdn",
			})

			const ctx = createMockContext("/cdn/images/logo.png", bucket)
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			expect(result).toHaveProperty("response")
			expect(mockGet).toHaveBeenCalledWith("images/logo.png")
			expect(next).not.toHaveBeenCalled()
		})

		it("does not match path without prefix", async () => {
			const mockGet = vi.fn()
			const bucket: R2BucketBinding = { get: mockGet }
			const middleware = cdnProxy<TestEnv>({
				bucket: ({ env }) => env.CDN_BUCKET,
				pathPrefix: "/cdn",
			})

			const ctx = createMockContext("/api/users", bucket)
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(mockGet).not.toHaveBeenCalled()
		})

		it("does not match exact prefix without trailing content", async () => {
			const mockGet = vi.fn()
			const bucket: R2BucketBinding = { get: mockGet }
			const middleware = cdnProxy<TestEnv>({
				bucket: ({ env }) => env.CDN_BUCKET,
				pathPrefix: "/cdn",
			})

			const ctx = createMockContext("/cdn", bucket)
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(mockGet).not.toHaveBeenCalled()
		})

		it("extracts correct key from nested path", async () => {
			const mockGet = vi.fn().mockResolvedValue(createMockR2Object("content"))
			const bucket: R2BucketBinding = { get: mockGet }
			const middleware = cdnProxy<TestEnv>({
				bucket: ({ env }) => env.CDN_BUCKET,
				pathPrefix: "/cdn",
			})

			const ctx = createMockContext("/cdn/store/acme/files/abc123.jpg", bucket)
			const next = vi.fn()

			await middleware(ctx, next)

			expect(mockGet).toHaveBeenCalledWith("store/acme/files/abc123.jpg")
		})
	})

	describe("R2 responses", () => {
		it("returns 404 when object not found", async () => {
			const mockGet = vi.fn().mockResolvedValue(null)
			const bucket: R2BucketBinding = { get: mockGet }
			const middleware = cdnProxy<TestEnv>({
				bucket: ({ env }) => env.CDN_BUCKET,
				pathPrefix: "/cdn",
			})

			const ctx = createMockContext("/cdn/missing.txt", bucket)
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			if (result.type === "bypass") {
				expect(result.response.status).toBe(404)
				expect(await result.response.text()).toBe("Not Found")
			}
		})

		it("sets correct response headers from R2 object", async () => {
			const mockGet = vi.fn().mockResolvedValue(createMockR2Object("test content", "image/png"))
			const bucket: R2BucketBinding = { get: mockGet }
			const middleware = cdnProxy<TestEnv>({
				bucket: ({ env }) => env.CDN_BUCKET,
				pathPrefix: "/cdn",
			})

			const ctx = createMockContext("/cdn/image.png", bucket)
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			if (result.type === "bypass") {
				expect(result.response.headers.get("Content-Type")).toBe("image/png")
				expect(result.response.headers.get("Content-Length")).toBe("12")
				expect(result.response.headers.get("ETag")).toBe('"abc123"')
				expect(result.response.headers.get("Cache-Control")).toBe(
					"public, max-age=31536000, immutable",
				)
			}
		})

		it("uses default content type when not provided", async () => {
			const mockGet = vi.fn().mockResolvedValue({
				body: new ReadableStream(),
				etag: '"xyz"',
				httpMetadata: {},
				size: 0,
			})
			const bucket: R2BucketBinding = { get: mockGet }
			const middleware = cdnProxy<TestEnv>({
				bucket: ({ env }) => env.CDN_BUCKET,
				pathPrefix: "/cdn",
			})

			const ctx = createMockContext("/cdn/unknown", bucket)
			const next = vi.fn()

			const result = await middleware(ctx, next)

			if (result.type === "bypass") {
				expect(result.response.headers.get("Content-Type")).toBe("application/octet-stream")
			}
		})

		it("uses custom cache control when provided", async () => {
			const mockGet = vi.fn().mockResolvedValue(createMockR2Object("content"))
			const bucket: R2BucketBinding = { get: mockGet }
			const middleware = cdnProxy<TestEnv>({
				bucket: ({ env }) => env.CDN_BUCKET,
				cacheControl: "public, max-age=3600",
				pathPrefix: "/cdn",
			})

			const ctx = createMockContext("/cdn/file.txt", bucket)
			const next = vi.fn()

			const result = await middleware(ctx, next)

			if (result.type === "bypass") {
				expect(result.response.headers.get("Cache-Control")).toBe("public, max-age=3600")
			}
		})
	})

	describe("edge caching", () => {
		it("calls waitUntil to cache response when edgeCache enabled", async () => {
			const mockGet = vi.fn().mockResolvedValue(createMockR2Object("cached content"))
			const bucket: R2BucketBinding = { get: mockGet }

			/* Mock global caches */
			const mockPut = vi.fn()
			const mockMatch = vi.fn().mockResolvedValue(undefined)
			;(globalThis as unknown as { caches: { default: unknown } }).caches = {
				default: { match: mockMatch, put: mockPut },
			}

			const middleware = cdnProxy<TestEnv>({
				bucket: ({ env }) => env.CDN_BUCKET,
				edgeCache: true,
				pathPrefix: "/cdn",
			})

			const ctx = createMockContext("/cdn/file.txt", bucket)
			const next = vi.fn()

			await middleware(ctx, next)

			expect(ctx.executionContext.waitUntil).toHaveBeenCalled()
			expect(mockPut).toHaveBeenCalled()
		})

		it("returns cached response when available", async () => {
			const mockGet = vi.fn()
			const bucket: R2BucketBinding = { get: mockGet }
			const cachedResponse = new Response("cached", { status: 200 })

			/* Mock global caches */
			const mockMatch = vi.fn().mockResolvedValue(cachedResponse)
			;(globalThis as unknown as { caches: { default: unknown } }).caches = {
				default: { match: mockMatch, put: vi.fn() },
			}

			const middleware = cdnProxy<TestEnv>({
				bucket: ({ env }) => env.CDN_BUCKET,
				edgeCache: true,
				pathPrefix: "/cdn",
			})

			const ctx = createMockContext("/cdn/file.txt", bucket)
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			expect(result).toHaveProperty("response", cachedResponse)
			expect(mockGet).not.toHaveBeenCalled()
		})

		it("falls back gracefully when CF Cache API unavailable", async () => {
			const mockGet = vi.fn().mockResolvedValue(createMockR2Object("content"))
			const bucket: R2BucketBinding = { get: mockGet }

			/* Remove global caches to simulate non-CF environment */
			;(globalThis as unknown as { caches: undefined }).caches = undefined

			const middleware = cdnProxy<TestEnv>({
				bucket: ({ env }) => env.CDN_BUCKET,
				edgeCache: true,
				pathPrefix: "/cdn",
			})

			const ctx = createMockContext("/cdn/file.txt", bucket)
			const next = vi.fn()

			/* Should not throw, just skip caching */
			const result = await middleware(ctx, next)
			expect(result.type).toBe("bypass")
			/* Still serves from R2 */
			expect(mockGet).toHaveBeenCalled()
		})
	})
})
