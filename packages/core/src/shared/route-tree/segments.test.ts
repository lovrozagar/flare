import { expect, it } from "vitest"
import { idPattern, parseSegment } from "./segments.ts"

it("static segment", () => {
	expect(parseSegment("about")).toEqual([{ kind: "static", text: "about" }])
})

it("param", () => {
	expect(parseSegment("[id]")).toEqual([{ kind: "dynamic", name: "id", optional: false }])
})

it("catch-all", () => {
	expect(parseSegment("[...rest]")).toEqual([{ kind: "catch-all", name: "rest", optional: false }])
})

it("optional", () => {
	expect(parseSegment("[[id]]")).toEqual([{ kind: "dynamic", name: "id", optional: true }])
	expect(parseSegment("[[...rest]]")).toEqual([{ kind: "catch-all", name: "rest", optional: true }])
})

it("literal brackets", () => {
	expect(parseSegment("[_]id]")).toEqual([{ kind: "static", text: "[id]" }])
})

it("group is not a segment", () => {
	expect(parseSegment("(auth)")).toEqual([])
})

// `__proto__` is no param name in any bracket form: a plain object cannot hold it, so a repeat escaped the check, a
// value was lost, and the type had no params. A literal-bracket `[_]__proto__]` is static text and stays (BUGS.md 407).
it("proto param", () => {
	for (const folder of ["[__proto__]", "[[__proto__]]", "[...__proto__]", "[[...__proto__]]"]) {
		expect(() => parseSegment(folder)).toThrow(`reserved param name __proto__: ${folder}`)
	}
	expect(parseSegment("[_]__proto__]")).toEqual([{ kind: "static", text: "[__proto__]" }])
	expect(parseSegment("[constructor]")).toEqual([{ kind: "dynamic", name: "constructor", optional: false }])
})

it("bad brackets", () => {
	expect(() => parseSegment("[user-id]")).toThrow(/bad brackets/)
	expect(() => parseSegment("[_]blog")).toThrow(/bad brackets/)
})

it("id pattern", () => {
	expect(idPattern("site/_root_/about")).toBe("/about")
	expect(idPattern("[locale]/_root_/about")).toBe("/[locale]/about")
	expect(idPattern("_shop_/cart")).toBe("/cart")
	expect(idPattern("_root_/(blog)/post")).toBe("/post")
	expect(idPattern("_root_")).toBe("/")
	expect(idPattern("__/x")).toBe("/__/x")
	expect(idPattern("(site)/[_]x]/_root_/[_]id]")).toBe("/[_]id]")
	// A root folder inside a root would nest a document in a document and keep its marker in the URL (BUGS.md 408).
	for (const id of ["_root_/_x_/p", "_root_/(g)/_x_", "_a_/_b_"])
		expect(() => idPattern(id)).toThrow(`a root inside a root: ${id}`)
})
