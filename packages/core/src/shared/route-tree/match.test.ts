import { expect, it } from "vitest";
import { matchPath } from "./match.ts";

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
