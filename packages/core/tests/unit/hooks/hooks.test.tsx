import { createMemo, createSignal } from "solid-js"
import { render } from "solid-js/web"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
	useBlocker,
	useLoaderData,
	useLoaderT,
	useLocation,
	useMatch,
	useNavigate,
	useParams,
	usePreloaderContext,
	usePreloaderT,
	useSearch,
} from "../../../src/hooks.ts"
import { RouterContext } from "../../../src/outlet/index.tsx"
import type { FlareProviderContext } from "../../../src/outlet/types.ts"

/* ── Mock context factory ────────────────────────────────── */

function createMockContext(overrides?: Partial<FlareProviderContext>): FlareProviderContext {
	const [matches, setMatches] = createSignal([
		{
			_type: "render" as const,
			loaderData: { count: 42, t: { common: { hello: "Hello" } } },
			preloaderContext: { t: { meta: { title: "Test" } }, theme: "dark" },
			render: () => null,
			variablePath: "/test",
			virtualPath: "_root_/test",
		},
	])
	const [params, setParams] = createSignal<Record<string, string | string[]>>({
		id: "123",
		slug: "hello-world",
	})
	const [search, setSearch] = createSignal<Record<string, string | string[]>>({
		page: "2",
		q: "foo",
	})
	const [notFound, setNotFound] = createSignal(false)
	const [hydrated, setHydrated] = createSignal(true)
	const [navigationPhase, setNavigationPhase] = createSignal<"idle" | "loading" | "transitioning">(
		"idle",
	)
	const isNavigating = createMemo(() => navigationPhase() !== "idle")
	const [intercepted, setIntercepted] = createSignal(null)
	const [viewTransition, setViewTransition] = createSignal(null)
	const navigateFn = vi.fn(() => Promise.resolve())
	const prefetchFn = vi.fn(() => Promise.resolve())

	const location = createMemo(() => ({
		hash: "",
		params: params(),
		pathname: "/test",
		search: search(),
		url: new URL("http://localhost/test"),
		variablePath: "/test",
		virtualPath: "_root_/test",
	}))

	return {
		caseSensitive: false,
		hydrated,
		intercepted: intercepted as FlareProviderContext["intercepted"],
		invalidate: vi.fn(),
		isNavigating,
		layouts: {},
		localeConfig: { defaultLocale: "en", locales: ["en", "de"], paramName: "locale" },
		location,
		matchCache: {
			clear: vi.fn(),
			get: vi.fn(),
			getAll: vi.fn(() => []),
			invalidate: vi.fn(),
			set: vi.fn(),
		} as unknown as FlareProviderContext["matchCache"],
		matches,
		navigate: navigateFn,
		navigationPhase,
		notFound,
		params,
		prefetch: prefetchFn,
		prefetchCache: {
			clear: vi.fn(),
			size: vi.fn(() => 0),
		} as unknown as FlareProviderContext["prefetchCache"],
		resolvers: new Map(),
		routeTree: { c: {}, p: "/" } as unknown as FlareProviderContext["routeTree"],
		search,
		setHydrated,
		setIntercepted: setIntercepted as FlareProviderContext["setIntercepted"],
		setMatches,
		setNavigationPhase,
		setNotFound,
		setParams,
		setSearch,
		setViewTransition: setViewTransition as FlareProviderContext["setViewTransition"],
		viewTransition: viewTransition as FlareProviderContext["viewTransition"],
		...overrides,
	}
}

/* ── Helpers ─────────────────────────────────────────────── */

let container: HTMLDivElement

function setup(): void {
	container = document.createElement("div")
	document.body.appendChild(container)
}

afterEach(() => {
	if (container) container.remove()
})

function renderWithRouter(fn: () => null, ctx?: FlareProviderContext): void {
	const context = ctx ?? createMockContext()
	render(() => <RouterContext.Provider value={context}>{fn()}</RouterContext.Provider>, container)
}

/* ── useLoaderData ───────────────────────────────────────── */

describe("useLoaderData", () => {
	it("H1: returns loader data for matching virtualPath", () => {
		setup()
		let result: unknown
		renderWithRouter(() => {
			const data = useLoaderData({ from: "_root_/test" as never })
			result = data()
			return null
		})
		expect(result).toEqual({ count: 42, t: { common: { hello: "Hello" } } })
	})

	it("H2: returns undefined for non-matching virtualPath", () => {
		setup()
		let result: unknown = "not-called"
		renderWithRouter(() => {
			const data = useLoaderData({ from: "_root_/nonexistent" as never })
			result = data()
			return null
		})
		expect(result).toBeUndefined()
	})
})

/* ── useLoaderT ──────────────────────────────────────────── */

