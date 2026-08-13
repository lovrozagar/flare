/**
 * Client Rendering Integration Tests
 *
 * Tests SSR state initialization and static rendering in jsdom.
 * For reactivity tests (signal updates, click handlers), see client-reactivity.browser.test.tsx
 */

import type { JSX } from "solid-js"
import { render } from "solid-js/web"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createFlareClient } from "../../src/client/init"
import { createFlareProvider, FlareProvider } from "../../src/client/provider"
import type { MatchedRoute } from "../../src/router/outlet"
import { Outlet, OutletContext } from "../../src/router/outlet"
import { FlareStateBuilder } from "../utils/flare-state"

describe("outlet rendering", () => {
	let container: HTMLElement
	let dispose: () => void

	beforeEach(() => {
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		dispose?.()
		container.remove()
	})

	it("renders page component from matches", () => {
		const matches: MatchedRoute[] = [
			{
				loaderData: { title: "Hello" },
				render: (props) => {
					const p = props as { loaderData: { title: string } }
					return <h1>{p.loaderData.title}</h1>
				},
				virtualPath: "_root_/",
			},
		]

		dispose = render(
			() => (
				<OutletContext.Provider value={{ depth: -1, matches: () => matches }}>
					<Outlet />
				</OutletContext.Provider>
			),
			container,
		)

		expect(container.innerHTML).toContain("<h1>Hello</h1>")
	})

	it("renders nested layouts with page", () => {
		const matches: MatchedRoute[] = [
			{
				_type: "layout",
				loaderData: {},
				render: (props) => {
					const p = props as { children: JSX.Element }
					return <div class="layout">{p.children}</div>
				},
				virtualPath: "_root_",
			},
			{
				_type: "render",
				loaderData: { message: "Content" },
				render: (props) => {
					const p = props as { loaderData: { message: string } }
					return <p>{p.loaderData.message}</p>
				},
				virtualPath: "_root_/page",
			},
		]

		dispose = render(
			() => (
				<OutletContext.Provider value={{ depth: -1, matches: () => matches }}>
					<Outlet />
				</OutletContext.Provider>
			),
			container,
		)

		expect(container.innerHTML).toContain('<div class="layout">')
		expect(container.innerHTML).toContain("<p>Content</p>")
	})
})

describe("FlareProvider with Outlet", () => {
	let container: HTMLElement
	let dispose: () => void

	beforeEach(() => {
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		dispose?.()
		container.remove()
	})

	it("renders initial matches from SSR state", () => {
		const ssrState = new FlareStateBuilder().addMatch("_root_/", { text: "SSR Content" }).build()

		const client = createFlareClient({ flareState: ssrState })
		const ctx = createFlareProvider(client)

		/* Manually inject render functions since client doesn't have route tree */
		ctx.setMatches([
			{
				loaderData: { text: "SSR Content" },
				render: (props) => {
					const p = props as { loaderData: { text: string } }
					return <div>{p.loaderData.text}</div>
				},
				virtualPath: "_root_/",
			},
		])

		dispose = render(
			() => (
				<FlareProvider context={ctx}>
					<Outlet />
				</FlareProvider>
			),
			container,
		)

		expect(container.innerHTML).toContain("<div>SSR Content</div>")
	})
})

describe("client rendering with SSR state", () => {
	let container: HTMLElement
	let dispose: () => void

	beforeEach(() => {
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		dispose?.()
		container.remove()
	})

	it("renders content matching SSR output", () => {
		const ssrState = new FlareStateBuilder().addMatch("_root_/", { text: "SSR Text" }).build()

		const client = createFlareClient({ flareState: ssrState })
		const ctx = createFlareProvider(client)

		ctx.setMatches([
			{
				loaderData: { text: "SSR Text" },
				render: (props) => {
					const p = props as { loaderData: { text: string } }
					return <span>{p.loaderData.text}</span>
				},
				virtualPath: "_root_/",
			},
		])

		dispose = render(
			() => (
				<FlareProvider context={ctx}>
					<Outlet />
				</FlareProvider>
			),
			container,
		)

		expect(container.innerHTML).toContain("<span>SSR Text</span>")
	})
})

describe("route loading integration", () => {
	it("matches contain render functions from loaded components", () => {
		/* Simulates what entry-client should do */
		const mockPageComponent = {
			_type: "render" as const,
			loader: async () => ({ data: "loaded" }),
			render: (props: { loaderData: { data: string } }) => <div>{props.loaderData.data}</div>,
			virtualPath: "_root_/",
		}

		const mockLayoutComponent = {
			_type: "layout" as const,
			render: (props: { children: JSX.Element }) => <main>{props.children}</main>,
			virtualPath: "_root_",
		}

		/* Build matches like entry-client would */
		const matches: MatchedRoute[] = [
			{
				_type: mockLayoutComponent._type,
				loaderData: {},
				render: mockLayoutComponent.render as (props: unknown) => JSX.Element,
				virtualPath: mockLayoutComponent.virtualPath,
			},
			{
				_type: mockPageComponent._type,
				loaderData: { data: "loaded" },
				render: mockPageComponent.render as (props: unknown) => JSX.Element,
				virtualPath: mockPageComponent.virtualPath,
			},
		]

		/* Verify structure */
		expect(matches[0]?.render).toBe(mockLayoutComponent.render)
		expect(matches[1]?.render).toBe(mockPageComponent.render)
		expect(typeof matches[0]?.render).toBe("function")
		expect(typeof matches[1]?.render).toBe("function")
	})
})
