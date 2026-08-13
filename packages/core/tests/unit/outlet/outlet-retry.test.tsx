/**
 * @vitest-environment jsdom
 *
 * Tests for error boundary retry/reset functionality.
 * Verifies that `retry` and `reset` callbacks are wired through
 * to all error boundary render props (error, unauthenticated, unauthorized).
 */
import { render } from "solid-js/web"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts"
import { UnauthenticatedError, UnauthorizedError } from "../../../src/errors/index.ts"
import {
	type ClientMatch,
	FlareProvider,
	type FlareProviderContext,
	type FlareProviderProps,
	Outlet,
	type RenderProps,
	useRouterContext,
} from "../../../src/outlet/index.tsx"
import type { TreeNode } from "../../../src/router-primitives/types.ts"

function makeFakeTree(): TreeNode {
	return { s: {} }
}

function makeMatch(overrides: Partial<ClientMatch> & { virtualPath: string }): ClientMatch {
	return {
		_type: "render",
		loaderData: null,
		render: (props: RenderProps) => (
			<div data-testid={`page-${overrides.virtualPath}`}>{String(props.loaderData)}</div>
		),
		variablePath: "",
		...overrides,
	}
}

function makeProviderProps(overrides?: Partial<FlareProviderProps>): FlareProviderProps {
	return {
		children: null as unknown as import("solid-js").JSX.Element,
		layouts: {},
		matchCache: createMatchCache(),
		matches: [],
		params: {},
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: makeFakeTree(),
		...overrides,
	}
}

describe("error boundary retry prop", () => {
	let container: HTMLDivElement
	let dispose: () => void

	beforeEach(() => {
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		dispose?.()
		container.remove()
	})

	it("errorRender receives retry function for pipeline errors", () => {
		let receivedRetry: unknown
		const page = makeMatch({
			error: new Error("broken"),
			errorRender: (props) => {
				receivedRetry = props.retry
				return <div data-testid="error-boundary">Error</div>
			},
			render: () => <div>Normal</div>,
			virtualPath: "_root_/broken",
		})

		const props = makeProviderProps({ matches: [page] })
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		)

		expect(container.querySelector("[data-testid='error-boundary']")).not.toBeNull()
		expect(typeof receivedRetry).toBe("function")
	})

	it("errorRender receives reset function for pipeline errors", () => {
		let receivedReset: unknown
		const page = makeMatch({
			error: new Error("broken"),
			errorRender: (props) => {
				receivedReset = props.reset
				return <div data-testid="error-boundary">Error</div>
			},
			render: () => <div>Normal</div>,
			virtualPath: "_root_/broken",
		})

		const props = makeProviderProps({ matches: [page] })
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		)

		expect(typeof receivedReset).toBe("function")
	})

	it("unauthenticatedRender receives retry function", () => {
		let receivedRetry: unknown
		const page = makeMatch({
			error: new UnauthenticatedError(),
			render: () => <div>Normal</div>,
			unauthenticatedRender: (props) => {
				receivedRetry = props.retry
				return <div data-testid="unauthn-boundary">Login</div>
			},
			virtualPath: "_root_/protected",
		})

		const props = makeProviderProps({ matches: [page] })
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		)

		expect(container.querySelector("[data-testid='unauthn-boundary']")).not.toBeNull()
		expect(typeof receivedRetry).toBe("function")
	})

	it("unauthorizedRender receives retry function", () => {
		let receivedRetry: unknown
		const page = makeMatch({
			error: new UnauthorizedError(),
			render: () => <div>Normal</div>,
			unauthorizedRender: (props) => {
				receivedRetry = props.retry
				return <div data-testid="unAuthz-boundary">Denied</div>
			},
			virtualPath: "_root_/admin",
		})

		const props = makeProviderProps({ matches: [page] })
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		)

		expect(container.querySelector("[data-testid='unAuthz-boundary']")).not.toBeNull()
		expect(typeof receivedRetry).toBe("function")
	})

	it("global error boundary receives retry function", () => {
		let receivedRetry: unknown
		const page = makeMatch({
			error: new Error("unhandled"),
			render: () => <div>Normal</div>,
			virtualPath: "_root_/broken",
		})

		const props = makeProviderProps({
			boundaries: {
				error: (bp) => {
					receivedRetry = bp.retry
					return <div data-testid="global-error">Global Error</div>
				},
			},
			matches: [page],
		})
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		)

		expect(container.querySelector("[data-testid='global-error']")).not.toBeNull()
		expect(typeof receivedRetry).toBe("function")
	})

	it("global unauthenticated boundary receives retry function", () => {
		let receivedRetry: unknown
		const page = makeMatch({
			error: new UnauthenticatedError(),
			render: () => <div>Normal</div>,
			virtualPath: "_root_/protected",
		})

		const props = makeProviderProps({
			boundaries: {
				unauthenticated: (bp) => {
					receivedRetry = bp.retry
					return <div data-testid="global-unauthn">Global Login</div>
				},
			},
			matches: [page],
		})
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		)

		expect(container.querySelector("[data-testid='global-unauthn']")).not.toBeNull()
		expect(typeof receivedRetry).toBe("function")
	})

	it("global unauthorized boundary receives retry function", () => {
		let receivedRetry: unknown
		const page = makeMatch({
			error: new UnauthorizedError(),
			render: () => <div>Normal</div>,
			virtualPath: "_root_/admin",
		})

		const props = makeProviderProps({
			boundaries: {
				unauthorized: (bp) => {
					receivedRetry = bp.retry
					return <div data-testid="global-unAuthz">Global Denied</div>
				},
			},
			matches: [page],
		})
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		)

		expect(container.querySelector("[data-testid='global-unAuthz']")).not.toBeNull()
		expect(typeof receivedRetry).toBe("function")
	})
})

