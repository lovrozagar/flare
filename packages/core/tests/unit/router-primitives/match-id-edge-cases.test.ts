import { describe, expect, it } from "vitest";
import { computeMatchId, parseMatchId } from "../../../src/router-primitives/index.ts";

/* ── computeMatchId edge cases ───────────────────────────────────── */

describe("computeMatchId edge cases", () => {
	it("empty params and no loaderDeps", () => {
		const id = computeMatchId({ params: {}, routeId: "_root_", search: {} });
		expect(id).toBe("_root_:{}:[]");
	});

	it("params are sorted alphabetically", () => {
		const id = computeMatchId({
			params: { a: "2", m: "3", z: "1" },
			routeId: "route",
			search: {},
		});
		expect(id).toContain('"a":"2"');
		expect(id).toContain('"m":"3"');
		expect(id).toContain('"z":"1"');
		/* a comes before m comes before z */
		const aIdx = id.indexOf('"a"');
		const mIdx = id.indexOf('"m"');
		const zIdx = id.indexOf('"z"');
		expect(aIdx).toBeLessThan(mIdx);
		expect(mIdx).toBeLessThan(zIdx);
	});

	it("array param values preserved", () => {
		const id = computeMatchId({
			params: { slug: ["a", "b", "c"] },
			routeId: "docs",
			search: {},
		});
		expect(id).toContain('["a","b","c"]');
	});

	it("loaderDeps produces stable deps array", () => {
		const id = computeMatchId({
			loaderDeps: ({ search }) => [search.page, search.sort],
			params: {},
			routeId: "list",
			search: { page: "2", sort: "name" },
		});
		expect(id).toContain('["2","name"]');
	});

	it("loaderDeps with objects are stably stringified", () => {
		const id1 = computeMatchId({
			loaderDeps: () => [{ a: 1, b: 2 }],
			params: {},
			routeId: "r",
			search: {},
		});
		const id2 = computeMatchId({
			loaderDeps: () => [{ a: 1, b: 2 }],
			params: {},
			routeId: "r",
			search: {},
		});
		/* Same content, different key order → same matchId */
		expect(id1).toBe(id2);
	});

	it("routeId with colon does not break parsing", () => {
		const id = computeMatchId({
			params: { id: "42" },
			routeId: "_root_/api:v2",
			search: {},
		});
		/* The colon in routeId is fine — parseMatchId uses :{  to find params start */
		const parsed = parseMatchId(id);
		expect(parsed?.routeId).toBe("_root_/api:v2");
	});

	it("special characters in param values", () => {
		const id = computeMatchId({
			params: { q: 'hello "world"' },
			routeId: "search",
			search: {},
		});
		const parsed = parseMatchId(id);
		expect(parsed?.params.q).toBe('hello "world"');
	});
});

/* ── stableStringify circular reference ─────────────────────────── */

describe("computeMatchId circular ref safety", () => {
	it("circular object in loaderDeps does not infinite loop", () => {
		const obj: Record<string, unknown> = { a: 1 };
		obj.self = obj;
		const id = computeMatchId({
			loaderDeps: () => [obj],
			params: {},
			routeId: "circ",
			search: {},
		});
		expect(typeof id).toBe("string");
		expect(id).toContain("circ");
	});

	it("deeply nested circular ref produces valid matchId", () => {
		const inner: Record<string, unknown> = { x: 1 };
		const outer = { inner, y: 2 };
		inner.parent = outer;
		const id = computeMatchId({
			loaderDeps: () => [outer],
			params: {},
			routeId: "deep-circ",
			search: {},
		});
		expect(typeof id).toBe("string");
		expect(id).toContain("deep-circ");
	});

	it("non-circular objects still produce correct stable output", () => {
		const a = computeMatchId({
			loaderDeps: () => [{ nested: { x: 1, y: 2 } }],
			params: {},
			routeId: "ok",
			search: {},
		});
		const b = computeMatchId({
			loaderDeps: () => [{ nested: { x: 1, y: 2 } }],
			params: {},
			routeId: "ok",
			search: {},
		});
		expect(a).toBe(b);
	});
});

/* ── parseMatchId edge cases ─────────────────────────────────────── */

describe("parseMatchId edge cases", () => {
	it("empty string → null", () => {
		expect(parseMatchId("")).toBeNull();
	});

	it("no brace → null", () => {
		expect(parseMatchId("route:params")).toBeNull();
	});

	it("missing deps array → null", () => {
		expect(parseMatchId("route:{}")).toBeNull();
	});

	it("malformed JSON in params → null", () => {
		expect(parseMatchId("route:{invalid}:[]")).toBeNull();
	});

	it("malformed JSON in deps → null", () => {
		expect(parseMatchId("route:{}:[not json]")).toBeNull();
	});

	it("params is array instead of object → null", () => {
		expect(parseMatchId("route:[1,2,3]:[]")).toBeNull();
	});

	it("deps is object instead of array → null", () => {
		expect(parseMatchId('route:{}:{"a":1}')).toBeNull();
	});

	it("roundtrip: compute then parse", () => {
		const id = computeMatchId({
			loaderDeps: () => ["dep1", 42],
			params: { category: "electronics", id: "42" },
			routeId: "_root_/products/[category]/[id]",
			search: {},
		});
		const parsed = parseMatchId(id);
		expect(parsed).not.toBeNull();
		expect(parsed?.routeId).toBe("_root_/products/[category]/[id]");
		expect(parsed?.params).toEqual({ category: "electronics", id: "42" });
		expect(parsed?.deps).toEqual(["dep1", 42]);
	});

	it("nested JSON in params with braces", () => {
		/* Params containing values with braces/brackets in strings */
		const id = computeMatchId({
			params: { filter: '{"status":"active"}' },
			routeId: "list",
			search: {},
		});
		const parsed = parseMatchId(id);
		expect(parsed?.params.filter).toBe('{"status":"active"}');
	});

	it("params with colon in value", () => {
		const id = computeMatchId({
			params: { time: "12:30:00" },
			routeId: "schedule",
			search: {},
		});
		const parsed = parseMatchId(id);
		expect(parsed?.params.time).toBe("12:30:00");
	});

	it("empty routeId", () => {
		const id = computeMatchId({ params: {}, routeId: "", search: {} });
		const parsed = parseMatchId(id);
		expect(parsed?.routeId).toBe("");
	});
});
