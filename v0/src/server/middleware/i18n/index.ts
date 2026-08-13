/**
 * i18n Middleware
 *
 * Detects user's preferred locale from: URL path > cookie > Accept-Language header > default
 * Handles redirects for locale normalization and sets locale cookie.
 *
 * Uses CLDR language distance matching for script variants (zh-Hans/zh-Hant, sr-Latn/sr-Cyrl)
 * Serves default locale to bots for consistent SEO indexing.
 *
 * @example
 * ```typescript
 * import { i18n } from "@flare/v0/server/middleware/i18n"
 *
 * createServerHandler({
 *   middlewares: [
 *     i18n({
 *       locales: ["en-us", "hr"],
 *       defaultLocale: "en-us",
 *       cookie: { key: "locale", maxAge: 31536000 },
 *       skip: ["/_fn/"],
 *     }),
 *   ],
 * })
 * ```
 */

import { match as cldrMatch } from "@formatjs/intl-localematcher"
import { isbot } from "isbot"
import Negotiator from "negotiator"
import type { FlareMiddleware } from "../index"

export interface I18nCookieConfig {
	/**
	 * Cookie name
	 */
	key: string
	/**
	 * Cookie max age in seconds
	 * @default 31536000 (1 year)
	 */
	maxAge?: number
	/**
	 * Use Secure flag (only sent over HTTPS)
	 * @default auto-detect from request URL
	 */
	secure?: boolean
}

export interface I18nConfig {
	/**
	 * Supported locales (lowercase)
	 */
	locales: string[]
	/**
	 * Default locale (used when no preference detected)
	 */
	defaultLocale: string
	/**
	 * Cookie configuration
	 */
	cookie: I18nCookieConfig
	/**
	 * Paths to skip i18n processing
	 */
	skip?: string[]
}

/** Key used to store locale in serverRequestContext */
export const LOCALE_KEY = "locale"

/**
 * Extract locale from URL path
 * /hr/about → "hr", /en-us/about → "en-us"
 */
function getLocaleFromPath(pathname: string, localeSet: Set<string>): string | null {
	const slashIdx = pathname.indexOf("/", 1)
	const segment = (slashIdx === -1 ? pathname.slice(1) : pathname.slice(1, slashIdx)).toLowerCase()
	return localeSet.has(segment) ? segment : null
}

/**
 * Extract locale from cookie
 */
function getLocaleFromCookie(
	request: Request,
	cookieKey: string,
	localeSet: Set<string>,
): string | null {
	const cookieHeader = request.headers.get("cookie")
	if (!cookieHeader) return null

	const regex = new RegExp(`${cookieKey}=([^;]+)`)
	const match = cookieHeader.match(regex)
	const locale = match?.[1]?.toLowerCase()

	return locale && localeSet.has(locale) ? locale : null
}

/**
 * Get best locale from Accept-Language header using CLDR matching
 */
function getLocaleFromAcceptLanguage(
	request: Request,
	locales: string[],
	defaultLocale: string,
): string {
	const acceptLanguage = request.headers.get("accept-language")
	if (!acceptLanguage) return defaultLocale

	const negotiator = new Negotiator({ headers: { "accept-language": acceptLanguage } })
	const requested = negotiator.languages()

	if (requested.length === 0) return defaultLocale

	for (const req of requested) {
		try {
			const result = cldrMatch([req], locales, "")
			if (result && result !== "") {
				return result.toLowerCase()
			}
		} catch {
			/* No match for this locale, try next */
		}
	}

	return defaultLocale
}

/**
 * Check if path segment looks like a locale (xx or xx-yy format)
 */
function hasLocaleLikeSegment(pathname: string): boolean {
	const slashIdx = pathname.indexOf("/", 1)
	const segment = slashIdx === -1 ? pathname.slice(1) : pathname.slice(1, slashIdx)
	return /^[a-z]{2}(-[a-z]{2,4})?$/i.test(segment)
}

/**
 * Build Set-Cookie header value
 */
function buildCookieHeader(locale: string, config: I18nCookieConfig, isHttps: boolean): string {
	const maxAge = config.maxAge ?? 31536000
	const secure = config.secure ?? isHttps
	const secureFlag = secure ? "; Secure" : ""
	return `${config.key}=${locale}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureFlag}`
}

