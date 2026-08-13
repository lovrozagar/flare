import { describe, expect, it } from "vitest"
import { getLocaleScript } from "../../../src/locale.ts"

describe("LocaleScript generation", () => {
	it("produces valid JavaScript IIFE", () => {
		const script = getLocaleScript({ defaultLocale: "en", locales: ["en", "hr"] })
		expect(script).toMatch(/^\(/)
		expect(script).toMatch(/\)$/)
	})

	it("includes default locale in script", () => {
		const script = getLocaleScript({ defaultLocale: "en-us", locales: ["en-us", "hr"] })
		expect(script).toContain("en-us")
	})

	it("sets html lang from SSR attribute, no localStorage", () => {
		const script = getLocaleScript({ defaultLocale: "en", locales: ["en", "hr"] })
		expect(script).toContain('getAttribute("lang")')
		expect(script).toContain("setAttribute")
		expect(script).not.toContain("localStorage")
	})

	it("XSS: escapes special characters in defaultLocale", () => {
		const script = getLocaleScript({
			defaultLocale: 'en"</script>',
			locales: ["en"],
		})
		expect(script).not.toContain('en"</script>')
	})
})
