/**
 * Outlet Unit Tests
 *
 * Tests Outlet component and context for nested route rendering.
 * Outlet reads from router context to render matched child components.
 * Supports optional fallback prop for loading states.
 */

import { describe, expect, it } from "vitest"
import {
	createOutletContext,
	getChildMatch,
	isOutletContext,
	type MatchedRoute,
	Outlet,
	OutletContext,
	type OutletContextValue,
	useOutletContext,
} from "../../../src/router/outlet"

describe("Outlet", () => {
	describe("createOutletContext", () => {
		it("creates context with matches and depth", () => {
			const matchesArray: MatchedRoute[] = [
				{ loaderData: { theme: "dark" }, render: () => "root", virtualPath: "_root_" },
				{ loaderData: { categories: [] }, render: () => "blog", virtualPath: "_root_/blog" },
			]
			const matches = () => matchesArray
			const ctx = createOutletContext({ depth: 0, matches })

			expect(ctx.depth).toBe(0)
			expect(ctx.matches).toBe(matches)
		})

		it("creates context with depth 1", () => {
			const matches = () => [] as MatchedRoute[]
			const ctx = createOutletContext({ depth: 1, matches })

			expect(ctx.depth).toBe(1)
		})

		it("creates context with empty matches", () => {
			const ctx = createOutletContext({ depth: 0, matches: () => [] })

			expect(ctx.matches()).toEqual([])
		})
	})

	describe("OutletContext", () => {
		it("OutletContext is defined", () => {
			expect(OutletContext).toBeDefined()
		})
	})

	describe("isOutletContext", () => {
		it("returns true for valid outlet context", () => {
			const ctx: OutletContextValue = {
				depth: 0,
				matches: () => [],
			}
			expect(isOutletContext(ctx)).toBe(true)
		})

		it("returns true for context with matches", () => {
			const ctx: OutletContextValue = {
				depth: 1,
				matches: () => [{ loaderData: {}, render: () => null, virtualPath: "_root_" }],
			}
			expect(isOutletContext(ctx)).toBe(true)
		})

		it("returns false for null", () => {
			expect(isOutletContext(null)).toBe(false)
		})

		it("returns false for undefined", () => {
			expect(isOutletContext(undefined)).toBe(false)
		})

		it("returns false for empty object", () => {
			expect(isOutletContext({})).toBe(false)
		})

		it("returns false for object without depth", () => {
			expect(isOutletContext({ matches: [] })).toBe(false)
		})

		it("returns false for object without matches", () => {
			expect(isOutletContext({ depth: 0 })).toBe(false)
		})

		it("returns false for object with invalid depth type", () => {
			expect(isOutletContext({ depth: "0", matches: [] })).toBe(false)
		})

		it("returns false for object with invalid matches type", () => {
			expect(isOutletContext({ depth: 0, matches: [] })).toBe(false)
		})
	})

	describe("MatchedRoute type", () => {
		it("requires component, loaderData, and path", () => {
			const match: MatchedRoute = {
				loaderData: { value: 123 },
				render: () => "test",
				virtualPath: "_root_/test",
			}

			expect(match.render).toBeDefined()
			expect(match.loaderData).toEqual({ value: 123 })
			expect(match.virtualPath).toBe("_root_/test")
		})

		it("supports optional preloaderContext", () => {
			const match: MatchedRoute = {
				loaderData: {},
				preloaderContext: { locale: "en" },
				render: () => "test",
				virtualPath: "_root_/test",
			}

			expect(match.preloaderContext).toEqual({ locale: "en" })
		})
	})

	describe("getChildComponent helper", () => {
		it("returns component at depth + 1", () => {
			const matchesArray: MatchedRoute[] = [
				{ loaderData: {}, render: () => "root", virtualPath: "_root_" },
				{ loaderData: {}, render: () => "blog", virtualPath: "_root_/blog" },
				{ loaderData: {}, render: () => "post", virtualPath: "_root_/blog/[slug]" },
			]
			const ctx = createOutletContext({ depth: 0, matches: () => matchesArray })
			const child = ctx.matches()[ctx.depth + 1]

			expect(child?.render({})).toBe("blog")
		})

		it("returns undefined when no child at depth", () => {
			const matchesArray: MatchedRoute[] = [
				{ loaderData: {}, render: () => "root", virtualPath: "_root_" },
			]
			const ctx = createOutletContext({ depth: 0, matches: () => matchesArray })
			const child = ctx.matches()[ctx.depth + 1]

			expect(child).toBeUndefined()
		})

		it("returns correct child for nested depth", () => {
			const matchesArray: MatchedRoute[] = [
				{ loaderData: {}, render: () => "root", virtualPath: "_root_" },
				{ loaderData: {}, render: () => "blog", virtualPath: "_root_/blog" },
				{ loaderData: {}, render: () => "post", virtualPath: "_root_/blog/[slug]" },
			]
			const ctx = createOutletContext({ depth: 1, matches: () => matchesArray })
			const child = ctx.matches()[ctx.depth + 1]

			expect(child?.render({})).toBe("post")
		})
	})

	describe("incrementDepth helper", () => {
		it("increments depth for nested outlets", () => {
			const ctx = createOutletContext({ depth: 0, matches: () => [] })
			const nested = createOutletContext({ depth: ctx.depth + 1, matches: ctx.matches })

			expect(nested.depth).toBe(1)
		})

		it("preserves matches reference", () => {
			const matchesArray: MatchedRoute[] = [
				{ loaderData: {}, render: () => "root", virtualPath: "_root_" },
			]
			const matches = () => matchesArray
			const ctx = createOutletContext({ depth: 0, matches })
			const nested = createOutletContext({ depth: ctx.depth + 1, matches: ctx.matches })

			expect(nested.matches).toBe(matches)
		})
	})

	describe("getChildMatch", () => {
		it("returns match at depth + 1", () => {
			const matchesArray: MatchedRoute[] = [
				{ loaderData: {}, render: () => "root", virtualPath: "_root_" },
				{ loaderData: { categories: [] }, render: () => "blog", virtualPath: "_root_/blog" },
			]
			const ctx = createOutletContext({ depth: 0, matches: () => matchesArray })
			const child = getChildMatch(ctx)

			expect(child).toBeDefined()
			expect(child?.virtualPath).toBe("_root_/blog")
		})

		it("returns undefined when no child exists", () => {
			const matchesArray: MatchedRoute[] = [
				{ loaderData: {}, render: () => "root", virtualPath: "_root_" },
			]
			const ctx = createOutletContext({ depth: 0, matches: () => matchesArray })
			const child = getChildMatch(ctx)

			expect(child).toBeUndefined()
		})

		it("returns correct child for nested depth", () => {
			const matchesArray: MatchedRoute[] = [
				{ loaderData: {}, render: () => "root", virtualPath: "_root_" },
				{ loaderData: {}, render: () => "blog", virtualPath: "_root_/blog" },
				{ loaderData: {}, render: () => "post", virtualPath: "_root_/blog/[slug]" },
			]
			const ctx = createOutletContext({ depth: 1, matches: () => matchesArray })
			const child = getChildMatch(ctx)

			expect(child?.virtualPath).toBe("_root_/blog/[slug]")
		})
	})

	describe("Outlet component", () => {
		it("is defined", () => {
			expect(Outlet).toBeDefined()
			expect(typeof Outlet).toBe("function")
		})
	})

	describe("useOutletContext", () => {
		it("is defined", () => {
			expect(useOutletContext).toBeDefined()
			expect(typeof useOutletContext).toBe("function")
		})
	})
})
