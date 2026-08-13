import { describe, expect, it, vi } from "vitest"
import type { MiddlewareContext } from "../../../../src/server/middleware"
import { i18n, LOCALE_KEY } from "../../../../src/server/middleware/i18n"

function createMockContext(
	pathname: string,
	options: {
		acceptLanguage?: string
		cookie?: string
		userAgent?: string
	} = {},
): MiddlewareContext {
	const url = new URL(`https://example.com${pathname}`)
	const headers = new Headers()
	if (options.acceptLanguage) headers.set("accept-language", options.acceptLanguage)
	if (options.cookie) headers.set("cookie", options.cookie)
	if (options.userAgent) headers.set("user-agent", options.userAgent)

	const store = new Map()
	return {
		applyResponseHandlers: vi.fn(),
		env: {},
		executionContext: { passThroughOnException: vi.fn(), waitUntil: vi.fn() },
		nonce: "test-nonce",
		onResponse: vi.fn(),
		request: new Request(url.toString(), { headers }),
		serverRequestContext: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) },
		url,
	}
}

const defaultConfig = {
	cookie: { key: "locale" },
	defaultLocale: "en-us",
	locales: ["en-us", "hr", "de"],
}

describe("i18n", () => {
	describe("bot detection", () => {
		it("serves default locale to bots", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/hr/about", {
				userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)",
			})
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(ctx.serverRequestContext.get(LOCALE_KEY)).toBe("en-us")
		})
	})

	describe("skip paths", () => {
		it("skips /_fn/ paths", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/_fn/123/getUser")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(ctx.serverRequestContext.get(LOCALE_KEY)).toBe("en-us")
		})

		it("skips custom skip paths", async () => {
			const middleware = i18n({ ...defaultConfig, skip: ["/api/"] })
			const ctx = createMockContext("/api/users")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(ctx.serverRequestContext.get(LOCALE_KEY)).toBe("en-us")
		})

		it("skips files with extensions", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/assets/style.css")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(ctx.serverRequestContext.get(LOCALE_KEY)).toBe("en-us")
		})
	})

	describe("locale detection from path", () => {
		it("detects locale from path", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/hr/about")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(ctx.serverRequestContext.get(LOCALE_KEY)).toBe("hr")
		})

		it("redirects default locale to non-localized path", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/en-us/about")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302)
				expect(result.response.headers.get("Location")).toBe("https://example.com/about")
			}
		})
	})

	describe("locale case normalization", () => {
		it("redirects uppercase locale to lowercase", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/HR/about")
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302)
				expect(result.response.headers.get("Location")).toBe("https://example.com/hr/about")
			}
		})
	})

	describe("locale detection from cookie", () => {
		it("uses cookie locale for non-localized paths", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/about", { cookie: "locale=hr" })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302)
				expect(result.response.headers.get("Location")).toBe("https://example.com/hr/about")
			}
		})

		it("does not redirect for default locale in cookie", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/about", { cookie: "locale=en-us" })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("next")
			expect(ctx.serverRequestContext.get(LOCALE_KEY)).toBe("en-us")
		})
	})

	describe("locale detection from Accept-Language", () => {
		it("uses Accept-Language on first visit (no cookie)", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/", { acceptLanguage: "hr,en;q=0.9" })
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302)
				expect(result.response.headers.get("Location")).toBe("https://example.com/hr")
			}
		})

		it("ignores Accept-Language when cookie exists", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/", {
				acceptLanguage: "hr,en;q=0.9",
				cookie: "locale=en-us",
			})
			const next = vi.fn()

			const result = await middleware(ctx, next)

			/* Cookie says en-us (default), so no redirect */
			expect(result.type).toBe("next")
			expect(ctx.serverRequestContext.get(LOCALE_KEY)).toBe("en-us")
		})
	})

	describe("invalid locale handling", () => {
		it("redirects invalid locale to fallback", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/fr/about") /* fr not in locales */
			const next = vi.fn()

			const result = await middleware(ctx, next)

			expect(result.type).toBe("bypass")
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302)
				/* Should redirect to /about (default locale) */
				expect(result.response.headers.get("Location")).toBe("https://example.com/about")
			}
		})
	})

	describe("cookie setting", () => {
		it("sets cookie via onResponse when locale changes", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/hr/about")
			const next = vi.fn()

			await middleware(ctx, next)

			expect(ctx.onResponse).toHaveBeenCalled()
		})

		it("does not set cookie when locale matches", async () => {
			const middleware = i18n(defaultConfig)
			const ctx = createMockContext("/hr/about", { cookie: "locale=hr" })
			const next = vi.fn()

			await middleware(ctx, next)

			expect(ctx.onResponse).not.toHaveBeenCalled()
		})
	})
})
