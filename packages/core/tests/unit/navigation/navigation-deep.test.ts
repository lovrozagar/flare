import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts"
import type { LoadedRouteModules } from "../../../src/navigation/types.ts"
import type { FlareProviderContext, NavigateOptions } from "../../../src/outlet/types.ts"
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

import { restoreScroll, scrollToTop } from "../../../src/history/index.ts"
import { navigate, resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts"
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts"
import { matchRoute } from "../../../src/router-primitives/index.ts"

const mockFetchNDJSON = fetchNDJSON as ReturnType<typeof vi.fn>
const mockMatchRoute = matchRoute as ReturnType<typeof vi.fn>
const mockScrollToTop = scrollToTop as ReturnType<typeof vi.fn>
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

const mockLoadRouteModules =
	vi.fn<(pathname: string, routeTree: unknown, layouts: unknown) => Promise<LoadedRouteModules>>()

function resetLocation(): void {
	window.history.replaceState({}, "", "/")
}

/* ------------------------------------------------------------------ */
/*  GC interval                                                       */
/* ------------------------------------------------------------------ */
describe("GC interval", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()
		mockLoadRouteModules.mockReset()
	})

	afterEach(() => {
		resetNavigationState()
		resetLocation()
		vi.useRealTimers()
	})

	it("registers GC interval that runs every 60s", () => {
		const ctx = makeCtx()
		const cleanupSpy = vi.spyOn(ctx.prefetchCache, "cleanup")

		setupNavigation(ctx, mockLoadRouteModules)

		/* GC should not have run yet */
		expect(cleanupSpy).not.toHaveBeenCalled()

		/* Advance 60s — one tick */
		vi.advanceTimersByTime(60_000)
		expect(cleanupSpy).toHaveBeenCalledTimes(1)
		expect(cleanupSpy).toHaveBeenCalledWith(5 * 60 * 1000)

		/* Advance another 60s — second tick */
		vi.advanceTimersByTime(60_000)
		expect(cleanupSpy).toHaveBeenCalledTimes(2)
	})

	it("removes matchCache entries older than 5 minutes during GC tick", () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		/* Insert a cache entry with an updatedAt in the past (6 min ago) */
		const sixMinAgo = Date.now() - 6 * 60 * 1000
		ctx.matchCache.set({
			data: "old-data",
			invalid: false,
			matchId: "old-match",
			updatedAt: sixMinAgo,
		})

		/* Insert a fresh entry */
		ctx.matchCache.set({
			data: "fresh-data",
			invalid: false,
			matchId: "fresh-match",
			updatedAt: Date.now(),
		})

		expect(ctx.matchCache.size()).toBe(2)

		/* Trigger GC */
		vi.advanceTimersByTime(60_000)

		expect(ctx.matchCache.has("old-match")).toBe(false)
		expect(ctx.matchCache.has("fresh-match")).toBe(true)
		expect(ctx.matchCache.size()).toBe(1)
	})

	it("resetNavigationState clears GC interval — no more ticks fire", () => {
		const ctx = makeCtx()
		const cleanupSpy = vi.spyOn(ctx.prefetchCache, "cleanup")

		setupNavigation(ctx, mockLoadRouteModules)
		resetNavigationState()

		vi.advanceTimersByTime(120_000)

		expect(cleanupSpy).not.toHaveBeenCalled()
	})
})

