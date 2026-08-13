import { describe, expect, it } from "vitest"
import { isExternal } from "../../../src/navigation/index.ts"

/* ── isExternal — additional edge cases ───────────────────────────── */

describe("isExternal — additional edge cases", () => {
	it("empty string is not external", () => {
		expect(isExternal("")).toBe(false)
	})

	it("hash-only link is not external", () => {
		expect(isExternal("#section")).toBe(false)
	})

	it("query-only link is not external", () => {
		expect(isExternal("?q=test")).toBe(false)
	})

	it("invalid URL with http:// prefix returns false (catch block)", () => {
		/* Malformed URL that throws — should be caught and return false */
		expect(isExternal("http://")).toBe(false)
	})

	it("ftp: protocol is not detected as external", () => {
		/* ftp: is not in the checked prefixes */
		expect(isExternal("ftp://evil.com/file")).toBe(false)
	})

	it("ws: protocol is not detected as external", () => {
		expect(isExternal("ws://evil.com/socket")).toBe(false)
	})
})
