import { expect, it } from "vitest"
import type { RequestKind } from "../../../shared/protocol/index.ts"
import { createRouter, type RouteNode } from "../../../shared/router/create-router.ts"
import { matchLocale, type I18nConfig } from "./match.ts"
import { i18n } from "./middleware.ts"

const page = (id: string, path: string): RouteNode => ({ id, path, module: {} })
const router = createRouter({
	layouts: { _root_: {} },
	routeTree: [
		page("_root_/[[locale]]", "/[[locale]]"),
		page("_root_/[[locale]]/pricing", "/[[locale]]/pricing"),
		page("_root_/[locale]/docs", "/[locale]/docs"),
		page("_root_/de", "/de"),
	],
})
// The config the slot builds from the router's locale and its own `botDetection`.
function configOf(locales: readonly string[], defaultLocale: string, botDetection = true): I18nConfig {
	return { locales, defaultLocale, paramName: "locale", cookieName: "flare.locale", botDetection }
}

const config = configOf(["en", "hr", "en-US"], "en")

const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0 Safari/537.36"
const BOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"

type Ask = { cookie?: string; language?: string; agent?: string; kind?: RequestKind; with?: I18nConfig }

function ask(path: string, options: Ask = {}): ReturnType<typeof matchLocale> {
	const request = {
		url: new URL(path, "https://site.test"),
		kind: options.kind ?? "document",
		cookieHeader: options.cookie === undefined ? null : `flare.locale=${options.cookie}`,
		acceptLanguage: options.language ?? null,
		userAgent: options.agent ?? BROWSER,
	}
	return matchLocale(request, options.with ?? config, router)
}

it("path first", () => {
	expect(ask("/hr/pricing", { cookie: "en", language: "de" })).toEqual({ locale: "hr" })
	// A data request, the one after setLocale, persists the tag its URL shows.
	expect(ask("/hr/pricing", { cookie: "en", kind: "data" })).toEqual({ locale: "hr", cookie: "hr" })
	expect(ask("/hr/pricing", { cookie: "hr", kind: "data" })).toEqual({ locale: "hr" })
})

it("cookie next", () => {
	expect(ask("/pricing", { cookie: "en", kind: "data" })).toEqual({ locale: "en" })
	expect(ask("/pricing", { cookie: "hr", kind: "data" }).locale).toBe("en")
	expect(ask("/pricing?x=1", { cookie: "hr" })).toEqual({
		locale: "hr",
		redirect: { status: 302, location: "/hr/pricing?x=1" },
		cookie: "hr",
	})
})

it("cookie bad", () => {
	expect(ask("/pricing", { cookie: "fr" })).toEqual({ locale: "en", negotiated: true })
})

// The cookie is a configured tag byte for byte, or it is absent.
it("cookie case", () => {
	expect(ask("/pricing", { cookie: "EN", language: "hr" }).redirect?.location).toBe("/hr/pricing")
	expect(ask("/pricing", { cookie: "HR" })).toEqual({ locale: "en", negotiated: true })
})

it("cookie junk", () => {
	const found = ask("/pricing", { cookie: "en%0D%0AX%3A%20y" })
	expect(found).toEqual({ locale: "en", negotiated: true })
	expect(JSON.stringify(found)).not.toContain("X:")
})

it("cookie ignored on path", () => {
	expect(ask("/hr/pricing", { cookie: "nope" })).toEqual({ locale: "hr" })
})

it("header", () => {
	expect(ask("/pricing", { language: "de, hr;q=0.5" }).redirect?.location).toBe("/hr/pricing")
	// A header that names no configured tag, or holds none, is the default.
	expect(ask("/pricing", { language: "de, fr" })).toEqual({ locale: "en", negotiated: true })
	expect(ask("/pricing", { language: "*, ;q=1" })).toEqual({ locale: "en", negotiated: true })
})

it("cap", () => {
	const twenty = ["aa", "ab", "af", "ak", "am", "an", "as", "av", "hr", ...Array.from({ length: 11 }, () => "zu")]
	expect(ask("/pricing", { language: twenty.join(", ") })).toEqual({ locale: "en", negotiated: true })
	expect(ask("/pricing", { language: twenty.slice(1).join(", ") }).redirect?.location).toBe("/hr/pricing")
})