/* ------------------------------------------------------------------ */
/*  staleTime option                                                  */
/* ------------------------------------------------------------------ */
describe("staleTime option", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockFetchNDJSON.mockReset()
		mockMatchRoute.mockReset()
		mockLoadRouteModules.mockReset()
		resetLocation()
	})

	afterEach(() => {
		resetNavigationState()
		resetLocation()
	})

	it("module with staleTime reuses cached data within window (no fetch)", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const modWithStaleTime = {
			...makeModule("_root_/cached-page"),
			cache: { client: { staleTime: 10_000 } },
		}

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/cached-page") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: modWithStaleTime }))
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "initial", matchId: "_root_/cached-page:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})

		/* First visit — new route, triggers parallel fetch */
		await navigate({ to: "/cached-page" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)

		mockFetchNDJSON.mockClear()

		/* Second visit — route already visited, staleTime = 10s, data still fresh */
		await navigate({ revalidate: false, to: "/cached-page" })
		expect(mockFetchNDJSON).not.toHaveBeenCalled()
	})

	it("module with staleTime: 0 always fetches on revisit", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const modZeroStale = {
			...makeModule("_root_/zero-stale"),
			cache: { client: { staleTime: 0 } },
		}

		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => {
			if (pathname === "/zero-stale") {
				return { params: {}, route: makeRoute("_root_/zero-stale") }
			}
			return { params: {}, route: makeRoute("_root_/other") }
		})
		mockLoadRouteModules.mockImplementation(async (pathname: string) => {
			if (pathname === "/zero-stale") {
				return makeLoadedModules({ page: modZeroStale })
			}
			return makeLoadedModules()
		})
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "data", matchId: "_root_/zero-stale:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})

		/* First visit */
		await navigate({ to: "/zero-stale" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)

		/* Navigate away so the same-URL guard does not short-circuit */
		mockFetchNDJSON.mockClear()
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })
		await navigate({ to: "/other" })
		mockFetchNDJSON.mockClear()

		/* Revisit — staleTime is 0, isStale returns true, triggers fetch */
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "data2", matchId: "_root_/zero-stale:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})
		await navigate({ to: "/zero-stale" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)
	})

	it("module with no staleTime defaults to 0 — fetches on revisit", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => {
			if (pathname === "/no-stale") {
				return { params: {}, route: makeRoute("_root_/no-stale") }
			}
			return { params: {}, route: makeRoute("_root_/away") }
		})
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d", matchId: "_root_/home:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})

		/* First visit */
		await navigate({ to: "/no-stale" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)

		/* Navigate away to avoid same-URL guard */
		mockFetchNDJSON.mockClear()
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })
		await navigate({ to: "/away" })
		mockFetchNDJSON.mockClear()

		/* Revisit — default staleTime is 0, always stale */
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d2", matchId: "_root_/home:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})
		await navigate({ to: "/no-stale" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)
	})
})

/* ------------------------------------------------------------------ */
/*  loaderDeps staleness                                              */
/* ------------------------------------------------------------------ */
describe("loaderDeps staleness", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockFetchNDJSON.mockReset()
		mockMatchRoute.mockReset()
		mockLoadRouteModules.mockReset()
		resetLocation()
	})

	afterEach(() => {
		resetNavigationState()
		resetLocation()
	})

	it("different loaderDeps result produces different matchId and triggers fetch", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		let depsValue: string[] = ["a"]
		const modWithDeps = {
			...makeModule("_root_/deps-page"),
			cache: { client: { staleTime: 60_000 } },
			effectsConfig: {
				loaderDeps: () => depsValue,
			},
		}

		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => {
			if (pathname === "/deps-page") {
				return { params: {}, route: makeRoute("_root_/deps-page") }
			}
			return { params: {}, route: makeRoute("_root_/elsewhere") }
		})
		mockLoadRouteModules.mockImplementation(async (pathname: string) => {
			if (pathname === "/deps-page") {
				return makeLoadedModules({ page: modWithDeps })
			}
			return makeLoadedModules()
		})
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "data-a", matchId: `_root_/deps-page:{}:["a"]` }],
			perRouteHeads: [],
			success: true,
		})

		/* First visit — new route */
		await navigate({ to: "/deps-page" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)

		/* Navigate away to bypass same-URL guard */
		mockFetchNDJSON.mockClear()
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })
		await navigate({ to: "/elsewhere" })
		mockFetchNDJSON.mockClear()

		/* Change deps — produces different matchId, cache miss despite staleTime */
		depsValue = ["b"]
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "data-b", matchId: `_root_/deps-page:{}:["b"]` }],
			perRouteHeads: [],
			success: true,
		})

		await navigate({ to: "/deps-page" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)
	})

	it("same loaderDeps result reuses cache (no fetch when within staleTime)", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const modWithDeps = {
			...makeModule("_root_/same-deps"),
			cache: { client: { staleTime: 60_000 } },
			effectsConfig: {
				loaderDeps: () => ["stable"],
			},
		}

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/same-deps") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: modWithDeps }))
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "cached", matchId: `_root_/same-deps:{}:["stable"]` }],
			perRouteHeads: [],
			success: true,
		})

		/* First visit */
		await navigate({ to: "/same-deps" })
		mockFetchNDJSON.mockClear()

		/* Revisit — same deps, staleTime 60s, data fresh */
		await navigate({ to: "/same-deps" })
		expect(mockFetchNDJSON).not.toHaveBeenCalled()
	})

	it("no loaderDeps defaults to empty array — consistent matchId", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const modNoDeps = {
			...makeModule("_root_/no-deps"),
			cache: { client: { staleTime: 60_000 } },
		}

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/no-deps") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: modNoDeps }))
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "nd", matchId: "_root_/no-deps:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})

		/* First visit */
		await navigate({ to: "/no-deps" })
		mockFetchNDJSON.mockClear()

		/* Revisit — no deps = [] both times, same matchId, within staleTime */
		await navigate({ to: "/no-deps" })
		expect(mockFetchNDJSON).not.toHaveBeenCalled()
	})
})

