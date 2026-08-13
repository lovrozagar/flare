import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, expectTypeOf, it } from "vitest"
import { createLayout, createPage, createRootLayout } from "../../../src/route-builder/index.ts"

const SRC = join(__dirname, "..", "..", "..", "src", "route-builder")

describe("#12: builder files contain no 'as never' casts", () => {
	it("create-page.ts", () => {
		const content = readFileSync(join(SRC, "create-page.ts"), "utf-8")
		expect(content).not.toContain("as never")
	})

	it("create-layout.ts", () => {
		const content = readFileSync(join(SRC, "create-layout.ts"), "utf-8")
		expect(content).not.toContain("as never")
	})

	it("create-root-layout.ts", () => {
		const content = readFileSync(join(SRC, "create-root-layout.ts"), "utf-8")
		expect(content).not.toContain("as never")
	})
})

describe("#12: builder chains still produce correct results after refactor", () => {
	it("page: full chain with loader", () => {
		const loaderFn = () => ({ product: { name: "test" } })
		const headFn = () => ({ title: "Product" })
		const headersFn = () => ({ "x-custom": "1" })
		const renderFn = () => null

		const result = createPage("_root_/products/[id]")
			.input({ params: (raw: Record<string, string | string[]>) => ({ id: String(raw["id"]) }) })
			.authenticate("admin")
			.authorize(() => true)
			.preloader(() => ({ theme: "dark" as const }))
			.loader(loaderFn)
			.head(headFn)
			.headers(headersFn)
			.render(renderFn)

		expect(result._type).toBe("render")
		expect(result.loader).toBe(loaderFn)
		expect(result.head).toBe(headFn)
		expect(result.headers).toBe(headersFn)
		expect(result.render).toBe(renderFn)
		expect(result.authenticate).toEqual(["admin"])
	})

	it("page: skip to render (void loader data)", () => {
		const result = createPage("_root_/about").render(() => null)
		expect(result._type).toBe("render")
		expect(result.loader).toBeUndefined()
	})

	it("page: response variant", () => {
		const responseFn = () => new Response("ok")
		const result = createPage("_root_/api/health").response(responseFn)
		expect(result._type).toBe("response")
		expect(result.response).toBe(responseFn)
	})

	it("page: boundary builders chain correctly", () => {
		const errorFn = () => null
		const notFoundFn = () => null
		const result = createPage("_root_/about")
			.render(() => null)
			.errorRender(errorFn)
			.notFoundRender(notFoundFn)

		const raw = result as unknown as Record<string, unknown>
		expect(raw.errorRender).toBe(errorFn)
		expect(raw.notFoundRender).toBe(notFoundFn)
		expect(result.unauthorizedRender).toBeTypeOf("function")
		expect(result.unauthenticatedRender).toBeTypeOf("function")
	})

	it("page: intercept + cache chain", () => {
		const result = createPage("_root_/products/[id]")
			.intercept({ from: ["/products"], render: "modal" })
			.cache({ client: { staleTime: 5000 } })
			.render(() => null)
		expect(result.intercept).toEqual({ from: ["/products"], render: "modal" })
		expect(result.cache).toEqual({ client: { staleTime: 5000 } })
	})

	it("layout: full chain", () => {
		const preloaderFn = () => ({ user: { id: "1" } })
		const loaderFn = () => ({ sidebar: true })
		const result = createLayout("_root_/(auth)")
			.cache({ client: { staleTime: 3000 } })
			.authenticate()
			.authorize(() => true)
			.effects({ loaderDeps: ({ search }: { search: unknown }) => [search] })
			.preloader(preloaderFn)
			.loader(loaderFn)
			.head(() => ({ title: "Auth" }))
			.headers(() => ({ "x-layout": "1" }))
			.render(() => null)

		expect(result._type).toBe("layout")
		expect(result.preloader).toBe(preloaderFn)
		expect(result.loader).toBe(loaderFn)
	})

	it("layout: boundary builders", () => {
		const result = createLayout("_root_/(auth)")
			.render(() => null)
			.errorRender(() => null)

		expect(result.notFoundRender).toBeTypeOf("function")
		expect(result.unauthorizedRender).toBeTypeOf("function")
	})

	it("root: full chain", () => {
		const preloaderFn = () => ({ config: {} })
		const loaderFn = () => ({ theme: "dark" })
		const result = createRootLayout("_root_")
			.cache({ client: { staleTime: 2000 } })
			.authenticate("admin")
			.authorize(() => true)
			.preloader(preloaderFn)
			.loader(loaderFn)
			.head(() => ({ title: "App" }))
			.headers(() => ({ "x-root": "1" }))
			.render(() => null)

		expect(result._type).toBe("root-layout")
		expect(result.preloader).toBe(preloaderFn)
		expect(result.loader).toBe(loaderFn)
	})

	it("root: boundary builders", () => {
		const errorFn = () => null
		const result = createRootLayout("_root_")
			.render(() => null)
			.errorRender(errorFn)
			.notFoundRender(() => null)
			.unauthorizedRender(() => null)

		expect(result.errorRender).toBe(errorFn)
		expect(result.unauthenticatedRender).toBeTypeOf("function")
	})

	it("page: authenticateOptional stores mode", () => {
		const result = createPage("_root_/about")
			.authenticateOptional()
			.render(() => null)
		expect(result.authenticateMode).toBe("optional")
	})
})

