import { describe, expect, it } from "vitest";
import { createPathSegment } from "../../../src/route-builder/index.ts";
import { BUILDER_MARKER } from "../../../src/route-builder/types.ts";

describe("createPathSegment", () => {
	it("returns _type path-segment and correct virtualPath", () => {
		const seg = createPathSegment("_root_/[locale]");
		expect(seg._type).toBe("layout");
		expect(seg.virtualPath).toBe("_root_/[locale]");
	});

	it("has BUILDER_MARKER set", () => {
		const seg = createPathSegment("_root_/[locale]");
		expect(seg[BUILDER_MARKER]).toBe(true);
	});

	it("is valid without calling .cache()", () => {
		const seg = createPathSegment("_root_/[locale]");
		expect(seg._type).toBe("layout");
		/* Initial builder has cache as a method, not a config value */
		expect(typeof seg.cache).toBe("function");
	});

	it(".cache() stores ssg config", () => {
		const params = () => [{ locale: "en" }, { locale: "fr" }];
		const seg = createPathSegment("_root_/[locale]").cache({
			ssg: { params },
		});
		expect(seg._type).toBe("layout");
		expect(seg.cache).toBeDefined();
		expect((seg.cache as { ssg: { params: unknown } }).ssg.params).toBe(params);
	});

	it(".cache() stores isr config", () => {
		const params = () => [{ org: "acme" }];
		const seg = createPathSegment("_root_/(dashboard)/[org]").cache({
			isr: { params, revalidate: 3600 },
		});
		expect(seg._type).toBe("layout");
		expect((seg.cache as { isr: { revalidate: number } }).isr.revalidate).toBe(3600);
	});

	it(".cache() result has BUILDER_MARKER", () => {
		const seg = createPathSegment("_root_/[locale]").cache({
			ssg: { params: () => [{ locale: "en" }] },
		});
		expect(seg[BUILDER_MARKER]).toBe(true);
	});

	it("pre-root segment works", () => {
		const seg = createPathSegment("[locale]");
		expect(seg._type).toBe("layout");
		expect(seg.virtualPath).toBe("[locale]");
	});

	it("has transparent render function", () => {
		const seg = createPathSegment("_root_/[locale]");
		expect(typeof seg.render).toBe("function");
		expect(seg.render({ children: "hello" })).toBe("hello");
	});

	it("deep nesting works", () => {
		const seg = createPathSegment("_root_/[category]/[id]");
		expect(seg.virtualPath).toBe("_root_/[category]/[id]");
	});
});