/* ------------------------------------------------------------------ */
/*  visitedRoutes / initialRouteIds                                   */
/* ------------------------------------------------------------------ */
describe("visitedRoutes / initialRouteIds", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockFetchNDJSON.mockReset()
		mockMatchRoute.mockReset()
		mockLoadRouteModules.mockReset()
		resetLocation()
	})

	afterEach(() => {
		resetNavigationState()
		resetLocation()
	})

	it("setupNavigation with initialRouteIds pre-populates visitedRoutes (sequential load)", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, {
			initialRouteIds: ["_root_/home"],
		})

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/home") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({
			matches: [],
			perRouteHeads: [],
			success: true,
		})

		/*
		 * Navigate to /home — route is in visitedRoutes already,
		 * so loadRouteModules runs BEFORE fetchNDJSON (sequential path).
		 * Verify loadRouteModules is called first, then fetchNDJSON.
		 */
		const callOrder: string[] = []
		mockLoadRouteModules.mockImplementation(() => {
			callOrder.push("modules")
			return Promise.resolve(makeLoadedModules())
		})
		mockFetchNDJSON.mockImplementation(() => {
			callOrder.push("fetch")
			return Promise.resolve({ matches: [], perRouteHeads: [], success: true })
		})

		await navigate({ to: "/home" })

		/* Sequential: modules loaded first, then stale check decides fetch */
		expect(callOrder[0]).toBe("modules")
	})

	it("first visit to new route triggers parallel fetch (modules + data simultaneously)", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/brand-new") })

		/*
		 * For a new (unvisited) route, navigate does Promise.all([loadRouteModules, fetchNDJSON]).
		 * Track that both are called before either resolves.
		 */
		let modulesStarted = false
		let fetchStarted = false
		let fetchStartedBeforeModulesResolved = false

		mockLoadRouteModules.mockImplementation(async () => {
			modulesStarted = true
			/* Yield to allow fetch to start */
			await new Promise((r) => setTimeout(r, 0))
			fetchStartedBeforeModulesResolved = fetchStarted
			return makeLoadedModules()
		})

		mockFetchNDJSON.mockImplementation(async () => {
			fetchStarted = true
			return { matches: [], perRouteHeads: [], success: true }
		})

		await navigate({ to: "/brand-new" })

		expect(modulesStarted).toBe(true)
		expect(fetchStarted).toBe(true)
		expect(fetchStartedBeforeModulesResolved).toBe(true)
	})
})

