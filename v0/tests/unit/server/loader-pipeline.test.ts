/**
 * Loader Pipeline Unit Tests
 *
 * Tests preloader/loader execution.
 * Preloaders: sequential (root → page)
 * Loaders: parallel via Promise.allSettled
 */

import { describe, expect, it } from "vitest"
import {
	type LoaderContext,
	runLoaderPipeline,
	type StoredRouteWithLoader,
} from "../../../src/server/handler/loader-pipeline"

describe("runLoaderPipeline", () => {
	describe("preloaders", () => {
		it("runs preloaders sequentially", async () => {
			const order: number[] = []

			const routes: StoredRouteWithLoader[] = [
				{
					_type: "root-layout",
					preloader: () => {
						order.push(1)
						return Promise.resolve({ user: "test" })
					},
					render: () => null,
					variablePath: "/",
					virtualPath: "_root_",
				},
				{
					_type: "layout",
					preloader: () => {
						order.push(2)
						return Promise.resolve({ categories: ["a", "b"] })
					},
					render: () => null,
					variablePath: "/blog",
					virtualPath: "_root_/blog",
				},
				{
					_type: "render",
					preloader: () => {
						order.push(3)
						return Promise.resolve({ meta: {} })
					},
					render: () => null,
					variablePath: "/blog/[slug]",
					virtualPath: "_root_/blog/[slug]",
				},
			]

			const ctx = createMockContext()
			await runLoaderPipeline(routes, ctx)

			expect(order).toEqual([1, 2, 3])
		})

		it("builds preloaderContext from ancestors", async () => {
			let capturedTreeContext: unknown

			const routes: StoredRouteWithLoader[] = [
				{
					_type: "root-layout",
					preloader: () => Promise.resolve({ user: "alice" }),
					render: () => null,
					variablePath: "/",
					virtualPath: "_root_",
				},
				{
					_type: "layout",
					preloader: () => Promise.resolve({ categories: ["tech"] }),
					render: () => null,
					variablePath: "/blog",
					virtualPath: "_root_/blog",
				},
				{
					_type: "render",
					preloader: (ctx) => {
						capturedTreeContext = ctx.preloaderContext
						return Promise.resolve({ post: "hello" })
					},
					render: () => null,
					variablePath: "/blog/[slug]",
					virtualPath: "_root_/blog/[slug]",
				},
			]

			const ctx = createMockContext()
			await runLoaderPipeline(routes, ctx)

			/* preloaderContext is flat merged, not nested by route ID */
			expect(capturedTreeContext).toEqual({
				categories: ["tech"],
				user: "alice",
			})
		})

		it("provides preloaderContext to each preloader", async () => {
			let rootTreeCtx: unknown
			let layoutTreeCtx: unknown

			const routes: StoredRouteWithLoader[] = [
				{
					_type: "root-layout",
					preloader: (ctx) => {
						rootTreeCtx = ctx.preloaderContext
						return Promise.resolve({ user: "bob" })
					},
					render: () => null,
					variablePath: "/",
					virtualPath: "_root_",
				},
				{
					_type: "layout",
					preloader: (ctx) => {
						layoutTreeCtx = ctx.preloaderContext
						return Promise.resolve({ tenant: "acme" })
					},
					render: () => null,
					variablePath: "/dashboard",
					virtualPath: "_root_/dashboard",
				},
			]

			const ctx = createMockContext()
			await runLoaderPipeline(routes, ctx)

			expect(rootTreeCtx).toEqual({})
			/* preloaderContext is flat merged from ancestors */
			expect(layoutTreeCtx).toEqual({ user: "bob" })
		})
	})

	describe("loaders", () => {
		it("runs loaders in parallel", async () => {
			const startTimes: number[] = []
			const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

			const routes: StoredRouteWithLoader[] = [
				{
					_type: "root-layout",
					loader: async () => {
						startTimes.push(Date.now())
						await delay(50)
						return { a: 1 }
					},
					render: () => null,
					variablePath: "/",
					virtualPath: "_root_",
				},
				{
					_type: "layout",
					loader: async () => {
						startTimes.push(Date.now())
						await delay(50)
						return { b: 2 }
					},
					render: () => null,
					variablePath: "/dash",
					virtualPath: "_root_/dash",
				},
				{
					_type: "render",
					loader: async () => {
						startTimes.push(Date.now())
						await delay(50)
						return { c: 3 }
					},
					render: () => null,
					variablePath: "/dash/page",
					virtualPath: "_root_/dash/page",
				},
			]

			const ctx = createMockContext()
			const start = Date.now()
			await runLoaderPipeline(routes, ctx)
			const elapsed = Date.now() - start

			/* If sequential: ~150ms. If parallel: ~50ms */
			expect(elapsed).toBeLessThan(100)

			/* All started within 10ms of each other */
			const maxDiff = Math.max(...startTimes) - Math.min(...startTimes)
			expect(maxDiff).toBeLessThan(20)
		})

		it("receives preloaderContext from own preloader", async () => {
			let capturedPreloaderCtx: unknown

			const routes: StoredRouteWithLoader[] = [
				{
					_type: "render",
					loader: (ctx) => {
						capturedPreloaderCtx = ctx.preloaderContext
						return Promise.resolve({ result: "ok" })
					},
					preloader: () => Promise.resolve({ myPreloaderData: "hello" }),
					render: () => null,
					variablePath: "/page",
					virtualPath: "_root_/page",
				},
			]

			const ctx = createMockContext()
			await runLoaderPipeline(routes, ctx)

			expect(capturedPreloaderCtx).toEqual({ myPreloaderData: "hello" })
		})

		it("receives preloaderContext in loader", async () => {
			let capturedTreeCtx: unknown

			const routes: StoredRouteWithLoader[] = [
				{
					_type: "root-layout",
					preloader: () => Promise.resolve({ global: "data" }),
					render: () => null,
					variablePath: "/",
					virtualPath: "_root_",
				},
				{
					_type: "render",
					loader: (ctx) => {
						capturedTreeCtx = ctx.preloaderContext
						return Promise.resolve({})
					},
					render: () => null,
					variablePath: "/page",
					virtualPath: "_root_/page",
				},
			]

			const ctx = createMockContext()
			await runLoaderPipeline(routes, ctx)

			/* preloaderContext is flat merged */
			expect(capturedTreeCtx).toEqual({ global: "data" })
		})
	})

	describe("error handling", () => {
		it("isolates loader errors to individual routes", async () => {
			const routes: StoredRouteWithLoader[] = [
				{
					_type: "root-layout",
					loader: () => Promise.resolve({ root: "ok" }),
					render: () => null,
					variablePath: "/",
					virtualPath: "_root_",
				},
				{
					_type: "render",
					loader: () => Promise.reject(new Error("Loader failed")),
					render: () => null,
					variablePath: "/page",
					virtualPath: "_root_/page",
				},
			]

			const ctx = createMockContext()
			const result = await runLoaderPipeline(routes, ctx)

			const match0 = result.matches[0]
			const match1 = result.matches[1]
			expect(match0?.status).toBe("success")
			expect(match0?.loaderData).toEqual({ root: "ok" })

			expect(match1?.status).toBe("error")
			expect(match1?.error?.message).toBe("Loader failed")
		})

		it("continues other loaders when one fails", async () => {
			const loaderResults: string[] = []

			const routes: StoredRouteWithLoader[] = [
				{
					_type: "root-layout",
					loader: () => {
						loaderResults.push("root")
						return Promise.resolve({})
					},
					render: () => null,
					variablePath: "/",
					virtualPath: "_root_",
				},
				{
					_type: "layout",
					loader: () => Promise.reject(new Error("Failed")),
					render: () => null,
					variablePath: "/layout",
					virtualPath: "_root_/layout",
				},
				{
					_type: "render",
					loader: () => {
						loaderResults.push("page")
						return Promise.resolve({})
					},
					render: () => null,
					variablePath: "/layout/page",
					virtualPath: "_root_/layout/page",
				},
			]

			const ctx = createMockContext()
			await runLoaderPipeline(routes, ctx)

			/* Both root and page loaders ran despite layout failure */
			expect(loaderResults).toContain("root")
			expect(loaderResults).toContain("page")
		})
	})

	describe("result structure", () => {
		it("returns matches with loaderData", async () => {
			const routes: StoredRouteWithLoader[] = [
				{
					_type: "root-layout",
					loader: () => Promise.resolve({ rootData: true }),
					render: () => null,
					variablePath: "/",
					virtualPath: "_root_",
				},
				{
					_type: "render",
					loader: () => Promise.resolve({ pageData: "hello" }),
					render: () => null,
					variablePath: "/page",
					virtualPath: "_root_/page",
				},
			]

			const ctx = createMockContext()
			const result = await runLoaderPipeline(routes, ctx)

			expect(result.matches).toHaveLength(2)
			expect(result.matches[0]?.loaderData).toEqual({ rootData: true })
			expect(result.matches[1]?.loaderData).toEqual({ pageData: "hello" })
		})

		it("returns preloaderContext", async () => {
			const routes: StoredRouteWithLoader[] = [
				{
					_type: "root-layout",
					preloader: () => Promise.resolve({ a: 1 }),
					render: () => null,
					variablePath: "/",
					virtualPath: "_root_",
				},
				{
					_type: "render",
					preloader: () => Promise.resolve({ b: 2 }),
					render: () => null,
					variablePath: "/page",
					virtualPath: "_root_/page",
				},
			]

			const ctx = createMockContext()
			const result = await runLoaderPipeline(routes, ctx)

			/* preloaderContext is flat merged from all preloaders */
			expect(result.preloaderContext).toEqual({ a: 1, b: 2 })
		})

		it("handles routes without loaders", async () => {
			const routes: StoredRouteWithLoader[] = [
				{
					_type: "root-layout",
					render: () => null,
					variablePath: "/",
					virtualPath: "_root_",
				},
				{
					_type: "render",
					render: () => null,
					variablePath: "/page",
					virtualPath: "_root_/page",
				},
			]

			const ctx = createMockContext()
			const result = await runLoaderPipeline(routes, ctx)

			expect(result.matches[0]?.loaderData).toEqual({})
			expect(result.matches[1]?.loaderData).toEqual({})
		})

		it("handles routes without preloaders", async () => {
			const routes: StoredRouteWithLoader[] = [
				{
					_type: "root-layout",
					render: () => null,
					variablePath: "/",
					virtualPath: "_root_",
				},
			]

			const ctx = createMockContext()
			const result = await runLoaderPipeline(routes, ctx)

			expect(result.preloaderContext).toEqual({})
		})
	})

	describe("context passing", () => {
		it("passes location to loaders", async () => {
			let capturedLocation: unknown

			const routes: StoredRouteWithLoader[] = [
				{
					_type: "render",
					loader: (ctx) => {
						capturedLocation = ctx.location
						return Promise.resolve({})
					},
					render: () => null,
					variablePath: "/[id]",
					virtualPath: "_root_/[id]",
				},
			]

			const ctx = createMockContext({
				location: {
					params: { id: "123" },
					pathname: "/123",
					search: { tab: "info" },
				},
			})
			await runLoaderPipeline(routes, ctx)

			expect(capturedLocation).toEqual({
				params: { id: "123" },
				pathname: "/123",
				search: { tab: "info" },
			})
		})

		it("passes env to loaders", async () => {
			let capturedEnv: unknown

			const routes: StoredRouteWithLoader[] = [
				{
					_type: "render",
					loader: (ctx) => {
						capturedEnv = ctx.env
						return Promise.resolve({})
					},
					render: () => null,
					variablePath: "/page",
					virtualPath: "_root_/page",
				},
			]

			const mockEnv = { DB: "mock-db", KV: "mock-kv" }
			const ctx = createMockContext({ env: mockEnv })
			await runLoaderPipeline(routes, ctx)

			expect(capturedEnv).toBe(mockEnv)
		})

		it("passes request to loaders", async () => {
			let capturedRequest: unknown

			const routes: StoredRouteWithLoader[] = [
				{
					_type: "render",
					loader: (ctx) => {
						capturedRequest = ctx.request
						return Promise.resolve({})
					},
					render: () => null,
					variablePath: "/page",
					virtualPath: "_root_/page",
				},
			]

			const mockRequest = new Request("https://example.com/page")
			const ctx = createMockContext({ request: mockRequest })
			await runLoaderPipeline(routes, ctx)

			expect(capturedRequest).toBe(mockRequest)
		})
	})
})

