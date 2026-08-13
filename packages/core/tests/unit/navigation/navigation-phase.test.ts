/**
 * NavigationPhase: phase-aware navigation signals.
 *
 * navigate() → "loading" → VT starts → "transitioning" → VT finished → "idle"
 *                           no VT path → "idle" directly
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts"
import type { LoadedRouteModules } from "../../../src/navigation/types.ts"
import type {
	FlareProviderContext,
	NavigateOptions,
	NavigationPhase,
} from "../../../src/outlet/types.ts"
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

import { navigate, resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts"
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts"
import { matchRoute } from "../../../src/router-primitives/index.ts"

const mockFetchNDJSON = fetchNDJSON as ReturnType<typeof vi.fn>
const mockMatchRoute = matchRoute as ReturnType<typeof vi.fn>

function makeFakeTree(): TreeNode {
	return { s: {} }
}

function makeModule(virtualPath: string, type: "layout" | "render" = "render") {
	return { _type: type, render: () => null, variablePath: "", virtualPath }
}

function makeLoadedModules(overrides?: Partial<LoadedRouteModules>): LoadedRouteModules {
	return {
		layouts: [],
		page: makeModule("_root_/target"),
		params: {},
		...overrides,
	}
}

function makeRoute(virtualPath: string) {
	return { e: "", o: {}, p: vi.fn(), t: "r", v: "", x: virtualPath }
}

interface Deferred<T = void> {
	promise: Promise<T>
	reject: (e: Error) => void
	resolve: (v: T) => void
}

function createDeferred<T = void>(): Deferred<T> {
	let resolveFn: (v: T) => void = () => {}
	let rejectFn: (e: Error) => void = () => {}
	const promise = new Promise<T>((res, rej) => {
		resolveFn = res
		rejectFn = rej
	})
	return { promise, reject: rejectFn, resolve: resolveFn }
}

function makeCtx(overrides?: Partial<FlareProviderContext>): FlareProviderContext {
	let matches: FlareProviderContext["matches"] extends () => infer R ? R : never = []
	let params: Record<string, string | string[]> = {}
	let search: SearchParams = {}
	let navigationPhase: NavigationPhase = "idle"
	let notFound = false
	let hydrated = false
	let viewTransition: {
		finished: Promise<void>
		ready: Promise<void>
		skipTransition: () => void
		updateCallbackDone: Promise<void>
	} | null = null

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
		setNavigationPhase: (v: NavigationPhase) => {
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
		setViewTransition: (vt) => {
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

function makeVTMock(finished: Deferred) {
	return (arg: (() => void) | { update: () => void }) => {
		const updateFn = typeof arg === "function" ? arg : arg.update
		updateFn()
		return {
			finished: finished.promise,
			ready: Promise.resolve(),
			skipTransition: () => {},
			updateCallbackDone: Promise.resolve(),
		}
	}
}

function withVT(fn: (...args: never[]) => unknown): () => void {
	const origStartVT = document.startViewTransition
	;(document as unknown as Record<string, unknown>).startViewTransition = fn
	return () => {
		if (origStartVT) {
			;(document as unknown as Record<string, unknown>).startViewTransition = origStartVT
		} else {
			delete (document as unknown as Record<string, unknown>).startViewTransition
		}
	}
}

describe("navigationPhase signal", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockLoadRouteModules.mockReset()
	})

	afterEach(() => {
		resetNavigationState()
		resetLocation()
	})

	it("navigationPhase starts as idle", () => {
		const ctx = makeCtx()
		expect(ctx.navigationPhase()).toBe("idle")
	})

	it("navigationPhase becomes loading when navigate starts", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true })

		const route = makeRoute("_root_/target")
		mockMatchRoute.mockReturnValue({ params: {}, route })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		let phaseBeforeVT: NavigationPhase | null = null

		const cleanup = withVT((arg: unknown) => {
			phaseBeforeVT = ctx.navigationPhase()
			const updateFn = typeof arg === "function" ? arg : (arg as { update: () => void }).update
			updateFn()
			return {
				finished: Promise.resolve(),
				ready: Promise.resolve(),
				skipTransition: () => {},
				updateCallbackDone: Promise.resolve(),
			}
		})

		await navigate({ to: "/target" })
		await new Promise((r) => setTimeout(r, 10))
		expect(phaseBeforeVT).toBe("loading")

		cleanup()
	})

	it("navigationPhase becomes transitioning when VT starts", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true })

		const route = makeRoute("_root_/target")
		mockMatchRoute.mockReturnValue({ params: {}, route })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		const finished = createDeferred()
		const cleanup = withVT(makeVTMock(finished))

		const navPromise = navigate({ to: "/target" })

		await new Promise((r) => setTimeout(r, 50))
		expect(ctx.navigationPhase()).toBe("transitioning")

		finished.resolve(undefined as never)
		await navPromise
		await new Promise((r) => setTimeout(r, 10))
		expect(ctx.navigationPhase()).toBe("idle")

		cleanup()
	})

	it("navigationPhase returns to idle when VT finishes", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true })

		const route = makeRoute("_root_/target")
		mockMatchRoute.mockReturnValue({ params: {}, route })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		const finished = createDeferred()
		const cleanup = withVT(makeVTMock(finished))

		const navPromise = navigate({ to: "/target" })
		await new Promise((r) => setTimeout(r, 50))

		expect(ctx.navigationPhase()).toBe("transitioning")

		finished.resolve(undefined as never)
		await navPromise
		await new Promise((r) => setTimeout(r, 10))

		expect(ctx.navigationPhase()).toBe("idle")

		cleanup()
	})

	it("isNavigating derived from phase", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true })

		const route = makeRoute("_root_/target")
		mockMatchRoute.mockReturnValue({ params: {}, route })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		expect(ctx.isNavigating()).toBe(false)

		const finished = createDeferred()
		const cleanup = withVT(makeVTMock(finished))

		const navPromise = navigate({ to: "/target" })
		await new Promise((r) => setTimeout(r, 50))

		expect(ctx.navigationPhase()).not.toBe("idle")
		expect(ctx.isNavigating()).toBe(true)

		finished.resolve(undefined as never)
		await navPromise
		await new Promise((r) => setTimeout(r, 10))

		expect(ctx.isNavigating()).toBe(false)

		cleanup()
	})

	it("viewTransition accessor exposes browser VT object during transition", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true })

		const route = makeRoute("_root_/target")
		mockMatchRoute.mockReturnValue({ params: {}, route })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		expect(ctx.viewTransition()).toBeNull()

		const finished = createDeferred()
		const cleanup = withVT(makeVTMock(finished))

		const navPromise = navigate({ to: "/target" })
		await new Promise((r) => setTimeout(r, 50))

		expect(ctx.viewTransition()).not.toBeNull()

		finished.resolve(undefined as never)
		await navPromise
		await new Promise((r) => setTimeout(r, 10))

		expect(ctx.viewTransition()).toBeNull()

		cleanup()
	})

	it("no VT: phase goes loading → idle (skip transitioning)", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const route = makeRoute("_root_/target")
		mockMatchRoute.mockReturnValue({ params: {}, route })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		const origStartVT = document.startViewTransition
		delete (document as unknown as Record<string, unknown>).startViewTransition

		const phases: NavigationPhase[] = []
		const origSetPhase = ctx.setNavigationPhase
		ctx.setNavigationPhase = (v: NavigationPhase) => {
			phases.push(v)
			origSetPhase(v)
		}

		await navigate({ to: "/target" })

		expect(phases).toContain("loading")
		expect(phases).toContain("idle")
		expect(phases).not.toContain("transitioning")

		if (origStartVT) {
			;(document as unknown as Record<string, unknown>).startViewTransition = origStartVT
		}
	})

	it("abort resets phase to idle", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules)

		const route = makeRoute("_root_/target")
		mockMatchRoute.mockReturnValue({ params: {}, route })

		const firstDeferred = createDeferred<LoadedRouteModules>()
		mockLoadRouteModules.mockImplementationOnce(() => firstDeferred.promise)
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		const origStartVT = document.startViewTransition
		delete (document as unknown as Record<string, unknown>).startViewTransition

		const firstNav = navigate({ to: "/target" })
		await new Promise((r) => setTimeout(r, 10))
		expect(ctx.navigationPhase()).toBe("loading")

		const secondNav = navigate({ to: "/target?v=2" })
		await new Promise((r) => setTimeout(r, 10))

		firstDeferred.resolve(makeLoadedModules())
		await Promise.all([firstNav, secondNav]).catch(() => {})

		expect(ctx.navigationPhase()).toBe("idle")

		if (origStartVT) {
			;(document as unknown as Record<string, unknown>).startViewTransition = origStartVT
		}
	})

	it("VT finished rejection resets phase to idle", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true })

		const route = makeRoute("_root_/target")
		mockMatchRoute.mockReturnValue({ params: {}, route })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		const finished = createDeferred()
		const cleanup = withVT(makeVTMock(finished))

		const navPromise = navigate({ to: "/target" })
		await new Promise((r) => setTimeout(r, 50))

		expect(ctx.navigationPhase()).toBe("transitioning")

		finished.reject(new Error("VT aborted"))
		await navPromise.catch(() => {})
		await new Promise((r) => setTimeout(r, 10))

		expect(ctx.navigationPhase()).toBe("idle")

		cleanup()
	})
})