describe("useLoaderT", () => {
	it("H3: returns translator function", () => {
		setup()
		let t: unknown
		renderWithRouter(() => {
			t = useLoaderT({ from: "_root_/test" as never })
			return null
		})
		expect(typeof t).toBe("function")
	})
})

/* ── useLocation ─────────────────────────────────────────── */

describe("useLocation", () => {
	it("H4: returns location accessor with pathname", () => {
		setup()
		let pathname: string | undefined
		renderWithRouter(() => {
			const loc = useLocation()
			pathname = loc().pathname
			return null
		})
		expect(pathname).toBe("/test")
	})

	it("H5: location includes params and search", () => {
		setup()
		let loc: { params?: unknown; search?: unknown } = {}
		renderWithRouter(() => {
			const l = useLocation()
			loc = l()
			return null
		})
		expect(loc.params).toEqual({ id: "123", slug: "hello-world" })
		expect(loc.search).toEqual({ page: "2", q: "foo" })
	})
})

/* ── useMatch ────────────────────────────────────────────── */

describe("useMatch", () => {
	it("H6: returns match for existing virtualPath", () => {
		setup()
		let match: unknown
		renderWithRouter(() => {
			const m = useMatch({ from: "_root_/test" as never })
			match = m()
			return null
		})
		expect(match).toBeDefined()
		expect((match as { virtualPath: string }).virtualPath).toBe("_root_/test")
	})

	it("H7: returns undefined for non-matching virtualPath", () => {
		setup()
		let match: unknown = "not-called"
		renderWithRouter(() => {
			const m = useMatch({ from: "_root_/nope" as never })
			match = m()
			return null
		})
		expect(match).toBeUndefined()
	})
})

/* ── useNavigate ─────────────────────────────────────────── */

describe("useNavigate", () => {
	it("H8: returns navigate function", () => {
		setup()
		let nav: unknown
		renderWithRouter(() => {
			nav = useNavigate()
			return null
		})
		expect(typeof nav).toBe("function")
	})
})

/* ── useParams ───────────────────────────────────────────── */

describe("useParams", () => {
	it("H9: returns params accessor", () => {
		setup()
		let params: unknown
		renderWithRouter(() => {
			const p = useParams({ from: "_root_/test" as never })
			params = p()
			return null
		})
		expect(params).toEqual({ id: "123", slug: "hello-world" })
	})
})

/* ── useSearch ───────────────────────────────────────────── */

describe("useSearch", () => {
	it("H10: returns search accessor", () => {
		setup()
		let search: unknown
		renderWithRouter(() => {
			const s = useSearch({ from: "_root_/test" as never })
			search = s()
			return null
		})
		expect(search).toEqual({ page: "2", q: "foo" })
	})
})

/* ── usePreloaderContext ─────────────────────────────────── */

describe("usePreloaderContext", () => {
	it("H11: returns preloader context for matching virtualPath", () => {
		setup()
		let ctx: unknown
		renderWithRouter(() => {
			const p = usePreloaderContext({ from: "_root_/test" as never })
			ctx = p()
			return null
		})
		expect(ctx).toEqual({ t: { meta: { title: "Test" } }, theme: "dark" })
	})

	it("H12: returns undefined for non-matching virtualPath", () => {
		setup()
		let ctx: unknown = "not-called"
		renderWithRouter(() => {
			const p = usePreloaderContext({ from: "_root_/missing" as never })
			ctx = p()
			return null
		})
		expect(ctx).toBeUndefined()
	})
})

/* ── usePreloaderT ───────────────────────────────────────── */

describe("usePreloaderT", () => {
	it("H13: returns translator function", () => {
		setup()
		let t: unknown
		renderWithRouter(() => {
			t = usePreloaderT({ from: "_root_/test" as never })
			return null
		})
		expect(typeof t).toBe("function")
	})
})

/* ── useBlocker ──────────────────────────────────────────── */

describe("useBlocker", () => {
	it("H14: returns blocker state with blocked, proceed, reset", () => {
		setup()
		let blocker: { blocked?: unknown; proceed?: unknown; reset?: unknown } = {}
		renderWithRouter(() => {
			blocker = useBlocker(() => false)
			return null
		})
		expect(typeof blocker.blocked).toBe("function")
		expect(typeof blocker.proceed).toBe("function")
		expect(typeof blocker.reset).toBe("function")
	})

	it("H15: blocked starts as false when condition is false", () => {
		setup()
		let isBlocked: boolean | undefined
		renderWithRouter(() => {
			const b = useBlocker(() => false)
			isBlocked = b.blocked()
			return null
		})
		expect(isBlocked).toBe(false)
	})
})
