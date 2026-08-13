import { describe, expect, it, vi } from "vitest"
import { NotFoundError, RedirectResponse, UnauthenticatedError, UnauthorizedError } from "../../../src/errors/index.ts"
import type { PipelineConfig, ResolvedRoute } from "../../../src/loader-pipeline/index.ts"
import { runPipeline } from "../../../src/loader-pipeline/index.ts"

function makeRoute(overrides?: Partial<ResolvedRoute>): ResolvedRoute {
	return {
		_type: "render",
		variablePath: "/",
		virtualPath: "_root_",
		...overrides,
	}
}

function makeConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
	return {
		abortController: new AbortController(),
		cause: "enter",
		env: {},
		prefetch: false,
		request: new Request("http://localhost/"),
		routes: [],
		url: new URL("http://localhost/"),
		...overrides,
	}
}

describe("input validation", () => {
	it("valid params + search → pipeline continues", async () => {
		const route = makeRoute({
			inputConfig: {
				params: (raw: Record<string, string | string[]>) => ({ id: String(raw.id ?? "default") }),
			},
			loader: vi.fn(() => Promise.resolve({ data: "ok" })),
			virtualPath: "_root_/products/[id]",
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches).toHaveLength(1)
		expect(result.matches[0]?.status).toBe("success")
	})

	it("invalid params → throws immediately", async () => {
		const loader = vi.fn(() => Promise.resolve("data"))
		const route = makeRoute({
			inputConfig: {
				params: () => {
					throw new Error("bad params")
				},
			},
			loader,
		})
		await expect(runPipeline(makeConfig({ routes: [route] }))).rejects.toThrow("bad params")
		expect(loader).not.toHaveBeenCalled()
	})

	it("params { parse } object validator works", async () => {
		let capturedParams: unknown
		const route = makeRoute({
			inputConfig: {
				params: {
					parse: (raw: Record<string, string | string[]>) => ({ id: String(raw.id ?? "fallback") }),
				},
			},
			loader: (ctx: Record<string, unknown>) => {
				capturedParams = (ctx.location as Record<string, unknown>).params
				return Promise.resolve("ok")
			},
			virtualPath: "_root_/items/[id]",
		})
		const result = await runPipeline(makeConfig({ params: { id: "99" }, routes: [route] }))
		expect(result.matches[0]?.status).toBe("success")
		expect(capturedParams).toEqual({ id: "99" })
	})

	it("route with no inputConfig → passes through", async () => {
		const route = makeRoute({ loader: vi.fn(() => Promise.resolve("data")) })
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.status).toBe("success")
	})
})

describe("authentication", () => {
	it("no routes need auth → authenticateFn not called", async () => {
		const authFn = vi.fn(() => Promise.resolve({ id: "user1" }))
		const route = makeRoute()
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }))
		expect(authFn).not.toHaveBeenCalled()
	})

	it("route with .authenticate(), auth resolved → auth passed", async () => {
		const user = { id: "user1" }
		const authFn = vi.fn(() => Promise.resolve(user))
		const loader = vi.fn((ctx: Record<string, unknown>) => Promise.resolve(ctx.auth))
		const route = makeRoute({ authenticate: [], loader })
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }))
		expect(result.auth).toBe(user)
	})

	it("route with .authenticate(), auth = null → throws UnauthenticatedError", async () => {
		const authFn = vi.fn(() => Promise.resolve(null))
		const route = makeRoute({ authenticate: [] })
		await expect(
			runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] })),
		).rejects.toThrow(UnauthenticatedError)
	})

	it('route with .authenticate("admin"), callerData passed', async () => {
		let capturedCallerData: unknown
		const authFn = vi.fn((ctx: { callerData?: unknown[] }) => {
			capturedCallerData = ctx.callerData
			return Promise.resolve({ id: "admin" })
		})
		const route = makeRoute({ authenticate: ["admin"] })
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }))
		expect(capturedCallerData).toEqual(["admin"])
	})

	it("authenticateFn throws RedirectResponse → pipeline throws redirect", async () => {
		const authFn = () => {
			throw new RedirectResponse({ to: "/login" })
		}
		const route = makeRoute({ authenticate: [] })
		await expect(
			runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] })),
		).rejects.toThrow(RedirectResponse)
	})

	it("authenticateFn called once even with 3 auth routes", async () => {
		const authFn = vi.fn(() => Promise.resolve({ id: "user1" }))
		const routes = [
			makeRoute({ authenticate: [], virtualPath: "_root_" }),
			makeRoute({ authenticate: [], virtualPath: "_root_/(auth)" }),
			makeRoute({ authenticate: [], virtualPath: "_root_/(auth)/dashboard" }),
		]
		await runPipeline(makeConfig({ authenticateFn: authFn, routes }))
		expect(authFn).toHaveBeenCalledTimes(1)
	})

	it("no authenticateFn + route with authenticate → throws UnauthenticatedError", async () => {
		const route = makeRoute({ authenticate: [] })
		await expect(runPipeline(makeConfig({ routes: [route] }))).rejects.toThrow(UnauthenticatedError)
	})

	it("authenticateFn returning undefined → throws UnauthenticatedError", async () => {
		const authFn = vi.fn(() => Promise.resolve(undefined))
		const route = makeRoute({ authenticate: [] })
		await expect(
			runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] })),
		).rejects.toThrow(UnauthenticatedError)
	})
})