describe("defer context", () => {
	it("creates defer context for each loader", async () => {
		const routes: StoredRouteWithLoader[] = [
			{
				_type: "root-layout",
				loader: () => Promise.resolve({ a: 1 }),
				render: () => null,
				variablePath: "/",
				virtualPath: "_root_",
			},
			{
				_type: "render",
				loader: () => Promise.resolve({ b: 2 }),
				render: () => null,
				variablePath: "/page",
				virtualPath: "_root_/page",
			},
		]

		const ctx = createMockContext()
		const result = await runLoaderPipeline(routes, ctx)

		expect(result.deferContexts.size).toBe(2)
		expect(result.deferContexts.has("_root_")).toBe(true)
		expect(result.deferContexts.has("_root_/page")).toBe(true)
	})

	it("passes defer function to loader", async () => {
		let capturedDefer: unknown

		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				loader: (ctx) => {
					capturedDefer = ctx.defer
					return Promise.resolve({})
				},
				render: () => null,
				variablePath: "/page",
				virtualPath: "_root_/page",
			},
		]

		const ctx = createMockContext()
		await runLoaderPipeline(routes, ctx)

		expect(typeof capturedDefer).toBe("function")
	})

	it("tracks deferred promises in defer context", async () => {
		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				loader: (ctx) => {
					ctx.defer(() => Promise.resolve("deferred-data"))
					return Promise.resolve({ main: "data" })
				},
				render: () => null,
				variablePath: "/page",
				virtualPath: "_root_/page",
			},
		]

		const ctx = createMockContext()
		const result = await runLoaderPipeline(routes, ctx)

		const deferCtx = result.deferContexts.get("_root_/page")
		expect(deferCtx).toBeDefined()
		expect(deferCtx?.getDeferred()).toHaveLength(1)
	})

	it("does not create defer context for routes without loaders", async () => {
		const routes: StoredRouteWithLoader[] = [
			{
				_type: "root-layout",
				render: () => null,
				variablePath: "/",
				virtualPath: "_root_",
			},
		]

		const ctx = createMockContext()
		const result = await runLoaderPipeline(routes, ctx)

		expect(result.deferContexts.size).toBe(0)
	})
})

