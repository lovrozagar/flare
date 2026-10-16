import { defined } from "../../../shared/errors/index.ts"
import { LOCALE_SLOT, type LocaleDecision, type LocaleInput, type LocaleSlot } from "../../../server/lifecycle/index.ts"
import { localeCookie } from "../shared/cookie.ts"
import { matchLocale, type I18nConfig } from "./match.ts"

// `botDetection` is the server's own. The tags, the default, the param name, and the cookie name are the router's
// `locale` (B73); given here, each must equal the router's, which createServer checks.
export type I18nOptions = {
	locales?: readonly string[]
	defaultLocale?: string
	cookieName?: string
	paramName?: string
	botDetection?: boolean
}

// The locale slot createServer({ locale }) runs, with the fields it was given. It is not a middleware.
export type I18n = LocaleSlot & { readonly botDetection: boolean }

// A cookie name is an RFC 6265 token.
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

// A given `locales` is non-empty, unique, and canonical BCP 47, and holds a given `defaultLocale` (dx/features.md
// i18n).
export function i18n(options: I18nOptions = {}): I18n {
	checkOptions(options)
	const { locales, defaultLocale, cookieName, paramName } = options
	const botDetection = options.botDetection ?? true
	return {
		...(locales !== undefined && { locales }),
		...(defaultLocale !== undefined && { defaultLocale }),
		...(cookieName !== undefined && { cookieName }),
		...(paramName !== undefined && { paramName }),
		botDetection,
		[LOCALE_SLOT]: (input: LocaleInput) => decide(input, botDetection),
	}
}

function checkOptions(options: I18nOptions): void {
	const { locales, defaultLocale, cookieName } = options
	if (locales !== undefined) {
		if (locales.length === 0 || new Set(locales).size !== locales.length) throw new Error("i18n locales")
		for (const tag of locales) if (canonical(tag) !== tag) throw new Error(`i18n locales: ${JSON.stringify(tag)}`)
		if (defaultLocale !== undefined && !locales.includes(defaultLocale)) {
			throw new Error(`i18n defaultLocale ${defaultLocale} is not in locales`)
		}
	}
	if (cookieName !== undefined && !TOKEN.test(cookieName)) throw new Error("i18n cookieName")
}

// The matcher's answer as the slot's decision, over the router's locale config. The cookie string carries the
// server's attributes, `Secure` on https.
function decide(input: LocaleInput, botDetection: boolean): LocaleDecision {
	const config: I18nConfig = { ...defined(input.router.locale, "the router's locale"), botDetection }
	const url = new URL(input.request.url)
	const headers = input.request.headers
	const found = matchLocale(
		{
			url,
			kind: input.kind,
			cookieHeader: headers.get("cookie"),
			acceptLanguage: headers.get("accept-language"),
			userAgent: headers.get("user-agent") ?? "",
		},
		config,
		input.router,
	)
	const setCookie =
		found.cookie === undefined ? undefined : localeCookie(config.cookieName, found.cookie, url.protocol === "https:")
	return { redirect: found.redirect, setCookie, negotiated: found.negotiated }
}

function canonical(tag: string): string | undefined {
	try {
		return Intl.getCanonicalLocales(tag)[0]
	} catch {
		return undefined
	}
}
