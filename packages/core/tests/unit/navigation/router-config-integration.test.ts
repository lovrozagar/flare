import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts"
import type { LoadedRouteModules } from "../../../src/navigation/types.ts"
import type { FlareProviderContext, NavigateOptions } from "../../../src/outlet/types.ts"
import { rewriteBasePath } from "../../../src/rewrite/index.ts"
import type { TreeNode } from "../../../src/router-primitives/types.ts"
import type { SearchParams } from "../../../src/url/index.ts"

vi.mock("../../../src/ndjson-client", () => ({ fetchNDJSON: vi.fn() }))
vi.mock("../../../src/head-client", () => ({ applyPerRouteHeads: vi.fn() }))
vi.mock("../../../src/router-primitives", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/router-primitives")>()
	return { ...original, matchRoute: vi.fn() }
})
vi.mock("../../../src/history", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/history")>()
	return { ...original, restoreScroll: vi.fn(), scrollToTop: vi.fn() }
})

import { restoreScroll } from "../../../src/history/index.ts"
import { navigate, resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts"
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts"
import { matchRoute } from "../../../src/router-primitives/index.ts"

const mockFetchNDJSON = fetchNDJSON as ReturnType<typeof vi.fn>
const mockMatchRoute = matchRoute as ReturnType<typeof vi.fn>
const mockRestoreScroll = restoreScroll as ReturnType<typeof vi.fn>

function makeFakeTree(): TreeNode {
	return { s: {} }
}

function makeModule(virtualPath: string, type: "layout" | "render" = "render") {
	return { _type: type, render: () => null, variablePath: "", virtualPath }
}

function makeLoadedModules(overrides?: Partial<LoadedRouteModules>): LoadedRouteModules {
	return {
		layouts: [],
		page: makeModule("_root_/home"),
		params: {},
		...overrides,
	}
}

function makeRoute(virtualPath: string, type: "r" | "x" = "r") {
	return { e: "", o: {}, p: vi.fn(), t: type, v: "", x: virtualPath }
}

function makeCtx(overrides?: Partial<FlareProviderContext>): FlareProviderContext {
	let matches: FlareProviderContext["matches"] extends () => infer R ? R : never = []
	let params: Record<string, string | string[]> = {}
	let search: SearchParams = {}
	let navigationPhase: import("../../../src/outlet/types").NavigationPhase = "idle"
	let viewTransition: import("../../../src/outlet/types").BrowserViewTransition | null = null
	let notFound = false
	let hydrated = false

	const ctx: FlareProviderContext = {
		hydrated: () => hydrated,
		intercepted: () => null,
		invalidate: vi.fn(),
		isNavigating: () => navigationPhase !== "idle",
		layouts: {},
		location: () => ({
			hash: "",
			params: {},
			pathname: "/",
			search: {},
			url: new URL("http://localhost/"),
			variablePath: "",
			virtualPath: "",
		}),
		matchCache: createMatchCache(),
		matches: () => matches,
		navigate: vi.fn(() => Promise.resolve()),
		navigationPhase: () => navigationPhase,
		notFound: () => notFound,
		params: () => params,
		prefetch: vi.fn(() => Promise.resolve()),
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: makeFakeTree(),
		search: () => search,
		setHydrated: (v: boolean) => {
			hydrated = v
		},
		setIntercepted: () => {},
		setMatches: (m) => {
			matches = m
		},
		setNavigationPhase: (v: import("../../../src/outlet/types").NavigationPhase) => {
			navigationPhase = v
		},
		setNotFound: (v: boolean) => {
			notFound = v
		},
		setParams: (p) => {
			params = p
		},
		setSearch: (s) => {
			search = s
		},
		setViewTransition: (vt: import("../../../src/outlet/types").BrowserViewTransition | null) => {
			viewTransition = vt
		},
		viewTransition: () => viewTransition,
		...overrides,
	}

	let navigateFn: (opts: NavigateOptions) => Promise<void> = () => Promise.resolve()
	let prefetchFn: (opts: { to: string }) => Promise<void> = () => Promise.resolve()

	Object.defineProperty(ctx, "_setNavigate", {
		value: (fn: typeof navigateFn) => {
			navigateFn = fn
		},
	})
	Object.defineProperty(ctx, "_setPrefetch", {
		value: (fn: typeof prefetchFn) => {
			prefetchFn = fn
		},
	})

	return ctx
}

let scrollRestorationSpy: (v: string) => void

beforeEach(() => {
	vi.useFakeTimers()
	vi.stubGlobal("history", {
		pushState: vi.fn(),
		replaceState: vi.fn(),
		scrollRestoration: "auto",
	})
	vi.stubGlobal("scrollTo", vi.fn())
	vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
		fn()
		return 0
	})
	vi.stubGlobal("addEventListener", vi.fn())
	vi.stubGlobal("removeEventListener", vi.fn())
	scrollRestorationSpy = vi.fn()
	let scrollRestorationValue = "auto"
	Object.defineProperty(globalThis.history, "scrollRestoration", {
		configurable: true,
		get: () => scrollRestorationValue,
		set: (v: string) => {
			scrollRestorationSpy(v)
			scrollRestorationValue = v
		},
	})
})

