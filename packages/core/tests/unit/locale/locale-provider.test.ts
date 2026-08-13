import { describe, expect, it } from "vitest"
import { getLocaleScript, useLocale } from "../../../src/locale.ts"

describe("getLocaleScript", () => {
	it("returns minified inline script string", () => {
		const script = getLocaleScript({ defaultLocale: "en", locales: ["en", "hr"] })
		expect(script).toBeTypeOf("string")
		expect(script.length).toBeGreaterThan(0)
	})

	it("no localStorage — cookie is the only persistence", () => {
		const script = getLocaleScript({ defaultLocale: "en", locales: ["en", "hr"] })
		expect(script).not.toContain("localStorage")
	})

	it("reads html lang attribute", () => {
		const script = getLocaleScript({ defaultLocale: "en", locales: ["en", "hr"] })
		expect(script).toContain('getAttribute("lang")')
	})

	it("sets html lang attribute", () => {
		const script = getLocaleScript({ defaultLocale: "en", locales: ["en", "hr"] })
		expect(script).toContain("setAttribute")
	})

	it("escapes double quotes in config values", () => {
		const script = getLocaleScript({
			defaultLocale: 'e"n',
			locales: ["en"],
		})
		expect(script).not.toContain('e"n')
		expect(script).toContain('e\\"n')
	})

	it("escapes closing script tag in config values", () => {
		const script = getLocaleScript({
			defaultLocale: "</script>",
			locales: ["en"],
		})
		expect(script).not.toContain("</script>")
		expect(script).toContain("<\\/script>")
	})
})

describe("useLocale", () => {
	it("throws when used outside LocaleProvider", () => {
		expect(() => useLocale()).toThrow("useLocale() called outside LocaleProvider")
	})
})
