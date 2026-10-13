import {
	LOCALE_SLOT,
	type LocaleDecision,
	type LocaleInput,
	type LocaleSlot,
} from "../../../server/lifecycle/index.ts";
import { LOCALE_COOKIE, localeCookie } from "../shared/cookie.ts";
import { matchLocale, type I18nConfig } from "./match.ts";

export type I18nOptions = {
	locales: readonly string[];
	defaultLocale: string;
	cookieName?: string;
	paramName?: string;
	botDetection?: boolean;
};

// The resolved config, and the locale slot createServer({ locale }) runs. It is not a middleware.
export type I18n = I18nConfig & LocaleSlot;

// A cookie name is an RFC 6265 token.
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// `locales` is non-empty, unique, and canonical BCP 47, and holds `defaultLocale` (dx/features.md i18n).
export function i18n(options: I18nOptions): I18n {
	const { locales, defaultLocale } = options;
	if (locales.length === 0 || new Set(locales).size !== locales.length) throw new Error("i18n locales");
	for (const tag of locales) if (canonical(tag) !== tag) throw new Error(`i18n locales: ${JSON.stringify(tag)}`);
	if (!locales.includes(defaultLocale)) throw new Error(`i18n defaultLocale ${defaultLocale} is not in locales`);
	const cookieName = options.cookieName ?? LOCALE_COOKIE;
	if (!TOKEN.test(cookieName)) throw new Error("i18n cookieName");
	const config: I18nConfig = {
		locales,
		defaultLocale,
		cookieName,
		paramName: options.paramName ?? "locale",
		botDetection: options.botDetection ?? true,
	};
	return { ...config, [LOCALE_SLOT]: (input: LocaleInput) => decide(input, config) };
}

// The matcher's answer as the slot's decision. The cookie string carries the server's attributes, `Secure` on https.
function decide(input: LocaleInput, config: I18nConfig): LocaleDecision {
	const url = new URL(input.request.url);
	const headers = input.request.headers;
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
	);
	const setCookie =
		found.cookie === undefined ? undefined : localeCookie(config.cookieName, found.cookie, url.protocol === "https:");
	return { redirect: found.redirect, setCookie, negotiated: found.negotiated };
}

function canonical(tag: string): string | undefined {
	try {
		return Intl.getCanonicalLocales(tag)[0];
	} catch {
		return undefined;
	}
}
