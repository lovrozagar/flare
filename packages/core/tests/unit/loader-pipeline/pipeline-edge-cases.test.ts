import { describe, expect, it, vi } from "vitest"
import { RedirectResponse, UnauthorizedError } from "../../../src/errors/index.ts"
import type { PipelineConfig, ResolvedRoute } from "../../../src/loader-pipeline/index.ts"
import { runPipeline } from "../../../src/loader-pipeline/index.ts"
import type { FlareStore } from "../../../src/store/index.ts"

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

function makeFlareStore(overrides?: Partial<FlareStore>): FlareStore {
	return {
		delete: vi.fn(),
		deleteByTags: vi.fn(),
		get: vi.fn(() => Promise.resolve(null)),
		set: vi.fn(() => Promise.resolve()),
		...overrides,
	}
}

/* ── store cache intercept ────────────────────────────────────────── */

describe("store cache intercept", () => {
	it("cache hit → loader NOT called, cached data returned", async () => {
		const loader = vi.fn(() => Promise.resolve("fresh-data"))
		const store = makeFlareStore({
			get: vi.fn(() => Promise.resolve({ data: "cached-data", storedAt: Date.now() })),
		})

		const route = makeRoute({
			cache: { ssr: {} },
			loader,
		})
		const result = await runPipeline(makeConfig({ routes: [route], store }))

		expect(loader).not.toHaveBeenCalled()
		expect(result.matches[0]?.loaderData).toBe("cached-data")
		expect(result.matches[0]?.status).toBe("success")
	})

	it("cache miss → loader called, result stored", async () => {
		const setFn = vi.fn<
			(key: string, entry: { data: unknown; storedAt: number }, ttl?: number) => Promise<void>
		>(() => Promise.resolve())
		const store = makeFlareStore({
			get: vi.fn(() => Promise.resolve(null)),
			set: setFn,
		})

		const route = makeRoute({
			cache: { ssr: {} },
			loader: () => Promise.resolve("fresh-data"),
		})
		const result = await runPipeline(makeConfig({ routes: [route], store }))

		expect(result.matches[0]?.loaderData).toBe("fresh-data")
		expect(setFn).toHaveBeenCalledTimes(1)
		const setArgs = setFn.mock.calls[0]
		expect(setArgs?.[1]?.data).toBe("fresh-data")
	})

	it("stale cache entry → loader called", async () => {
		const loader = vi.fn(() => Promise.resolve("fresh-data"))
		const store = makeFlareStore({
			get: vi.fn(() => Promise.resolve({ data: "stale", storedAt: Date.now() - 10_000 })),
		})

		const route = makeRoute({
			cache: { ssr: { staleTime: 5_000 } },
			loader,
		})
		const result = await runPipeline(makeConfig({ routes: [route], store }))

		expect(loader).toHaveBeenCalledTimes(1)
		expect(result.matches[0]?.loaderData).toBe("fresh-data")
	})

	it("cache.store.staleTime undefined → always fresh", async () => {
		const loader = vi.fn(() => Promise.resolve("should-not-call"))
		const store = makeFlareStore({
			get: vi.fn(() => Promise.resolve({ data: "very-old", storedAt: 0 })),
		})

		const route = makeRoute({
			cache: { ssr: {} },
			loader,
		})
		const result = await runPipeline(makeConfig({ routes: [route], store }))

		expect(loader).not.toHaveBeenCalled()
		expect(result.matches[0]?.loaderData).toBe("very-old")
	})

	it("cache get throws → treated as miss, loader called", async () => {
		const loader = vi.fn(() => Promise.resolve("fallback-data"))
		const store = makeFlareStore({
			get: vi.fn(() => Promise.reject(new Error("storage down"))),
		})

		const route = makeRoute({
			cache: { ssr: {} },
			loader,
		})
		const result = await runPipeline(makeConfig({ routes: [route], store }))

		expect(loader).toHaveBeenCalledTimes(1)
		expect(result.matches[0]?.loaderData).toBe("fallback-data")
	})

	it("cache set throws → loader result still returned", async () => {
		const store = makeFlareStore({
			get: vi.fn(() => Promise.resolve(null)),
			set: vi.fn(() => Promise.reject(new Error("write failed"))),
		})

		const route = makeRoute({
			cache: { ssr: {} },
			loader: () => Promise.resolve("data-survives"),
		})
		const result = await runPipeline(makeConfig({ routes: [route], store }))

		expect(result.matches[0]?.loaderData).toBe("data-survives")
		expect(result.matches[0]?.status).toBe("success")
	})

	it("custom cache key function used", async () => {
		const store = makeFlareStore({
			get: vi.fn(() => Promise.resolve({ data: "keyed", storedAt: Date.now() })),
		})

		const route = makeRoute({
			cache: {
				ssr: { key: ({ params }) => `custom:${String(params.id)}` },
			},
			loader: vi.fn(),
		})
		await runPipeline(makeConfig({ params: { id: "42" }, routes: [route], store }))

		expect(store.get).toHaveBeenCalledWith("custom:42")
	})

	it("store as factory function → resolved with env", async () => {
		const store = makeFlareStore({
			get: vi.fn(() => Promise.resolve({ data: "from-factory", storedAt: Date.now() })),
		})
		const factory = vi.fn((_env: unknown): FlareStore => store)

		const route = makeRoute({
			cache: { ssr: {} },
			loader: vi.fn(),
		})
		const result = await runPipeline(
			makeConfig({ env: { DB: "test" }, routes: [route], store: factory }),
		)

		expect(factory).toHaveBeenCalledWith({ DB: "test" })
		expect(result.matches[0]?.loaderData).toBe("from-factory")
	})
})

