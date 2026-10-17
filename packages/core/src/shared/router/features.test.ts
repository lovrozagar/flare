import { expect, it } from "vitest"
import { directionConfig, localeConfig, themeConfig } from "./features.ts"

// The rows live in create-router.test.ts. These cases hold each parser alone.
it("theme defaults", () => {
	expect(themeConfig({ themes: ["dark"], defaultTheme: "dark" })).toEqual({
		defaultTheme: "dark",
		attribute: "data-theme",
		storageKey: "flare.theme",
		themes: ["dark"],
		disableTransitionOnChange: true,
	})
})

it("direction data attribute", () => {
	expect(directionConfig({ attribute: "data-text-dir" }).attribute).toBe("data-text-dir")
	expect(() => directionConfig({ attribute: "data-" })).toThrow("direction.attribute")
})

it("locale param", () => {
	expect(localeConfig({ locales: ["en"], defaultLocale: "en" }).paramName).toBe("locale")
})

// The router's locale cookie name goes into Set-Cookie as written, so it is an RFC 6265 token, as `i18n()` checks its
// own: a name holding `;` or a space would write a broken or forged cookie (BUGS.md 279).
it("locale cookie name", () => {
	expect(localeConfig({ locales: ["en"], defaultLocale: "en", cookieName: "pick" }).cookieName).toBe("pick")
	for (const cookieName of ["a; Domain=x", "a b", ""]) {
		expect(() => localeConfig({ locales: ["en"], defaultLocale: "en", cookieName })).toThrow("locale.cookieName")
	}
})
