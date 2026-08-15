import { describe, expect, it } from "vitest";
import { concatArrays, isRenderFn, mergeHeadConfigs, mergeResponseHeaders } from "../../../src/internal.ts";
import { BUILDER_MARKER } from "../../../src/route-builder/types.ts";

/* ── isRenderFn edge cases ─────────────────────────────────────────── */

describe("isRenderFn edge cases", () => {
	it("null → false", () => {
		expect(isRenderFn(null)).toBe(false);
	});

	it("undefined → false", () => {
		expect(isRenderFn(undefined)).toBe(false);
	});

	it("string → false", () => {
		expect(isRenderFn("function")).toBe(false);
	});

	it("number → false", () => {
		expect(isRenderFn(42)).toBe(false);
	});

	it("arrow fn with 0 args → true", () => {
		expect(isRenderFn(() => "jsx")).toBe(true);
	});

	it("arrow fn with 1 arg (props) → true", () => {
		expect(isRenderFn((_props: unknown) => "jsx")).toBe(true);
	});

	it("function with 2 args → false (builder boundary)", () => {
		expect(isRenderFn((_a: unknown, _b: unknown) => "x")).toBe(false);
	});

	it("function with 3 args → false", () => {
		expect(isRenderFn((_a: unknown, _b: unknown, _c: unknown) => "x")).toBe(false);
	});

	it("function with BUILDER_MARKER → false even with 0 args", () => {
		const fn = Object.assign(() => "builder", { [BUILDER_MARKER]: true });
		expect(isRenderFn(fn)).toBe(false);
	});

	it("function with BUILDER_MARKER → false even with 1 arg", () => {
		const fn = Object.assign((_p: unknown) => "builder", { [BUILDER_MARKER]: true });
		expect(isRenderFn(fn)).toBe(false);
	});

	it("object → false", () => {
		expect(isRenderFn({})).toBe(false);
	});

	it("class constructor → depends on length", () => {
		class MyClass {}
		/* class constructors have .length = 0 */
		expect(isRenderFn(MyClass)).toBe(true);
	});

	it("bound function preserves length 0", () => {
		const fn = (() => "x").bind(null);
		expect(isRenderFn(fn)).toBe(true);
	});
});

/* ── concatArrays edge cases ───────────────────────────────────────── */

describe("concatArrays edge cases", () => {
	it("both undefined → undefined", () => {
		expect(concatArrays(undefined, undefined)).toBeUndefined();
	});

	it("a defined, b undefined → a", () => {
		expect(concatArrays([1], undefined)).toEqual([1]);
	});

	it("a undefined, b defined → b", () => {
		expect(concatArrays(undefined, [2])).toEqual([2]);
	});

	it("both defined → concatenated", () => {
		expect(concatArrays([1], [2, 3])).toEqual([1, 2, 3]);
	});

	it("both empty arrays → empty array", () => {
		expect(concatArrays([], [])).toEqual([]);
	});

	it("returns new array (no mutation)", () => {
		const a = [1];
		const b = [2];
		const result = concatArrays(a, b);
		expect(result).not.toBe(a);
		expect(result).not.toBe(b);
	});
});

/* ── mergeHeadConfigs edge cases ───────────────────────────────────── */

