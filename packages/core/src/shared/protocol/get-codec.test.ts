import { expect, it } from "vitest"
import { decodeGetInput, encodeGetInput, getQuery, MAX_GET_INPUT } from "./get-codec.ts"

// The input is a wire value, so a Date or a BigInt arrives as it was sent (B145).
it("round trip", () => {
	const encoded = encodeGetInput({ a: 1, b: "x", at: new Date(5), big: 7n })
	expect(decodeGetInput(`?_i=${encoded}`)).toEqual({ status: 200, input: { a: 1, b: "x", at: new Date(5), big: 7n } })
})

// What `_i` holds for `1`: a wire value that is JSON, then URL-encoded.
const ONE = encodeGetInput(1)

it("cap", () => {
	// A string's letters encode one to one, so the wire's own characters are the length of an empty string's.
	const frame = encodeGetInput("").length
	expect(encodeGetInput("a".repeat(MAX_GET_INPUT - frame))).toHaveLength(MAX_GET_INPUT)
	expect(() => encodeGetInput("a".repeat(MAX_GET_INPUT - frame + 1))).toThrow(/8192/)
	expect(decodeGetInput(`?_i=${"a".repeat(MAX_GET_INPUT + 1)}`)).toEqual({ status: 400 })
})

it("extra param", () => {
	expect(decodeGetInput("?_i=%7B%7D&x=1")).toEqual({ status: 400 })
	expect(decodeGetInput("?_i=%7B")).toEqual({ status: 400 })
	expect(decodeGetInput(`?_i=${ONE}&_i=${ONE}`)).toEqual({ status: 400 })
	// JSON that is no wire value is 400 too.
	expect(decodeGetInput("?_i=1")).toEqual({ status: 400 })
	expect(decodeGetInput("?_i")).toEqual({ status: 400 })
})

// `_b`, the client's build, may sit beside `_i` or alone, in either order, and its value is not read. A second `_b`
// is 400 (plan 21 8.5, BUGS.md 199).
it("build param", () => {
	expect(decodeGetInput(`?_i=${ONE}&_b=a1b2`)).toEqual({ status: 200, input: 1 })
	expect(decodeGetInput(`?_b=a1b2&_i=${ONE}`)).toEqual({ status: 200, input: 1 })
	expect(decodeGetInput("?_b=a1b2")).toEqual({ status: 200, input: undefined })
	expect(decodeGetInput("?_b=1&_b=2")).toEqual({ status: 400 })
	expect(getQuery({ a: 1 }, "a1b2")).toBe(`?_i=${encodeGetInput({ a: 1 })}&_b=a1b2`)
	expect(getQuery(undefined, "a b")).toBe("?_b=a%20b")
	expect(getQuery(undefined, "")).toBe("")
})

it("missing", () => {
	expect(decodeGetInput("")).toEqual({ status: 200, input: undefined })
	expect(decodeGetInput("?")).toEqual({ status: 200, input: undefined })
})

it("void input", () => {
	expect(() => encodeGetInput(undefined)).toThrow(/Omit _i/)
	expect(decodeGetInput("")).toEqual({ status: 200, input: undefined })
})
