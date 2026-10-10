import { match as cldrMatch } from "@formatjs/intl-localematcher";
import { isbot } from "isbot";
import Negotiator from "negotiator";
import type { FlareMiddleware } from "..";
import { formatLocaleCookie } from "../../locale/cookie.ts";
import { HEADER_DATA, HEADER_FLAG, HEADER_PRERENDER, HEADER_PREFETCH, INTERNAL_PATH_PREFIX } from "../../protocol.ts";
import { matchRoute, toLocaleMatch } from "../../router-primitives/tree.ts";

/**
 * Matches BCP-47-like path segments with 2-letter primary subtag:
 * xx, xx-YY, xx-Yyyy, xx-Yyyy-ZZ
 * Covers: en, en-us, zh-hans, zh-hant-tw, sr-latn, pt-br
 * Uses 2-letter primary only to avoid false positives on route
 * segments like isr-test, env-fn-test, api-data.
 */
const LOCALE_LIKE_RE = /^[a-z]{2}(-[a-z]{2,4}){0,2}$/i;

export interface I18nMiddlewareOptions {
	botDetection?: boolean;
	cookie?: {
		maxAge?: number;
		secure?: boolean;
	};
	cookieName?: string;
	skip?: readonly string[];
}

function getLocaleFromPath(pathname: string, localeSet: Set<string>): string | null {
	const slashIdx = pathname.indexOf("/", 1);
	const segment = (slashIdx === -1 ? pathname.slice(1) : pathname.slice(1, slashIdx)).toLowerCase();
	return localeSet.has(segment) ? segment : null;
}

function getLocaleFromCookie(request: Request, cookieName: string, localeSet: Set<string>): string | null {
	const cookieHeader = request.headers.get("cookie");
	if (!cookieHeader) return null;
	for (const pair of cookieHeader.split(";")) {
		const eqIdx = pair.indexOf("=");
		if (eqIdx === -1) continue;
		const name = pair.slice(0, eqIdx).trim();
		if (name !== cookieName) continue;
		const locale = pair
			.slice(eqIdx + 1)
			.trim()
			.toLowerCase();
		return localeSet.has(locale) ? locale : null;
	}
	return null;
}

function getLocaleFromAcceptLanguage(request: Request, locales: readonly string[], defaultLocale: string): string {
	const acceptLanguage = request.headers.get("accept-language");
	if (!acceptLanguage) return defaultLocale;

	const negotiator = new Negotiator({ headers: { "accept-language": acceptLanguage } });
	const requested = negotiator.languages();
	if (requested.length === 0) return defaultLocale;

	for (const req of requested) {
		try {
			const result = cldrMatch([req], locales as string[], "");
			if (result && result !== "") {
				return result.toLowerCase();
			}
		} catch {
			/* no match, try next */
		}
	}

	return defaultLocale;
}

/** Path-only Location so the document applies Set-Cookie on 3xx (SW fetch() with follow does not). */
function locationForPath(url: URL, pathname: string): string {
	const next = new URL(url);
	next.pathname = pathname;
	return `${next.pathname}${next.search}${next.hash}`;
}

function buildCookieHeader(
	locale: string,
	cookieName: string,
	maxAge: number,
	isHttps: boolean,
	secure?: boolean,
): string {
	return formatLocaleCookie(locale, cookieName, { https: isHttps, maxAge, secure });
}

