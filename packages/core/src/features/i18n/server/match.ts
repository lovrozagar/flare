// negotiator ships no types. Its ambient shim sits in a script file, and a reference is how a module loads one (B37).
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./negotiator.d.ts" />

import { parseCookieHeader } from "@solidjs/web"
import { match } from "@formatjs/intl-localematcher"
import { isbot } from "isbot"
import Negotiator from "negotiator"
import type { RequestKind } from "../../../shared/protocol/index.ts"
import { idPattern, patternSegments } from "../../../shared/route-tree/index.ts"
import type { Router } from "../../../shared/router/index.ts"
import { localeLike } from "../../../shared/router/features.ts"
import { buildUrl } from "../../../shared/url/index.ts"

// The server's i18n config, as i18n() resolves it (dx/features.md i18n).
export type I18nConfig = {
	readonly locales: readonly string[]
	readonly defaultLocale: string
	readonly cookieName: string
	readonly paramName: string
	readonly botDetection: boolean
}

export type LocaleRequest = {
	url: URL
	kind: RequestKind
	cookieHeader: string | null
	acceptLanguage: string | null
	userAgent: string
}

// `cookie` is the tag a response may persist. The slot writes it only where the cookie rules allow. `negotiated` is a
// document whose URL shows no tag: what it shows depended on the cookie and Accept-Language, so it leaves private.
export type LocaleMatch = {
	locale: string
	redirect?: { status: 301 | 302; location: string }
	cookie?: string
	negotiated?: true
}

type RouterLike = Pick<Router, "match" | "basePath">

// The page's locale segment, read from the matched route's pattern. `response` marks a `.response()` route, which is
// never negotiated: it is no rendered document (dx/features.md i18n, BUGS.md B23).
type Page = { id: string; params: Record<string, string | string[] | undefined>; optional: boolean; response: boolean }

const MAX_TAGS = 8

// The locale for one request: the path tag, then the cookie, then `Accept-Language`, then the default. Only a
// document redirects. A wrong-case path tag 301s to the configured spelling. The router's locale param holds only a
// configured tag (B73), so a segment that is none never reaches here as a tag. A document whose URL does not show the tag the
// cookie or the header chose 302s to it. A bot follows neither the cookie nor the header and never gets a cookie. A
// data response may persist the tag its URL shows. A prefetch never persists one.
export function matchLocale(request: LocaleRequest, config: I18nConfig, router: RouterLike): LocaleMatch {
	const page = localePage(router, request.url.pathname, config.paramName)
	const raw = page?.params[config.paramName]
	const bot = config.botDetection && isbot(request.userAgent)
	if (page !== undefined && typeof raw === "string") return pathTag({ request, config, router, page, raw, bot })
	if (bot) return { locale: config.defaultLocale, ...(untagged(request, config, page) && { negotiated: true }) }
	return negotiated({ request, config, router }, page)
}

// A document under an optional locale param with no tag, where more than one locale is configured.
function untagged(request: LocaleRequest, config: I18nConfig, page: Page | undefined): boolean {
	return request.kind === "document" && page !== undefined && !page.response && config.locales.length > 1
}

// No tag on the path. On an optional segment the URL shows the default.
function negotiated(input: Omit<RedirectInput, "page">, page: Page | undefined): LocaleMatch {
	const { request, config } = input
	const shown = page === undefined ? undefined : config.defaultLocale
	const stored = cookieTag(request.cookieHeader, config)
	const chosen = stored ?? headerTag(request.acceptLanguage, config) ?? config.defaultLocale
	if (request.kind === "document" && page !== undefined && !page.response && chosen !== shown) {
		return redirect({ ...input, page }, { tag: chosen, status: 302, cookie: chosen })
	}
	const persist = request.kind === "data" && shown !== undefined && shown !== stored
	const locale = shown ?? chosen
	return { locale, ...(persist && { cookie: shown }), ...(untagged(request, config, page) && { negotiated: true }) }
}

type PathInput = {
	request: LocaleRequest
	config: I18nConfig
	router: RouterLike
	page: Page
	raw: string
	bot: boolean
}

function pathTag(input: PathInput): LocaleMatch {
	const { request, config, raw, bot } = input
	if (config.locales.includes(raw)) {
		const persist = request.kind === "data" && !bot && cookieTag(request.cookieHeader, config) !== raw
		return { locale: raw, ...(persist && { cookie: raw }) }
	}
	const cased = config.locales.find((tag) => tag.toLowerCase() === raw.toLowerCase())
	if (cased !== undefined) {
		if (request.kind !== "document") return { locale: config.defaultLocale }
		return redirect(input, { tag: cased, status: 301, cookie: bot || input.page.response ? undefined : cased })
	}
	// A router with no `locale` config does not filter the param: a segment that is no configured tag is no locale.
	return { locale: config.defaultLocale }
}

type RedirectInput = Pick<PathInput, "request" | "config" | "router" | "page">

type Target = { tag: string; status: 301 | 302; cookie: string | undefined }

// The same route with the locale segment set to `tag`, or removed when `tag` is the default on an optional segment. The query stays. The target is built from the matched route's own pattern, so it is a route. A
// URL that matches no route is not a locale page, and the router answers it.
function redirect(input: RedirectInput, target: Target): LocaleMatch {
	const { request, config, router, page } = input
	const { tag, status, cookie } = target
	const dropped = page.optional && tag === config.defaultLocale
	const path = buildUrl({ to: page.id, params: { ...page.params, [config.paramName]: dropped ? undefined : tag } })
	const location = `${router.basePath === "/" ? "" : router.basePath}${path}${request.url.search}`
	return { locale: tag, redirect: { status, location }, ...(cookie !== undefined && { cookie }) }
}

function localePage(router: RouterLike, pathname: string, name: string): Page | undefined {
	const matched = router.match(pathname)
	if (matched.id === undefined) return undefined
	const segment = patternSegments(idPattern(matched.id)).find((item) => item.kind === "dynamic" && item.name === name)
	if (segment === undefined || segment.kind !== "dynamic") return undefined
	return { id: matched.id, params: matched.params, optional: segment.optional, response: matched.response === true }
}

// The cookie, through Solid's parser, followed only when it is a configured tag byte for byte.
function cookieTag(header: string | null, config: I18nConfig): string | undefined {
	const value = parseCookieHeader(header)[config.cookieName]
	return config.locales.find((tag) => tag === value)
}

// The first 8 `Accept-Language` tags, parsed by negotiator, then one match() against the configured list. The result
// is the configured spelling. No header, or no tag the list matches, is nothing.
function headerTag(header: string | null, config: I18nConfig): string | undefined {
	if (header === null) return undefined
	const capped = header.split(",").slice(0, MAX_TAGS).join(",")
	const requested = new Negotiator({ headers: { "accept-language": capped } }).languages().filter(localeLike)
	if (requested.length === 0) return undefined
	const NONE = ""
	const found = match(requested, config.locales, NONE)
	return found === NONE ? undefined : config.locales.find((tag) => tag.toLowerCase() === found.toLowerCase())
}