export function i18n(config: I18nConfig): FlareMiddleware {
	const { locales, defaultLocale, cookie, skip = [] } = config

	/* Pre-compute locale set for O(1) lookup */
	const localeSet = new Set(locales.map((l) => l.toLowerCase()))

	/* Default skip paths */
	const skipPaths = ["/_fn/", ...skip]

	return async (ctx, _next) => {
		const { pathname } = ctx.url
		const isHttps = ctx.url.protocol === "https:"

		/* Bots get default locale for consistent SEO indexing */
		const userAgent = ctx.request.headers.get("user-agent") ?? ""
		if (isbot(userAgent)) {
			ctx.serverRequestContext.set(LOCALE_KEY, defaultLocale)
			return { type: "next" }
		}

		/* Skip configured paths */
		for (const skipPath of skipPaths) {
			if (pathname.startsWith(skipPath)) {
				ctx.serverRequestContext.set(LOCALE_KEY, defaultLocale)
				return { type: "next" }
			}
		}

		/* Skip files with extensions */
		const lastDot = pathname.lastIndexOf(".")
		if (lastDot > pathname.lastIndexOf("/")) {
			ctx.serverRequestContext.set(LOCALE_KEY, defaultLocale)
			return { type: "next" }
		}

		/* Normalize locale case (EN-US -> en-us) */
		const slashIdx = pathname.indexOf("/", 1)
		const firstSegment = slashIdx === -1 ? pathname.slice(1) : pathname.slice(1, slashIdx)

		if (firstSegment && /^[a-z]{2}(-[a-z]{2,4})?$/i.test(firstSegment)) {
			const lowerSegment = firstSegment.toLowerCase()
			if (firstSegment !== lowerSegment) {
				const newUrl = new URL(ctx.url)
				newUrl.pathname = pathname.replace(firstSegment, lowerSegment)

				const headers = new Headers({ Location: newUrl.href })
				if (localeSet.has(lowerSegment)) {
					headers.set("Set-Cookie", buildCookieHeader(lowerSegment, cookie, isHttps))
				}

				return {
					response: new Response(null, { headers, status: 302 }),
					type: "bypass",
				}
			}
		}

		/* Extract locale with priority: path > cookie > accept-language > default */
		const pathLocale = getLocaleFromPath(pathname, localeSet)
		const cookieLocale = getLocaleFromCookie(ctx.request, cookie.key, localeSet)
		const hasInvalidLocale = !pathLocale && hasLocaleLikeSegment(pathname)

		/* Only use Accept-Language if no cookie (first visit) */
		const acceptLocale = !cookieLocale
			? getLocaleFromAcceptLanguage(ctx.request, locales, defaultLocale)
			: null

		const currentLocale = pathLocale ?? cookieLocale ?? acceptLocale ?? defaultLocale

		/* Handle invalid/unsupported locale in path (e.g., /de-de) */
		if (hasInvalidLocale) {
			const fallbackLocale = cookieLocale ?? acceptLocale ?? defaultLocale
			const newUrl = new URL(ctx.url)

			/* Remove invalid locale segment */
			newUrl.pathname = pathname.replace(`/${firstSegment}`, "") || "/"

			/* Prepend fallback locale if non-default */
			if (fallbackLocale !== defaultLocale) {
				newUrl.pathname = `/${fallbackLocale}${newUrl.pathname === "/" ? "" : newUrl.pathname}`
			}

			const headers = new Headers({ Location: newUrl.href })
			headers.set("Set-Cookie", buildCookieHeader(fallbackLocale, cookie, isHttps))

			return {
				response: new Response(null, { headers, status: 302 }),
				type: "bypass",
			}
		}

		/* Root path without locale - redirect to user's locale if non-default */
		if (!pathLocale && pathname === "/") {
			const userLocale = cookieLocale ?? acceptLocale ?? defaultLocale

			if (userLocale !== defaultLocale) {
				const newUrl = new URL(ctx.url)
				newUrl.pathname = `/${userLocale}`

				const headers = new Headers({ Location: newUrl.href })
				headers.set("Set-Cookie", buildCookieHeader(userLocale, cookie, isHttps))

				return {
					response: new Response(null, { headers, status: 302 }),
					type: "bypass",
				}
			}
		}

		/* Non-root path without locale - redirect if cookie has non-default locale */
		if (!pathLocale && pathname !== "/" && cookieLocale && cookieLocale !== defaultLocale) {
			const newUrl = new URL(ctx.url)
			newUrl.pathname = `/${cookieLocale}${pathname}`

			const headers = new Headers({ Location: newUrl.href })
			headers.set("Set-Cookie", buildCookieHeader(cookieLocale, cookie, isHttps))

			return {
				response: new Response(null, { headers, status: 302 }),
				type: "bypass",
			}
		}

		/* Redirect default locale to non-localized path (/en-us/about -> /about) */
		if (pathLocale === defaultLocale) {
			const newUrl = new URL(ctx.url)
			newUrl.pathname = pathname.replace(`/${defaultLocale}`, "") || "/"

			const headers = new Headers({ Location: newUrl.href })
			headers.set("Set-Cookie", buildCookieHeader(defaultLocale, cookie, isHttps))

			return {
				response: new Response(null, { headers, status: 302 }),
				type: "bypass",
			}
		}

		/* No redirect needed - set locale and register cookie handler if needed */
		ctx.serverRequestContext.set(LOCALE_KEY, currentLocale)

		const needsCookie = currentLocale !== cookieLocale
		if (needsCookie) {
			const cookieHeader = buildCookieHeader(currentLocale, cookie, isHttps)
			ctx.onResponse((response) => {
				response.headers.append("Set-Cookie", cookieHeader)
				return response
			})
		}

		return { type: "next" }
	}
}
