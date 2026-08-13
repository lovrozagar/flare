/**
 * createLayout Unit Tests
 *
 * Tests builder pattern and result types for layouts.
 * Layouts differ from pages: use <Outlet /> for nested content, only server loaders, _type: "layout"
 */

import { describe, expect, it } from "vitest"
import { createLayout, isLayoutWithLoader } from "../../../src/router/create-layout"

describe("createLayout", () => {
	describe("builder pattern", () => {
		it("returns builder from createLayout()", () => {
			const builder = createLayout({ virtualPath: "_root_/(auth)" })
			expect(builder).toBeDefined()
			expect(typeof builder.options).toBe("function")
			expect(typeof builder.input).toBe("function")
			expect(typeof builder.effects).toBe("function")
			expect(typeof builder.authorize).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .options() correctly", () => {
			const builder = createLayout({ virtualPath: "_root_/(auth)" }).options({
				authenticate: true,
				prefetch: "hover",
			})
			expect(typeof builder.input).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .input() correctly", () => {
			const builder = createLayout({ virtualPath: "_root_/(dashboard)/[orgId]" }).input({
				params: (raw: Record<string, string>) => ({ orgId: raw.orgId ?? "" }),
			})
			expect(typeof builder.effects).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .effects() correctly", () => {
			const builder = createLayout({ virtualPath: "_root_/(auth)" }).effects({
				shouldRefetch: () => true,
			})
			expect(typeof builder.render).toBe("function")
		})

		it("chains .authorize() correctly", () => {
			const builder = createLayout({ virtualPath: "_root_/(auth)" })
				.options({ authenticate: true })
				.authorize(() => true)
			expect(typeof builder.render).toBe("function")
		})

		it("chains .loader() correctly", () => {
			const builder = createLayout({ virtualPath: "_root_/(auth)" }).loader(async () => ({
				user: "test",
			}))
			expect(typeof builder.head).toBe("function")
			expect(typeof builder.headers).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .preloader() → .loader()", () => {
			const builder = createLayout({ virtualPath: "_root_/(auth)" })
				.preloader(async () => ({ session: {} }))
				.loader(async () => ({ user: "test" }))
			expect(typeof builder.render).toBe("function")
		})

		it("chains .head() after .loader()", () => {
			const builder = createLayout({ virtualPath: "_root_/(auth)" })
				.loader(async () => ({ title: "Auth" }))
				.head(() => ({ title: "Auth Layout" }))
			expect(typeof builder.headers).toBe("function")
			expect(typeof builder.render).toBe("function")
		})

		it("chains .headers() after .loader()", () => {
			const builder = createLayout({ virtualPath: "_root_/(auth)" })
				.loader(async () => ({}))
				.headers(() => ({ "x-frame-options": "DENY" }))
			expect(typeof builder.render).toBe("function")
		})
	})

	describe("layout result", () => {
		it("returns result with _type: layout", () => {
			const result = createLayout({ virtualPath: "_root_/(auth)" }).render(() => null)
			expect(result._type).toBe("layout")
		})

		it("preserves path in result", () => {
			const result = createLayout({ virtualPath: "_root_/(dashboard)" }).render(() => null)
			expect(result.virtualPath).toBe("_root_/(dashboard)")
		})

		it("preserves options in result", () => {
			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.options({ authenticate: true, prefetch: "viewport" })
				.render(() => null)
			expect(result.options?.authenticate).toBe(true)
			expect(result.options?.prefetch).toBe("viewport")
		})

		it("preserves inputConfig in result", () => {
			const paramsValidator = (raw: Record<string, string>) => ({ orgId: raw.orgId ?? "" })
			const result = createLayout({ virtualPath: "_root_/(dashboard)/[orgId]" })
				.input({ params: paramsValidator })
				.render(() => null)
			expect(result.inputConfig?.params).toBe(paramsValidator)
		})

		it("preserves effectsConfig in result", () => {
			const shouldRefetch = () => true
			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.effects({ shouldRefetch })
				.render(() => null)
			expect(result.effectsConfig?.shouldRefetch).toBe(shouldRefetch)
		})

		it("preserves authorize in result", () => {
			const authorizeFn = () => true
			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.options({ authenticate: true })
				.authorize(authorizeFn)
				.render(() => null)
			expect(result.authorize).toBe(authorizeFn)
		})

		it("preserves loader in result", () => {
			const loader = async () => ({ user: "test" })
			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.loader(loader)
				.render(() => null)
			expect(result.loader).toBe(loader)
		})

		it("preserves preloader in result", () => {
			const preloader = async () => ({ session: {} })
			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.preloader(preloader)
				.render(() => null)
			expect(result.preloader).toBe(preloader)
		})

		it("preserves head in result (with loader)", () => {
			const headFn = () => ({ title: "Auth" })
			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.loader(async () => ({}))
				.head(headFn)
				.render(() => null)
			expect(result.head).toBe(headFn)
		})

		it("preserves headers in result (with loader)", () => {
			const headersFn = () => ({ "x-frame-options": "DENY" })
			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.loader(async () => ({}))
				.headers(headersFn)
				.render(() => null)
			expect(result.headers).toBe(headersFn)
		})

		it("preserves component in result", () => {
			const componentFn = () => null
			const result = createLayout({ virtualPath: "_root_/(auth)" }).render(componentFn)
			expect(result.render).toBe(componentFn)
		})
	})

	describe("type guards", () => {
		it("isLayoutWithLoader returns true when loader present", () => {
			const result = createLayout({ virtualPath: "_root_/(auth)" })
				.loader(async () => ({ user: "test" }))
				.render(() => null)
			expect(isLayoutWithLoader(result)).toBe(true)
		})

		it("isLayoutWithLoader returns false when no loader", () => {
			const result = createLayout({ virtualPath: "_root_/(auth)" }).render(() => null)
			expect(isLayoutWithLoader(result)).toBe(false)
		})
	})

	describe("full chain scenarios", () => {
		it("supports minimal layout (just component)", () => {
			const result = createLayout({ virtualPath: "_root_/(public)" }).render(() => null)
			expect(result._type).toBe("layout")
			expect(result.virtualPath).toBe("_root_/(public)")
		})

		it("supports authenticated layout with loader", () => {
			const result = createLayout({ virtualPath: "_root_/(dashboard)" })
				.options({ authenticate: true })
				.loader(async () => ({ org: {} }))
				.head(() => ({ title: "Dashboard" }))
				.render(() => null)

			expect(result._type).toBe("layout")
			expect(result.options?.authenticate).toBe(true)
		})

		it("supports layout with preloader + loader chain", () => {
			const result = createLayout({ virtualPath: "_root_/(admin)/[tenantId]" })
				.input({ params: (raw: Record<string, string>) => ({ tenantId: raw.tenantId ?? "" }) })
				.preloader(async () => ({ tenant: {} }))
				.loader(async () => ({ permissions: [] }))
				.head(() => ({ title: "Admin" }))
				.headers(() => ({ "x-frame-options": "DENY" }))
				.render(() => null)

			expect(result._type).toBe("layout")
		})
	})
})
