/**
 * Route Tree Unit Tests
 *
 * Tests building route tree from route factory results.
 * Converts route definitions to radix tree structure.
 */

import { describe, expect, it } from "vitest"
import {
	addRoute,
	createRouteTree,
	match,
	type RouteDefinition,
} from "../../../src/router/_route-tree"

describe("RouteTree", () => {
	describe("createRouteTree", () => {
		it("creates empty tree", () => {
			const tree = createRouteTree()
			expect(tree).toBeDefined()
			expect(tree.root).toBeDefined()
		})

		it("creates tree from route definitions", () => {
			const routes: RouteDefinition[] = [
				{ _type: "render", render: () => null, virtualPath: "_root_/about" },
			]
			const tree = createRouteTree(routes)
			expect(tree.routes.size).toBe(1)
		})
	})

	describe("addRoute", () => {
		it("adds static route", () => {
			const tree = createRouteTree()
			addRoute(tree, { _type: "render", render: () => null, virtualPath: "_root_/about" })
			expect(tree.routes.has("_root_/about")).toBe(true)
		})

		it("adds dynamic route", () => {
			const tree = createRouteTree()
			addRoute(tree, { _type: "render", render: () => null, virtualPath: "_root_/products/[id]" })
			expect(tree.routes.has("_root_/products/[id]")).toBe(true)
		})

		it("adds catch-all route", () => {
			const tree = createRouteTree()
			addRoute(tree, { _type: "render", render: () => null, virtualPath: "_root_/docs/[...slug]" })
			expect(tree.routes.has("_root_/docs/[...slug]")).toBe(true)
		})

		it("adds layout route", () => {
			const tree = createRouteTree()
			addRoute(tree, { _type: "layout", render: () => null, virtualPath: "_root_/(dashboard)" })
			expect(tree.routes.has("_root_/(dashboard)")).toBe(true)
		})

		it("adds root layout route", () => {
			const tree = createRouteTree()
			addRoute(tree, { _type: "root-layout", render: () => null, virtualPath: "_root_" })
			expect(tree.routes.has("_root_")).toBe(true)
		})
	})

	describe("matchRoute", () => {
		it("matches static route", () => {
			const tree = createRouteTree([
				{ _type: "root-layout", render: () => "root", virtualPath: "_root_" },
				{ _type: "render", render: () => "about", virtualPath: "_root_/about" },
			])
			const result = match(tree, "/about")
			expect(result).toBeDefined()
			expect(result?.matches).toHaveLength(2)
			expect(result?.matches[1]?.virtualPath).toBe("_root_/about")
		})

		it("matches dynamic route", () => {
			const tree = createRouteTree([
				{ _type: "root-layout", render: () => "root", virtualPath: "_root_" },
				{ _type: "render", render: () => "product", virtualPath: "_root_/products/[id]" },
			])
			const result = match(tree, "/products/123")
			expect(result).toBeDefined()
			expect(result?.params).toEqual({ id: "123" })
		})

		it("matches catch-all route", () => {
			const tree = createRouteTree([
				{ _type: "root-layout", render: () => "root", virtualPath: "_root_" },
				{ _type: "render", render: () => "docs", virtualPath: "_root_/docs/[...slug]" },
			])
			const result = match(tree, "/docs/api/auth/tokens")
			expect(result).toBeDefined()
			expect(result?.params).toEqual({ slug: ["api", "auth", "tokens"] })
		})

		it("matches with layout hierarchy", () => {
			const tree = createRouteTree([
				{ _type: "root-layout", render: () => "root", virtualPath: "_root_" },
				{ _type: "layout", render: () => "dashboard", virtualPath: "_root_/(dashboard)" },
				{ _type: "render", render: () => "settings", virtualPath: "_root_/(dashboard)/settings" },
			])
			const result = match(tree, "/settings")
			expect(result?.matches).toHaveLength(3)
		})

		it("returns null for unmatched route", () => {
			const tree = createRouteTree([
				{ _type: "root-layout", render: () => "root", virtualPath: "_root_" },
				{ _type: "render", render: () => "about", virtualPath: "_root_/about" },
			])
			const result = match(tree, "/nonexistent")
			expect(result).toBeNull()
		})

		it("matches index route", () => {
			const tree = createRouteTree([
				{ _type: "root-layout", render: () => "root", virtualPath: "_root_" },
				{ _type: "render", render: () => "home", virtualPath: "_root_/index" },
			])
			const result = match(tree, "/index")
			expect(result).toBeDefined()
			expect(result?.matches.length).toBeGreaterThanOrEqual(1)
		})

		it("includes loader data in matches", () => {
			const tree = createRouteTree([
				{ _type: "root-layout", render: () => "root", virtualPath: "_root_" },
				{ _type: "render", render: () => "page", virtualPath: "_root_/test" },
			])
			const result = match(tree, "/test")
			expect(result?.matches[0]?.loaderData).toBeDefined()
		})
	})

	describe("variablePath extraction", () => {
		it("extracts variablePath from virtualPath", () => {
			const tree = createRouteTree([
				{ _type: "render", render: () => null, virtualPath: "_root_/products/[id]" },
			])
			const route = tree.routes.get("_root_/products/[id]")
			expect(route?.variablePath).toBe("/products/[id]")
		})

		it("strips layout groups from variablePath", () => {
			const tree = createRouteTree([
				{ _type: "render", render: () => null, virtualPath: "_root_/(dashboard)/settings" },
			])
			const route = tree.routes.get("_root_/(dashboard)/settings")
			expect(route?.variablePath).toBe("/settings")
		})

		it("strips root layout prefix", () => {
			const tree = createRouteTree([
				{ _type: "render", render: () => null, virtualPath: "_admin_/users" },
			])
			const route = tree.routes.get("_admin_/users")
			expect(route?.variablePath).toBe("/users")
		})
	})
})