/* ── CDN cache headers ────────────────────────────────────────────── */

describe("CDN cache headers", () => {
	it("cdn config generates Cache-Control and Surrogate-Key", async () => {
		const route = makeRoute({
			cache: {
				cdn: {
					maxAge: 300,
					swr: 60,
					tags: ["products"],
				},
			},
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.responseHeaders?.["Cache-Control"]).toBe(
			"public, max-age=300, stale-while-revalidate=60",
		)
		expect(result.matches[0]?.responseHeaders?.["Surrogate-Key"]).toBe("products")
	})

	it("cdn with private=true → private scope", async () => {
		const route = makeRoute({
			cache: {
				cdn: { maxAge: 60, private: true },
			},
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.responseHeaders?.["Cache-Control"]).toBe("private, max-age=60")
	})

	it("user headers with Cache-Control → cdn Cache-Control skipped, Surrogate-Key preserved", async () => {
		const route = makeRoute({
			cache: {
				cdn: {
					maxAge: 300,
					tags: ["products"],
				},
			},
			headers: () => ({ "Cache-Control": "no-store" }),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.responseHeaders?.["Cache-Control"]).toBe("no-store")
		expect(result.matches[0]?.responseHeaders?.["Surrogate-Key"]).toBe("products")
	})

	it("user headers with lowercase cache-control → cdn Cache-Control skipped", async () => {
		const route = makeRoute({
			cache: {
				cdn: {
					maxAge: 300,
					tags: ["products"],
				},
			},
			headers: () => ({ "cache-control": "no-store" }),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		/* User's lowercase cache-control should win — CDN Cache-Control must not appear */
		const h = result.matches[0]?.responseHeaders ?? {}
		const ccKeys = Object.keys(h).filter((k) => k.toLowerCase() === "cache-control")
		expect(ccKeys).toHaveLength(1)
		expect(h[ccKeys[0] ?? ""]).toBe("no-store")
		/* Surrogate-Key should still be present */
		expect(h["Surrogate-Key"]).toBe("products")
	})

	it("cdn.tags as function receives params", async () => {
		const tagFn = vi.fn(({ params }: { params: Record<string, string | string[]> }) => [
			`product:${String(params.id)}`,
		])
		const route = makeRoute({
			cache: { cdn: { maxAge: 60, tags: tagFn } },
			virtualPath: "_root_/products/[id]",
		})
		await runPipeline(makeConfig({ params: { id: "42" }, routes: [route] }))
		expect(tagFn).toHaveBeenCalledWith({ params: { id: "42" } })
	})

	it("cdn.tags empty array → no Surrogate-Key header", async () => {
		const route = makeRoute({
			cache: { cdn: { maxAge: 60, tags: [] } },
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.responseHeaders?.["Surrogate-Key"]).toBeUndefined()
	})
})

/* ── preloader snapshot isolation ─────────────────────────────────── */

describe("preloader snapshot isolation", () => {
	it("mutating preloaderContext in loader does NOT affect other loaders", async () => {
		let rootLoaderCtx: Record<string, unknown> | undefined
		let pageLoaderCtx: Record<string, unknown> | undefined

		const root = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				rootLoaderCtx = ctx.preloaderContext as Record<string, unknown>
				/* Mutate the snapshot */
				rootLoaderCtx.mutated = true
				return { root: true }
			},
			preloader: () => ({ shared: "data" }),
			virtualPath: "_root_",
		})
		const page = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				pageLoaderCtx = ctx.preloaderContext as Record<string, unknown>
				return { page: true }
			},
			virtualPath: "_root_/about",
		})

		await runPipeline(makeConfig({ routes: [root, page] }))

		/* Root mutated its snapshot */
		expect(rootLoaderCtx?.mutated).toBe(true)
		/* Page's snapshot is isolated (frozen copy from preloader phase) */
		expect(pageLoaderCtx?.mutated).toBeUndefined()
		expect(pageLoaderCtx?.shared).toBe("data")
	})

	it("child preloader extends parent context without affecting parent loader", async () => {
		let rootLoaderCtx: Record<string, unknown> | undefined

		const root = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				rootLoaderCtx = ctx.preloaderContext as Record<string, unknown>
				return {}
			},
			preloader: () => ({ root: true }),
			virtualPath: "_root_",
		})
		const child = makeRoute({
			loader: () => ({}),
			preloader: () => ({ child: true }),
			virtualPath: "_root_/child",
		})

		await runPipeline(makeConfig({ routes: [root, child] }))

		/* Root's snapshot should NOT have child's preloader data */
		expect(rootLoaderCtx?.root).toBe(true)
		expect(rootLoaderCtx?.child).toBeUndefined()
	})
})

