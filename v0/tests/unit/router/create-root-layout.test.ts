/**
 * createRootLayout Unit Tests
 *
 * Tests builder pattern and result types for root layouts.
 * Root layouts render <html> and receive children prop.
 * Use <HeadContent /> and <Scripts /> components instead of props.
 * Path must match _name_ pattern. Server-only loaders. _type: "root-layout"
 */

import { describe, expect, it } from "vitest"
import {
	createRootLayout,
	isRootLayoutResult,
	type RootLayoutRenderProps,
} from "../../../src/router/create-root-layout"

describe("createRootLayout", () => {
	describe("builder pattern", () => {
		it("returns builder from createRootLayout()", () => {
			const builder = createRootLayout({ virtualPath: "_root_" })
			expect(builder).toBeDefined()
			expect(typeof builder.options).toBe("function")
			expect(typeof builder.input).toBe("function")
			expect(typeof builder.effects).toBe("function")
			expect(typeof builder.authorize).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .options() correctly", () => {
			const builder = createRootLayout({ virtualPath: "_root_" }).options({
				authenticate: true,
				prefetch: "hover",
			})
			expect(typeof builder.input).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .input() correctly", () => {
			const builder = createRootLayout({ virtualPath: "_root_" }).input({
				searchParams: (raw: URLSearchParams) => ({ locale: raw.get("locale") ?? "en" }),
			})
			expect(typeof builder.effects).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .effects() correctly", () => {
			const builder = createRootLayout({ virtualPath: "_root_" }).effects({
				shouldRefetch: () => true,
			})
			expect(typeof builder.render).toBe("function")
		})

		it("chains .authorize() correctly", () => {
			const builder = createRootLayout({ virtualPath: "_root_" })
				.options({ authenticate: true })
				.authorize(() => true)
			expect(typeof builder.render).toBe("function")
		})

		it("chains .loader() correctly", () => {
			const builder = createRootLayout({ virtualPath: "_root_" }).loader(async () => ({
				theme: "dark",
			}))
			expect(typeof builder.head).toBe("function")
			expect(typeof builder.headers).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .preloader() → .loader()", () => {
			const builder = createRootLayout({ virtualPath: "_root_" })
				.preloader(async () => ({ locale: "en" }))
				.loader(async () => ({ theme: "dark" }))
			expect(typeof builder.render).toBe("function")
		})

		it("chains .head() correctly", () => {
			const builder = createRootLayout({ virtualPath: "_root_" })
				.loader(async () => ({ title: "App" }))
				.head(() => ({ title: "My App" }))
			expect(typeof builder.headers).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .headers() correctly", () => {
			const builder = createRootLayout({ virtualPath: "_root_" })
				.loader(async () => ({}))
				.headers(() => ({ "content-security-policy": "default-src 'self'" }))
			expect(typeof builder.render).toBe("function")
		})

		it("chains .head() WITHOUT requiring .loader()", () => {
			const builder = createRootLayout({ virtualPath: "_root_" }).head(() => ({
				title: "My App",
			}))
			expect(typeof builder.headers).toBe("function")
			expect(typeof builder.loader).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .headers() WITHOUT requiring .loader()", () => {
			const builder = createRootLayout({ virtualPath: "_root_" }).headers(() => ({
				"content-security-policy": "default-src 'self'",
			}))
			expect(typeof builder.head).toBe("function")
			expect(typeof builder.loader).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .head() → .headers() without loader", () => {
			const builder = createRootLayout({ virtualPath: "_root_" })
				.head(() => ({ title: "My App" }))
				.headers(() => ({ "content-security-policy": "default-src 'self'" }))
			expect(typeof builder.loader).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .headers() → .head() without loader", () => {
			const builder = createRootLayout({ virtualPath: "_root_" })
				.headers(() => ({ "content-security-policy": "default-src 'self'" }))
				.head(() => ({ title: "My App" }))
			expect(typeof builder.loader).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .preloader() → .head() without loader", () => {
			const builder = createRootLayout({ virtualPath: "_root_" })
				.preloader(async () => ({ locale: "en" }))
				.head(() => ({ title: "My App" }))
			expect(typeof builder.loader).toBe("function")
			expect(typeof builder.headers).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .authorize() → .head() without loader", () => {
			const builder = createRootLayout({ virtualPath: "_root_" })
				.options({ authenticate: true })
				.authorize(() => true)
				.head(() => ({ title: "My App" }))
			expect(typeof builder.loader).toBe("function")
			expect(typeof builder.render).toBe("function")
		})
	})

	describe("root layout result", () => {
		it("returns result with _type: root-layout", () => {
			const result = createRootLayout({ virtualPath: "_root_" }).render(() => null)
			expect(result._type).toBe("root-layout")
		})

		it("preserves virtualPath in result", () => {
			const result = createRootLayout({ virtualPath: "_docs_" }).render(() => null)
			expect(result.virtualPath).toBe("_docs_")
		})

		it("preserves options in result", () => {
			const result = createRootLayout({ virtualPath: "_root_" })
				.options({ authenticate: true, prefetch: "viewport" })
				.render(() => null)
			expect(result.options?.authenticate).toBe(true)
			expect(result.options?.prefetch).toBe("viewport")
		})

		it("preserves inputConfig in result", () => {
			const searchValidator = (raw: URLSearchParams) => ({ locale: raw.get("locale") ?? "en" })
			const result = createRootLayout({ virtualPath: "_root_" })
				.input({ searchParams: searchValidator })
				.render(() => null)
			expect(result.inputConfig?.searchParams).toBe(searchValidator)
		})

		it("preserves effectsConfig in result", () => {
			const shouldRefetch = () => true
			const result = createRootLayout({ virtualPath: "_root_" })
				.effects({ shouldRefetch })
				.render(() => null)
			expect(result.effectsConfig?.shouldRefetch).toBe(shouldRefetch)
		})

		it("preserves authorize in result", () => {
			const authorizeFn = () => true
			const result = createRootLayout({ virtualPath: "_root_" })
				.options({ authenticate: true })
				.authorize(authorizeFn)
				.render(() => null)
			expect(result.authorize).toBe(authorizeFn)
		})

		it("preserves loader in result", () => {
			const loader = async () => ({ theme: "dark" })
			const result = createRootLayout({ virtualPath: "_root_" })
				.loader(loader)
				.render(() => null)
			expect(result.loader).toBe(loader)
		})

		it("preserves preloader in result", () => {
			const preloader = async () => ({ locale: "en" })
			const result = createRootLayout({ virtualPath: "_root_" })
				.preloader(preloader)
				.render(() => null)
			expect(result.preloader).toBe(preloader)
		})

		it("preserves head in result", () => {
			const headFn = () => ({ title: "My App" })
			const result = createRootLayout({ virtualPath: "_root_" })
				.loader(async () => ({}))
				.head(headFn)
				.render(() => null)
			expect(result.head).toBe(headFn)
		})

		it("preserves headers in result", () => {
			const headersFn = () => ({ "x-frame-options": "DENY" })
			const result = createRootLayout({ virtualPath: "_root_" })
				.loader(async () => ({}))
				.headers(headersFn)
				.render(() => null)
			expect(result.headers).toBe(headersFn)
		})

		it("preserves head in result WITHOUT loader", () => {
			const headFn = () => ({ title: "My App" })
			const result = createRootLayout({ virtualPath: "_root_" })
				.head(headFn)
				.render(() => null)
			expect(result.head).toBe(headFn)
			expect(result.loader).toBeUndefined()
		})

		it("preserves headers in result WITHOUT loader", () => {
			const headersFn = () => ({ "content-security-policy": "default-src 'self'" })
			const result = createRootLayout({ virtualPath: "_root_" })
				.headers(headersFn)
				.render(() => null)
			expect(result.headers).toBe(headersFn)
			expect(result.loader).toBeUndefined()
		})

		it("preserves both head and headers WITHOUT loader", () => {
			const headFn = () => ({ title: "My App" })
			const headersFn = () => ({ "content-security-policy": "default-src 'self'" })
			const result = createRootLayout({ virtualPath: "_root_" })
				.head(headFn)
				.headers(headersFn)
				.render(() => null)
			expect(result.head).toBe(headFn)
			expect(result.headers).toBe(headersFn)
			expect(result.loader).toBeUndefined()
		})

		it("preserves component in result", () => {
			const componentFn = () => null
			const result = createRootLayout({ virtualPath: "_root_" }).render(componentFn)
			expect(result.render).toBe(componentFn)
		})
	})

	describe("type guards", () => {
		it("isRootLayoutResult returns true for root layout", () => {
			const result = createRootLayout({ virtualPath: "_root_" }).render(() => null)
			expect(isRootLayoutResult(result)).toBe(true)
		})

		it("isRootLayoutResult returns false for non-root layout", () => {
			expect(isRootLayoutResult(null)).toBe(false)
			expect(isRootLayoutResult({})).toBe(false)
			expect(isRootLayoutResult({ _type: "layout" })).toBe(false)
			expect(isRootLayoutResult({ _type: "component" })).toBe(false)
		})
	})

	describe("full chain scenarios", () => {
		it("supports minimal root layout (just component)", () => {
			const result = createRootLayout({ virtualPath: "_root_" }).render(() => null)
			expect(result._type).toBe("root-layout")
			expect(result.virtualPath).toBe("_root_")
		})

		it("supports root layout with loader", () => {
			const result = createRootLayout({ virtualPath: "_root_" })
				.loader(async () => ({ locale: "en", theme: "dark" }))
				.head(() => ({ title: "My App" }))
				.render(() => null)

			expect(result._type).toBe("root-layout")
		})

		it("supports full root layout chain", () => {
			const result = createRootLayout({ virtualPath: "_root_" })
				.options({ authenticate: false })
				.input({ searchParams: (raw: URLSearchParams) => ({ debug: raw.has("debug") }) })
				.preloader(async () => ({ locale: "en" }))
				.loader(async () => ({ theme: "dark" }))
				.head(() => ({ title: "My App" }))
				.headers(() => ({ "content-security-policy": "default-src 'self'" }))
				.render(() => null)

			expect(result._type).toBe("root-layout")
			expect(result.virtualPath).toBe("_root_")
		})

		it("supports root layout with head + headers WITHOUT loader", () => {
			const result = createRootLayout({ virtualPath: "_root_" })
				.head(() => ({ title: "Static App" }))
				.headers(() => ({ "content-security-policy": "default-src 'self'" }))
				.render(() => null)

			expect(result._type).toBe("root-layout")
			expect(result.head).toBeDefined()
			expect(result.headers).toBeDefined()
			expect(result.loader).toBeUndefined()
		})

		it("supports root layout with preloader + head + headers WITHOUT loader", () => {
			const result = createRootLayout({ virtualPath: "_root_" })
				.preloader(async () => ({ config: {} }))
				.head(() => ({ title: "Preloaded App" }))
				.headers(() => ({ "x-custom": "value" }))
				.render(() => null)

			expect(result._type).toBe("root-layout")
			expect(result.preloader).toBeDefined()
			expect(result.head).toBeDefined()
			expect(result.headers).toBeDefined()
			expect(result.loader).toBeUndefined()
		})

		it("supports any order: options → head → loader → headers", () => {
			const result = createRootLayout({ virtualPath: "_root_" })
				.options({ prefetch: "hover" })
				.head(() => ({ title: "Flexible" }))
				.loader(async () => ({ data: true }))
				.headers(() => ({ "x-order": "test" }))
				.render(() => null)

			expect(result._type).toBe("root-layout")
			expect(result.options?.prefetch).toBe("hover")
			expect(result.head).toBeDefined()
			expect(result.loader).toBeDefined()
			expect(result.headers).toBeDefined()
		})
	})
})