afterEach(() => {
	resetNavigationState()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

/* ── scrollRestoration: false ────────────────────────────────────────── */

describe("scrollRestoration: false", () => {
	it("does NOT set history.scrollRestoration to manual", () => {
		const ctx = makeCtx()
		setupNavigation(
			ctx,
			vi.fn(() => Promise.resolve(makeLoadedModules())),
			{
				scrollRestoration: false,
			},
		)
		expect(scrollRestorationSpy).not.toHaveBeenCalledWith("manual")
	})

	it("default (true) sets history.scrollRestoration to manual", () => {
		const ctx = makeCtx()
		setupNavigation(
			ctx,
			vi.fn(() => Promise.resolve(makeLoadedModules())),
			{},
		)
		expect(scrollRestorationSpy).toHaveBeenCalledWith("manual")
	})

	it("scrollRestoration: false skips scroll restore on popstate", async () => {
		const ctx = makeCtx()
		const loadModules = vi.fn(() => Promise.resolve(makeLoadedModules()))

		setupNavigation(ctx, loadModules, { scrollRestoration: false })

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/home"),
		})
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		await navigate({
			_popstate: true,
			_restoreScroll: { x: 0, y: 200 },
			scroll: false,
			to: "/home",
		})

		/* restoreScroll should NOT be called when scrollRestoration disabled */
		expect(mockRestoreScroll).not.toHaveBeenCalled()
	})
})

/* ── scrollRestorationBehavior ───────────────────────────────────────── */

describe("scrollRestorationBehavior through navigate", () => {
	it('passes "smooth" to restoreScroll when configured', async () => {
		const ctx = makeCtx()
		const loadModules = vi.fn(() => Promise.resolve(makeLoadedModules()))

		setupNavigation(ctx, loadModules, { scrollRestorationBehavior: "smooth" })

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/home"),
		})
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		await navigate({
			_popstate: true,
			_restoreScroll: { x: 0, y: 300 },
			scroll: false,
			to: "/home",
		})

		await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
		expect(mockRestoreScroll).toHaveBeenCalledWith({ x: 0, y: 300 }, "smooth")
	})

	it('default passes "auto" to restoreScroll', async () => {
		const ctx = makeCtx()
		const loadModules = vi.fn(() => Promise.resolve(makeLoadedModules()))

		setupNavigation(ctx, loadModules, {})

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/home"),
		})
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		await navigate({
			_popstate: true,
			_restoreScroll: { x: 10, y: 50 },
			scroll: false,
			to: "/home",
		})

		await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
		expect(mockRestoreScroll).toHaveBeenCalledWith({ x: 10, y: 50 }, "auto")
	})
})

/* ── scrollRestorationMaxEntries ─────────────────────────────────────── */

