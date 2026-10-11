import { expect, it } from "vitest";
import { matchParams, matchPath } from "./match.ts";

it("static match", () => {
	expect(matchPath("/about", "/about")).toBe(true);
});

it("encoded static", () => {
	expect(matchPath("/a b", "/a%20b")).toBe(true);
});

it("case fold", () => {
	expect(matchPath("/about", "/About", { caseSensitive: false })).toBe(true);
});

it("case strict", () => {
	expect(matchPath("/about", "/About", { caseSensitive: true })).toBe(false);
});

it("no match", () => {
	expect(matchPath("/about", "/missing")).toBe(false);
});

it("optional catch-all empty", () => {
	const matched = matchParams("[[...rest]]", "/");
	if (matched === undefined) throw new Error("[[...rest]]");
	expect(Object.hasOwn(matched, "rest")).toBe(true);
	expect(matched.rest).toBeUndefined();
	expect(matchParams("[...rest]", "/")).toBeUndefined();
	expect(matchPath("[...rest]", "/")).toBe(false);
	expect(matchPath("[[...rest]]", "/")).toBe(true);
	expect(matchParams("[[...rest]]", "/a/b")).toEqual({ rest: ["a", "b"] });
	expect(matchParams("[...rest]", "/a")).toEqual({ rest: ["a"] });
	expect(() => matchParams("(blog)", "/")).toThrow("(blog)");
});