describe("mergeHeadConfigs edge cases", () => {
	it("both undefined → empty object", () => {
		expect(mergeHeadConfigs(undefined, undefined)).toEqual({});
	});

	it("parent only → shallow copy", () => {
		const parent = { title: "Parent" };
		const result = mergeHeadConfigs(parent, undefined);
		expect(result).toEqual({ title: "Parent" });
		expect(result).not.toBe(parent);
	});

	it("child only → shallow copy", () => {
		const child = { title: "Child" };
		const result = mergeHeadConfigs(undefined, child);
		expect(result).toEqual({ title: "Child" });
		expect(result).not.toBe(child);
	});

	it("scalar: child title overrides parent title", () => {
		expect(mergeHeadConfigs({ title: "P" }, { title: "C" })).toEqual({ title: "C" });
	});

	it("scalar: child description overrides parent", () => {
		expect(mergeHeadConfigs({ description: "old" }, { description: "new" })).toEqual({
			description: "new",
		});
	});

	it("scalar: child canonical overrides parent", () => {
		expect(mergeHeadConfigs({ canonical: "/old" }, { canonical: "/new" })).toEqual({
			canonical: "/new",
		});
	});

	it("object: meta shallow merges, child wins", () => {
		const result = mergeHeadConfigs(
			{ meta: { author: "A", viewport: "width=device-width" } },
			{ meta: { author: "B", charset: "utf-8" } },
		);
		expect(result.meta).toEqual({
			author: "B",
			charset: "utf-8",
			viewport: "width=device-width",
		});
	});

	it("object: openGraph merges", () => {
		const result = mergeHeadConfigs(
			{ openGraph: { siteName: "Site", type: "website" } },
			{ openGraph: { title: "OG Title", type: "article" } },
		);
		expect(result.openGraph).toEqual({
			siteName: "Site",
			title: "OG Title",
			type: "article",
		});
	});

	it("array: jsonLd concatenated", () => {
		const result = mergeHeadConfigs({ jsonLd: [{ "@type": "WebSite" }] }, { jsonLd: [{ "@type": "Product" }] });
		expect(result.jsonLd).toEqual([{ "@type": "WebSite" }, { "@type": "Product" }]);
	});

	it("array: images concatenated", () => {
		const result = mergeHeadConfigs({ images: [{ url: "/a.jpg" }] }, { images: [{ url: "/b.jpg" }] });
		expect(result.images).toEqual([{ url: "/a.jpg" }, { url: "/b.jpg" }]);
	});

	it("custom: links concatenated", () => {
		const result = mergeHeadConfigs(
			{ custom: { links: [{ href: "/a.css", rel: "stylesheet" }] } },
			{ custom: { links: [{ href: "/b.css", rel: "stylesheet" }] } },
		);
		expect(result.custom?.links).toHaveLength(2);
	});

	it("custom: both undefined → empty custom object", () => {
		const result = mergeHeadConfigs({ custom: undefined }, { custom: undefined });
		expect(result.custom).toEqual({});
	});

	it("custom: parent only → copy of parent", () => {
		const result = mergeHeadConfigs({ custom: { scripts: [{ src: "/a.js" }] } }, {});
		/* parent.custom preserved, child has no custom key */
		expect(result.custom?.scripts).toHaveLength(1);
	});

	it("__proto__ key filtered out", () => {
		const child = JSON.parse('{"__proto__": "evil", "title": "Safe"}');
		const result = mergeHeadConfigs({}, child);
		expect(result.title).toBe("Safe");
		expect(Object.hasOwn(result, "__proto__")).toBe(false);
	});

	it("constructor key filtered out", () => {
		const child = JSON.parse('{"constructor": "evil", "title": "Safe"}');
		const result = mergeHeadConfigs({}, child);
		expect(result.title).toBe("Safe");
	});

	it("prototype key filtered out", () => {
		const child = JSON.parse('{"prototype": "evil", "title": "Safe"}');
		const result = mergeHeadConfigs({}, child);
		expect(result.title).toBe("Safe");
	});

	it("unknown keys → child overrides (fallthrough)", () => {
		const result = mergeHeadConfigs(
			{ unknownField: "parent" } as Record<string, unknown>,
			{ unknownField: "child" } as Record<string, unknown>,
		);
		expect((result as Record<string, unknown>).unknownField).toBe("child");
	});

	it("parent has extra fields, child is empty → parent fields preserved", () => {
		const result = mergeHeadConfigs({ description: "desc", title: "T" }, {});
		expect(result.title).toBe("T");
		expect(result.description).toBe("desc");
	});

	it("auto-merge: child sets only title, parent description preserved", () => {
		const parent = { description: "Parent desc", meta: { charset: "utf-8" }, title: "Parent" };
		const child = { title: "Child" };
		const result = mergeHeadConfigs(parent, child);
		expect(result.title).toBe("Child");
		expect(result.description).toBe("Parent desc");
		expect(result.meta?.charset).toBe("utf-8");
	});

	it("auto-merge: child sets description, parent title preserved", () => {
		const parent = { title: "Parent" };
		const child = { description: "Child desc" };
		const result = mergeHeadConfigs(parent, child);
		expect(result.title).toBe("Parent");
		expect(result.description).toBe("Child desc");
	});

	it("auto-merge: multi-level chain accumulates", () => {
		const root = { meta: { charset: "utf-8" }, title: "Root" };
		const layout = { description: "Layout desc" };
		const page = { title: "Page" };
		const afterLayout = mergeHeadConfigs(root, layout);
		const afterPage = mergeHeadConfigs(afterLayout, page);
		expect(afterPage.title).toBe("Page");
		expect(afterPage.description).toBe("Layout desc");
		expect(afterPage.meta?.charset).toBe("utf-8");
	});
});

/* ── mergeResponseHeaders edge cases ───────────────────────────────── */

describe("mergeResponseHeaders edge cases", () => {
	it("both undefined → empty", () => {
		expect(mergeResponseHeaders(undefined, undefined)).toEqual({});
	});

	it("parent only → copy", () => {
		const p = { "content-type": "text/html" };
		const result = mergeResponseHeaders(p, undefined);
		expect(result).toEqual(p);
		expect(result).not.toBe(p);
	});

	it("child only → copy", () => {
		const c = { "x-custom": "val" };
		const result = mergeResponseHeaders(undefined, c);
		expect(result).toEqual(c);
		expect(result).not.toBe(c);
	});

	it("child overrides parent for same key", () => {
		expect(mergeResponseHeaders({ "cache-control": "max-age=60" }, { "cache-control": "no-cache" })).toEqual({
			"cache-control": "no-cache",
		});
	});

	it("disjoint keys merged", () => {
		expect(mergeResponseHeaders({ "x-a": "1" }, { "x-b": "2" })).toEqual({ "x-a": "1", "x-b": "2" });
	});

	it("empty objects → empty", () => {
		expect(mergeResponseHeaders({}, {})).toEqual({});
	});

	it("case-sensitive: different cased keys are separate entries", () => {
		const result = mergeResponseHeaders({ "Content-Type": "text/html" }, { "content-type": "application/json" });
		/* shallow merge: both keys exist */
		expect(result["Content-Type"]).toBe("text/html");
		expect(result["content-type"]).toBe("application/json");
	});

	it("set-cookie: parent and child both preserved", () => {
		const result = mergeResponseHeaders({ "Set-Cookie": "session=abc" }, { "Set-Cookie": "tracking=xyz" });
		/* both cookies must survive the merge */
		const cookie = result["Set-Cookie"];
		expect(cookie).toContain("session=abc");
		expect(cookie).toContain("tracking=xyz");
	});
});
