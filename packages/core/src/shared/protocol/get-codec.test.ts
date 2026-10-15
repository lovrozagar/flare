import { expect, it } from "vitest"
import { decodeGetInput, encodeGetInput, MAX_GET_INPUT } from "./get-codec.ts"

it("round trip", () => {
	const encoded = encodeGetInput({ a: 1, b: "x" })
	expect(decodeGetInput(`?_i=${encoded}`)).toEqual({ status: 200, input: { a: 1, b: "x" } })
})

it("cap", () => {
	// Each JSON quote encodes to %22, so a string of n letters encodes to n + 6 characters.
	expect(encodeGetInput("a".repeat(MAX_GET_INPUT - 6))).toHaveLength(MAX_GET_INPUT)
	expect(() => encodeGetInput("a".repeat(MAX_GET_INPUT - 5))).toThrow(/8192/)
	expect(decodeGetInput(`?_i=${"a".repeat(MAX_GET_INPUT + 1)}`)).toEqual({ status: 400 })
})

it("extra param", () => {
	expect(decodeGetInput("?_i=%7B%7D&x=1")).toEqual({ status: 400 })
	expect(decodeGetInput("?_i=%7B")).toEqual({ status: 400 })
	expect(decodeGetInput("?_i=1&_i=2")).toEqual({ status: 400 })
})

it("missing", () => {
	expect(decodeGetInput("")).toEqual({ status: 200, input: undefined })
	expect(decodeGetInput("?")).toEqual({ status: 200, input: undefined })
})

it("void input", () => {
	expect(() => encodeGetInput(undefined)).toThrow(/Omit _i/)
	expect(decodeGetInput("")).toEqual({ status: 200, input: undefined })
})