export function i18n(options?: I18nMiddlewareOptions): FlareMiddleware {
	let cachedLocales: readonly string[] | null = null;
	let cachedLocaleSet: Set<string> = new Set();
	let cachedSkipPaths: string[] = [];
	let cachedCookieName = "";
	let cachedMaxAge = 0;
	return async (ctx) => {
		if (!ctx.locale) {
			throw new Error(
				'i18n() middleware requires locale config on the router. Use router.locale({ locales: [...], defaultLocale: "..." }).',
			);
		}
		const { defaultLocale, locales } = ctx.locale;
		if (cachedLocales !== locales) {
			cachedLocales = locales;
			cachedLocaleSet = new Set(locales.map((l) => l.toLowerCase()));
			cachedCookieName = options?.cookieName ?? ctx.locale.cookieName ?? "flare.locale";
			cachedMaxAge = options?.cookie?.maxAge ?? 31536000;
			const skip = options?.skip ?? ctx.locale.skip ?? [];
			cachedSkipPaths = [INTERNAL_PATH_PREFIX, ...skip];
		}

		const { pathname } = ctx.url;
		const isHttps = ctx.url.protocol === "https:";

		/* Prerender snapshots the exact expanded URL — do not locale-redirect. */
		if (ctx.request.headers.get(HEADER_PRERENDER) === HEADER_FLAG) {
			const prerenderLocale = getLocaleFromPath(pathname, cachedLocaleSet);
			ctx.serverContext.locale = prerenderLocale ?? defaultLocale;
			return ctx.next();
		}

		/* Bots get default locale for consistent SEO */
		if (options?.botDetection !== false) {
			const userAgent = ctx.request.headers.get("user-agent") ?? "";
			if (isbot(userAgent)) {
				ctx.serverContext.locale = defaultLocale;
				return ctx.next();
			}
		}

		/* Skip configured paths */
		for (const skipPath of cachedSkipPaths) {
			if (pathname.startsWith(skipPath)) {
				ctx.serverContext.locale = defaultLocale;
				return ctx.next();
			}
		}

		/* Skip files with extensions */
		const lastDot = pathname.lastIndexOf(".");
		if (lastDot > pathname.lastIndexOf("/")) {
			ctx.serverContext.locale = defaultLocale;
			return ctx.next();
		}

		/* Normalize locale case (EN-US -> en-us) */
		const slashIdx = pathname.indexOf("/", 1);
		const firstSegment = slashIdx === -1 ? pathname.slice(1) : pathname.slice(1, slashIdx);

		if (firstSegment && LOCALE_LIKE_RE.test(firstSegment)) {
			const lowerSegment = firstSegment.toLowerCase();
			if (firstSegment !== lowerSegment) {
				const headers = new Headers({
					Location: locationForPath(ctx.url, pathname.replace(firstSegment, lowerSegment)),
				});
				if (cachedLocaleSet.has(lowerSegment)) {
					headers.set(
						"Set-Cookie",
						buildCookieHeader(lowerSegment, cachedCookieName, cachedMaxAge, isHttps, options?.cookie?.secure),
					);
				}
				return ctx.bypass(new Response(null, { headers, status: 302 }));
			}
		}

		const pathLocale = getLocaleFromPath(pathname, cachedLocaleSet);
		const cookieLocale = getLocaleFromCookie(ctx.request, cachedCookieName, cachedLocaleSet);
		const hasInvalidLocale = !pathLocale && firstSegment !== "" && LOCALE_LIKE_RE.test(firstSegment);

		/* Invalid/unsupported locale-like segment in path → strip it */
		if (hasInvalidLocale) {
			const headers = new Headers({
				Location: locationForPath(ctx.url, pathname.replace(`/${firstSegment}`, "") || "/"),
			});
			headers.set(
				"Set-Cookie",
				buildCookieHeader(defaultLocale, cachedCookieName, cachedMaxAge, isHttps, options?.cookie?.secure),
			);
			return ctx.bypass(new Response(null, { headers, status: 302 }));
		}

		/* Default locale in URL → strip prefix when the unprefixed path is a real route.
		   Required `[locale]/ssg-about` has no `/ssg-about` twin — keep `/en/ssg-about`. */
		if (pathLocale === defaultLocale) {
			const strippedPath = pathname.replace(`/${defaultLocale}`, "") || "/";
			const canStrip =
				!ctx.routeTree || matchRoute(ctx.routeTree, strippedPath, false, toLocaleMatch(ctx.locale)) !== null;
			if (canStrip) {
				const headers = new Headers({ Location: locationForPath(ctx.url, strippedPath) });
				headers.set(
					"Set-Cookie",
					buildCookieHeader(defaultLocale, cachedCookieName, cachedMaxAge, isHttps, options?.cookie?.secure),
				);
				return ctx.bypass(new Response(null, { headers, status: 302 }));
			}
		}

		/*
		 * First visit to root — Accept-Language redirect.
		 * Only when no cookie exists (truly first visit).
		 */
		if (!pathLocale && pathname === "/" && !cookieLocale) {
			const acceptLocale = getLocaleFromAcceptLanguage(ctx.request, locales, defaultLocale);
			if (acceptLocale !== defaultLocale) {
				const headers = new Headers({ Location: locationForPath(ctx.url, `/${acceptLocale}`) });
				headers.set(
					"Set-Cookie",
					buildCookieHeader(acceptLocale, cachedCookieName, cachedMaxAge, isHttps, options?.cookie?.secure),
				);
				return ctx.bypass(new Response(null, { headers, status: 302 }));
			}
		}

		/*
		 * Cookie-respect redirect: unprefixed SSR path + cookie has non-default locale.
		 * Only for full page loads (not NDJSON/prefetch — SPA router handles those).
		 * e.g. /about with cookie=fr → 302 → /fr/about
		 */
		const isDataRequest = ctx.request.headers.get(HEADER_DATA) === HEADER_FLAG;
		if (!pathLocale && cookieLocale && cookieLocale !== defaultLocale && !isDataRequest) {
			return ctx.bypass(
				new Response(null, {
					headers: new Headers({ Location: locationForPath(ctx.url, `/${cookieLocale}${pathname}`) }),
					status: 302,
				}),
			);
		}

		/* URL is truth: locale comes from path, or default if no prefix */
		const currentLocale = pathLocale ?? defaultLocale;
		ctx.serverContext.locale = currentLocale;

		/* Prefetch requests must not set cookies — SPA prefetches multiple
		 * locale URLs after hydration, and the last one to complete would
		 * overwrite the correct cookie from the actual page load. */
		const isPrefetch = ctx.request.headers.get(HEADER_PREFETCH) === HEADER_FLAG;
		const needsCookie = !isPrefetch && currentLocale !== cookieLocale;
		if (needsCookie) {
			const setCookieHeader = buildCookieHeader(
				currentLocale,
				cachedCookieName,
				cachedMaxAge,
				isHttps,
				options?.cookie?.secure,
			);
			ctx.onResponse((response) => {
				response.headers.append("Set-Cookie", setCookieHeader);
				return response;
			});
		}

		return ctx.next();
	};
}
