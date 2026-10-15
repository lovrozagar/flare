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
