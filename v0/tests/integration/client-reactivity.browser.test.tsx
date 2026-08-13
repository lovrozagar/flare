/**
 * Client Reactivity Browser Tests
 *
 * Tests Solid reactivity in real browser via vitest/browser + Playwright.
 * These tests verify actual DOM updates from signal changes.
 */

import { cleanup, render } from "@solidjs/testing-library"
import { createSignal, type JSX } from "solid-js"
import { afterEach, describe, expect, it } from "vitest"
import { createFlareClient } from "../../src/client/init"
import { createFlareProvider, FlareProvider } from "../../src/client/provider"
import type { MatchedRoute } from "../../src/router/outlet"
import { Outlet, OutletContext } from "../../src/router/outlet"
import { FlareStateBuilder } from "../utils/flare-state"

describe("browser: outlet reactivity", () => {
	afterEach(() => {
		cleanup()
	})

	it("updates DOM when matches signal changes", () => {
		const [matches, setMatches] = createSignal<MatchedRoute[]>([
			{
				loaderData: { page: "home" },
				render: (props) => {
					const p = props as { loaderData: { page: string } }
					return <span data-testid="page">{p.loaderData.page}</span>
				},
				virtualPath: "_root_/",
			},
		])

		const { getByTestId } = render(() => (
			<OutletContext.Provider value={{ depth: -1, matches }}>
				<Outlet />
			</OutletContext.Provider>
		))

		expect(getByTestId("page").textContent).toBe("home")

		/* Update matches signal */
		setMatches([
			{
				loaderData: { page: "about" },
				render: (props) => {
					const p = props as { loaderData: { page: string } }
					return <span data-testid="page">{p.loaderData.page}</span>
				},
				virtualPath: "_root_/about",
			},
		])

		/* DOM should update reactively */
		expect(getByTestId("page").textContent).toBe("about")
	})

	it("renders nested layouts reactively", () => {
		const [matches, setMatches] = createSignal<MatchedRoute[]>([
			{
				_type: "layout",
				loaderData: {},
				render: (props) => {
					const p = props as { children: JSX.Element }
					return <div data-testid="layout">{p.children}</div>
				},
				virtualPath: "_root_",
			},
			{
				_type: "render",
				loaderData: { content: "initial" },
				render: (props) => {
					const p = props as { loaderData: { content: string } }
					return <p data-testid="content">{p.loaderData.content}</p>
				},
				virtualPath: "_root_/page",
			},
		])

		const { getByTestId } = render(() => (
			<OutletContext.Provider value={{ depth: -1, matches }}>
				<Outlet />
			</OutletContext.Provider>
		))

		expect(getByTestId("content").textContent).toBe("initial")

		/* Update page content */
		setMatches([
			{
				_type: "layout",
				loaderData: {},
				render: (props) => {
					const p = props as { children: JSX.Element }
					return <div data-testid="layout">{p.children}</div>
				},
				virtualPath: "_root_",
			},
			{
				_type: "render",
				loaderData: { content: "updated" },
				render: (props) => {
					const p = props as { loaderData: { content: string } }
					return <p data-testid="content">{p.loaderData.content}</p>
				},
				virtualPath: "_root_/page",
			},
		])

		expect(getByTestId("content").textContent).toBe("updated")
	})
})

describe("browser: component interactivity", () => {
	afterEach(() => {
		cleanup()
	})

	it("click handler updates signal and DOM", () => {
		const [count, setCount] = createSignal(0)

		const { getByTestId } = render(() => (
			<button data-testid="btn" onClick={() => setCount((c) => c + 1)} type="button">
				Count: {count()}
			</button>
		))

		const button = getByTestId("btn")
		expect(button.textContent).toBe("Count: 0")

		/* Click button */
		button.click()
		expect(button.textContent).toBe("Count: 1")

		button.click()
		expect(button.textContent).toBe("Count: 2")
	})

	it("renders interactive component from route match", () => {
		const matches: MatchedRoute[] = [
			{
				loaderData: {},
				render: () => {
					const [count, setCount] = createSignal(0)
					return (
						<button data-testid="counter" onClick={() => setCount((c) => c + 1)} type="button">
							{count()}
						</button>
					)
				},
				virtualPath: "_root_/",
			},
		]

		const { getByTestId } = render(() => (
			<OutletContext.Provider value={{ depth: -1, matches: () => matches }}>
				<Outlet />
			</OutletContext.Provider>
		))

		const button = getByTestId("counter")
		expect(button.textContent).toBe("0")

		button.click()
		expect(button.textContent).toBe("1")
	})
})

describe("browser: FlareProvider reactivity", () => {
	afterEach(() => {
		cleanup()
	})

	it("re-renders when matches are updated via setMatches", () => {
		const ssrState = new FlareStateBuilder().addMatch("_root_/", {}).build()

		const client = createFlareClient({ flareState: ssrState })
		const ctx = createFlareProvider(client)

		/* Set initial matches */
		ctx.setMatches([
			{
				loaderData: {},
				render: () => <span data-testid="page">Home</span>,
				virtualPath: "_root_/",
			},
		])

		const { getByTestId } = render(() => (
			<FlareProvider context={ctx}>
				<Outlet />
			</FlareProvider>
		))

		expect(getByTestId("page").textContent).toBe("Home")

		/* Update matches */
		ctx.setMatches([
			{
				loaderData: { page: "about" },
				render: (props) => {
					const p = props as { loaderData: { page: string } }
					return <span data-testid="page">{p.loaderData.page}</span>
				},
				virtualPath: "_root_/about",
			},
		])

		expect(getByTestId("page").textContent).toBe("about")
	})
})