describe("RootLayoutRenderProps", () => {
	const mockLocation = {
		hash: "",
		params: {},
		pathname: "/",
		search: {},
		url: new URL("http://localhost/"),
		variablePath: "/",
		virtualPath: "/",
	}

	it("includes children prop", () => {
		const props: RootLayoutRenderProps = {
			auth: null,
			cause: "enter",
			children: null as unknown as import("solid-js").JSX.Element,
			loaderData: undefined,
			location: mockLocation,
			prefetch: false,
			preloaderContext: undefined,
			queryClient: undefined,
		}

		expect(props.children).toBeDefined()
	})

	it("includes loaderData prop", () => {
		const props: RootLayoutRenderProps<
			Record<string, string>,
			Record<string, string>,
			false,
			unknown,
			{ theme: string }
		> = {
			auth: null,
			cause: "enter",
			children: null as unknown as import("solid-js").JSX.Element,
			loaderData: { theme: "dark" },
			location: mockLocation,
			prefetch: false,
			preloaderContext: undefined,
			queryClient: undefined,
		}

		expect(props.loaderData.theme).toBe("dark")
	})

	it("does not include head prop (type-level)", () => {
		const props: RootLayoutRenderProps = {
			auth: null,
			cause: "enter",
			children: null as unknown as import("solid-js").JSX.Element,
			loaderData: undefined,
			location: mockLocation,
			prefetch: false,
			preloaderContext: undefined,
			queryClient: undefined,
		}

		/* head should not be a valid key - use <HeadContent /> component instead */
		expect("head" in props).toBe(false)
	})

	it("does not include scripts prop (type-level)", () => {
		const props: RootLayoutRenderProps = {
			auth: null,
			cause: "enter",
			children: null as unknown as import("solid-js").JSX.Element,
			loaderData: undefined,
			location: mockLocation,
			prefetch: false,
			preloaderContext: undefined,
			queryClient: undefined,
		}

		/* scripts should not be a valid key - use <Scripts /> component instead */
		expect("scripts" in props).toBe(false)
	})
})
