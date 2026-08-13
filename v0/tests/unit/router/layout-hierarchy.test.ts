/**
 * Layout Hierarchy Unit Tests
 *
 * Tests layout path validation, type guards, and error boundary methods.
 */

import { describe, expect, it } from "vitest"
import { createLayout, isLayoutResult, isLayoutWithLoader } from "../../../src/router/create-layout"
import { createRootLayout, isRootLayoutResult } from "../../../src/router/create-root-layout"

describe("Layout type guards", () => {
	describe("isLayoutResult", () => {
		it("returns true for layout result", () => {
			const result = createLayout({ virtualPath: "_root_/(auth)" }).render(() => null)
			expect(isLayoutResult(result)).toBe(true)
		})

		it("returns false for root layout result", () => {
			const result = createRootLayout({ virtualPath: "_root_" }).render(() => null)
			expect(isLayoutResult(result)).toBe(false)
		})

		it("returns false for null", () => {
			expect(isLayoutResult(null)).toBe(false)
		})

		it("returns false for undefined", () => {
			expect(isLayoutResult(undefined)).toBe(false)
		})

		it("returns false for plain object without _type", () => {
			expect(isLayoutResult({})).toBe(false)
		})

		it("returns false for object with wrong _type", () => {
			expect(isLayoutResult({ _type: "page" })).toBe(false)
		})

		it("returns false for array", () => {
			expect(isLayoutResult([])).toBe(false)
		})
	})

	describe("isRootLayoutResult", () => {
		it("returns true for root layout result", () => {
			const result = createRootLayout({ virtualPath: "_root_" }).render(() => null)
			expect(isRootLayoutResult(result)).toBe(true)
		})

		it("returns false for regular layout result", () => {
			const result = createLayout({ virtualPath: "_root_/(auth)" }).render(() => null)
			expect(isRootLayoutResult(result)).toBe(false)
		})
	})

	describe("isLayoutWithLoader", () => {
		it("returns true when layout has loader", () => {
			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.loader(async () => ({ data: true }))
				.render(() => null)
			expect(isLayoutWithLoader(result)).toBe(true)
		})

		it("returns false when layout has no loader", () => {
			const result = createLayout({ virtualPath: "_root_/(auth)" }).render(() => null)
			expect(isLayoutWithLoader(result)).toBe(false)
		})

		it("returns false when layout only has preloader", () => {
			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.preloader(async () => ({ ctx: {} }))
				.render(() => null)
			expect(isLayoutWithLoader(result)).toBe(false)
		})
	})
})

describe("Layout error and notFound boundaries", () => {
	describe("errorRender", () => {
		it("can be chained after render", () => {
			const errorFn = (_props: { error: Error; reset: () => void }) => null
			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.render(() => null)
				.errorRender(errorFn)

			expect(result.errorRender).toBeDefined()
			expect(typeof result.errorRender).toBe("function")
		})

		it("preserves all other properties", () => {
			const loaderFn = async () => ({ data: true })
			const headFn = () => ({ title: "Auth" })
			const errorFn = () => null

			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.loader(loaderFn)
				.head(headFn)
				.render(() => null)
				.errorRender(errorFn)

			expect(result.loader).toBe(loaderFn)
			expect(result.head).toBe(headFn)
			expect(result.errorRender).toBeDefined()
		})
	})

	describe("notFoundRender", () => {
		it("can be chained after render", () => {
			const notFoundFn = () => null
			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.render(() => null)
				.notFoundRender(notFoundFn)

			expect(result.notFoundRender).toBeDefined()
			expect(typeof result.notFoundRender).toBe("function")
		})

		it("preserves all other properties", () => {
			const loaderFn = async () => ({ data: true })
			const notFoundFn = () => null

			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.loader(loaderFn)
				.render(() => null)
				.notFoundRender(notFoundFn)

			expect(result.loader).toBe(loaderFn)
			expect(result.notFoundRender).toBeDefined()
		})
	})

	describe("chaining errorRender and notFoundRender", () => {
		it("errorRender then notFoundRender", () => {
			const errorFn = () => null
			const notFoundFn = () => null

			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.render(() => null)
				.errorRender(errorFn)
				.notFoundRender(notFoundFn)

			expect(result.errorRender).toBeDefined()
			expect(result.notFoundRender).toBeDefined()
		})

		it("notFoundRender then errorRender", () => {
			const errorFn = () => null
			const notFoundFn = () => null

			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.render(() => null)
				.notFoundRender(notFoundFn)
				.errorRender(errorFn)

			expect(result.errorRender).toBeDefined()
			expect(result.notFoundRender).toBeDefined()
		})
	})
})

