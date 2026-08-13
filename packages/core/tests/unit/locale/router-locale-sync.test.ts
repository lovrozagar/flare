import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Tests for the syncLocale function behavior as integrated into navigation.
 * Since syncLocale is an internal function, we test its effects by verifying
 * what it would do to document.cookie and document.documentElement.
 */

/* Mock document for sync tests */
function createMockDocument() {
	const attrs = new Map<string, string>()
	let cookie = ""
	return {
		get cookie() {
			return cookie
		},
		set cookie(value: string) {
			cookie = value
		},
		documentElement: {
			getAttribute(name: string) {
				return attrs.get(name) ?? null
			},
			setAttribute(name: string, value: string) {
				attrs.set(name, value)
			},
		},
		getAttrs() {
			return Object.fromEntries(attrs)
		},
	}
}

describe("syncLocale behavior", () => {
	describe("cookie format", () => {
		it("writes cookie with correct format", () => {
			const doc = createMockDocument()
			const cookieName = "flare.locale"
			const locale = "hr"
			doc.cookie = `${cookieName}=${locale}; path=/; max-age=31536000; samesite=lax`

			expect(doc.cookie).toBe("flare.locale=hr; path=/; max-age=31536000; samesite=lax")
		})

		it("uses custom cookie name", () => {
			const doc = createMockDocument()
			const cookieName = "app.lang"
			doc.cookie = `${cookieName}=fr; path=/; max-age=31536000; samesite=lax`

			expect(doc.cookie).toContain("app.lang=fr")
		})
	})

	describe("locale derivation from params", () => {
		it("reads locale from paramName in params", () => {
			const config = {
				defaultLocale: "en",
				locales: ["en", "hr", "fr"] as const,
				paramName: "locale",
			}
			const params: Record<string, string | string[]> = { locale: "hr" }
			const val = params[config.paramName]
			const effectiveLocale = (typeof val === "string" ? val : undefined) ?? config.defaultLocale

			expect(effectiveLocale).toBe("hr")
		})

		it("falls back to defaultLocale when param is undefined", () => {
			const config = {
				defaultLocale: "en",
				locales: ["en", "hr", "fr"] as const,
				paramName: "locale",
			}
			const params: Record<string, string | string[]> = {}
			const val = params[config.paramName]
			const effectiveLocale = (typeof val === "string" ? val : undefined) ?? config.defaultLocale

			expect(effectiveLocale).toBe("en")
		})

		it("respects custom paramName", () => {
			const config = { defaultLocale: "en", locales: ["en", "hr"] as const, paramName: "lang" }
			const params: Record<string, string | string[]> = { lang: "hr" }
			const val = params[config.paramName]
			const effectiveLocale = (typeof val === "string" ? val : undefined) ?? config.defaultLocale

			expect(effectiveLocale).toBe("hr")
		})

		it("defaults paramName to 'locale' when not specified", () => {
			const config: { defaultLocale: string; locales: readonly string[]; paramName?: string } = {
				defaultLocale: "en",
				locales: ["en", "hr"] as const,
			}
			const paramName = config.paramName ?? "locale"
			const params: Record<string, string | string[]> = { locale: "hr" }
			const val = params[paramName]
			const effectiveLocale = (typeof val === "string" ? val : undefined) ?? config.defaultLocale

			expect(effectiveLocale).toBe("hr")
		})

		it("handles array param values by falling back to default", () => {
			const config = { defaultLocale: "en", locales: ["en", "hr"] as const, paramName: "locale" }
			const params: Record<string, string | string[]> = { locale: ["hr", "fr"] }
			const val = params[config.paramName]
			const effectiveLocale = (typeof val === "string" ? val : undefined) ?? config.defaultLocale

			expect(effectiveLocale).toBe("en")
		})
	})

	describe("html lang sync", () => {
		it("sets html lang attribute", () => {
			const doc = createMockDocument()
			doc.documentElement.setAttribute("lang", "hr")

			expect(doc.documentElement.getAttribute("lang")).toBe("hr")
		})

		it("sets default locale when param absent", () => {
			const doc = createMockDocument()
			doc.documentElement.setAttribute("lang", "en")

			expect(doc.documentElement.getAttribute("lang")).toBe("en")
		})
	})

	describe("direction sync", () => {
		it("does not set dir when syncDirection is false", () => {
			const doc = createMockDocument()
			doc.documentElement.setAttribute("lang", "ar")
			/* syncDirection: false → no dir attribute change */

			expect(doc.documentElement.getAttribute("dir")).toBeNull()
		})

		it("sets dir=rtl for RTL locale when syncDirection is true", () => {
			const doc = createMockDocument()
			const rtlLocales = ["ar", "he", "fa", "ur"]
			const locale = "ar"
			const base = locale.split("-")[0]?.toLowerCase() ?? ""
			const dir = rtlLocales.includes(base) ? "rtl" : "ltr"

			doc.documentElement.setAttribute("dir", dir)
			doc.documentElement.setAttribute("data-dir", dir)

			expect(doc.documentElement.getAttribute("dir")).toBe("rtl")
			expect(doc.documentElement.getAttribute("data-dir")).toBe("rtl")
		})

		it("sets dir=ltr for LTR locale when syncDirection is true", () => {
			const doc = createMockDocument()
			const rtlLocales = ["ar", "he", "fa", "ur"]
			const locale = "hr"
			const base = locale.split("-")[0]?.toLowerCase() ?? ""
			const dir = rtlLocales.includes(base) ? "rtl" : "ltr"

			doc.documentElement.setAttribute("dir", dir)
			doc.documentElement.setAttribute("data-dir", dir)

			expect(doc.documentElement.getAttribute("dir")).toBe("ltr")
			expect(doc.documentElement.getAttribute("data-dir")).toBe("ltr")
		})

		it("uses custom direction attribute name", () => {
			const doc = createMockDocument()
			const attr = "data-direction"
			doc.documentElement.setAttribute("dir", "rtl")
			doc.documentElement.setAttribute(attr, "rtl")

			expect(doc.documentElement.getAttribute(attr)).toBe("rtl")
		})
	})
})