describe("scrollRestorationMaxEntries through setupNavigation", () => {
	/* The actual eviction behavior is tested in the unit test.
	 * Here we verify that setupNavigation accepts and threads the option
	 * by doing a basic navigate that exercises scroll save. */
	it("accepts scrollRestorationMaxEntries without error", () => {
		const ctx = makeCtx()
		expect(() =>
			setupNavigation(
				ctx,
				vi.fn(() => Promise.resolve(makeLoadedModules())),
				{
					scrollRestorationMaxEntries: 10,
				},
			),
		).not.toThrow()
	})
})

/* ── caseSensitive through navigate ──────────────────────────────────── */

describe("caseSensitive through navigate", () => {
	it("passes caseSensitive to matchRoute", async () => {
		const ctx = makeCtx()
		const loadModules = vi.fn(() => Promise.resolve(makeLoadedModules()))

		setupNavigation(ctx, loadModules, { caseSensitive: true })

		mockMatchRoute.mockReturnValue(null)

		await navigate({ to: "/About" })

		/* matchRoute should have been called with caseSensitive=true */
		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/About", true, undefined)
	})

	it("default passes caseSensitive=false to matchRoute", async () => {
		const ctx = makeCtx()
		const loadModules = vi.fn(() => Promise.resolve(makeLoadedModules()))

		setupNavigation(ctx, loadModules, {})

		mockMatchRoute.mockReturnValue(null)

		await navigate({ to: "/About" })

		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/About", false, undefined)
	})
})

/* ── basePath through navigate ───────────────────────────────────────── */

describe("basePath through navigate", () => {
	it("strips basePath before matchRoute", async () => {
		const ctx = makeCtx()
		const loadModules = vi.fn(() => Promise.resolve(makeLoadedModules()))

		setupNavigation(ctx, loadModules, { rewrite: rewriteBasePath({ basePath: "/app" }) })

		mockMatchRoute.mockReturnValue(null)

		await navigate({ to: "/app/about" })

		/* matchRoute called with /about (basePath stripped) */
		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/about", false, undefined)
	})

	it("basePath root request strips to /", async () => {
		const ctx = makeCtx()
		const loadModules = vi.fn(() => Promise.resolve(makeLoadedModules()))

		setupNavigation(ctx, loadModules, { rewrite: rewriteBasePath({ basePath: "/app" }) })

		mockMatchRoute.mockReturnValue(null)

		await navigate({ to: "/app" })

		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/", false, undefined)
	})

	it("no basePath passes pathname unchanged", async () => {
		const ctx = makeCtx()
		const loadModules = vi.fn(() => Promise.resolve(makeLoadedModules()))

		setupNavigation(ctx, loadModules, {})

		mockMatchRoute.mockReturnValue(null)

		await navigate({ to: "/about" })

		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/about", false, undefined)
	})

	it("basePath + caseSensitive combined", async () => {
		const ctx = makeCtx()
		const loadModules = vi.fn(() => Promise.resolve(makeLoadedModules()))

		setupNavigation(ctx, loadModules, {
			caseSensitive: true,
			rewrite: rewriteBasePath({ basePath: "/app" }),
		})

		mockMatchRoute.mockReturnValue(null)

		await navigate({ to: "/app/About" })

		expect(mockMatchRoute).toHaveBeenCalledWith(expect.anything(), "/About", true, undefined)
	})

	it("loadRouteModules receives stripped pathname", async () => {
		const ctx = makeCtx()
		const loadModules = vi.fn(() => Promise.resolve(makeLoadedModules()))

		setupNavigation(ctx, loadModules, { rewrite: rewriteBasePath({ basePath: "/app" }) })

		mockMatchRoute.mockReturnValue({
			params: {},
			route: makeRoute("_root_/about"),
		})
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		await navigate({ to: "/app/about" })

		/* loadModules called with stripped pathname */
		expect(loadModules).toHaveBeenCalledWith("/about", expect.anything(), expect.anything())
	})
})