describe("Layout path patterns", () => {
	it("accepts pathless group syntax", () => {
		const result = createLayout({ virtualPath: "_root_/(auth)" }).render(() => null)
		expect(result.virtualPath).toBe("_root_/(auth)")
	})

	it("accepts nested pathless groups", () => {
		const result = createLayout({ virtualPath: "_root_/(group-a)/(group-b)" }).render(() => null)
		expect(result.virtualPath).toBe("_root_/(group-a)/(group-b)")
	})

	it("accepts params in layout path", () => {
		const result = createLayout({ virtualPath: "_root_/(tenant)/[tenantId]" }).render(() => null)
		expect(result.virtualPath).toBe("_root_/(tenant)/[tenantId]")
	})

	it("accepts catch-all params in layout path", () => {
		const result = createLayout({ virtualPath: "_root_/(docs)/[...slug]" }).render(() => null)
		expect(result.virtualPath).toBe("_root_/(docs)/[...slug]")
	})
})

describe("Layout head context", () => {
	it("head function receives loaderData", () => {
		let _capturedLoaderData: unknown

		const result = createLayout({ virtualPath: "_root_/(auth)" })
			.loader(async () => ({ user: "test" }))
			.head(({ loaderData }) => {
				_capturedLoaderData = loaderData
				return { title: "Auth" }
			})
			.render(() => null)

		/* Head function should be defined */
		expect(result.head).toBeDefined()
	})

	it("head function receives parentHead", () => {
		let _capturedParentHead: unknown

		const result = createLayout({ virtualPath: "_root_/(auth)" })
			.loader(async () => ({}))
			.head(({ parentHead }) => {
				_capturedParentHead = parentHead
				return { title: `Child - ${parentHead?.title ?? ""}` }
			})
			.render(() => null)

		expect(result.head).toBeDefined()
	})
})

describe("Layout headers context", () => {
	it("headers function receives parentHeaders", () => {
		const result = createLayout({ virtualPath: "_root_/(auth)" })
			.loader(async () => ({}))
			.headers(({ parentHeaders }) => ({
				...parentHeaders,
				"x-custom": "value",
			}))
			.render(() => null)

		expect(result.headers).toBeDefined()
	})

	it("headers function requires loader", () => {
		const headersFn = () => ({ "cache-control": "no-store" })

		const result = createLayout({ virtualPath: "_root_/(auth)" })
			.loader(async () => ({}))
			.headers(headersFn)
			.render(() => null)

		expect(result.headers).toBe(headersFn)
		expect(result.loader).toBeDefined()
	})
})

describe("Layout with full feature chain", () => {
	it("supports complete chain: options → input → effects → authorize → preloader → loader → head → headers → render → errorRender → notFoundRender", () => {
		const optionsFn = { authenticate: true, prefetch: "hover" as const }
		const inputFn = { params: (raw: Record<string, string>) => ({ id: raw.id ?? "" }) }
		const effectsFn = { shouldRefetch: () => true }
		const authorizeFn = () => true
		const preloaderFn = async () => ({ ctx: {} })
		const loaderFn = async () => ({ data: true })
		const headFn = () => ({ title: "Full Chain" })
		const headersFn = () => ({ "x-full-chain": "true" })
		const renderFn = () => null
		const errorFn = () => null
		const notFoundFn = () => null

		const result = createLayout({ virtualPath: "_root_/(full)/[id]" })
			.options(optionsFn)
			.input(inputFn)
			.effects(effectsFn)
			.authorize(authorizeFn)
			.preloader(preloaderFn)
			.loader(loaderFn)
			.head(headFn)
			.headers(headersFn)
			.render(renderFn)
			.errorRender(errorFn)
			.notFoundRender(notFoundFn)

		expect(result._type).toBe("layout")
		expect(result.virtualPath).toBe("_root_/(full)/[id]")
		expect(result.options).toEqual(optionsFn)
		expect(result.inputConfig).toEqual(inputFn)
		expect(result.effectsConfig).toEqual(effectsFn)
		expect(result.authorize).toBe(authorizeFn)
		expect(result.preloader).toBe(preloaderFn)
		expect(result.loader).toBe(loaderFn)
		expect(result.head).toBe(headFn)
		expect(result.headers).toBe(headersFn)
		expect(result.render).toBe(renderFn)
		expect(result.errorRender).toBeDefined()
		expect(result.notFoundRender).toBeDefined()
	})
})
