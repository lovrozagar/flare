import type { RequestKind } from "../../shared/protocol/index.ts";
import { NDJSON, redirectBody } from "../navigation/index.ts";
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

// The configured tags and the param name come with the slot, so the sitemap lists each locale's URL (B101).
export type LocaleSlot = {
	readonly [LOCALE_SLOT]: (input: LocaleInput) => LocaleDecision;
	readonly locales: readonly string[];
	readonly defaultLocale: string;
	readonly paramName: string;
};

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
	// The router's answer leaves with the set it was built under, as the middleware exit's does (BUGS.md B12).
	const secured = exchange.built.secured ?? exchange.secured;
	return secure({ ...exchange, secured }, { status: response.status, body: response.body, headers });
}

// A document gets the 3xx. A data request gets HTTP 200 with the one `x` frame to the same target, as a loader
// redirect does. A prefetch never redirects, so it is a 404 with no frames (B73).
function redirected(
	exchange: Exchange,
	to: { status: number; location: string },
	cookie: string | undefined,
): Response {
	const headers = new Headers(exchange.secured.headers);
	headers.set("cache-control", NO_STORE);
	if (exchange.kind === "prefetch") return finalize({ status: 404, body: "", headers });
	if (cookie !== undefined) headers.append("set-cookie", cookie);
	if (exchange.kind === "document") return finalize({ status: to.status, body: "", location: to.location, headers });
	headers.set("content-type", NDJSON);
	return finalize({ status: 200, body: redirectBody({ s: to.status, u: to.location, r: true }), headers });
}

function isPrivate(response: Response): boolean {
	return /\b(?:private|no-store)\b/i.test(String(response.headers.get("cache-control")));
}
