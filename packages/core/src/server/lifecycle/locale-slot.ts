import type { RequestKind } from "../../shared/protocol/index.ts";
import type { Router } from "../../shared/router/create-router.ts";
import { secure, type Exchange } from "./exchange.ts";
import { finalize } from "./finalize.ts";
import { NO_STORE } from "./policies.ts";

// The key `i18n()` publishes its slot under. A middleware has no such key, and the slot is not a middleware.
export const LOCALE_SLOT: unique symbol = Symbol.for("flare.locale-slot");

export type LocaleInput = { request: Request; kind: RequestKind; router: Router };

// What the slot decided for one page request. `setCookie` is a whole `Set-Cookie` value. `negotiated` marks a document
// whose content depended on the cookie and Accept-Language although its URL names no tag.
export type LocaleDecision = {
	redirect?: { status: 301 | 302; location: string } | undefined;
	setCookie?: string | undefined;
	negotiated?: boolean | undefined;
};

export type LocaleSlot = { readonly [LOCALE_SLOT]: (input: LocaleInput) => LocaleDecision };

// The locale slot, between rewrite and middleware, around the middleware chain of a page request (02-system). The
// feature decides. The cookie rule is the core's: the locale cookie rides the slot's own redirects, which are
// `no-store`, and an exit answer that is already `private` or `no-store`. A public answer, or one with no
// Cache-Control, never carries it, so no cached page turns private because of the locale (dx/features.md i18n).
export async function withLocale(exchange: Exchange, chain: () => Promise<Response>): Promise<Response> {
	const slot = exchange.options.locale;
	if (slot === undefined) return chain();
	const decision = slot[LOCALE_SLOT]({
		request: exchange.request,
		kind: exchange.kind,
		router: exchange.options.router,
	});
	const cookie = decision.setCookie;
	if (decision.redirect !== undefined) return redirected(exchange, decision.redirect, cookie);
	const response = await chain();
	// A negotiated public document leaves `private, no-store`: a CDN copy would answer without the slot. Its shared
	// decision already reached the Flare store, which sits behind the slot (dx/features.md i18n).
	const downgrade = decision.negotiated === true && !isPrivate(response);
	if (!downgrade && (cookie === undefined || !isPrivate(response))) return response;
	const headers = new Headers(response.headers);
	if (downgrade) {
		headers.set("cache-control", NO_STORE);
		headers.delete("cache-tag");
	}
	if (cookie !== undefined) headers.append("set-cookie", cookie);
	return secure(exchange, { status: response.status, body: response.body, headers });
}

function redirected(
	exchange: Exchange,
	to: { status: number; location: string },
	cookie: string | undefined,
): Response {
	const headers = new Headers(exchange.secured.headers);
	headers.set("cache-control", NO_STORE);
	if (cookie !== undefined) headers.append("set-cookie", cookie);
	return finalize({ status: to.status, body: "", location: to.location, headers });
}

function isPrivate(response: Response): boolean {
	return /\b(?:private|no-store)\b/i.test(String(response.headers.get("cache-control")));
}
