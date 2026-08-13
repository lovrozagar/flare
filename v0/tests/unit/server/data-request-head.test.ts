/**
 * Data Request Head Resolution Tests
 *
 * Tests that head config is properly resolved from page modules.
 */

import { describe, expect, it } from "vitest"
import { createPage } from "../../../src/router/create-page"
import { createRootLayout } from "../../../src/router/create-root-layout"
import { resolveHeadChain } from "../../../src/server/handler/head-resolution"

describe("data-request head resolution", () => {
	it("resolves head from page with head defined", () => {
		const page = createPage({ virtualPath: "_root_/test" })
			.head(() => ({
				description: "Test description",
				title: "Test Page",
			}))
			.render(() => null)

		const matches = [
			{
				context: {
					loaderData: undefined,
					location: { pathname: "/test" },
				},
				route: { head: page.head },
			},
		]

		const headConfig = resolveHeadChain(matches)
		expect(headConfig.title).toBe("Test Page")
		expect(headConfig.description).toBe("Test description")
	})

	it("resolves head from page with loader and head", () => {
		const page = createPage({ virtualPath: "_root_/test" })
			.loader(async () => ({ name: "Product" }))
			.head(({ loaderData }) => ({
				title: `${(loaderData as { name: string }).name} - Test`,
			}))
			.render(() => null)

		const matches = [
			{
				context: {
					loaderData: { name: "Product" },
					location: { pathname: "/test" },
				},
				route: { head: page.head },
			},
		]

		const headConfig = resolveHeadChain(matches)
		expect(headConfig.title).toBe("Product - Test")
	})

	it("resolves head from root layout and page chain", () => {
		const rootLayout = createRootLayout({ virtualPath: "_root_" })
			.head(() => ({ title: "Root Title" }))
			.render(() => null)

		const page = createPage({ virtualPath: "_root_/about" })
			.head(() => ({
				description: "About page",
				title: "About",
			}))
			.render(() => null)

		const matches = [
			{
				context: {
					loaderData: undefined,
					location: { pathname: "/about" },
				},
				route: { head: rootLayout.head },
			},
			{
				context: {
					loaderData: undefined,
					location: { pathname: "/about" },
				},
				route: { head: page.head },
			},
		]

		const headConfig = resolveHeadChain(matches)
		/* Page title should override root title */
		expect(headConfig.title).toBe("About")
		expect(headConfig.description).toBe("About page")
	})

	it("returns empty config when no head defined", () => {
		const page = createPage({ virtualPath: "_root_/test" }).render(() => null)

		const matches = [
			{
				context: {
					loaderData: undefined,
					location: { pathname: "/test" },
				},
				route: { head: page.head },
			},
		]

		const headConfig = resolveHeadChain(matches)
		expect(headConfig).toEqual({})
	})

	it("verifies page.head property exists after builder chain", () => {
		const page = createPage({ virtualPath: "_root_/test" })
			.preloader(() => Promise.resolve({}))
			.loader(() => Promise.resolve({ version: "1.0" }))
			.head(() => ({ title: "Test" }))
			.render(() => null)

		/* This is what data-request does: access component.head */
		expect(page.head).toBeDefined()
		expect(typeof page.head).toBe("function")

		const result = page.head?.({
			cause: "enter",
			loaderData: { version: "1.0" },
			location: { params: {}, pathname: "/test", search: {} },
			prefetch: false,
			preloaderContext: {},
			preloaderContextContext: {},
		})
		expect(result?.title).toBe("Test")
	})
})
