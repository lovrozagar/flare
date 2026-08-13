import { describe, expect, it } from "vitest"
import { getDirectionScript, getDirFromLocale, useDirection } from "../../../src/direction.ts"

describe("getDirectionScript", () => {
	it("returns minified inline script", () => {
		const script = getDirectionScript()
		expect(script).toBeTypeOf("string")
		expect(script.length).toBeGreaterThan(0)
	})

	it("script reads localStorage", () => {
		const script = getDirectionScript()
		expect(script).toContain("localStorage")
	})

	it("script falls back to html dir attribute", () => {
		const script = getDirectionScript()
		expect(script).toContain('getAttribute("dir")')
	})

	it("script sets data-dir and dir attributes", () => {
		const script = getDirectionScript()
		expect(script).toContain("data-dir")
		expect(script).toContain('"dir"')
	})

	it("escapes double quotes in config values", () => {
		const script = getDirectionScript({ storageKey: 'key"inject' })
		expect(script).not.toContain('key"inject')
		expect(script).toContain('key\\"inject')
	})

	it("escapes closing script tag in config values", () => {
		const script = getDirectionScript({ attribute: "</script>" })
		expect(script).not.toContain("</script>")
		expect(script).toContain("<\\/script>")
	})
})

describe("getDirFromLocale", () => {
	it('"ar" → "rtl"', () => {
		expect(getDirFromLocale("ar")).toBe("rtl")
	})

	it('"he" → "rtl"', () => {
		expect(getDirFromLocale("he")).toBe("rtl")
	})

	it('"fa" → "rtl"', () => {
		expect(getDirFromLocale("fa")).toBe("rtl")
	})

	it('"ur" → "rtl"', () => {
		expect(getDirFromLocale("ur")).toBe("rtl")
	})

	it('"ar-SA" → "rtl" (base language extracted)', () => {
		expect(getDirFromLocale("ar-SA")).toBe("rtl")
	})

	it('"en" → "ltr"', () => {
		expect(getDirFromLocale("en")).toBe("ltr")
	})

	it('"fr" → "ltr"', () => {
		expect(getDirFromLocale("fr")).toBe("ltr")
	})

	it("undefined → ltr", () => {
		expect(getDirFromLocale(undefined)).toBe("ltr")
	})

	it('"" → "ltr"', () => {
		expect(getDirFromLocale("")).toBe("ltr")
	})

	it("custom rtlLocales override defaults", () => {
		expect(getDirFromLocale("ar", ["he"])).toBe("ltr")
		expect(getDirFromLocale("he", ["he"])).toBe("rtl")
	})
})

describe("useDirection", () => {
	it("throws when used outside DirectionProvider", () => {
		expect(() => useDirection()).toThrow("useDirection() called outside DirectionProvider")
	})
})
