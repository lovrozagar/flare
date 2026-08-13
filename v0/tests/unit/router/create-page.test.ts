/**
 * createPage Unit Tests
 *
 * Tests builder pattern, result types, and type guards.
 * Runtime behavior only - type safety tested via TypeScript compilation.
 */

import { describe, expect, it } from "vitest"
import { createPage, isRenderResult, isResponseResult } from "../../../src/router/create-page"

describe("createPage", () => {
	describe("builder pattern", () => {
		it("returns builder from createPage()", () => {
			const builder = createPage({ virtualPath: "_root_/test" })
			expect(builder).toBeDefined()
			expect(typeof builder.options).toBe("function")
			expect(typeof builder.input).toBe("function")
			expect(typeof builder.effects).toBe("function")
			expect(typeof builder.authorize).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .options() correctly", () => {
			const builder = createPage({ virtualPath: "_root_/test" }).options({
				authenticate: true,
				prefetch: "hover",
			})
			expect(typeof builder.input).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .input() correctly", () => {
			const builder = createPage({ virtualPath: "_root_/products/[id]" }).input({
				params: (raw: Record<string, string>) => ({ id: Number(raw.id) }),
			})
			expect(typeof builder.effects).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .effects() correctly", () => {
			const builder = createPage({ virtualPath: "_root_/test" }).effects({
				shouldRefetch: () => true,
			})
			expect(typeof builder.render).toBe("function")
		})

		it("chains .authorize() correctly", () => {
			const builder = createPage({ virtualPath: "_root_/test" })
				.options({ authenticate: true })
				.authorize(() => true)
			expect(typeof builder.render).toBe("function")
		})

		it("chains .loader() correctly", () => {
			const builder = createPage({ virtualPath: "_root_/test" }).loader(async () => ({
				data: "test",
			}))
			expect(typeof builder.head).toBe("function")
			expect(typeof builder.headers).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .preloader() → .loader()", () => {
			const builder = createPage({ virtualPath: "_root_/test" })
				.preloader(async () => ({ preloaded: true }))
				.loader(async () => ({ loaded: true }))
			expect(typeof builder.render).toBe("function")
		})

		it("chains .head() correctly", () => {
			const builder = createPage({ virtualPath: "_root_/test" })
				.loader(async () => ({ title: "Test" }))
				.head(() => ({ title: "Test Page" }))
			expect(typeof builder.headers).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .headers() correctly", () => {
			const builder = createPage({ virtualPath: "_root_/test" })
				.loader(async () => ({}))
				.headers(() => ({ "cache-control": "no-store" }))
			expect(typeof builder.render).toBe("function")
		})
	})

	describe("render result", () => {
		it("returns result with _type: render", () => {
			const result = createPage({ virtualPath: "_root_/test" }).render(() => null)
			expect(result._type).toBe("render")
		})

		it("preserves path in result", () => {
			const result = createPage({ virtualPath: "_root_/products/[id]" }).render(() => null)
			expect(result.virtualPath).toBe("_root_/products/[id]")
		})

		it("preserves options in result", () => {
			const result = createPage({ virtualPath: "_root_/test" })
				.options({ authenticate: true, prefetch: "viewport" })
				.render(() => null)
			expect(result.options?.authenticate).toBe(true)
			expect(result.options?.prefetch).toBe("viewport")
		})

		it("preserves inputConfig in result", () => {
			const paramsValidator = (raw: Record<string, string>) => ({ id: Number(raw.id) })
			const result = createPage({ virtualPath: "_root_/products/[id]" })
				.input({ params: paramsValidator })
				.render(() => null)
			expect(result.inputConfig?.params).toBe(paramsValidator)
		})

		it("preserves effectsConfig in result", () => {
			const shouldRefetch = () => true
			const result = createPage({ virtualPath: "_root_/test" })
				.effects({ shouldRefetch })
				.render(() => null)
			expect(result.effectsConfig?.shouldRefetch).toBe(shouldRefetch)
		})

		it("preserves authorize in result", () => {
			const authorizeFn = () => true
			const result = createPage({ virtualPath: "_root_/test" })
				.options({ authenticate: true })
				.authorize(authorizeFn)
				.render(() => null)
			expect(result.authorize).toBe(authorizeFn)
		})

		it("preserves loader in result", () => {
			const loader = async () => ({ data: "test" })
			const result = createPage({ virtualPath: "_root_/test" })
				.loader(loader)
				.render(() => null)
			expect(result.loader).toBe(loader)
		})

		it("preserves preloader in result", () => {
			const preloader = async () => ({ preloaded: true })
			const result = createPage({ virtualPath: "_root_/test" })
				.preloader(preloader)
				.render(() => null)
			expect(result.preloader).toBe(preloader)
		})

		it("preserves head in result", () => {
			const headFn = () => ({ title: "Test" })
			const result = createPage({ virtualPath: "_root_/test" })
				.loader(async () => ({}))
				.head(headFn)
				.render(() => null)
			expect(result.head).toBe(headFn)
		})

		it("preserves headers in result", () => {
			const headersFn = () => ({ "cache-control": "no-store" })
			const result = createPage({ virtualPath: "_root_/test" })
				.loader(async () => ({}))
				.headers(headersFn)
				.render(() => null)
			expect(result.headers).toBe(headersFn)
		})

		it("preserves render in result", () => {
			const renderFn = () => null
			const result = createPage({ virtualPath: "_root_/test" }).render(renderFn)
			expect(result.render).toBe(renderFn)
		})
	})

	describe("response result", () => {
		it("returns result with _type: response", () => {
			const result = createPage({ virtualPath: "_root_/test" })
				.loader(async () => ({ data: "test" }))
				.response(() => new Response("OK"))
			expect(result._type).toBe("response")
		})

		it("preserves path in response result", () => {
			const result = createPage({ virtualPath: "_root_/api/health" })
				.loader(async () => ({}))
				.response(() => new Response("OK"))
			expect(result.virtualPath).toBe("_root_/api/health")
		})

		it("preserves loader in response result", () => {
			const loader = async () => ({ status: "ok" })
			const result = createPage({ virtualPath: "_root_/test" })
				.loader(loader)
				.response(() => new Response("OK"))
			expect(result.loader).toBe(loader)
		})

		it("preserves response function in result", () => {
			const responseFn = () => new Response("OK")
			const result = createPage({ virtualPath: "_root_/test" })
				.loader(async () => ({}))
				.response(responseFn)
			expect(result.response).toBe(responseFn)
		})
	})

	describe("type guards", () => {
		it("isRenderResult returns true for render", () => {
			const result = createPage({ virtualPath: "_root_/test" }).render(() => null)
			expect(isRenderResult(result)).toBe(true)
			expect(isResponseResult(result)).toBe(false)
		})

		it("isResponseResult returns true for response", () => {
			const result = createPage({ virtualPath: "_root_/test" })
				.loader(async () => ({}))
				.response(() => new Response("OK"))
			expect(isResponseResult(result)).toBe(true)
			expect(isRenderResult(result)).toBe(false)
		})
	})

	describe("input validators", () => {
		it("accepts function validator for params", () => {
			const validator = (raw: Record<string, string>) => ({ id: Number(raw.id) })
			const result = createPage({ virtualPath: "_root_/products/[id]" })
				.input({ params: validator })
				.render(() => null)
			expect(result.inputConfig?.params).toBe(validator)
		})

		it("accepts schema with parse method for params", () => {
			const schema = { parse: (raw: Record<string, string>) => ({ id: Number(raw.id) }) }
			const result = createPage({ virtualPath: "_root_/products/[id]" })
				.input({ params: schema })
				.render(() => null)
			expect(result.inputConfig?.params).toBe(schema)
		})

		it("accepts function validator for searchParams", () => {
			const validator = (raw: URLSearchParams) => ({
				page: Number(raw.get("page")) || 1,
			})
			const result = createPage({ virtualPath: "_root_/test" })
				.input({ searchParams: validator })
				.render(() => null)
			expect(result.inputConfig?.searchParams).toBe(validator)
		})

		it("accepts combined validators", () => {
			const paramsValidator = (raw: Record<string, string>) => ({ id: Number(raw.id) })
			const searchValidator = (raw: URLSearchParams) => ({
				page: Number(raw.get("page")) || 1,
			})

			const result = createPage({ virtualPath: "_root_/products/[id]" })
				.input({
					params: paramsValidator,
					searchParams: searchValidator,
				})
				.render(() => null)

			expect(result.inputConfig?.params).toBe(paramsValidator)
			expect(result.inputConfig?.searchParams).toBe(searchValidator)
		})
	})

	describe("full chain scenarios", () => {
		it("supports minimal page (just render)", () => {
			const result = createPage({ virtualPath: "_root_/" }).render(() => null)
			expect(result._type).toBe("render")
			expect(result.virtualPath).toBe("_root_/")
		})

		it("supports authenticated page with loader", () => {
			const result = createPage({ virtualPath: "_root_/dashboard" })
				.options({ authenticate: true })
				.loader(async () => ({ user: "test" }))
				.head(() => ({ title: "Dashboard" }))
				.render(() => null)

			expect(result._type).toBe("render")
			expect(result.options?.authenticate).toBe(true)
		})

		it("supports page with preloader + loader chain", () => {
			const result = createPage({ virtualPath: "_root_/products/[id]" })
				.input({ params: (raw: Record<string, string>) => ({ id: Number(raw.id) }) })
				.preloader(async () => ({ cache: {} }))
				.loader(async () => ({ product: {} }))
				.head(() => ({ title: "Product" }))
				.headers(() => ({ "cache-control": "public, max-age=3600" }))
				.render(() => null)

			expect(result._type).toBe("render")
		})

		it("supports API response page", () => {
			const result = createPage({ virtualPath: "_root_/api/status" })
				.loader(async () => ({ status: "healthy" }))
				.response(({ loaderData }) => Response.json(loaderData))

			expect(result._type).toBe("response")
		})
	})
})
