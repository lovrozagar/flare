import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts"
import type { FlareProviderContext } from "../../../src/outlet/types.ts"
import type { TreeNode } from "../../../src/router-primitives/types.ts"
import type { SearchParams } from "../../../src/url/index.ts"

/* Mock dependencies that navigation imports */
vi.mock("../../../src/ndjson-client", () => ({
	fetchNDJSON: vi.fn(),
}))

vi.mock("../../../src/head-client", () => ({
	applyPerRouteHeads: vi.fn(),
}))

vi.mock("../../../src/router-primitives", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/router-primitives")>()
	return { ...original, matchRoute: vi.fn(), matchRoutePartial: vi.fn() }
})

vi.mock("../../../src/history", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/history")>()
	return {
		...original,
		restoreScroll: vi.fn(),
		scrollToTop: vi.fn(),
	}
})

import { resetNavigationState, setupNavigation } from "../../../src/navigation/index.ts"

function makeFakeTree(): TreeNode {
	return { s: {} }
}

function makeCtx(): FlareProviderContext {
	let navigationPhase: import("../../../src/outlet/types").NavigationPhase = "idle"
	let notFound = false
	let hydrated = false
	let search: SearchParams = {}
	let params: Record<string, string | string[]> = {}

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
		matches: () => [],
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
		setMatches: () => {},
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
		setViewTransition: () => {},
		viewTransition: () => null,
	}

	Object.defineProperty(ctx, "_setNavigate", {
		value: () => {},
	})
	Object.defineProperty(ctx, "_setPrefetch", {
		value: () => {},
	})

	return ctx
}

const mockLoadRouteModules = vi.fn()

describe("keepalive client-side", () => {
	let fetchSpy: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.useFakeTimers()
		fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
		vi.stubGlobal("fetch", fetchSpy)
	})

	afterEach(() => {
		resetNavigationState()
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it("setupNavigation with keepalive starts fetch interval", () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { keepalive: 5000 })

		expect(fetchSpy).not.toHaveBeenCalled()

		vi.advanceTimersByTime(5000)
		expect(fetchSpy).toHaveBeenCalledTimes(1)

		vi.advanceTimersByTime(5000)
		expect(fetchSpy).toHaveBeenCalledTimes(2)
	})

	it("fetch uses /_flare/keepalive with priority low", () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { keepalive: 5000 })

		vi.advanceTimersByTime(5000)
		expect(fetchSpy).toHaveBeenCalledWith("/_flare/keepalive", { priority: "low" })
	})

	it("pauses on visibilitychange hidden", () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { keepalive: 5000 })

		vi.advanceTimersByTime(5000)
		expect(fetchSpy).toHaveBeenCalledTimes(1)

		/* Simulate hidden */
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
		document.dispatchEvent(new Event("visibilitychange"))

		/* Advance past next interval — should NOT fire */
		vi.advanceTimersByTime(10000)
		expect(fetchSpy).toHaveBeenCalledTimes(1)
	})

	it("resumes + immediate ping on visibilitychange visible", () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { keepalive: 5000 })

		/* Go hidden */
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
		document.dispatchEvent(new Event("visibilitychange"))

		vi.advanceTimersByTime(10000)
		expect(fetchSpy).toHaveBeenCalledTimes(0)

		/* Go visible — should fire immediate ping */
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
		document.dispatchEvent(new Event("visibilitychange"))

		expect(fetchSpy).toHaveBeenCalledTimes(1)

		/* Normal interval resumes */
		vi.advanceTimersByTime(5000)
		expect(fetchSpy).toHaveBeenCalledTimes(2)
	})

	it("resetNavigationState clears interval and listener", () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { keepalive: 5000 })

		vi.advanceTimersByTime(5000)
		expect(fetchSpy).toHaveBeenCalledTimes(1)

		resetNavigationState()

		vi.advanceTimersByTime(10000)
		expect(fetchSpy).toHaveBeenCalledTimes(1)
	})

	it("no interval when keepalive is undefined", () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, {})

		vi.advanceTimersByTime(60000)
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it("no interval when keepalive is false", () => {
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { keepalive: false })

		vi.advanceTimersByTime(60000)
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it("fetch errors are silently caught", () => {
		fetchSpy.mockRejectedValue(new Error("network error"))
		const ctx = makeCtx()
		setupNavigation(ctx, mockLoadRouteModules, { keepalive: 5000 })

		/* Should not throw */
		vi.advanceTimersByTime(5000)
		expect(fetchSpy).toHaveBeenCalledTimes(1)

		/* Interval continues after error */
		vi.advanceTimersByTime(5000)
		expect(fetchSpy).toHaveBeenCalledTimes(2)
	})
})
