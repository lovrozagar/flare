import { expect, it } from "vitest"
import { readSearch, searchKey, writeUrl } from "./search.ts"

it("proto", () => {
	const record = readSearch("?__proto__=1&constructor=2&prototype=3&ok=4")
	expect(Object.getPrototypeOf(record)).toBe(null)
	expect(Object.keys(record)).toEqual(["ok"])
	expect(record.ok).toBe("4")
	const input = Object.create(null) as Record<string, string>
	input["__proto__"] = "1"
	input["constructor"] = "2"
	input["prototype"] = "3"
	input.ok = "4"
	expect(writeUrl({ path: "/p", search: input })).toBe("/p?ok=4")
})

it("empty", () => {
	expect(writeUrl({ path: "/p", search: { a: "" } })).toBe("/p?a=")
	expect(writeUrl({ path: "/p", search: { a: null, b: undefined, c: [] } })).toBe("/p")
})

it("sort", () => {
	expect(writeUrl({ path: "/p", search: { "b b": "2 2", a: "1 1" } })).toBe("/p?a=1%201&b%20b=2%202")
})

it("repeat", () => {
	expect(writeUrl({ path: "/p", search: { a: ["2", "1"] } })).toBe("/p?a=2&a=1")
})

it("empty hash", () => {
	expect(writeUrl({ path: "/p", hash: "" })).toBe("/p")
	expect(writeUrl({ path: "/p", hash: "top" })).toBe("/p#top")
})

it("read shapes", () => {
	expect(readSearch("")).toEqual({})
	expect(readSearch("?")).toEqual({})
	expect(readSearch("?flag&a=1&&b=")).toEqual({ flag: "", a: "1", b: "" })
	expect(readSearch("?tag=a&x=1&tag=b&tag=c")).toEqual({ tag: ["a", "b", "c"], x: "1" })
})

// Each key and value is decoded as URLSearchParams does, `+` a space; a malformed escape stays as written; a banned key
// is banned however it is spelled (BUGS.md 147).
it("read decoded", () => {
	expect(readSearch("?q=a%20b&p=a+b&s=a%2Fb&e=%C3%A9&k%20k=v&lit=%2541")).toEqual({
		q: "a b",
		p: "a b",
		s: "a/b",
		e: "é",
		"k k": "v",
		lit: "%41",
	})
	expect(readSearch("?bad=%ZZ&half=%E9&plus=%2B")).toEqual({ bad: "%ZZ", half: "%E9", plus: "+" })
	expect(Object.keys(readSearch("?%5F%5Fproto%5F%5F=1&ok=2"))).toEqual(["ok"])
})

// One value set is one key: the encoding, the spelling of a space, and the key order do not matter; a literal `%41`
// goes out as `%2541`, never decoded twice (B31, BUGS.md 147).
it("search key", () => {
	expect(searchKey("?q=a%20b&a=1")).toBe("a=1&q=a%20b")
	expect(searchKey("?a=1&q=a+b")).toBe("a=1&q=a%20b")
	expect(searchKey("?s=a/b")).toBe(searchKey("?s=a%2Fb"))
	expect(searchKey("?lit=%2541")).toBe("lit=%2541")
	expect(searchKey("")).toBe("")
	expect(writeUrl({ path: "/p", search: readSearch("?lit=%2541&q=a+b") })).toBe("/p?lit=%2541&q=a%20b")
})