describe("queryClient", () => {
	it("passes queryClient to preloader", async () => {
		let capturedQC: unknown

		const routes: StoredRouteWithLoader[] = [
			{
				_type: "root-layout",
				preloader: (ctx) => {
					capturedQC = ctx.queryClient
					return Promise.resolve({})
				},
				render: () => null,
				variablePath: "/",
				virtualPath: "_root_",
			},
		]

		const mockQC = { getQueryData: () => null }
		const ctx = createMockContext({ queryClient: mockQC })
		await runLoaderPipeline(routes, ctx)

		expect(capturedQC).toBe(mockQC)
	})

	it("passes queryClient to loader", async () => {
		let capturedQC: unknown

		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				loader: (ctx) => {
					capturedQC = ctx.queryClient
					return Promise.resolve({})
				},
				render: () => null,
				variablePath: "/page",
				virtualPath: "_root_/page",
			},
		]

		const mockQC = { ensureQueryData: () => Promise.resolve({}) }
		const ctx = createMockContext({ queryClient: mockQC })
		await runLoaderPipeline(routes, ctx)

		expect(capturedQC).toBe(mockQC)
	})
})

describe("authentication", () => {
	it("calls authenticateFn when route has authenticate: true", async () => {
		let authenticateCalled = false

		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				options: { authenticate: true },
				path: "/protected",
				render: () => null,
				variablePath: "/protected",
				virtualPath: "_root_/protected",
			},
		]

		const ctx = createMockContext({
			authenticateFn: () => {
				authenticateCalled = true
				return Promise.resolve({ sub: "user-123" })
			},
		})
		await runLoaderPipeline(routes, ctx)

		expect(authenticateCalled).toBe(true)
	})

	it("calls authenticateFn when route has authenticate: optional", async () => {
		let authenticateCalled = false

		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				options: { authenticate: "optional" },
				path: "/maybe-auth",
				render: () => null,
				variablePath: "/maybe-auth",
				virtualPath: "_root_/maybe-auth",
			},
		]

		const ctx = createMockContext({
			authenticateFn: () => {
				authenticateCalled = true
				return Promise.resolve({ sub: "user-123" })
			},
		})
		await runLoaderPipeline(routes, ctx)

		expect(authenticateCalled).toBe(true)
	})

	it("does not call authenticateFn when no route needs auth", async () => {
		let authenticateCalled = false

		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				path: "/public",
				render: () => null,
				variablePath: "/public",
				virtualPath: "_root_/public",
			},
		]

		const ctx = createMockContext({
			authenticateFn: () => {
				authenticateCalled = true
				return Promise.resolve({ sub: "user-123" })
			},
		})
		await runLoaderPipeline(routes, ctx)

		expect(authenticateCalled).toBe(false)
	})

	it("passes auth to preloader context", async () => {
		let capturedAuth: unknown

		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				options: { authenticate: true },
				path: "/protected",
				preloader: (ctx) => {
					capturedAuth = ctx.auth
					return Promise.resolve({})
				},
				render: () => null,
				variablePath: "/protected",
				virtualPath: "_root_/protected",
			},
		]

		const mockAuth = { email: "test@example.com", sub: "user-123" }
		const ctx = createMockContext({
			authenticateFn: () => Promise.resolve(mockAuth),
		})
		await runLoaderPipeline(routes, ctx)

		expect(capturedAuth).toBe(mockAuth)
	})

	it("passes auth to loader context", async () => {
		let capturedAuth: unknown

		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				loader: (ctx) => {
					capturedAuth = ctx.auth
					return Promise.resolve({})
				},
				options: { authenticate: true },
				path: "/protected",
				render: () => null,
				variablePath: "/protected",
				virtualPath: "_root_/protected",
			},
		]

		const mockAuth = { email: "test@example.com", sub: "user-123" }
		const ctx = createMockContext({
			authenticateFn: () => Promise.resolve(mockAuth),
		})
		await runLoaderPipeline(routes, ctx)

		expect(capturedAuth).toBe(mockAuth)
	})

	it("returns auth in result", async () => {
		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				options: { authenticate: true },
				path: "/protected",
				render: () => null,
				variablePath: "/protected",
				virtualPath: "_root_/protected",
			},
		]

		const mockAuth = { sub: "user-123" }
		const ctx = createMockContext({
			authenticateFn: () => Promise.resolve(mockAuth),
		})
		const result = await runLoaderPipeline(routes, ctx)

		expect(result.auth).toBe(mockAuth)
	})

	it("returns null auth when no routes need authentication", async () => {
		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				path: "/public",
				render: () => null,
				variablePath: "/public",
				virtualPath: "_root_/public",
			},
		]

		const ctx = createMockContext({
			authenticateFn: () => Promise.resolve({ sub: "user-123" }),
		})
		const result = await runLoaderPipeline(routes, ctx)

		expect(result.auth).toBe(null)
	})
})