/* ------------------------------------------------------------------ */
/*  Popstate scroll restore                                           */
/* ------------------------------------------------------------------ */
describe("popstate scroll restore", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockFetchNDJSON.mockReset()
		mockMatchRoute.mockReset()
		mockLoadRouteModules.mockReset()
		mockScrollToTop.mockReset()
		mockRestoreScroll.mockReset()
		resetLocation()
	})

	afterEach(() => {
		resetNavigationState()
		resetLocation()
	})

	it("_restoreScroll with saved position schedules restoreScroll in rAF", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/scroll-back") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })

		/* Simulate popstate-triggered navigate with saved scroll */
		await navigate({
			_popstate: true,
			_restoreScroll: { x: 0, y: 300 },
			revalidate: true,
			scroll: false,
			to: "/scroll-back",
		})

		/* restoreScroll is called inside double requestAnimationFrame */
		await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
		expect(mockRestoreScroll).toHaveBeenCalledWith({ x: 0, y: 300 }, "auto")
		expect(mockScrollToTop).not.toHaveBeenCalled()
	})

	it("_restoreScroll null schedules scrollToTop in rAF", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/scroll-null") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })

		await navigate({
			_popstate: true,
			_restoreScroll: null,
			revalidate: true,
			scroll: false,
			to: "/scroll-null",
		})

		await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
		expect(mockScrollToTop).toHaveBeenCalled()
		expect(mockRestoreScroll).not.toHaveBeenCalled()
	})

	it("popstate navigate uses revalidate: true", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/pop-target") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "pop-data", matchId: "_root_/pop-target:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})

		/*
		 * Pre-populate visitedRoutes and cache so that without revalidate
		 * the navigation would be a no-op or cache hit.
		 */
		await navigate({ to: "/pop-target" })
		mockFetchNDJSON.mockClear()

		/* Simulate popstate (revalidate: true forces refetch) */
		await navigate({
			_popstate: true,
			_restoreScroll: null,
			revalidate: true,
			scroll: false,
			to: "/pop-target",
		})

		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)
	})
})

/* ------------------------------------------------------------------ */
/*  shouldRefetch callback                                            */
/* ------------------------------------------------------------------ */
describe("shouldRefetch callback", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockFetchNDJSON.mockReset()
		mockMatchRoute.mockReset()
		mockLoadRouteModules.mockReset()
		resetLocation()
	})

	afterEach(() => {
		resetNavigationState()
		resetLocation()
	})

	it("shouldRefetch returning true forces fetch even within staleTime", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const modRefetch = {
			...makeModule("_root_/refetch-page"),
			cache: { client: { staleTime: 60_000 } },
			effectsConfig: { shouldRefetch: () => true },
		}

		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => {
			if (pathname === "/refetch-page") {
				return { params: {}, route: makeRoute("_root_/refetch-page") }
			}
			return { params: {}, route: makeRoute("_root_/other") }
		})
		mockLoadRouteModules.mockImplementation(async (pathname: string) => {
			if (pathname === "/refetch-page") {
				return makeLoadedModules({ page: modRefetch })
			}
			return makeLoadedModules()
		})
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d1", matchId: "_root_/refetch-page:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})

		/* First visit — parallel fetch (new route) */
		await navigate({ to: "/refetch-page" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)

		/* Navigate away to bypass same-URL guard */
		mockFetchNDJSON.mockClear()
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })
		await navigate({ to: "/other" })
		mockFetchNDJSON.mockClear()

		/* Revisit — staleTime 60s but shouldRefetch forces fetch */
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d2", matchId: "_root_/refetch-page:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})
		await navigate({ to: "/refetch-page" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)
	})

	it("shouldRefetch returning false respects staleTime (no fetch when fresh)", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const modNoRefetch = {
			...makeModule("_root_/no-refetch"),
			cache: { client: { staleTime: 60_000 } },
			effectsConfig: { shouldRefetch: () => false },
		}

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/no-refetch") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: modNoRefetch }))
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d1", matchId: "_root_/no-refetch:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})

		/* First visit */
		await navigate({ to: "/no-refetch" })
		mockFetchNDJSON.mockClear()

		/* Revisit — shouldRefetch false + within staleTime → no fetch */
		await navigate({ to: "/no-refetch" })
		expect(mockFetchNDJSON).not.toHaveBeenCalled()
	})

	it("shouldRefetch receives correct location.current and location.next", async () => {
		const shouldRefetchSpy = vi.fn(() => false)

		const ctx = makeCtx({
			location: () => ({
				hash: "",
				params: {},
				pathname: "/origin",
				search: {},
				url: new URL("http://localhost/origin"),
				variablePath: "",
				virtualPath: "",
			}),
		})
		setupNavigation(ctx, mockLoadRouteModules)

		const modSpy = {
			...makeModule("_root_/target"),
			cache: { client: { staleTime: 60_000 } },
			effectsConfig: { shouldRefetch: shouldRefetchSpy },
		}

		mockMatchRoute.mockReturnValue({ params: { id: "42" }, route: makeRoute("_root_/target") })
		mockLoadRouteModules.mockResolvedValue(
			makeLoadedModules({ page: modSpy, params: { id: "42" } }),
		)
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d1", matchId: '_root_/target:{"id":"42"}:[]' }],
			perRouteHeads: [],
			success: true,
		})

		/* First visit — new route, parallel path, shouldRefetch not called */
		await navigate({ to: "/target" })
		shouldRefetchSpy.mockClear()

		/* Second visit — sequential path, shouldRefetch IS called */
		await navigate({ to: "/target?q=test" })

		expect(shouldRefetchSpy).toHaveBeenCalledTimes(1)
		const arg = shouldRefetchSpy.mock.calls[0] as unknown as [
			{
				location: {
					current: { pathname: string }
					next: {
						params: Record<string, string | string[]>
						pathname: string
						search: SearchParams
					}
				}
			},
		]
		expect(arg[0].location.current.pathname).toBe("/origin")
		expect(arg[0].location.next.pathname).toBe("/target")
		expect(arg[0].location.next.params).toEqual({ id: "42" })
		expect(arg[0].location.next.search).toEqual({ q: "test" })
	})
})

