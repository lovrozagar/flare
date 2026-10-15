import { expect, it } from "vitest"
import { parseDuration } from "./parse.ts"

it("seconds", () => {
	expect(parseDuration("30s")).toBe(30_000)
})

it("compound", () => {
	expect(parseDuration("1m30s")).toBe(90_000)
})

it("garbage", () => {
	expect(() => parseDuration("soon")).toThrow(/duration/)
	expect(() => parseDuration("")).toThrow(/duration/)
	expect(() => parseDuration("1x")).toThrow(/duration/)
})
