import { expect, it } from "vitest";
import { idPattern, parseSegment } from "./segments.ts";

it("static segment", () => {
	expect(parseSegment("about")).toEqual([{ kind: "static", text: "about" }]);
});

it("param", () => {
	expect(parseSegment("[id]")).toEqual([{ kind: "dynamic", name: "id", optional: false }]);
});

it("catch-all", () => {
	expect(parseSegment("[...rest]")).toEqual([{ kind: "catch-all", name: "rest", optional: false }]);
});

it("optional", () => {
	expect(parseSegment("[[id]]")).toEqual([{ kind: "dynamic", name: "id", optional: true }]);
	expect(parseSegment("[[...rest]]")).toEqual([{ kind: "catch-all", name: "rest", optional: true }]);
});

it("literal brackets", () => {
	expect(parseSegment("[_]id]")).toEqual([{ kind: "static", text: "[id]" }]);
});

it("group is not a segment", () => {
	expect(parseSegment("(auth)")).toEqual([]);
});

it("bad brackets", () => {
	expect(() => parseSegment("[user-id]")).toThrow(/bad brackets/);
	expect(() => parseSegment("[_]blog")).toThrow(/bad brackets/);
});

it("id pattern", () => {
	expect(idPattern("site/_root_/about")).toBe("/about");
	expect(idPattern("[locale]/_root_/about")).toBe("/[locale]/about");
	expect(idPattern("_shop_/cart")).toBe("/cart");
	expect(idPattern("_root_/(blog)/post")).toBe("/post");
	expect(idPattern("_root_")).toBe("/");
	expect(idPattern("__/x")).toBe("/__/x");
	expect(idPattern("(site)/[_]x]/_root_/[_]id]")).toBe("/[_]id]");
});