/* ── authorize propagation ────────────────────────────────────────── */

describe("authorize failure propagation", () => {
	it("authorize fail on layout → page also gets UnauthorizedError, page loader skipped", async () => {
		const pageLoader = vi.fn(() => Promise.resolve("page data"))
		const layout = makeRoute({
			authorize: () => false,
			virtualPath: "_root_",
		})
		const page = makeRoute({
			loader: pageLoader,
			virtualPath: "_root_/page",
		})

		const result = await runPipeline(makeConfig({ routes: [layout, page] }))

		expect(result.matches[0]?.status).toBe("error")
		expect(result.matches[0]?.error).toBeInstanceOf(UnauthorizedError)
		expect(result.matches[1]?.status).toBe("error")
		expect(result.matches[1]?.error).toBeInstanceOf(UnauthorizedError)
		expect(pageLoader).not.toHaveBeenCalled()
	})

	it("authorize fail on page → layout loader still runs", async () => {
		const layoutLoader = vi.fn(() => Promise.resolve("layout-data"))
		const layout = makeRoute({
			loader: layoutLoader,
			virtualPath: "_root_",
		})
		const page = makeRoute({
			authorize: () => false,
			virtualPath: "_root_/page",
		})

		const result = await runPipeline(makeConfig({ routes: [layout, page] }))

		expect(layoutLoader).toHaveBeenCalledTimes(1)
		expect(result.matches[0]?.status).toBe("success")
		expect(result.matches[0]?.loaderData).toBe("layout-data")
		expect(result.matches[1]?.status).toBe("error")
		expect(result.matches[1]?.error).toBeInstanceOf(UnauthorizedError)
	})
})

/* ── headers chain edge cases ─────────────────────────────────────── */

describe("headers chain edge cases", () => {
	it("headers() throwing → error stored, pipeline continues", async () => {
		const root = makeRoute({
			headers: () => {
				throw new Error("headers boom")
			},
			virtualPath: "_root_",
		})
		const page = makeRoute({
			headers: () => ({ "X-Page": "yes" }),
			virtualPath: "_root_/page",
		})

		const result = await runPipeline(makeConfig({ routes: [root, page] }))

		expect(result.matches[0]?.headersError).toBeInstanceOf(Error)
		expect(result.matches[0]?.headersError?.message).toBe("headers boom")
		expect(result.matches[1]?.responseHeaders?.["X-Page"]).toBe("yes")
	})

	it("errored route (loader fail) → headers() skipped", async () => {
		const headersFn = vi.fn(() => ({ "X-Custom": "yes" }))
		const route = makeRoute({
			headers: headersFn,
			loader: () => {
				throw new Error("fail")
			},
		})

		await runPipeline(makeConfig({ routes: [route] }))

		expect(headersFn).not.toHaveBeenCalled()
	})
})

/* ── loader receives correct context ──────────────────────────────── */

describe("loader context completeness", () => {
	it("loader receives all expected context properties", async () => {
		let receivedCtx: Record<string, unknown> | undefined

		const route = makeRoute({
			authenticate: [],
			loader: (ctx: Record<string, unknown>) => {
				receivedCtx = ctx
				return "ok"
			},
		})

		const authFn = () => Promise.resolve({ id: "user1" })
		await runPipeline(
			makeConfig({
				authenticateFn: authFn,
				cause: "stay",
				env: { DB: "test" },
				routes: [route],
			}),
		)

		expect(receivedCtx).toBeDefined()
		expect(receivedCtx?.auth).toEqual({ id: "user1" })
		expect(receivedCtx?.cause).toBe("stay")
		expect(receivedCtx?.env).toEqual({ DB: "test" })
		expect(receivedCtx?.prefetch).toBe(false)
		expect(typeof receivedCtx?.defer).toBe("function")
		expect(receivedCtx?.location).toBeDefined()
		expect(receivedCtx?.preloaderContext).toEqual({})
		/* throwHelpers present */
		expect(typeof receivedCtx?.notFound).toBe("function")
		expect(typeof receivedCtx?.redirect).toBe("function")
		expect(typeof receivedCtx?.unauthenticated).toBe("function")
		expect(typeof receivedCtx?.unauthorized).toBe("function")
	})

	it("prefetch=true passed through to loader context", async () => {
		let receivedPrefetch: unknown

		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				receivedPrefetch = ctx.prefetch
				return {}
			},
		})

		await runPipeline(makeConfig({ prefetch: true, routes: [route] }))
		expect(receivedPrefetch).toBe(true)
	})

	it("loader throwing RedirectResponse → match error preserves RedirectResponse", async () => {
		const route = makeRoute({
			loader: () => {
				throw new RedirectResponse({ status: 302, to: "/login" })
			},
		})

		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.status).toBe("error")
		/* RedirectResponse is Error subclass */
		expect(result.matches[0]?.error).toBeInstanceOf(RedirectResponse)
	})
})