describe("retry triggers navigation with revalidation", () => {
	let container: HTMLDivElement
	let dispose: () => void

	beforeEach(() => {
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		dispose?.()
		container.remove()
	})

	it("calling retry() navigates to current URL with revalidate: true", () => {
		let retryFn: (() => void) | undefined
		let capturedCtx: FlareProviderContext | undefined
		const navigateSpy = vi.fn(() => Promise.resolve())

		const page = makeMatch({
			error: new Error("transient"),
			errorRender: (props) => {
				retryFn = props.retry as () => void
				return <div data-testid="error">Error</div>
			},
			render: () => <div>Normal</div>,
			virtualPath: "_root_/flaky",
		})

		const props = makeProviderProps({
			matches: [page],
			onContextReady: (ctx) => {
				capturedCtx = ctx
			},
		})
		dispose = render(
			() => (
				<FlareProvider {...props}>
					{(() => {
						const ctx = useRouterContext()
						/* Spy on navigate by binding _setNavigate */
						const ctxObj = ctx as FlareProviderContext & { _setNavigate?: (fn: unknown) => void }
						if (ctxObj._setNavigate) ctxObj._setNavigate(navigateSpy)
						return null
					})()}
					<Outlet />
				</FlareProvider>
			),
			container,
		)

		expect(retryFn).toBeDefined()
		retryFn?.()

		expect(navigateSpy).toHaveBeenCalledTimes(1)
		const calls = navigateSpy.mock.calls as unknown[][]
		const call = (calls[0] as unknown[])[0] as Record<string, unknown>
		expect(call.replace).toBe(true)
		expect(call.revalidate).toBe(true)
	})
})

describe("layout boundary receives retry for child errors", () => {
	let container: HTMLDivElement
	let dispose: () => void

	beforeEach(() => {
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		dispose?.()
		container.remove()
	})

	it("layout errorRender catches child error and receives retry", () => {
		let receivedRetry: unknown
		const layout: ClientMatch = {
			_type: "layout",
			errorRender: (props) => {
				receivedRetry = props.retry
				return <div data-testid="layout-error">Layout caught: {String(props.error)}</div>
			},
			loaderData: null,
			render: (props: RenderProps) => <div data-testid="layout">{props.children}</div>,
			variablePath: "",
			virtualPath: "_root_",
		}
		const page = makeMatch({
			error: new Error("child broke"),
			render: () => <div>Normal</div>,
			virtualPath: "_root_/child",
		})

		const props = makeProviderProps({ matches: [layout, page] })
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Outlet />
				</FlareProvider>
			),
			container,
		)

		expect(container.querySelector("[data-testid='layout-error']")).not.toBeNull()
		expect(typeof receivedRetry).toBe("function")
	})
})
