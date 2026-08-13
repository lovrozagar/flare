import { describe, expect, it } from "vitest"
import { escapeJsString, getThemeScript, useTheme } from "../../../src/theme.ts"

describe("getThemeScript", () => {
	it("returns minified inline script string", () => {
		const script = getThemeScript()
		expect(script).toBeTypeOf("string")
		expect(script.length).toBeGreaterThan(0)
	})

	it("script reads localStorage", () => {
		const script = getThemeScript()
		expect(script).toContain("localStorage")
	})

	it('script handles "system" → matchMedia', () => {
		const script = getThemeScript()
		expect(script).toContain("system")
		expect(script).toContain("matchMedia")
		expect(script).toContain("prefers-color-scheme:dark")
	})

	it("script sets data-theme attribute", () => {
		const script = getThemeScript()
		expect(script).toContain("setAttribute")
		expect(script).toContain("data-theme")
	})

	it("script sets colorScheme style", () => {
		const script = getThemeScript()
		expect(script).toContain("colorScheme")
	})

	it("custom attribute → used in script", () => {
		const script = getThemeScript({ attribute: "data-mode" })
		expect(script).toContain("data-mode")
	})

	it("custom storageKey → used in script", () => {
		const script = getThemeScript({ storageKey: "my.theme" })
		expect(script).toContain("my.theme")
	})

	it("custom defaultTheme → used in script", () => {
		const script = getThemeScript({ defaultTheme: "dark" })
		expect(script).toContain('"dark"')
	})
})

describe("escapeJsString", () => {
	it("escapes double quotes", () => {
		expect(escapeJsString('key"inject')).toBe('key\\"inject')
	})

	it("escapes closing script tag", () => {
		expect(escapeJsString("</script>")).toBe("<\\/script>")
	})

	it("escapes backslashes", () => {
		expect(escapeJsString("path\\to\\key")).toBe("path\\\\to\\\\key")
	})
})

describe("getThemeScript XSS prevention", () => {
	it("escapes double quotes in config values", () => {
		const script = getThemeScript({ storageKey: 'key"inject' })
		expect(script).not.toContain('key"inject')
		expect(script).toContain('key\\"inject')
	})

	it("escapes closing script tag in config values", () => {
		const script = getThemeScript({ attribute: "</script>" })
		expect(script).not.toContain("</script>")
		expect(script).toContain("<\\/script>")
	})

	it("escapes backslashes in config values", () => {
		const script = getThemeScript({ storageKey: "path\\to\\key" })
		expect(script).toContain("path\\\\to\\\\key")
	})
})

describe("useTheme", () => {
	it("throws when used outside ThemeProvider", () => {
		expect(() => useTheme()).toThrow("useTheme() called outside ThemeProvider")
	})
})