/* ------------------------------------------------------------------ */
/*  prefetch() + navigate() cache reuse                               */
/* ------------------------------------------------------------------ */
describe("prefetch → navigate cache reuse", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockFetchNDJSON.mockReset()
		mockMatchRoute.mockReset()
		mockLoadRouteModules.mockReset()
		resetLocation()
	})

	afterEach(() => {
		resetNavigationState()
		resetLocation()
	})

	it("prefetch() calls loadRouteModules with correct pathname", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/prefetched") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "pf", matchId: "_root_/prefetched:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})

		const { prefetch: doPrefetch } = await import("../../../src/navigation")
		await doPrefetch({ to: "/prefetched" })

		expect(mockLoadRouteModules).toHaveBeenCalledWith("/prefetched", ctx.routeTree, ctx.layouts)
	})

	it("after prefetch(), navigate() reuses matchCache (no extra fetch when within staleTime)", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const modWithStale = {
			...makeModule("_root_/pf-target"),
			cache: { client: { staleTime: 60_000 } },
		}

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/pf-target") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: modWithStale }))
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "prefetched-data", matchId: "_root_/pf-target:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})

		/* Prefetch populates matchCache */
		const { prefetch: doPrefetch } = await import("../../../src/navigation")
		await doPrefetch({ to: "/pf-target" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)

		mockFetchNDJSON.mockClear()

		/* Also need to pre-populate visitedRoutes so navigate takes sequential path */
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/pf-target") })

		/* First visit: new route → parallel fetch (visitedRoutes doesn't have it yet) */
		mockFetchNDJSON.mockResolvedValue({
			matches: [],
			perRouteHeads: [],
			success: true,
		})
		await navigate({ to: "/pf-target" })

		/*
		 * Parallel path fetches unconditionally, so clear and test revisit.
		 * Now "_root_/pf-target" is in visitedRoutes and cache is populated.
		 */
		mockFetchNDJSON.mockClear()

		/* Navigate away to bypass same-URL guard */
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/away") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })
		await navigate({ to: "/away" })
		mockFetchNDJSON.mockClear()

		/* Revisit — sequential path, matchCache has entry within staleTime → no fetch */
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/pf-target") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: modWithStale }))
		await navigate({ to: "/pf-target" })
		expect(mockFetchNDJSON).not.toHaveBeenCalled()
	})

	it("prefetch() error deletes prefetchCache marker (allows retry)", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		mockLoadRouteModules.mockRejectedValue(new Error("network error"))
		mockFetchNDJSON.mockRejectedValue(new Error("network error"))

		const { prefetch: doPrefetch } = await import("../../../src/navigation")
		await doPrefetch({ to: "/fail-target" })

		/* Marker should be deleted — shouldPrefetch returns true (can retry) */
		expect(ctx.prefetchCache.shouldPrefetch("http://localhost/fail-target", 30_000)).toBe(true)
	})
})

