/**
 * Tree Matcher Unit Tests
 *
 * Tests radix tree route matching with O(depth) complexity.
 * Covers: static segments, dynamic params, catch-all, optional catch-all.
 */

import { describe, expect, it } from "vitest"
import {
	createTreeNode,
	type FlareRouteData,
	insertRoute,
	matchRoute,
} from "../../../src/router/_tree-matcher"

/** Helper to create minimal route data for testing */
function createRouteData(overrides: Partial<FlareRouteData> = {}): FlareRouteData {
	return {
		variablePath: "/",
		virtualPath: "_root_",
		...overrides,
	}
}

describe("tree-matcher", () => {
	describe("createTreeNode", () => {
		it("creates empty node with correct structure", () => {
			const node = createTreeNode()
			expect(node.static).toBeInstanceOf(Map)
			expect(node.static.size).toBe(0)
			expect(node.param).toBeNull()
			expect(node.catchAll).toBeNull()
			expect(node.optionalCatchAll).toBeNull()
			expect(node.route).toBeNull()
			expect(node.paramName).toBeUndefined()
		})

		it("creates node with paramName", () => {
			const node = createTreeNode("id")
			expect(node.paramName).toBe("id")
		})
	})

	describe("insertRoute", () => {
		it("inserts static route at root", () => {
			const tree = createTreeNode()
			const route = createRouteData({ variablePath: "/" })
			insertRoute(tree, "/", route)
			expect(tree.route).toBe(route)
		})

		it("inserts static segment", () => {
			const tree = createTreeNode()
			const route = createRouteData({ variablePath: "/products" })
			insertRoute(tree, "/products", route)
			expect(tree.static.get("products")?.route).toBe(route)
		})

		it("inserts nested static segments", () => {
			const tree = createTreeNode()
			const route = createRouteData({ variablePath: "/products/featured" })
			insertRoute(tree, "/products/featured", route)
			expect(tree.static.get("products")?.static.get("featured")?.route).toBe(route)
		})

		it("inserts dynamic param [id]", () => {
			const tree = createTreeNode()
			const route = createRouteData({ variablePath: "/products/[id]" })
			insertRoute(tree, "/products/[id]", route)
			const productsNode = tree.static.get("products")
			expect(productsNode?.param?.route).toBe(route)
			expect(productsNode?.param?.paramName).toBe("id")
		})

		it("inserts catch-all [...slug]", () => {
			const tree = createTreeNode()
			const route = createRouteData({ variablePath: "/docs/[...slug]" })
			insertRoute(tree, "/docs/[...slug]", route)
			const docsNode = tree.static.get("docs")
			expect(docsNode?.catchAll?.route).toBe(route)
			expect(docsNode?.catchAll?.paramName).toBe("slug")
		})

		it("inserts optional catch-all [[...slug]]", () => {
			const tree = createTreeNode()
			const route = createRouteData({ variablePath: "/[[...slug]]" })
			insertRoute(tree, "/[[...slug]]", route)
			expect(tree.optionalCatchAll?.route).toBe(route)
			expect(tree.optionalCatchAll?.paramName).toBe("slug")
		})
	})

	describe("matchRoute", () => {
		describe("static routes", () => {
			it("matches root path", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/" })
				insertRoute(tree, "/", route)

				const result = matchRoute(tree, "/")
				expect(result).not.toBeNull()
				expect(result?.route).toBe(route)
				expect(result?.params).toEqual({})
			})

			it("matches single static segment", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/products" })
				insertRoute(tree, "/products", route)

				const result = matchRoute(tree, "/products")
				expect(result?.route).toBe(route)
				expect(result?.params).toEqual({})
			})

			it("matches nested static segments", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/products/featured/new" })
				insertRoute(tree, "/products/featured/new", route)

				const result = matchRoute(tree, "/products/featured/new")
				expect(result?.route).toBe(route)
			})

			it("is case insensitive", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/products" })
				insertRoute(tree, "/products", route)

				expect(matchRoute(tree, "/Products")?.route).toBe(route)
				expect(matchRoute(tree, "/PRODUCTS")?.route).toBe(route)
			})

			it("returns null for non-matching path", () => {
				const tree = createTreeNode()
				insertRoute(tree, "/products", createRouteData())

				expect(matchRoute(tree, "/users")).toBeNull()
			})

			it("handles trailing slashes", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/products" })
				insertRoute(tree, "/products", route)

				expect(matchRoute(tree, "/products/")?.route).toBe(route)
			})
		})

		describe("dynamic params [id]", () => {
			it("matches and extracts single param", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/products/[id]" })
				insertRoute(tree, "/products/[id]", route)

				const result = matchRoute(tree, "/products/123")
				expect(result?.route).toBe(route)
				expect(result?.params).toEqual({ id: "123" })
			})

			it("matches multiple params", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/users/[userId]/posts/[postId]" })
				insertRoute(tree, "/users/[userId]/posts/[postId]", route)

				const result = matchRoute(tree, "/users/42/posts/99")
				expect(result?.params).toEqual({ postId: "99", userId: "42" })
			})

			it("preserves param value with special chars", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/products/[id]" })
				insertRoute(tree, "/products/[id]", route)

				const result = matchRoute(tree, "/products/abc-123_xyz")
				expect(result?.params).toEqual({ id: "abc-123_xyz" })
			})
		})

		describe("catch-all [...slug]", () => {
			it("matches and extracts rest of path as array", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/docs/[...slug]" })
				insertRoute(tree, "/docs/[...slug]", route)

				const result = matchRoute(tree, "/docs/api/auth/tokens")
				expect(result?.route).toBe(route)
				expect(result?.params).toEqual({ slug: ["api", "auth", "tokens"] })
			})

			it("matches single segment", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/docs/[...slug]" })
				insertRoute(tree, "/docs/[...slug]", route)

				const result = matchRoute(tree, "/docs/intro")
				expect(result?.params).toEqual({ slug: ["intro"] })
			})

			it("does not match empty catch-all (requires at least one segment)", () => {
				const tree = createTreeNode()
				insertRoute(tree, "/docs/[...slug]", createRouteData())

				expect(matchRoute(tree, "/docs")).toBeNull()
			})
		})

		describe("optional catch-all [[...slug]]", () => {
			it("matches with segments", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/[[...slug]]" })
				insertRoute(tree, "/[[...slug]]", route)

				const result = matchRoute(tree, "/any/path/here")
				expect(result?.route).toBe(route)
				expect(result?.params).toEqual({ slug: ["any", "path", "here"] })
			})

			it("matches without segments (empty array)", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/[[...slug]]" })
				insertRoute(tree, "/[[...slug]]", route)

				const result = matchRoute(tree, "/")
				expect(result?.route).toBe(route)
				expect(result?.params).toEqual({ slug: [] })
			})

			it("matches at nested level", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/docs/[[...slug]]" })
				insertRoute(tree, "/docs/[[...slug]]", route)

				expect(matchRoute(tree, "/docs")?.params).toEqual({ slug: [] })
				expect(matchRoute(tree, "/docs/intro")?.params).toEqual({ slug: ["intro"] })
			})
		})

		describe("priority", () => {
			it("prefers static over param", () => {
				const tree = createTreeNode()
				const staticRoute = createRouteData({ variablePath: "/products/featured" })
				const paramRoute = createRouteData({ variablePath: "/products/[id]" })
				insertRoute(tree, "/products/featured", staticRoute)
				insertRoute(tree, "/products/[id]", paramRoute)

				expect(matchRoute(tree, "/products/featured")?.route).toBe(staticRoute)
				expect(matchRoute(tree, "/products/123")?.route).toBe(paramRoute)
			})

			it("prefers param over catch-all", () => {
				const tree = createTreeNode()
				const paramRoute = createRouteData({ variablePath: "/docs/[section]" })
				const catchAllRoute = createRouteData({ variablePath: "/docs/[...slug]" })
				insertRoute(tree, "/docs/[section]", paramRoute)
				insertRoute(tree, "/docs/[...slug]", catchAllRoute)

				expect(matchRoute(tree, "/docs/intro")?.route).toBe(paramRoute)
				expect(matchRoute(tree, "/docs/api/auth")?.route).toBe(catchAllRoute)
			})

			it("prefers catch-all over optional catch-all", () => {
				const tree = createTreeNode()
				const catchAllRoute = createRouteData({ variablePath: "/[...slug]" })
				const optionalRoute = createRouteData({ variablePath: "/[[...slug]]" })
				insertRoute(tree, "/[...slug]", catchAllRoute)
				insertRoute(tree, "/[[...slug]]", optionalRoute)

				expect(matchRoute(tree, "/any/path")?.route).toBe(catchAllRoute)
				expect(matchRoute(tree, "/")?.route).toBe(optionalRoute)
			})
		})

		describe("complex scenarios", () => {
			it("handles mixed static and dynamic segments", () => {
				const tree = createTreeNode()
				const route = createRouteData({ variablePath: "/users/[id]/settings/profile" })
				insertRoute(tree, "/users/[id]/settings/profile", route)

				const result = matchRoute(tree, "/users/42/settings/profile")
				expect(result?.route).toBe(route)
				expect(result?.params).toEqual({ id: "42" })
			})

			it("handles multiple routes in same tree", () => {
				const tree = createTreeNode()
				const homeRoute = createRouteData({ variablePath: "/" })
				const productsRoute = createRouteData({ variablePath: "/products" })
				const productRoute = createRouteData({ variablePath: "/products/[id]" })
				const docsRoute = createRouteData({ variablePath: "/docs/[...slug]" })

				insertRoute(tree, "/", homeRoute)
				insertRoute(tree, "/products", productsRoute)
				insertRoute(tree, "/products/[id]", productRoute)
				insertRoute(tree, "/docs/[...slug]", docsRoute)

				expect(matchRoute(tree, "/")?.route).toBe(homeRoute)
				expect(matchRoute(tree, "/products")?.route).toBe(productsRoute)
				expect(matchRoute(tree, "/products/123")?.route).toBe(productRoute)
				expect(matchRoute(tree, "/docs/api/v1")?.route).toBe(docsRoute)
			})
		})

		describe("pathname normalization", () => {
			it("returns / for root path", () => {
				const tree = createTreeNode()
				insertRoute(tree, "/", createRouteData())

				expect(matchRoute(tree, "/")?.pathname).toBe("/")
			})

			it("lowercases static segments", () => {
				const tree = createTreeNode()
				insertRoute(tree, "/products/featured", createRouteData())

				expect(matchRoute(tree, "/Products/Featured")?.pathname).toBe("/products/featured")
				expect(matchRoute(tree, "/PRODUCTS/FEATURED")?.pathname).toBe("/products/featured")
			})

			it("preserves param case", () => {
				const tree = createTreeNode()
				insertRoute(tree, "/products/[id]", createRouteData())

				const result = matchRoute(tree, "/products/ABC-123")
				expect(result?.pathname).toBe("/products/ABC-123")
				expect(result?.params).toEqual({ id: "ABC-123" })
			})

			it("mixes lowercase static with preserved param case", () => {
				const tree = createTreeNode()
				insertRoute(tree, "/users/[userId]/posts/[postId]", createRouteData())

				const result = matchRoute(tree, "/Users/John-Doe/Posts/My-First-Post")
				expect(result?.pathname).toBe("/users/John-Doe/posts/My-First-Post")
				expect(result?.params).toEqual({ postId: "My-First-Post", userId: "John-Doe" })
			})

			it("preserves catch-all segment case", () => {
				const tree = createTreeNode()
				insertRoute(tree, "/docs/[...slug]", createRouteData())

				const result = matchRoute(tree, "/Docs/API/Auth/OAuth")
				expect(result?.pathname).toBe("/docs/API/Auth/OAuth")
				expect(result?.params).toEqual({ slug: ["API", "Auth", "OAuth"] })
			})

			it("preserves optional catch-all segment case", () => {
				const tree = createTreeNode()
				insertRoute(tree, "/[[...slug]]", createRouteData())

				const result = matchRoute(tree, "/Any/Path/Here")
				expect(result?.pathname).toBe("/Any/Path/Here")
				expect(result?.params).toEqual({ slug: ["Any", "Path", "Here"] })
			})

			it("handles empty optional catch-all", () => {
				const tree = createTreeNode()
				insertRoute(tree, "/docs/[[...slug]]", createRouteData())

				expect(matchRoute(tree, "/docs")?.pathname).toBe("/docs")
				expect(matchRoute(tree, "/Docs")?.pathname).toBe("/docs")
			})
		})
	})
})
