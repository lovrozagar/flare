/**
 * Match ID Unit Tests
 *
 * Tests match ID computation for client-side caching.
 * Match ID = routeId + params hash + loaderDeps hash
 */

import { describe, expect, it } from "vitest"
import { computeMatchId, parseMatchId } from "../../../src/router/_internal/match-id"

describe("computeMatchId", () => {
	it("computes id for route without params or deps", () => {
		const matchId = computeMatchId({
			params: {},
			routeId: "_root_",
			search: {},
		})

		expect(matchId).toBe("_root_:{}:[]")
	})

	it("includes params in match id", () => {
		const matchId = computeMatchId({
			params: { id: "123" },
			routeId: "_root_/products/[id]",
			search: {},
		})

		expect(matchId).toBe('_root_/products/[id]:{"id":"123"}:[]')
	})

	it("different params produce different match ids", () => {
		const matchId1 = computeMatchId({
			params: { id: "123" },
			routeId: "_root_/products/[id]",
			search: {},
		})

		const matchId2 = computeMatchId({
			params: { id: "456" },
			routeId: "_root_/products/[id]",
			search: {},
		})

		expect(matchId1).not.toBe(matchId2)
	})

	it("includes loaderDeps in match id", () => {
		const matchId = computeMatchId({
			loaderDeps: ({ search }) => [search.page ?? 1],
			params: {},
			routeId: "_root_/products",
			search: { page: "2" },
		})

		expect(matchId).toBe('_root_/products:{}:["2"]')
	})

	it("same route with different loaderDeps produces different ids", () => {
		const loaderDeps = ({ search }: { search: Record<string, string> }) => [search.page ?? "1"]

		const matchId1 = computeMatchId({
			loaderDeps,
			params: {},
			routeId: "_root_/products",
			search: { page: "1" },
		})

		const matchId2 = computeMatchId({
			loaderDeps,
			params: {},
			routeId: "_root_/products",
			search: { page: "2" },
		})

		expect(matchId1).not.toBe(matchId2)
	})

	it("search params not in loaderDeps do not affect match id", () => {
		const loaderDeps = ({ search }: { search: Record<string, string> }) => [search.page ?? "1"]

		const matchId1 = computeMatchId({
			loaderDeps,
			params: {},
			routeId: "_root_/products",
			search: { page: "1", sort: "name" },
		})

		const matchId2 = computeMatchId({
			loaderDeps,
			params: {},
			routeId: "_root_/products",
			search: { page: "1", sort: "price" },
		})

		expect(matchId1).toBe(matchId2)
	})

	it("handles multiple params", () => {
		const matchId = computeMatchId({
			params: { category: "electronics", id: "123" },
			routeId: "_root_/[category]/[id]",
			search: {},
		})

		expect(matchId).toBe('_root_/[category]/[id]:{"category":"electronics","id":"123"}:[]')
	})

	it("handles catch-all params as arrays", () => {
		const matchId = computeMatchId({
			params: { slug: ["docs", "api", "auth"] },
			routeId: "_root_/docs/[...slug]",
			search: {},
		})

		expect(matchId).toBe('_root_/docs/[...slug]:{"slug":["docs","api","auth"]}:[]')
	})

	it("handles multiple loaderDeps", () => {
		const matchId = computeMatchId({
			loaderDeps: ({ search }) => [search.page ?? "1", search.category ?? "all"],
			params: {},
			routeId: "_root_/products",
			search: { category: "electronics", page: "2" },
		})

		expect(matchId).toBe('_root_/products:{}:["2","electronics"]')
	})

	it("handles no loaderDeps function", () => {
		const matchId = computeMatchId({
			params: { id: "123" },
			routeId: "_root_/products/[id]",
			search: { page: "1" },
		})

		expect(matchId).toBe('_root_/products/[id]:{"id":"123"}:[]')
	})

	it("sorts params keys for consistent ordering", () => {
		const matchId1 = computeMatchId({
			params: { a: "1", b: "2" },
			routeId: "_root_/test",
			search: {},
		})

		/* Build params in reverse order to test sorting */
		const unsortedParams: Record<string, string> = {}
		unsortedParams.b = "2"
		unsortedParams.a = "1"

		const matchId2 = computeMatchId({
			params: unsortedParams,
			routeId: "_root_/test",
			search: {},
		})

		expect(matchId1).toBe(matchId2)
	})
})

describe("parseMatchId", () => {
	it("parses match id into components", () => {
		const parsed = parseMatchId('_root_/products/[id]:{"id":"123"}:[]')

		expect(parsed).toEqual({
			deps: [],
			params: { id: "123" },
			routeId: "_root_/products/[id]",
		})
	})

	it("parses match id with deps", () => {
		const parsed = parseMatchId('_root_/products:{}:["2","electronics"]')

		expect(parsed).toEqual({
			deps: ["2", "electronics"],
			params: {},
			routeId: "_root_/products",
		})
	})

	it("parses match id with catch-all params", () => {
		const parsed = parseMatchId('_root_/docs/[...slug]:{"slug":["api","auth"]}:[]')

		expect(parsed).toEqual({
			deps: [],
			params: { slug: ["api", "auth"] },
			routeId: "_root_/docs/[...slug]",
		})
	})

	it("returns null for invalid match id", () => {
		expect(parseMatchId("invalid")).toBeNull()
		expect(parseMatchId("")).toBeNull()
		expect(parseMatchId("_root_")).toBeNull()
	})

	it("returns null for malformed JSON in params", () => {
		expect(parseMatchId("_root_:{invalid}:[]")).toBeNull()
	})
})

describe("spec examples", () => {
	it('/products/123 → _root_/products/[id]:{"id":"123"}:[]', () => {
		const matchId = computeMatchId({
			params: { id: "123" },
			routeId: "_root_/products/[id]",
			search: {},
		})

		expect(matchId).toBe('_root_/products/[id]:{"id":"123"}:[]')
	})

	it("/products?page=1 with loaderDeps → _root_/products:{}:[1]", () => {
		const matchId = computeMatchId({
			loaderDeps: ({ search }) => [Number(search.page) || 1],
			params: {},
			routeId: "_root_/products",
			search: { page: "1" },
		})

		expect(matchId).toBe("_root_/products:{}:[1]")
	})

	it("/products?sort=name without loaderDeps → same as /products", () => {
		const matchId1 = computeMatchId({
			params: {},
			routeId: "_root_/products",
			search: {},
		})

		const matchId2 = computeMatchId({
			params: {},
			routeId: "_root_/products",
			search: { sort: "name" },
		})

		expect(matchId1).toBe(matchId2)
	})
})
