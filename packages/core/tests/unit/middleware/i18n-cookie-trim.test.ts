import { describe, expect, it } from "vitest"

/**
 * Task 3: Cookie locale value missing .trim()
 *
 * Mirror the getLocaleFromCookie logic from src/middleware/builtins/i18n.ts
 * to verify that whitespace in cookie values is properly trimmed.
 */

function getLocaleFromCookie(
	cookieHeader: string | null,
	cookieName: string,
	localeSet: Set<string>,
): string | null {
	if (!cookieHeader) return null
	const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	const regex = new RegExp(`${escaped}=([^;]+)`)
	const match = cookieHeader.match(regex)
	const locale = match?.[1]?.trim().toLowerCase()
	return locale && localeSet.has(locale) ? locale : null
}

const locales = new Set(["en", "de", "fr", "en-us"])

describe("Task 3: i18n cookie locale trim", () => {
	it("exact cookie value matches", () => {
		expect(getLocaleFromCookie("flare.locale=en", "flare.locale", locales)).toBe("en")
	})

	it("trailing space is trimmed", () => {
		expect(getLocaleFromCookie("flare.locale=en ", "flare.locale", locales)).toBe("en")
	})

	it("leading space is trimmed", () => {
		expect(getLocaleFromCookie("flare.locale= en", "flare.locale", locales)).toBe("en")
	})

	it("both sides trimmed", () => {
		expect(getLocaleFromCookie("flare.locale= en ", "flare.locale", locales)).toBe("en")
	})

	it("case-insensitive after trim", () => {
		expect(getLocaleFromCookie("flare.locale=EN ", "flare.locale", locales)).toBe("en")
	})

	it("tab character trimmed", () => {
		expect(getLocaleFromCookie("flare.locale=en\t", "flare.locale", locales)).toBe("en")
	})

	it("invalid locale still returns null", () => {
		expect(getLocaleFromCookie("flare.locale=xx", "flare.locale", locales)).toBeNull()
	})

	it("missing cookie returns null", () => {
		expect(getLocaleFromCookie(null, "flare.locale", locales)).toBeNull()
	})

	it("locale with region code and space", () => {
		expect(getLocaleFromCookie("flare.locale=en-us ", "flare.locale", locales)).toBe("en-us")
	})
})