describe("authorization", () => {
	it("throws ForbiddenError when authorize returns false", async () => {
		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				authorize: () => false,
				path: "/forbidden",
				render: () => null,
				variablePath: "/forbidden",
				virtualPath: "_root_/forbidden",
			},
		]

		const ctx = createMockContext()

		await expect(runLoaderPipeline(routes, ctx)).rejects.toThrow("Forbidden")
	})

	it("continues when authorize returns true", async () => {
		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				authorize: () => true,
				loader: () => Promise.resolve({ data: "allowed" }),
				path: "/allowed",
				render: () => null,
				variablePath: "/allowed",
				virtualPath: "_root_/allowed",
			},
		]

		const ctx = createMockContext()
		const result = await runLoaderPipeline(routes, ctx)

		expect(result.matches[0]?.loaderData).toEqual({ data: "allowed" })
	})

	it("passes auth to authorize context when authenticated", async () => {
		let capturedAuth: unknown

		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				authorize: (ctx) => {
					capturedAuth = ctx.auth
					return true
				},
				options: { authenticate: true },
				path: "/protected",
				render: () => null,
				variablePath: "/protected",
				virtualPath: "_root_/protected",
			},
		]

		const mockAuth = { role: "admin", sub: "user-123" }
		const ctx = createMockContext({
			authenticateFn: () => Promise.resolve(mockAuth),
		})
		await runLoaderPipeline(routes, ctx)

		expect(capturedAuth).toBe(mockAuth)
	})

	it("passes undefined auth to authorize when not authenticated", async () => {
		let capturedAuth: unknown = "not-set"

		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				authorize: (ctx) => {
					capturedAuth = ctx.auth
					return true
				},
				path: "/public",
				render: () => null,
				variablePath: "/public",
				virtualPath: "_root_/public",
			},
		]

		const ctx = createMockContext()
		await runLoaderPipeline(routes, ctx)

		expect(capturedAuth).toBeUndefined()
	})

	it("passes preloaderContext to authorize", async () => {
		let capturedPreloaderCtx: unknown

		const routes: StoredRouteWithLoader[] = [
			{
				_type: "root-layout",
				path: "/",
				preloader: () => Promise.resolve({ tenant: "acme" }),
				render: () => null,
				variablePath: "/",
				virtualPath: "_root_",
			},
			{
				_type: "render",
				authorize: (ctx) => {
					capturedPreloaderCtx = ctx.preloaderContext
					return true
				},
				path: "/page",
				render: () => null,
				variablePath: "/page",
				virtualPath: "_root_/page",
			},
		]

		const ctx = createMockContext()
		await runLoaderPipeline(routes, ctx)

		expect(capturedPreloaderCtx).toEqual({ tenant: "acme" })
	})

	it("runs authorize before loader", async () => {
		const order: string[] = []

		const routes: StoredRouteWithLoader[] = [
			{
				_type: "render",
				authorize: () => {
					order.push("authorize")
					return true
				},
				loader: () => {
					order.push("loader")
					return Promise.resolve({})
				},
				path: "/page",
				render: () => null,
				variablePath: "/page",
				virtualPath: "_root_/page",
			},
		]

		const ctx = createMockContext()
		await runLoaderPipeline(routes, ctx)

		expect(order).toEqual(["authorize", "loader"])
	})
})

function createMockContext(overrides: Partial<LoaderContext> = {}): LoaderContext {
	return {
		abortController: new AbortController(),
		cause: "enter",
		env: {},
		location: {
			params: {},
			pathname: "/",
			search: {},
		},
		prefetch: false,
		request: new Request("https://example.com/"),
		url: new URL("https://example.com/"),
		...overrides,
	}
}
