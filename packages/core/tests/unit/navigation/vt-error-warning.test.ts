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
		page: makeModule("_root_/home"),
		params: {},
		...overrides,
	}
}

function makeRoute(virtualPath: string) {
	return { e: "", o: {}, p: vi.fn(), t: "r", v: "", x: virtualPath }
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

describe("B2: view transition error warnings", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockLoadRouteModules.mockReset()
	})

	afterEach(() => {
		resetNavigationState()
		resetLocation()
	})

	it("VT API failure calls warn() and update() still runs", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true })

		const route = makeRoute("_root_/about")
		mockMatchRoute.mockReturnValue({ params: {}, route })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		const vtError = new Error("VT not supported")
		const origStartVT = document.startViewTransition
		;(document as unknown as Record<string, unknown>).startViewTransition = () => {
			throw vtError
		}

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

		await navigate({ to: "/about" })

		/* warn("nav", ...) was called with the caught error */
		expect(warnSpy).toHaveBeenCalledWith("[flare:nav]", "view transition API failed", vtError)

		/* update() still ran — navigation completed */
		expect(ctx.isNavigating()).toBe(false)

		if (origStartVT) {
			;(document as unknown as Record<string, unknown>).startViewTransition = origStartVT
		} else {
			delete (document as unknown as Record<string, unknown>).startViewTransition
		}
	})

	it("transition.finished rejection calls warn() and phase → idle", async () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { viewTransitions: true })

		const route = makeRoute("_root_/contact")
		mockMatchRoute.mockReturnValue({ params: {}, route })
		mockLoadRouteModules.mockResolvedValue(makeLoadedModules())
		mockFetchNDJSON.mockResolvedValue({ matches: [], perRouteHeads: [] })

		const finishedError = new DOMException("Transition aborted", "AbortError")
		let updateCb: (() => void) | undefined
		const origStartVT = document.startViewTransition
		;(document as unknown as Record<string, unknown>).startViewTransition = (
			arg: (() => void) | { update: () => void },
		) => {
			const update = typeof arg === "function" ? arg : arg.update
			updateCb = update
			const transition = {
				finished: Promise.reject(finishedError),
				ready: Promise.resolve(),
				skipTransition: vi.fn(),
				updateCallbackDone: Promise.resolve().then(() => {
					if (updateCb) updateCb()
				}),
			}
			/* Prevent unhandled rejection from finished */
			transition.finished.catch(() => {})
			return transition
		}

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

		await navigate({ to: "/contact" })

		/* Allow microtask for finished rejection handler */
		await new Promise<void>((r) => setTimeout(r, 10))

		/* warn was called for the finished rejection */
		expect(warnSpy).toHaveBeenCalledWith(
			"[flare:nav]",
			"view transition finished with error",
			finishedError,
		)

		/* Phase should be idle */
		expect(ctx.navigationPhase()).toBe("idle")

		if (origStartVT) {
			;(document as unknown as Record<string, unknown>).startViewTransition = origStartVT
		} else {
			delete (document as unknown as Record<string, unknown>).startViewTransition
		}
	})
})