/* ------------------------------------------------------------------ */
/*  SPA navigation blocker                                             */
/* ------------------------------------------------------------------ */
describe("SPA navigation blocker", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockFetchNDJSON.mockReset()
		mockMatchRoute.mockReset()
		mockLoadRouteModules.mockReset()
		resetLocation()
	})

	afterEach(() => {
		resetNavigationState()
		resetLocation()
	})

	it("active blocker prevents navigate and calls onBlocked callback", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const onBlocked = vi.fn()
		const { setActiveBlocker } = await import("../../../src/navigation")
		setActiveBlocker(() => true, onBlocked)

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/blocked") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })

		await navigate({ to: "/blocked" })

		/* Navigation should be blocked — fetchNDJSON not called */
		expect(mockFetchNDJSON).not.toHaveBeenCalled()
		expect(onBlocked).toHaveBeenCalledTimes(1)
	})

	it("blocker returning false allows navigation through", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const { setActiveBlocker } = await import("../../../src/navigation")
		setActiveBlocker(() => false)

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/allowed") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })

		await navigate({ to: "/allowed" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)
	})

	it("proceedPendingNavigation resumes blocked navigation", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const { proceedPendingNavigation, setActiveBlocker } = await import("../../../src/navigation")
		setActiveBlocker(() => true)

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/proceed-target") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })

		/* Block first navigate */
		await navigate({ to: "/proceed-target" })
		expect(mockFetchNDJSON).not.toHaveBeenCalled()

		/* Clear blocker then proceed */
		setActiveBlocker(null)
		proceedPendingNavigation()
		await new Promise((r) => setTimeout(r, 0))

		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)
	})

	it("clearPendingNavigation discards blocked navigation", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const { clearPendingNavigation, proceedPendingNavigation, setActiveBlocker } =
			await import("../../../src/navigation")
		setActiveBlocker(() => true)

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/discard-target") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })

		await navigate({ to: "/discard-target" })

		/* Clear pending, then proceed — should be no-op */
		clearPendingNavigation()
		setActiveBlocker(null)
		proceedPendingNavigation()
		await new Promise((r) => setTimeout(r, 0))

		expect(mockFetchNDJSON).not.toHaveBeenCalled()
	})

	it("popstate navigation bypasses SPA blocker", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const { setActiveBlocker } = await import("../../../src/navigation")
		setActiveBlocker(() => true)

		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/popstate") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })

		/* _popstate navigations skip the blocker check */
		await navigate({
			_popstate: true,
			_restoreScroll: null,
			revalidate: true,
			scroll: false,
			to: "/popstate",
		})

		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)
	})

	it("resetNavigationState clears active blocker", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const { setActiveBlocker } = await import("../../../src/navigation")
		setActiveBlocker(() => true)

		/* Reset clears blocker */
		resetNavigationState()

		/* Re-setup to make navigate work */
		setupNavigation(ctx, mockLoadRouteModules)
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/after-reset") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })

		await navigate({ to: "/after-reset" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)
	})
})