it("casing", () => {
	expect(ask("/HR/pricing?q=1")).toEqual({
		locale: "hr",
		redirect: { status: 301, location: "/hr/pricing?q=1" },
		cookie: "hr",
	})
	// Only a document redirects.
	expect(ask("/HR/pricing", { kind: "data" })).toEqual({ locale: "en" })
	// The default tag in the wrong case leaves the optional segment out, as the default always does.
	expect(ask("/EN/pricing")).toEqual({ locale: "en", redirect: { status: 301, location: "/pricing" }, cookie: "en" })
})

it("bot path", () => {
	expect(ask("/hr/pricing", { agent: BOT, cookie: "en", language: "en" })).toEqual({ locale: "hr" })
	expect(ask("/hr/pricing", { agent: BOT, cookie: "en", kind: "data" })).toEqual({ locale: "hr" })
	expect(ask("/HR/pricing", { agent: BOT })).toEqual({
		locale: "hr",
		redirect: { status: 301, location: "/hr/pricing" },
	})
})

it("bot root", () => {
	expect(ask("/", { agent: BOT, language: "hr" })).toEqual({ locale: "en", negotiated: true })
	// A data answer, and a bot on a page with no locale segment, are not negotiated.
	expect(ask("/", { agent: BOT, kind: "data" })).toEqual({ locale: "en" })
	expect(ask("/de", { agent: BOT })).toEqual({ locale: "en" })
})

it("bot off", () => {
	const off = configOf(["en", "hr"], "en", false)
	expect(ask("/", { agent: BOT, language: "hr", with: off }).redirect?.location).toBe("/hr")
})

it("bcp47", () => {
	expect(i18n({ locales: ["en", "zh-Hant-TW"], defaultLocale: "en" }).locales).toEqual(["en", "zh-Hant-TW"])
	expect(() => i18n({ locales: [""], defaultLocale: "" })).toThrow("i18n locales")
	expect(() => i18n({ locales: ["en_US"], defaultLocale: "en_US" })).toThrow("i18n locales")
	expect(() => i18n({ locales: ["en-us"], defaultLocale: "en-us" })).toThrow("i18n locales")
	expect(() => i18n({ locales: [], defaultLocale: "en" })).toThrow("i18n locales")
	expect(() => i18n({ locales: ["en", "en"], defaultLocale: "en" })).toThrow("i18n locales")
	expect(() => i18n({ locales: ["en"], defaultLocale: "en", cookieName: "a b" })).toThrow("i18n cookieName")
})

// `de` is a locale-like segment, but a static route there wins.
it("static wins", () => {
	expect(ask("/de")).toEqual({ locale: "en" })
})

// Only a configured tag is a locale. The router's locale param holds nothing else (B73); this router has no locale
// config, so the segment reaches the matcher, which reads it as no locale: no redirect and no cookie, on every kind
// and for a bot (plan 21 3.8).
it("unconfigured tag", () => {
	for (const kind of ["document", "data", "prefetch"] as const) {
		expect(ask("/fr/pricing?x=1", { kind })).toEqual({ locale: "en" })
	}
	expect(ask("/not_a_tag/pricing")).toEqual({ locale: "en" })
	expect(ask("/fr/docs")).toEqual({ locale: "en" })
	expect(ask("/fr/pricing", { agent: BOT })).toEqual({ locale: "en" })
})

it("base path", () => {
	// Under a base path the target keeps the base.
	const based = createRouter({
		basePath: "/app",
		layouts: { _root_: {} },
		routeTree: [page("_root_/[locale]/docs", "/[locale]/docs")],
	})
	const request = {
		url: new URL("https://site.test/app/HR/docs"),
		kind: "document" as const,
		cookieHeader: null,
		acceptLanguage: null,
		userAgent: BROWSER,
	}
	expect(matchLocale(request, config, based).redirect).toEqual({ status: 301, location: "/app/hr/docs" })
})

it("language en", () => {
	const only = configOf(["en", "hr"], "hr")
	expect(ask("/pricing", { language: "en-US", with: only }).redirect?.location).toBe("/en/pricing")
})

it("language both", () => {
	expect(ask("/pricing", { language: "en-US" }).redirect?.location).toBe("/en-US/pricing")
})

it("language spelling", () => {
	const found = ask("/pricing", { language: "EN-us" })
	expect(found.locale).toBe("en-US")
	expect(found.cookie).toBe("en-US")
})