describe("optional authentication", () => {
	it("authenticateMode: optional, auth = null → does NOT throw", async () => {
		const authFn = vi.fn(() => Promise.resolve(null))
		const route = makeRoute({ authenticate: [], authenticateMode: "optional" })
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }))
		expect(result.auth).toBeNull()
		expect(result.matches).toHaveLength(1)
		expect(result.matches[0]?.status).toBe("success")
	})

	it("authenticateMode: optional, auth resolved → auth passed through", async () => {
		const user = { id: "user1" }
		const authFn = vi.fn(() => Promise.resolve(user))
		const route = makeRoute({ authenticate: [], authenticateMode: "optional" })
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }))
		expect(result.auth).toBe(user)
	})

	it("mixed: optional + required → throws if auth = null", async () => {
		const authFn = vi.fn(() => Promise.resolve(null))
		const optional = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			virtualPath: "_root_",
		})
		const required = makeRoute({
			authenticate: [],
			virtualPath: "_root_/dashboard",
		})
		await expect(
			runPipeline(makeConfig({ authenticateFn: authFn, routes: [optional, required] })),
		).rejects.toThrow(UnauthenticatedError)
	})

	it("mixed: optional + required → succeeds when auth resolves", async () => {
		const user = { id: "user1" }
		const authFn = vi.fn(() => Promise.resolve(user))
		const optional = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			virtualPath: "_root_",
		})
		const required = makeRoute({
			authenticate: [],
			virtualPath: "_root_/dashboard",
		})
		const result = await runPipeline(
			makeConfig({ authenticateFn: authFn, routes: [optional, required] }),
		)
		expect(result.auth).toBe(user)
	})

	it("authenticateMode: optional, no authenticateFn → does NOT throw", async () => {
		const route = makeRoute({ authenticate: [], authenticateMode: "optional" })
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.auth).toBeNull()
	})

	it("optional auth loader receives null auth when unauthenticated", async () => {
		const authFn = vi.fn(() => Promise.resolve(null))
		let capturedAuth: unknown = "sentinel"
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			loader: (ctx: Record<string, unknown>) => {
				capturedAuth = ctx.auth
				return {}
			},
		})
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }))
		expect(capturedAuth).toBeNull()
	})

	it("authenticateFn called once even with optional auth route", async () => {
		const authFn = vi.fn(() => Promise.resolve({ id: "user1" }))
		const routes = [
			makeRoute({ authenticate: [], authenticateMode: "optional", virtualPath: "_root_" }),
			makeRoute({ authenticate: [], authenticateMode: "optional", virtualPath: "_root_/about" }),
		]
		await runPipeline(makeConfig({ authenticateFn: authFn, routes }))
		expect(authFn).toHaveBeenCalledTimes(1)
	})
})