/* ------------------------------------------------------------------ */
/*  router-level cache defaults                                       */
/* ------------------------------------------------------------------ */
describe("router-level cache defaults", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockFetchNDJSON.mockReset()
		mockMatchRoute.mockReset()
		mockLoadRouteModules.mockReset()
		resetLocation()
	})

	afterEach(() => {
		resetNavigationState()
		resetLocation()
	})

	it("uses router staleTime when route has no staleTime", async () => {
		const ctx = makeCtx({ routerCacheDefaults: { staleTime: 10_000 } })
		setupNavigation(ctx, mockLoadRouteModules)

		/* Module WITHOUT staleTime — should inherit router default 10s */
		const mod = makeModule("_root_/router-default")
		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => {
			if (pathname === "/router-default") {
				return { params: {}, route: makeRoute("_root_/router-default") }
			}
			return { params: {}, route: makeRoute("_root_/away") }
		})
		mockLoadRouteModules.mockImplementation(async (pathname: string) => {
			if (pathname === "/router-default") {
				return makeLoadedModules({ page: mod })
			}
			return makeLoadedModules()
		})
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d1", matchId: "_root_/router-default:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})

		/* First visit — new route, parallel fetch */
		await navigate({ to: "/router-default" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)

		/* Navigate away to defeat same-URL guard */
		mockFetchNDJSON.mockClear()
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })
		await navigate({ to: "/away" })
		mockFetchNDJSON.mockClear()

		/* Revisit — visited route, within router staleTime 10s, should NOT fetch */
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d2", matchId: "_root_/router-default:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})
		await navigate({ to: "/router-default" })
		expect(mockFetchNDJSON).not.toHaveBeenCalled()
	})

	it("route staleTime overrides router default", async () => {
		const ctx = makeCtx({ routerCacheDefaults: { staleTime: 60_000 } })
		setupNavigation(ctx, mockLoadRouteModules)

		/* Module with explicit staleTime: 0 — overrides router 60s */
		const mod = {
			...makeModule("_root_/route-override"),
			cache: { client: { staleTime: 0 } },
		}

		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => {
			if (pathname === "/route-override") {
				return { params: {}, route: makeRoute("_root_/route-override") }
			}
			return { params: {}, route: makeRoute("_root_/other") }
		})
		mockLoadRouteModules.mockImplementation(async (pathname: string) => {
			if (pathname === "/route-override") {
				return makeLoadedModules({ page: mod })
			}
			return makeLoadedModules()
		})
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d", matchId: "_root_/route-override:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})

		/* First visit */
		await navigate({ to: "/route-override" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)

		/* Away */
		mockFetchNDJSON.mockClear()
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })
		await navigate({ to: "/other" })
		mockFetchNDJSON.mockClear()

		/* Revisit — route staleTime: 0 means always stale, despite router 60s */
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d2", matchId: "_root_/route-override:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/route-override") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: mod }))

		await navigate({ to: "/route-override" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)
	})

	it("client: false ignores router staleTime default", async () => {
		const ctx = makeCtx({ routerCacheDefaults: { staleTime: 60_000 } })
		setupNavigation(ctx, mockLoadRouteModules)

		/* Module with client: false — explicitly disables client cache */
		const mod = {
			...makeModule("_root_/no-client"),
			cache: { client: false as const },
		}

		mockMatchRoute.mockImplementation((_tree: unknown, pathname: string) => {
			if (pathname === "/no-client") {
				return { params: {}, route: makeRoute("_root_/no-client") }
			}
			return { params: {}, route: makeRoute("_root_/other") }
		})
		mockLoadRouteModules.mockImplementation(async (pathname: string) => {
			if (pathname === "/no-client") {
				return makeLoadedModules({ page: mod })
			}
			return makeLoadedModules()
		})
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d", matchId: "_root_/no-client:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})

		await navigate({ to: "/no-client" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)

		/* Away */
		mockFetchNDJSON.mockClear()
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [], success: true })
		await navigate({ to: "/other" })
		mockFetchNDJSON.mockClear()

		/* Revisit — client: false means staleTime 0, always refetch */
		mockFetchNDJSON.mockResolvedValue({
			matches: [{ loaderData: "d2", matchId: "_root_/no-client:{}:[]" }],
			perRouteHeads: [],
			success: true,
		})
		mockMatchRoute.mockReturnValue({ params: {}, route: makeRoute("_root_/no-client") })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules({ page: mod }))

		await navigate({ to: "/no-client" })
		expect(mockFetchNDJSON).toHaveBeenCalledTimes(1)
	})
})