describe("#21: boundary methods removed from type after first call", () => {
	it("page: errorRender excluded from type after call", () => {
		const after = createPage("_root_/about")
			.render(() => null)
			.errorRender(() => null)

		/* runtime: all boundary slots populated */
		const raw = after as unknown as Record<string, unknown>
		expect(raw.errorRender).toBeTypeOf("function")
		expect(after.notFoundRender).toBeTypeOf("function")
		expect(after.unauthorizedRender).toBeTypeOf("function")
		expect(after.unauthenticatedRender).toBeTypeOf("function")

		/* type-level: errorRender is no longer a callable builder */
		type After = typeof after
		expectTypeOf<After>().not.toHaveProperty("errorRender")
		expectTypeOf<After>().toHaveProperty("notFoundRender")
		expectTypeOf<After>().toHaveProperty("unauthorizedRender")
		expectTypeOf<After>().toHaveProperty("unauthenticatedRender")
	})

	it("page: all four boundaries exhausts builder methods", () => {
		const result = createPage("_root_/about")
			.render(() => null)
			.errorRender(() => null)
			.notFoundRender(() => null)
			.unauthenticatedRender(() => null)
			.unauthorizedRender(() => null)

		const raw = result as unknown as Record<string, unknown>
		expect(raw.errorRender).toBeTypeOf("function")
		expect(raw.notFoundRender).toBeTypeOf("function")
		expect(raw.unauthenticatedRender).toBeTypeOf("function")
		expect(raw.unauthorizedRender).toBeTypeOf("function")

		/* type-level: no boundary builders remain */
		type Final = typeof result
		expectTypeOf<Final>().not.toHaveProperty("errorRender")
		expectTypeOf<Final>().not.toHaveProperty("notFoundRender")
		expectTypeOf<Final>().not.toHaveProperty("unauthenticatedRender")
		expectTypeOf<Final>().not.toHaveProperty("unauthorizedRender")
	})

	it("layout: errorRender disappears after call", () => {
		const after = createLayout("_root_/(auth)")
			.render(() => null)
			.errorRender(() => null)

		expect(after.errorRender).toBeTypeOf("function")
		expect(after.notFoundRender).toBeTypeOf("function")
	})

	it("root: boundary exclusion works", () => {
		const after = createRootLayout("_root_")
			.render(() => null)
			.errorRender(() => null)
			.notFoundRender(() => null)

		expect(after.errorRender).toBeTypeOf("function")
		expect(after.notFoundRender).toBeTypeOf("function")
		expect(after.unauthorizedRender).toBeTypeOf("function")
		expect(after.unauthenticatedRender).toBeTypeOf("function")
	})
})

describe("builder chain soundness fixes", () => {
	it("intercept() not available after first call", () => {
		const afterIntercept = createPage("_root_/products/[id]").intercept({
			from: ["/products"],
			render: "modal",
		})

		type After = typeof afterIntercept
		expectTypeOf<After>().not.toHaveProperty("intercept")
		expectTypeOf<After>().toHaveProperty("cache")
	})

	it("intercept().cache() composes correctly", () => {
		const result = createPage("_root_/products/[id]")
			.intercept({ from: ["/products"], render: "modal" })
			.cache({ client: { staleTime: 5000 } })
			.render(() => null)

		expect(result.intercept).toEqual({ from: ["/products"], render: "modal" })
		expect(result.cache).toEqual({ client: { staleTime: 5000 } })
	})

	it("response result does not contain intercept", () => {
		const result = createPage("_root_/api/health")
			.intercept({ from: ["/"], render: "modal" })
			.response(() => new Response("ok"))

		expect(result._type).toBe("response")
		expect((result as unknown as Record<string, unknown>).intercept).toBeUndefined()
	})

	it("response() not available after preloader()", () => {
		const afterPreloader = createPage("_root_/about").preloader(() => ({ theme: "dark" as const }))

		type After = typeof afterPreloader
		expectTypeOf<After>().not.toHaveProperty("response")
		expectTypeOf<After>().toHaveProperty("loader")
		expectTypeOf<After>().toHaveProperty("render")
		expectTypeOf<After>().toHaveProperty("head")
		expectTypeOf<After>().toHaveProperty("headers")
	})

	it("preloader() result still works with loader chain", () => {
		const loaderFn = () => ({ data: true })
		const result = createPage("_root_/about")
			.preloader(() => ({ ctx: 1 }))
			.loader(loaderFn)
			.render(() => null)

		expect(result._type).toBe("render")
		expect(result.loader).toBe(loaderFn)
	})
})
