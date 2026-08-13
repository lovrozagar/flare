import { describe, expect, it, vi } from "vitest"
import type { MiddlewareContext } from "../../../../src/server/middleware"
import { apiProxy, type ServiceBinding } from "../../../../src/server/middleware/api-proxy"

interface TestEnv {
	GATEWAY: ServiceBinding
	PUBLIC_ENVIRONMENT: string
}

function createMockContext(pathname: string, env: TestEnv): MiddlewareContext<TestEnv> {
	const url = new URL(`https://example.com${pathname}`)
	const store = new Map()
	return {
		applyResponseHandlers: vi.fn(),
		env,
		executionContext: { passThroughOnException: vi.fn(), waitUntil: vi.fn() },
		nonce: "test-nonce",
		onResponse: vi.fn(),
		request: new Request(url.toString()),
		serverRequestContext: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) },
		url,
	}
}

function createMockService(response: Response): ServiceBinding {
	return { fetch: vi.fn().mockResolvedValue(response) }
}

describe("apiProxy", () => {
	describe("path matching", () => {
		it("matches path with prefix and returns bypass", async () => {
			const mockResponse = new Response('{"data": "test"}')
			const mockService = createMockService(mockResponse)
			const middleware = apiProxy<TestEnv>({
				pathPrefix: "/api",
				target: () => mockService,
			})

			const ctx = createMockContext("/api/users", {
				GATEWAY: mockService,
				PUBLIC_ENVIRONMENT: "local",
			})
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			expect(result).toHaveProperty("response", mockResponse)
			expect(mockService.fetch).toHaveBeenCalled()
			expect(next).not.toHaveBeenCalled()
		})

		it("matches exact prefix path", async () => {
			const mockResponse = new Response('{"data": "test"}')
			const mockService = createMockService(mockResponse)
			const middleware = apiProxy<TestEnv>({
				pathPrefix: "/api",
				target: () => mockService,
			})

			const ctx = createMockContext("/api", {
				GATEWAY: mockService,
				PUBLIC_ENVIRONMENT: "local",
			})
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
		})

		it("does not match different path", async () => {
			const mockService = createMockService(new Response())
			const middleware = apiProxy<TestEnv>({
				pathPrefix: "/api",
				target: () => mockService,
			})

			const ctx = createMockContext("/other/path", {
				GATEWAY: mockService,
				PUBLIC_ENVIRONMENT: "local",
			})
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(mockService.fetch).not.toHaveBeenCalled()
		})
	})

	describe("enabled option", () => {
		it("skips when enabled is false", async () => {
			const mockService = createMockService(new Response())
			const middleware = apiProxy<TestEnv>({
				enabled: false,
				pathPrefix: "/api",
				target: () => mockService,
			})

			const ctx = createMockContext("/api/users", {
				GATEWAY: mockService,
				PUBLIC_ENVIRONMENT: "local",
			})
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(mockService.fetch).not.toHaveBeenCalled()
		})

		it("skips when enabled function returns false", async () => {
			const mockService = createMockService(new Response())
			const middleware = apiProxy<TestEnv>({
				enabled: ({ env }) => env.PUBLIC_ENVIRONMENT === "production",
				pathPrefix: "/api",
				target: () => mockService,
			})

			const ctx = createMockContext("/api/users", {
				GATEWAY: mockService,
				PUBLIC_ENVIRONMENT: "local",
			})
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
		})

		it("proxies when enabled function returns true", async () => {
			const mockResponse = new Response('{"ok": true}')
			const mockService = createMockService(mockResponse)
			const middleware = apiProxy<TestEnv>({
				enabled: ({ env }) => env.PUBLIC_ENVIRONMENT === "local",
				pathPrefix: "/api",
				target: () => mockService,
			})

			const ctx = createMockContext("/api/users", {
				GATEWAY: mockService,
				PUBLIC_ENVIRONMENT: "local",
			})
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
		})
	})

	describe("path rewriting", () => {
		it("rewrites path using rewrite function", async () => {
			const mockResponse = new Response()
			const mockService = createMockService(mockResponse)
			const middleware = apiProxy<TestEnv>({
				pathPrefix: "/api",
				rewrite: (path) => path.slice(4), // /api/v1/... → /v1/...
				target: () => mockService,
			})

			const ctx = createMockContext("/api/v1/users", {
				GATEWAY: mockService,
				PUBLIC_ENVIRONMENT: "local",
			})
			const next = vi.fn()

			await middleware(ctx, next)

			const fetchCall = (mockService.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
			const request = fetchCall[0] as Request
			expect(new URL(request.url).pathname).toBe("/v1/users")
		})

		it("strips prefix by default when no rewrite provided", async () => {
			const mockResponse = new Response()
			const mockService = createMockService(mockResponse)
			const middleware = apiProxy<TestEnv>({
				pathPrefix: "/api",
				target: () => mockService,
			})

			const ctx = createMockContext("/api/v1/users", {
				GATEWAY: mockService,
				PUBLIC_ENVIRONMENT: "local",
			})
			const next = vi.fn()

			await middleware(ctx, next)

			const fetchCall = (mockService.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
			const request = fetchCall[0] as Request
			expect(new URL(request.url).pathname).toBe("/v1/users")
		})

		it("preserves query string", async () => {
			const mockResponse = new Response()
			const mockService = createMockService(mockResponse)
			const middleware = apiProxy<TestEnv>({
				pathPrefix: "/api",
				target: () => mockService,
			})

			const ctx = createMockContext("/api/users?page=2&limit=10", {
				GATEWAY: mockService,
				PUBLIC_ENVIRONMENT: "local",
			})
			const next = vi.fn()

			await middleware(ctx, next)

			const fetchCall = (mockService.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
			const request = fetchCall[0] as Request
			const url = new URL(request.url)
			expect(url.search).toBe("?page=2&limit=10")
		})
	})

	describe("custom headers", () => {
		it("adds custom headers to proxied request", async () => {
			const mockResponse = new Response()
			const mockService = createMockService(mockResponse)
			const middleware = apiProxy<TestEnv>({
				headers: () => ({ "X-Another": "header", "X-Custom": "value" }),
				pathPrefix: "/api",
				target: () => mockService,
			})

			const ctx = createMockContext("/api/users", {
				GATEWAY: mockService,
				PUBLIC_ENVIRONMENT: "local",
			})
			const next = vi.fn()

			await middleware(ctx, next)

			const fetchCall = (mockService.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
			const request = fetchCall[0] as Request
			expect(request.headers.get("X-Custom")).toBe("value")
			expect(request.headers.get("X-Another")).toBe("header")
		})

		it("headers function receives env and request", async () => {
			const mockResponse = new Response()
			const mockService = createMockService(mockResponse)
			const headersFn = vi.fn().mockReturnValue({})
			const middleware = apiProxy<TestEnv>({
				headers: headersFn,
				pathPrefix: "/api",
				target: () => mockService,
			})

			const ctx = createMockContext("/api/users", {
				GATEWAY: mockService,
				PUBLIC_ENVIRONMENT: "local",
			})
			const next = vi.fn()

			await middleware(ctx, next)

			expect(headersFn).toHaveBeenCalledWith({
				env: ctx.env,
				request: ctx.request,
			})
		})
	})

	describe("target service", () => {
		it("uses target function to get service binding", async () => {
			const mockResponse = new Response()
			const mockService = createMockService(mockResponse)
			const targetFn = vi.fn().mockReturnValue(mockService)
			const middleware = apiProxy<TestEnv>({
				pathPrefix: "/api",
				target: targetFn,
			})

			const ctx = createMockContext("/api/users", {
				GATEWAY: mockService,
				PUBLIC_ENVIRONMENT: "local",
			})
			const next = vi.fn()

			await middleware(ctx, next)

			expect(targetFn).toHaveBeenCalledWith({ env: ctx.env })
		})
	})
})
