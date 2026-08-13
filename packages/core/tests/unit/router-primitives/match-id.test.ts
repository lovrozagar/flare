import { describe, expect, it } from "vitest"
import { computeMatchId, parseMatchId } from "../../../src/router-primitives/index.ts"

describe("computeMatchId", () => {
	it("produces deterministic ID with empty params", () => {
		const id = computeMatchId({
			params: {},
			routeId: "_root_/about",
			search: {},
		})
		expect(id).toBe("_root_/about:{}:[]")
	})

	it("includes params in ID", () => {
		const id = computeMatchId({
			params: { id: "123" },
			routeId: "_root_/products/[id]",
			search: {},
		})
		expect(id).toBe('_root_/products/[id]:{"id":"123"}:[]')
	})

	it("sorts params alphabetically", () => {
		const a = computeMatchId({
			params: { a: "1", b: "2" },
			routeId: "_root_/x",
			search: {},
		})
		const b = computeMatchId({
			params: { a: "1", b: "2" },
			routeId: "_root_/x",
			search: {},
		})
		expect(a).toBe(b)
		expect(a).toBe('_root_/x:{"a":"1","b":"2"}:[]')
	})

	it("serializes catch-all params as arrays", () => {
		const id = computeMatchId({
			params: { slug: ["a", "b"] },
			routeId: "_root_/docs/[...slug]",
			search: {},
		})
		expect(id).toBe('_root_/docs/[...slug]:{"slug":["a","b"]}:[]')
	})

	it("includes loaderDeps result", () => {
		const id = computeMatchId({
			loaderDeps: ({ search }) => [search.q],
			params: {},
			routeId: "_root_/search",
			search: { q: "test" },
		})
		expect(id).toBe('_root_/search:{}:["test"]')
	})

	it("different params produce different IDs", () => {
		const base = { routeId: "_root_/products/[id]", search: {} }
		const a = computeMatchId({ ...base, params: { id: "1" } })
		const b = computeMatchId({ ...base, params: { id: "2" } })
		expect(a).not.toBe(b)
	})

	it("different loaderDeps produce different IDs", () => {
		const a = computeMatchId({
			loaderDeps: ({ search }) => [search.q],
			params: {},
			routeId: "_root_/search",
			search: { q: "foo" },
		})
		const b = computeMatchId({
			loaderDeps: ({ search }) => [search.q],
			params: {},
			routeId: "_root_/search",
			search: { q: "bar" },
		})
		expect(a).not.toBe(b)
	})

	it("deps with different key order produce same ID", () => {
		const a = computeMatchId({
			loaderDeps: () => [{ a: 1, b: 2 }],
			params: {},
			routeId: "_root_/test",
			search: {},
		})
		const b = computeMatchId({
			loaderDeps: () => [{ a: 1, b: 2 }],
			params: {},
			routeId: "_root_/test",
			search: {},
		})
		expect(a).toBe(b)
	})

	it("nested object deps with different key order produce same ID", () => {
		const a = computeMatchId({
			loaderDeps: () => [{ z: { a: 1, b: 2 } }],
			params: {},
			routeId: "_root_/deep",
			search: {},
		})
		const b = computeMatchId({
			loaderDeps: () => [{ z: { a: 1, b: 2 } }],
			params: {},
			routeId: "_root_/deep",
			search: {},
		})
		expect(a).toBe(b)
	})

	it("no loaderDeps defaults to empty array", () => {
		const id = computeMatchId({
			params: {},
			routeId: "_root_/about",
			search: {},
		})
		expect(id).toContain(":[]")
	})
})

describe("parseMatchId", () => {
	it("parses valid match ID", () => {
		const parsed = parseMatchId('_root_/products/[id]:{"id":"123"}:[]')
		expect(parsed).toEqual({
			deps: [],
			params: { id: "123" },
			routeId: "_root_/products/[id]",
		})
	})

	it("parses match ID with deps", () => {
		const parsed = parseMatchId('_root_/search:{}:["test"]')
		expect(parsed).toEqual({
			deps: ["test"],
			params: {},
			routeId: "_root_/search",
		})
	})

	it("parses catch-all params", () => {
		const parsed = parseMatchId('_root_/docs/[...slug]:{"slug":["a","b"]}:[]')
		expect(parsed).toEqual({
			deps: [],
			params: { slug: ["a", "b"] },
			routeId: "_root_/docs/[...slug]",
		})
	})

	it("returns null for malformed input", () => {
		expect(parseMatchId("garbage")).toBeNull()
		expect(parseMatchId("")).toBeNull()
	})

	it("roundtrips with computeMatchId", () => {
		const id = computeMatchId({
			loaderDeps: ({ search }) => [search.q],
			params: { id: "123" },
			routeId: "_root_/products/[id]",
			search: { q: "test" },
		})
		const parsed = parseMatchId(id)
		expect(parsed).toEqual({
			deps: ["test"],
			params: { id: "123" },
			routeId: "_root_/products/[id]",
		})
	})

	it("handles param values containing ':['", () => {
		const id = computeMatchId({
			params: { key: "value:[1,2]" },
			routeId: "_root_/test",
			search: {},
		})
		const parsed = parseMatchId(id)
		expect(parsed).toEqual({
			deps: [],
			params: { key: "value:[1,2]" },
			routeId: "_root_/test",
		})
	})

	it("handles deps containing ':{' pattern", () => {
		const id = computeMatchId({
			loaderDeps: ({ search }) => [search.q],
			params: {},
			routeId: "_root_/search",
			search: { q: "obj:{foo}" },
		})
		const parsed = parseMatchId(id)
		expect(parsed).toEqual({
			deps: ["obj:{foo}"],
			params: {},
			routeId: "_root_/search",
		})
	})

	it("returns null for truncated params JSON", () => {
		expect(parseMatchId('_root_/x:{"a":"1')).toBeNull()
	})

	it("returns null for missing deps separator", () => {
		expect(parseMatchId('_root_/x:{"a":"1"}')).toBeNull()
	})
})
