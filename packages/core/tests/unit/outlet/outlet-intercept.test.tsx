import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts"
import { InterceptOutlet } from "../../../src/intercept-outlet.ts"
import { RouterContext } from "../../../src/outlet/index.tsx"
import type { FlareProviderContext, InterceptedState } from "../../../src/outlet/types.ts"

function makeInterceptedState(overrides?: Partial<InterceptedState>): InterceptedState {
	return {
		backgroundLocation: {
			hash: "",
			params: {},
			pathname: "/products",
			search: {},
			url: new URL("http://localhost/products"),
			variablePath: "/products",
			virtualPath: "_root_/products/",
		},
		dismiss: vi.fn(),
		match: {
			_type: "render",
			loaderData: { name: "Widget" },
			render: () => null,
			variablePath: "/products/[id]",
			virtualPath: "_root_/products/[id]",
		},
		render: "modal",
		...overrides,
	}
}

function makeCtx(interceptedSignal: () => InterceptedState | null): FlareProviderContext {
	return {
		hydrated: () => true,
		intercepted: interceptedSignal,
		invalidate: vi.fn(),
		isNavigating: () => false,
		layouts: {},
		location: () => ({
			hash: "",
			params: {},
			pathname: "/products",
			search: {},
			url: new URL("http://localhost/products"),
			variablePath: "/products",
			virtualPath: "_root_/products/",
		}),
		matchCache: createMatchCache(),
		matches: () => [],
		navigate: vi.fn(() => Promise.resolve()),
		navigationPhase: () => "idle" as const,
		notFound: () => false,
		params: () => ({}),
		prefetch: vi.fn(() => Promise.resolve()),
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: { s: {} },
		search: () => ({}),
		setHydrated: vi.fn(),
		setIntercepted: vi.fn(),
		setMatches: vi.fn(),
		setNavigationPhase: vi.fn(),
		setNotFound: vi.fn(),
		setParams: vi.fn(),
		setSearch: vi.fn(),
		setViewTransition: vi.fn(),
		viewTransition: () => null,
	}
}

describe("InterceptOutlet", () => {
	let container: HTMLDivElement

	beforeEach(() => {
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		container.remove()
	})

	it("renders children when intercepted is not null", () => {
		const state = makeInterceptedState()
		const ctx = makeCtx(() => state)

		render(
			() => (
				<RouterContext.Provider value={ctx}>
					<InterceptOutlet>
						{(s) => <div data-testid="overlay">Mode: {s.render}</div>}
					</InterceptOutlet>
				</RouterContext.Provider>
			),
			container,
		)

		expect(container.querySelector("[data-testid=overlay]")?.textContent).toBe("Mode: modal")
	})

	it("renders nothing when intercepted is null", () => {
		const ctx = makeCtx(() => null)

		render(
			() => (
				<RouterContext.Provider value={ctx}>
					<InterceptOutlet>
						{(s) => <div data-testid="overlay">Mode: {s.render}</div>}
					</InterceptOutlet>
				</RouterContext.Provider>
			),
			container,
		)

		expect(container.querySelector("[data-testid=overlay]")).toBeNull()
	})

	it("reactively shows/hides when intercepted changes", async () => {
		const [intercepted, setIntercepted] = createSignal<InterceptedState | null>(null)
		const ctx = makeCtx(intercepted)

		render(
			() => (
				<RouterContext.Provider value={ctx}>
					<InterceptOutlet>
						{(s) => <div data-testid="overlay">Mode: {s.render}</div>}
					</InterceptOutlet>
				</RouterContext.Provider>
			),
			container,
		)

		/* Initially null → no overlay */
		expect(container.querySelector("[data-testid=overlay]")).toBeNull()

		/* Set intercepted → overlay appears */
		setIntercepted(makeInterceptedState())
		await new Promise((r) => setTimeout(r, 10))
		expect(container.querySelector("[data-testid=overlay]")?.textContent).toBe("Mode: modal")

		/* Clear intercepted → overlay disappears */
		setIntercepted(null)
		await new Promise((r) => setTimeout(r, 10))
		expect(container.querySelector("[data-testid=overlay]")).toBeNull()
	})
})
