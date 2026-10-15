import { expect, it } from "vitest"
import { matchParams, matchPath } from "./match.ts"
import { idPattern } from "./segments.ts"

it("static match", () => {
	expect(matchPath("/about", "/about")).toBe(true)
})

it("encoded static", () => {
	expect(matchPath("/a b", "/a%20b")).toBe(true)
	expect(matchPath("/a@b", "/a@b")).toBe(true)
	expect(matchPath("/c++", "/c++")).toBe(true)
	expect(matchPath("/a:b,c=d$e;f&g", "/a:b,c=d$e;f&g")).toBe(true)
	expect(matchPath("/é^", "/%c3%a9%5e")).toBe(true)
	expect(matchPath("/É", "/%C3%89", { caseSensitive: true })).toBe(true)
})

it("case fold", () => {
	expect(matchPath("/about", "/About", { caseSensitive: false })).toBe(true)
})

it("case strict", () => {
	expect(matchPath("/about", "/About", { caseSensitive: true })).toBe(false)
})

it("no match", () => {
	expect(matchPath("/about", "/missing")).toBe(false)
})

it("optional catch-all empty", () => {
	const matched = matchParams("[[...rest]]", "/")
	if (matched === undefined) throw new Error("[[...rest]]")
	expect(Object.hasOwn(matched, "rest")).toBe(true)
	expect(matched.rest).toBeUndefined()
	expect(matchParams("[...rest]", "/")).toBeUndefined()
	expect(matchPath("[...rest]", "/")).toBe(false)
	expect(matchPath("[[...rest]]", "/")).toBe(true)
	expect(matchParams("[[...rest]]", "/a/b")).toEqual({ rest: ["a", "b"] })
	expect(matchParams("[...rest]", "/a")).toEqual({ rest: ["a"] })
	expect(matchParams("(blog)", "/")).toEqual({})
})

it("dynamic", () => {
	expect(matchParams("/users/[id]", "/users/42")).toEqual({ id: "42" })
	expect(matchPath("/users/[id]", "/users")).toBe(false)
	expect(matchPath("/users/[id]", "/users/42/x")).toBe(false)
	expect(matchPath("/users/[id]", "/")).toBe(false)
})

it("optional", () => {
	expect(matchParams("/optional-locale/[[locale]]", "/optional-locale")).toEqual({ locale: undefined })
	expect(matchParams("/optional-locale/[[locale]]", "/optional-locale/fr")).toEqual({ locale: "fr" })
	expect(matchPath("/optional-locale/[[locale]]", "/optional-locale/fr/x")).toBe(false)
	expect(matchParams("/[[lang]]/about", "/about")).toEqual({ lang: undefined })
})

it("catch-all", () => {
	expect(matchParams("/files/[...path]", "/files/a/b")).toEqual({ path: ["a", "b"] })
	expect(matchPath("/files/[...path]", "/files")).toBe(false)
	expect(matchParams("/docs/[[...rest]]/edit", "/docs/a/b/edit")).toEqual({ rest: ["a", "b"] })
})

it("group and root", () => {
	expect(matchParams(idPattern("_root_/(blog)/post"), "/post")).toEqual({})
	expect(matchParams(idPattern("[locale]/_root_/about"), "/en/about")).toEqual({ locale: "en" })
	expect(matchPath(idPattern("_admin_/dashboard"), "/dashboard")).toBe(true)
})