describe("preloader + authorize (interleaved)", () => {
	it("root preloader runs, then root authorize, then layout preloader, then layout authorize", async () => {
		const order: string[] = []
		const root = makeRoute({
			authorize: () => {
				order.push("root-auth")
				return true
			},
			preloader: () => {
				order.push("root-pre")
				return { root: true }
			},
			virtualPath: "_root_",
		})
		const layout = makeRoute({
			authorize: () => {
				order.push("layout-auth")
				return true
			},
			preloader: () => {
				order.push("layout-pre")
				return { layout: true }
			},
			virtualPath: "_root_/(auth)",
		})
		await runPipeline(makeConfig({ routes: [root, layout] }))
		expect(order).toEqual(["root-pre", "root-auth", "layout-pre", "layout-auth"])
	})

	it("root preloader: preloaderContext arg = {}", async () => {
		let capturedCtx: unknown
		const root = makeRoute({
			preloader: (ctx: Record<string, unknown>) => {
				capturedCtx = ctx.preloaderContext
				return { root: true }
			},
			virtualPath: "_root_",
		})
		await runPipeline(makeConfig({ routes: [root] }))
		expect(capturedCtx).toEqual({})
	})

	it("layout preloader receives accumulated context from root", async () => {
		let capturedCtx: unknown
		const root = makeRoute({
			preloader: () => ({ user: { id: "1" } }),
			virtualPath: "_root_",
		})
		const layout = makeRoute({
			preloader: (ctx: Record<string, unknown>) => {
				capturedCtx = ctx.preloaderContext
				return { sidebar: true }
			},
			virtualPath: "_root_/(auth)",
		})
		await runPipeline(makeConfig({ routes: [root, layout] }))
		expect(capturedCtx).toEqual({ user: { id: "1" } })
	})

	it("authorize returns false → match has UnauthorizedError, loader skipped", async () => {
		let loaderCalled = false
		const root = makeRoute({
			authorize: () => false,
			loader: () => {
				loaderCalled = true
				return { data: true }
			},
		})
		const result = await runPipeline(makeConfig({ routes: [root] }))
		expect(result.matches[0].status).toBe("error")
		expect(result.matches[0].error).toBeInstanceOf(UnauthorizedError)
		expect(result.matches[0].loaderData).toBeUndefined()
		expect(loaderCalled).toBe(false)
	})

	it("authorize false on route A → route B authorize NOT called (break)", async () => {
		const authorizeBSpy = vi.fn(() => true)
		const routeA = makeRoute({
			authorize: () => false,
			virtualPath: "_root_",
		})
		const routeB = makeRoute({
			authorize: authorizeBSpy,
			virtualPath: "_root_/child",
		})
		const result = await runPipeline(makeConfig({ routes: [routeA, routeB] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(result.matches[0]?.error).toBeInstanceOf(UnauthorizedError)
		expect(authorizeBSpy).not.toHaveBeenCalled()
	})

	it("route without preloader → snapshot inherits parent context unchanged", async () => {
		let capturedCtx: unknown
		const root = makeRoute({
			preloader: () => ({ root: true }),
			virtualPath: "_root_",
		})
		const layout = makeRoute({
			authorize: (ctx: Record<string, unknown>) => {
				capturedCtx = ctx.preloaderContext
				return true
			},
			virtualPath: "_root_/(auth)",
		})
		await runPipeline(makeConfig({ routes: [root, layout] }))
		expect(capturedCtx).toEqual({ root: true })
	})
})

describe("loaders (parallel)", () => {
	it("all loaders start simultaneously", async () => {
		const startTimes: number[] = []
		const start = Date.now()
		const root = makeRoute({
			loader: async () => {
				startTimes.push(Date.now() - start)
				await new Promise((r) => setTimeout(r, 50))
				return { root: true }
			},
			virtualPath: "_root_",
		})
		const page = makeRoute({
			loader: async () => {
				startTimes.push(Date.now() - start)
				await new Promise((r) => setTimeout(r, 50))
				return { page: true }
			},
			virtualPath: "_root_/about",
		})
		await runPipeline(makeConfig({ routes: [root, page] }))
		expect(Math.abs((startTimes[0] ?? 0) - (startTimes[1] ?? 0))).toBeLessThan(20)
	})

	it("loader error in route A does NOT abort route B", async () => {
		const root = makeRoute({
			loader: () => {
				throw new Error("root fail")
			},
			virtualPath: "_root_",
		})
		const page = makeRoute({
			loader: () => Promise.resolve({ page: true }),
			virtualPath: "_root_/about",
		})
		const result = await runPipeline(makeConfig({ routes: [root, page] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(result.matches[1]?.status).toBe("success")
		expect(result.matches[1]?.loaderData).toEqual({ page: true })
	})

	it("loader throwing non-Error (string) → wrapped in Error(String(e))", async () => {
		const route = makeRoute({
			loader: () => {
				throw "raw string error"
			},
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(result.matches[0]?.error).toBeInstanceOf(Error)
		expect(result.matches[0]?.error?.message).toBe("raw string error")
	})

	it("loader throwing number → wrapped in Error(String(e))", async () => {
		const route = makeRoute({
			loader: () => {
				throw 42
			},
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(result.matches[0]?.error).toBeInstanceOf(Error)
		expect(result.matches[0]?.error?.message).toBe("42")
	})

	it("route without loader → loaderData = undefined, status = success", async () => {
		const route = makeRoute()
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.loaderData).toBeUndefined()
		expect(result.matches[0]?.status).toBe("success")
	})

	it("each loader receives its route's preloaderSnapshot", async () => {
		let rootSnapshot: unknown
		let pageSnapshot: unknown
		const root = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				rootSnapshot = ctx.preloaderContext
				return {}
			},
			preloader: () => ({ root: true }),
			virtualPath: "_root_",
		})
		const page = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				pageSnapshot = ctx.preloaderContext
				return {}
			},
			virtualPath: "_root_/about",
		})
		await runPipeline(makeConfig({ routes: [root, page] }))
		expect(rootSnapshot).toEqual({ root: true })
		expect(pageSnapshot).toEqual({ root: true })
	})
})

describe("head chain", () => {
	it("root head: parentHead = undefined", async () => {
		let capturedParent: unknown = "sentinel"
		const root = makeRoute({
			head: (ctx: Record<string, unknown>) => {
				capturedParent = ctx.parentHead
				return { title: "App" }
			},
			virtualPath: "_root_",
		})
		const result = await runPipeline(makeConfig({ routes: [root] }))
		expect(capturedParent).toBeUndefined()
		expect(result.matches[0]?.headConfig).toEqual({ title: "App" })
	})

	it("page head receives merged parent head", async () => {
		let capturedParent: unknown
		const root = makeRoute({
			head: () => ({ title: "App" }),
			virtualPath: "_root_",
		})
		const page = makeRoute({
			head: (ctx: Record<string, unknown>) => {
				capturedParent = ctx.parentHead
				return { description: "About page", title: "About" }
			},
			virtualPath: "_root_/about",
		})
		const result = await runPipeline(makeConfig({ routes: [root, page] }))
		expect(capturedParent).toEqual({ title: "App" })
		expect(result.matches[1]?.headConfig).toEqual({ description: "About page", title: "About" })
	})

	it("errored route → head skipped", async () => {
		const headFn = vi.fn(() => ({ title: "Error Page" }))
		const route = makeRoute({
			head: headFn,
			loader: () => {
				throw new Error("fail")
			},
		})
		await runPipeline(makeConfig({ routes: [route] }))
		expect(headFn).not.toHaveBeenCalled()
	})

	it("head() throwing → silently ignored, pipeline continues", async () => {
		const root = makeRoute({
			head: () => {
				throw new Error("head exploded")
			},
			virtualPath: "_root_",
		})
		const page = makeRoute({
			head: () => ({ title: "Page" }),
			virtualPath: "_root_/about",
		})
		const result = await runPipeline(makeConfig({ routes: [root, page] }))
		expect(result.matches).toHaveLength(2)
		expect(result.matches[0]?.status).toBe("success")
		expect(result.matches[1]?.headConfig).toEqual({ title: "Page" })
	})

	it("3-route sequential head merge: root → layout → page", async () => {
		const root = makeRoute({
			head: () => ({ description: "Root desc", title: "App" }),
			virtualPath: "_root_",
		})
		const layout = makeRoute({
			_type: "layout",
			head: () => ({ description: "Layout desc" }),
			virtualPath: "_root_/(group)",
		})
		const page = makeRoute({
			head: () => ({ title: "Page" }),
			virtualPath: "_root_/(group)/about",
		})
		const result = await runPipeline(makeConfig({ routes: [root, layout, page] }))
		expect(result.matches[0]?.headConfig).toEqual({ description: "Root desc", title: "App" })
		expect(result.matches[1]?.headConfig).toEqual({ description: "Layout desc", title: "App" })
		expect(result.matches[2]?.headConfig).toEqual({ description: "Layout desc", title: "Page" })
	})

	it("array fields (images, jsonLd) concatenated not overwritten", async () => {
		const root = makeRoute({
			head: () => ({
				images: [{ url: "/root.png" }],
				jsonLd: [{ "@type": "WebSite" }],
				title: "App",
			}),
			virtualPath: "_root_",
		})
		const page = makeRoute({
			head: () => ({
				images: [{ url: "/page.png" }],
				jsonLd: [{ "@type": "Article" }],
			}),
			virtualPath: "_root_/about",
		})
		const result = await runPipeline(makeConfig({ routes: [root, page] }))
		const pageHead = result.matches[1]?.headConfig
		expect(pageHead?.images).toEqual([{ url: "/root.png" }, { url: "/page.png" }])
		expect(pageHead?.jsonLd).toEqual([{ "@type": "WebSite" }, { "@type": "Article" }])
		expect(pageHead?.title).toBe("App")
	})

	it("object fields (openGraph) merged per-key not overwritten", async () => {
		const root = makeRoute({
			head: () => ({
				openGraph: { siteName: "My Site", title: "App", type: "website" },
			}),
			virtualPath: "_root_",
		})
		const page = makeRoute({
			head: () => ({
				openGraph: { description: "Page desc", title: "About" },
			}),
			virtualPath: "_root_/about",
		})
		const result = await runPipeline(makeConfig({ routes: [root, page] }))
		const pageHead = result.matches[1]?.headConfig
		expect(pageHead?.openGraph).toEqual({
			description: "Page desc",
			siteName: "My Site",
			title: "About",
			type: "website",
		})
	})

	it("custom head config arrays concatenated", async () => {
		const root = makeRoute({
			head: () => ({
				custom: {
					meta: [{ content: "root-val", name: "root-meta" }],
					scripts: [{ src: "/root.js" }],
				},
			}),
			virtualPath: "_root_",
		})
		const page = makeRoute({
			head: () => ({
				custom: {
					links: [{ href: "/page.css", rel: "stylesheet" }],
					meta: [{ content: "page-val", name: "page-meta" }],
				},
			}),
			virtualPath: "_root_/about",
		})
		const result = await runPipeline(makeConfig({ routes: [root, page] }))
		const pageHead = result.matches[1]?.headConfig
		expect(pageHead?.custom?.meta).toEqual([
			{ content: "root-val", name: "root-meta" },
			{ content: "page-val", name: "page-meta" },
		])
		expect(pageHead?.custom?.scripts).toEqual([{ src: "/root.js" }])
		expect(pageHead?.custom?.links).toEqual([{ href: "/page.css", rel: "stylesheet" }])
	})

	it("head receives loaderData in context", async () => {
		let capturedLoaderData: unknown
		const route = makeRoute({
			head: (ctx: Record<string, unknown>) => {
				capturedLoaderData = ctx.loaderData
				return { title: "dynamic" }
			},
			loader: () => Promise.resolve({ items: [1, 2] }),
		})
		await runPipeline(makeConfig({ routes: [route] }))
		expect(capturedLoaderData).toEqual({ items: [1, 2] })
	})

	it("errored route in middle → head skipped, later routes still get merged parent", async () => {
		const root = makeRoute({
			head: () => ({ title: "App" }),
			virtualPath: "_root_",
		})
		const errLayout = makeRoute({
			_type: "layout",
			head: vi.fn(() => ({ title: "Should Not Run" })),
			loader: () => {
				throw new Error("layout fail")
			},
			virtualPath: "_root_/(auth)",
		})
		const page = makeRoute({
			head: () => ({ description: "Page desc" }),
			virtualPath: "_root_/(auth)/dashboard",
		})
		const result = await runPipeline(makeConfig({ routes: [root, errLayout, page] }))
		expect(errLayout.head).not.toHaveBeenCalled()
		expect(result.matches[2]?.headConfig).toEqual({ description: "Page desc", title: "App" })
	})

	it("head receives correct location per route", async () => {
		const capturedLocations: string[] = []
		const root = makeRoute({
			head: (ctx: Record<string, unknown>) => {
				const loc = ctx.location as Record<string, unknown> | undefined
				capturedLocations.push(loc?.virtualPath as string)
				return { title: "App" }
			},
			virtualPath: "_root_",
		})
		const page = makeRoute({
			head: (ctx: Record<string, unknown>) => {
				const loc = ctx.location as Record<string, unknown> | undefined
				capturedLocations.push(loc?.virtualPath as string)
				return { title: "Page" }
			},
			virtualPath: "_root_/about",
		})
		await runPipeline(makeConfig({ routes: [root, page] }))
		expect(capturedLocations).toEqual(["_root_", "_root_/about"])
	})

	it("route without head → headConfig inherits accumulated merged head", async () => {
		const root = makeRoute({
			head: () => ({ title: "App" }),
			virtualPath: "_root_",
		})
		const layout = makeRoute({
			_type: "layout",
			virtualPath: "_root_/(group)",
		})
		const result = await runPipeline(makeConfig({ routes: [root, layout] }))
		expect(result.matches[1]?.headConfig).toEqual({ title: "App" })
	})
})

describe("headers chain", () => {
	it("root headers: parentHeaders = undefined", async () => {
		let capturedParent: unknown = "sentinel"
		const root = makeRoute({
			headers: (ctx: Record<string, unknown>) => {
				capturedParent = ctx.parentHeaders
				return { "x-root": "1" }
			},
			virtualPath: "_root_",
		})
		const result = await runPipeline(makeConfig({ routes: [root] }))
		expect(capturedParent).toBeUndefined()
		expect(result.matches[0]?.responseHeaders).toEqual({ "x-root": "1" })
	})

	it("errored route → headers skipped", async () => {
		const headersFn = vi.fn(() => ({ "x-error": "1" }))
		const route = makeRoute({
			headers: headersFn,
			loader: () => {
				throw new Error("fail")
			},
		})
		await runPipeline(makeConfig({ routes: [route] }))
		expect(headersFn).not.toHaveBeenCalled()
	})

	it("headers() throwing → silently ignored, pipeline continues", async () => {
		const root = makeRoute({
			headers: () => {
				throw new Error("headers exploded")
			},
			virtualPath: "_root_",
		})
		const page = makeRoute({
			headers: () => ({ "x-page": "1" }),
			virtualPath: "_root_/about",
		})
		const result = await runPipeline(makeConfig({ routes: [root, page] }))
		expect(result.matches).toHaveLength(2)
		expect(result.matches[0]?.status).toBe("success")
		expect(result.matches[1]?.responseHeaders).toEqual({ "x-page": "1" })
	})

	it("cdn config → Cache-Control auto-generated", async () => {
		const route = makeRoute({
			cache: { cdn: { maxAge: 3600 } },
			loader: () => Promise.resolve("ok"),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.responseHeaders?.["Cache-Control"]).toBe("public, max-age=3600")
	})

	it("cdn config with swr → stale-while-revalidate included", async () => {
		const route = makeRoute({
			cache: { cdn: { maxAge: 60, swr: 3600 } },
			loader: () => Promise.resolve("ok"),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.responseHeaders?.["Cache-Control"]).toBe(
			"public, max-age=60, stale-while-revalidate=3600",
		)
	})

	it("cdn config with private → private directive", async () => {
		const route = makeRoute({
			cache: { cdn: { maxAge: 300, private: true } },
			loader: () => Promise.resolve("ok"),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.responseHeaders?.["Cache-Control"]).toBe("private, max-age=300")
	})

	it("cdn config with tags array → Surrogate-Key header", async () => {
		const route = makeRoute({
			cache: { cdn: { maxAge: 3600, tags: ["posts", "feed"] } },
			loader: () => Promise.resolve("ok"),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.responseHeaders?.["Surrogate-Key"]).toBe("posts feed")
	})

	it("cdn config with tags function → Surrogate-Key from params", async () => {
		const route = makeRoute({
			cache: { cdn: { maxAge: 3600, tags: (ctx) => [`post-${ctx.params["id"]}`] } },
			loader: () => Promise.resolve("ok"),
			variablePath: "/posts/:id",
			virtualPath: "_root_/posts/[id]",
		})
		const result = await runPipeline(makeConfig({ params: { id: "42" }, routes: [route] }))
		expect(result.matches[0]?.responseHeaders?.["Surrogate-Key"]).toBe("post-42")
	})

	it("cdn: false → no CDN headers generated", async () => {
		const route = makeRoute({
			cache: { cdn: false },
			loader: () => Promise.resolve("ok"),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.responseHeaders?.["Cache-Control"]).toBeUndefined()
	})

	it("user .headers() with Cache-Control → CDN headers not overridden", async () => {
		const route = makeRoute({
			cache: { cdn: { maxAge: 3600 } },
			headers: () => ({ "Cache-Control": "no-store" }),
			loader: () => Promise.resolve("ok"),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.responseHeaders?.["Cache-Control"]).toBe("no-store")
	})

	it("cdn only maxAge (no swr) → no stale-while-revalidate", async () => {
		const route = makeRoute({
			cache: { cdn: { maxAge: 120 } },
			loader: () => Promise.resolve("ok"),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.responseHeaders?.["Cache-Control"]).not.toContain(
			"stale-while-revalidate",
		)
	})

	it("layout cdn headers merge with page cdn headers (page wins)", async () => {
		const layout = makeRoute({
			_type: "layout",
			cache: { cdn: { maxAge: 60 } },
			virtualPath: "_root_/(shop)",
		})
		const page = makeRoute({
			cache: { cdn: { maxAge: 3600, tags: ["products"] } },
			loader: () => Promise.resolve("ok"),
			virtualPath: "_root_/(shop)/products",
		})
		const result = await runPipeline(makeConfig({ routes: [layout, page] }))
		const pageHeaders = result.matches[1]?.responseHeaders
		expect(pageHeaders?.["Cache-Control"]).toBe("public, max-age=3600")
		expect(pageHeaders?.["Surrogate-Key"]).toBe("products")
	})

	it("cdn tags function receives validated params, not raw params", async () => {
		let capturedParams: Record<string, string | string[]> = {}
		const route = makeRoute({
			cache: {
				cdn: {
					maxAge: 3600,
					tags: (ctx) => {
						capturedParams = ctx.params
						return [`product-${ctx.params["slug"]}`]
					},
				},
			},
			inputConfig: {
				params: (raw: Record<string, string | string[]>) => ({
					slug: String(raw.id ?? "")
						.toLowerCase()
						.replace(/\s+/g, "-"),
				}),
			},
			loader: () => Promise.resolve("ok"),
			variablePath: "/products/:id",
			virtualPath: "_root_/products/[id]",
		})
		const result = await runPipeline(makeConfig({ params: { id: "Hello World" }, routes: [route] }))
		/* Validated params should have "slug" (transformed), not raw "id" */
		expect(capturedParams).toHaveProperty("slug")
		expect(capturedParams.slug).toBe("hello-world")
		expect(result.matches[0]?.responseHeaders?.["Surrogate-Key"]).toBe("product-hello-world")
	})

	it("3-route sequential headers merge: root → layout → page", async () => {
		const root = makeRoute({
			headers: () => ({ "x-app": "flare", "x-root": "1" }),
			virtualPath: "_root_",
		})
		const layout = makeRoute({
			_type: "layout",
			headers: () => ({ "x-layout": "1", "x-root": "overridden" }),
			virtualPath: "_root_/(group)",
		})
		const page = makeRoute({
			headers: () => ({ "x-page": "1" }),
			virtualPath: "_root_/(group)/about",
		})
		const result = await runPipeline(makeConfig({ routes: [root, layout, page] }))
		expect(result.matches[0]?.responseHeaders).toEqual({ "x-app": "flare", "x-root": "1" })
		expect(result.matches[1]?.responseHeaders).toEqual({
			"x-app": "flare",
			"x-layout": "1",
			"x-root": "overridden",
		})
		expect(result.matches[2]?.responseHeaders).toEqual({
			"x-app": "flare",
			"x-layout": "1",
			"x-page": "1",
			"x-root": "overridden",
		})
	})

	it("headers receives loaderData in context", async () => {
		let capturedLoaderData: unknown
		const route = makeRoute({
			headers: (ctx: Record<string, unknown>) => {
				capturedLoaderData = ctx.loaderData
				return { "x-test": "1" }
			},
			loader: () => Promise.resolve({ count: 5 }),
		})
		await runPipeline(makeConfig({ routes: [route] }))
		expect(capturedLoaderData).toEqual({ count: 5 })
	})

	it("errored route in middle → headers skipped, later routes still get merged parent", async () => {
		const root = makeRoute({
			headers: () => ({ "x-root": "1" }),
			virtualPath: "_root_",
		})
		const errLayout = makeRoute({
			_type: "layout",
			headers: vi.fn(() => ({ "x-err": "1" })),
			loader: () => {
				throw new Error("layout fail")
			},
			virtualPath: "_root_/(auth)",
		})
		const page = makeRoute({
			headers: () => ({ "x-page": "1" }),
			virtualPath: "_root_/(auth)/dashboard",
		})
		const result = await runPipeline(makeConfig({ routes: [root, errLayout, page] }))
		expect(errLayout.headers).not.toHaveBeenCalled()
		expect(result.matches[2]?.responseHeaders).toEqual({ "x-page": "1", "x-root": "1" })
	})

	it("headers receives correct location per route", async () => {
		const capturedLocations: string[] = []
		const root = makeRoute({
			headers: (ctx: Record<string, unknown>) => {
				const loc = ctx.location as Record<string, unknown> | undefined
				capturedLocations.push(loc?.virtualPath as string)
				return { "x-root": "1" }
			},
			virtualPath: "_root_",
		})
		const page = makeRoute({
			headers: (ctx: Record<string, unknown>) => {
				const loc = ctx.location as Record<string, unknown> | undefined
				capturedLocations.push(loc?.virtualPath as string)
				return { "x-page": "1" }
			},
			virtualPath: "_root_/about",
		})
		await runPipeline(makeConfig({ routes: [root, page] }))
		expect(capturedLocations).toEqual(["_root_", "_root_/about"])
	})

	it("route without headers → responseHeaders inherits accumulated merged headers", async () => {
		const root = makeRoute({
			headers: () => ({ "x-root": "1" }),
			virtualPath: "_root_",
		})
		const layout = makeRoute({
			_type: "layout",
			virtualPath: "_root_/(group)",
		})
		const result = await runPipeline(makeConfig({ routes: [root, layout] }))
		expect(result.matches[1]?.responseHeaders).toEqual({ "x-root": "1" })
	})
})

describe("full pipeline", () => {
	it("minimal: single page, no auth, no preloader", async () => {
		const route = makeRoute({
			loader: () => Promise.resolve({ greeting: "hello" }),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.auth).toBeNull()
		expect(result.matches).toHaveLength(1)
		expect(result.matches[0]?.loaderData).toEqual({ greeting: "hello" })
		expect(result.matches[0]?.status).toBe("success")
	})

	it("complex: root + layout + page with auth, preloaders, loaders", async () => {
		const authFn = () => Promise.resolve({ id: "user1", role: "admin" })
		const root = makeRoute({
			authenticate: [],
			head: () => ({ title: "App" }),
			headers: () => ({ "x-app": "flare" }),
			loader: () => Promise.resolve({ globals: true }),
			preloader: () => ({ user: { id: "user1" } }),
			virtualPath: "_root_",
		})
		const layout = makeRoute({
			_type: "layout",
			authorize: () => true,
			loader: () => Promise.resolve({ sidebar: true }),
			preloader: () => ({ permissions: ["read"] }),
			virtualPath: "_root_/(auth)",
		})
		const page = makeRoute({
			head: () => ({ title: "Dashboard" }),
			loader: () => Promise.resolve({ items: [1, 2, 3] }),
			virtualPath: "_root_/(auth)/dashboard",
		})
		const result = await runPipeline(
			makeConfig({ authenticateFn: authFn, routes: [root, layout, page] }),
		)
		expect(result.auth).toEqual({ id: "user1", role: "admin" })
		expect(result.matches).toHaveLength(3)
		expect(result.matches[0]?.loaderData).toEqual({ globals: true })
		expect(result.matches[1]?.loaderData).toEqual({ sidebar: true })
		expect(result.matches[2]?.loaderData).toEqual({ items: [1, 2, 3] })
	})

	it("abortController passed through all phases", async () => {
		const ac = new AbortController()
		let capturedSignal: unknown
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				capturedSignal = ctx.abortController
				return {}
			},
		})
		await runPipeline(makeConfig({ abortController: ac, routes: [route] }))
		expect(capturedSignal).toBe(ac)
	})
})

/* ── searchParams validator ──────────────────────────────────────────── */

describe("searchParams validation", () => {
	it("searchParams function validator called with URLSearchParams", async () => {
		let captured: unknown
		const route = makeRoute({
			inputConfig: {
				searchParams: (raw: URLSearchParams) => {
					captured = raw
					return { q: raw.get("q") ?? "" }
				},
			},
			loader: () => Promise.resolve("ok"),
		})
		const url = new URL("http://localhost/?q=test")
		const result = await runPipeline(makeConfig({ routes: [route], url }))
		expect(captured).toBeInstanceOf(URLSearchParams)
		expect(result.matches[0]?.status).toBe("success")
	})

	it("searchParams { parse } object validator works", async () => {
		const route = makeRoute({
			inputConfig: {
				searchParams: {
					parse: (raw: URLSearchParams) => ({ q: raw.get("q") ?? "" }),
				},
			},
			loader: () => Promise.resolve("ok"),
		})
		const url = new URL("http://localhost/?q=hello")
		const result = await runPipeline(makeConfig({ routes: [route], url }))
		expect(result.matches[0]?.status).toBe("success")
	})

	it("searchParams validator throwing → pipeline throws", async () => {
		const route = makeRoute({
			inputConfig: {
				searchParams: () => {
					throw new Error("bad search")
				},
			},
		})
		await expect(runPipeline(makeConfig({ routes: [route] }))).rejects.toThrow("bad search")
	})
})

/* ── RedirectResponse inside loader ──────────────────────────────────── */

describe("RedirectResponse in loader", () => {
	it("RedirectResponse thrown in loader → captured as match error, not pipeline throw", async () => {
		const route = makeRoute({
			loader: () => {
				throw new RedirectResponse({ to: "/login" })
			},
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(result.matches[0]?.error).toBeInstanceOf(Error)
	})

	it("loader error does not prevent other loaders from running", async () => {
		const route1 = makeRoute({
			loader: () => {
				throw new Error("fail")
			},
			virtualPath: "_root_/a",
		})
		const route2 = makeRoute({
			loader: () => Promise.resolve({ ok: true }),
			virtualPath: "_root_/b",
		})
		const result = await runPipeline(makeConfig({ routes: [route1, route2] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(result.matches[1]?.status).toBe("success")
		expect(result.matches[1]?.loaderData).toEqual({ ok: true })
	})
})

/* ── cause and prefetch in loader context ────────────────────────────── */

describe("cause and prefetch in loader context", () => {
	it("cause and prefetch values threaded to loader", async () => {
		let capturedCause: unknown
		let capturedPrefetch: unknown
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				capturedCause = ctx.cause
				capturedPrefetch = ctx.prefetch
				return {}
			},
		})
		await runPipeline(makeConfig({ cause: "prefetch", prefetch: true, routes: [route] }))
		expect(capturedCause).toBe("prefetch")
		expect(capturedPrefetch).toBe(true)
	})

	it("defer context created per match and returned in result", async () => {
		const route1 = makeRoute({
			loader: () => Promise.resolve("a"),
			virtualPath: "_root_/a",
		})
		const route2 = makeRoute({
			loader: () => Promise.resolve("b"),
			virtualPath: "_root_/b",
		})
		const result = await runPipeline(makeConfig({ routes: [route1, route2] }))
		expect(result.deferContexts.size).toBe(2)
	})

	it("preloader returning non-object is ignored", async () => {
		const route = makeRoute({
			loader: () => Promise.resolve("data"),
			preloader: () => Promise.resolve("not an object"),
		})
		const result = await runPipeline(makeConfig({ authenticateFn: undefined, routes: [route] }))
		expect(result.matches[0]?.status).toBe("success")
		expect(result.matches[0]?.preloaderContext).toEqual({})
	})

	it("prefetch: true → defer() in loader does not execute fn, entries empty", async () => {
		let deferFn: ((fn: () => Promise<unknown>) => unknown) | null = null
		const expensiveFn = vi.fn(() => Promise.resolve("expensive-data"))

		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				deferFn = ctx.defer as typeof deferFn
				const deferred = (ctx.defer as (fn: () => Promise<unknown>) => unknown)(expensiveFn)
				return { deferred, shell: "fast-data" }
			},
		})

		const result = await runPipeline(makeConfig({ prefetch: true, routes: [route] }))

		/* fn should NOT have been called in prefetch mode */
		expect(expensiveFn).not.toHaveBeenCalled()

		/* Loader still returns data with deferred marker */
		expect(result.matches[0]?.loaderData).toEqual(expect.objectContaining({ shell: "fast-data" }))

		/* deferContexts exist but have empty entries */
		for (const [, dCtx] of result.deferContexts) {
			expect(dCtx.entries()).toHaveLength(0)
		}
	})

	it("prefetch: false → defer() in loader executes fn normally", async () => {
		const expensiveFn = vi.fn(() => Promise.resolve("expensive-data"))

		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				const deferred = (ctx.defer as (fn: () => Promise<unknown>) => unknown)(expensiveFn)
				return { deferred, shell: "fast-data" }
			},
		})

		const result = await runPipeline(makeConfig({ prefetch: false, routes: [route] }))

		/* fn SHOULD be called in normal mode */
		expect(expensiveFn).toHaveBeenCalledTimes(1)

		/* entries populated */
		let totalEntries = 0
		for (const [, dCtx] of result.deferContexts) {
			totalEntries += dCtx.entries().length
		}
		expect(totalEntries).toBe(1)
	})
})

describe("catch-all params preservation", () => {
	it("string[] params from catch-all preserved through pipeline", async () => {
		let capturedParams: unknown
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				capturedParams = (ctx.location as { params: unknown }).params
				return "loaded"
			},
			virtualPath: "_root_/docs/[...slug]",
		})
		const result = await runPipeline(
			makeConfig({
				authenticateFn: undefined,
				params: { slug: ["a", "b", "c"] },
				routes: [route],
			}),
		)
		expect(result.matches[0]?.status).toBe("success")
		expect(capturedParams).toEqual({ slug: ["a", "b", "c"] })
	})

	it("string params still work alongside catch-all", async () => {
		let capturedParams: unknown
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				capturedParams = (ctx.location as { params: unknown }).params
				return "loaded"
			},
		})
		const result = await runPipeline(
			makeConfig({
				authenticateFn: undefined,
				params: { id: "123" },
				routes: [route],
			}),
		)
		expect(result.matches[0]?.status).toBe("success")
		expect(capturedParams).toEqual({ id: "123" })
	})

	it("catch-all string[] params pass through validator without cast", async () => {
		let validatorReceived: unknown
		const route = makeRoute({
			inputConfig: {
				params: (raw: Record<string, string | string[]>) => {
					validatorReceived = raw
					const out: Record<string, string> = {}
					for (const [k, v] of Object.entries(raw)) {
						out[k] = Array.isArray(v) ? v.join("/") : v
					}
					return out
				},
			},
			loader: () => "ok",
			virtualPath: "_root_/docs/[...slug]",
		})
		await runPipeline(
			makeConfig({
				params: { slug: ["a", "b", "c"] },
				routes: [route],
			}),
		)
		expect(validatorReceived).toEqual({ slug: ["a", "b", "c"] })
	})
})

describe("locale validation", () => {
	it("invalid locale param throws NotFoundError", async () => {
		const route = makeRoute({
			loader: () => Promise.resolve("ok"),
		})
		await expect(
			runPipeline(
				makeConfig({
					localeConfig: {
						defaultLocale: "en",
						locales: ["en", "de", "fr"],
						paramName: "locale",
					},
					params: { locale: "products" },
					routes: [route],
				}),
			),
		).rejects.toThrow(NotFoundError)
	})

	it("valid locale param is used as-is", async () => {
		let receivedLocale: string | undefined
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				const localeFn = ctx.locale as () => string
				receivedLocale = localeFn()
				return Promise.resolve("ok")
			},
		})
		const result = await runPipeline(
			makeConfig({
				localeConfig: {
					defaultLocale: "en",
					locales: ["en", "de", "fr"],
					paramName: "locale",
				},
				params: { locale: "de" },
				routes: [route],
			}),
		)
		expect(result.matches[0]?.status).toBe("success")
		expect(receivedLocale).toBe("de")
	})
})