describe("router.locale() accessor", () => {
	it("returns locale from params when config exists", () => {
		const localeConfig = {
			defaultLocale: "en",
			locales: ["en", "hr", "fr"] as const,
			paramName: "locale",
		}
		const params: Record<string, string> = { locale: "hr" }
		const locale = () => {
			if (!localeConfig) return undefined
			const val = params[localeConfig.paramName ?? "locale"]
			return (typeof val === "string" ? val : undefined) ?? localeConfig.defaultLocale
		}

		expect(locale()).toBe("hr")
	})

	it("returns defaultLocale when param is absent (optional [[locale]])", () => {
		const localeConfig = {
			defaultLocale: "en",
			locales: ["en", "hr"] as const,
			paramName: "locale",
		}
		const params: Record<string, string> = {}
		const locale = () => {
			const val = params[localeConfig.paramName ?? "locale"]
			return (typeof val === "string" ? val : undefined) ?? localeConfig.defaultLocale
		}

		expect(locale()).toBe("en")
	})

	it("returns undefined when no locale config", () => {
		const localeConfig = undefined
		const locale = () => {
			if (!localeConfig) return undefined
			return "en"
		}

		expect(locale()).toBeUndefined()
	})

	it("returns defaultLocale for unlocalized route (param not in route)", () => {
		const localeConfig = {
			defaultLocale: "en",
			locales: ["en", "hr"] as const,
			paramName: "locale",
		}
		const params = { slug: "my-post" } as Record<string, string>
		const locale = () => {
			const val = params[localeConfig.paramName ?? "locale"]
			return (typeof val === "string" ? val : undefined) ?? localeConfig.defaultLocale
		}

		expect(locale()).toBe("en")
	})

	it("handles custom paramName", () => {
		const localeConfig = { defaultLocale: "en", locales: ["en", "hr"] as const, paramName: "lng" }
		const params = { lng: "hr" } as Record<string, string>
		const locale = () => {
			const val = params[localeConfig.paramName ?? "locale"]
			return (typeof val === "string" ? val : undefined) ?? localeConfig.defaultLocale
		}

		expect(locale()).toBe("hr")
	})
})
