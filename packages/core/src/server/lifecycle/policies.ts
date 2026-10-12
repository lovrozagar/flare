import { parseDuration } from "../../shared/duration/index.ts";
import type { EffectiveAuth } from "../auth/effective.ts";
import { foreignCookies } from "../cacheability/cookies.ts";
import type { Decision } from "../cacheability/decide.ts";

// Every answer that no rule makes public. finalize starts from it.
export const NO_STORE = "private, no-store";

// What the answer itself says. `errored` is a data or prefetch answer with an `e` frame or a redirect, which
// stays HTTP 200 (B73). `params` are the raw params a `cdn.tags` function reads (B32).
export type PolicyAnswer = { status: number; params: Record<string, string | string[]>; errored?: boolean };

function seconds(duration: string): number {
	return Math.floor(parseDuration(duration) / 1000);
}

// The one writer of Cache-Control and Cache-Tag for a rendered page (dx/cache.md "How the decision is made").
// Only class `public` with `cdn.maxAge`, on a 2xx answer with no error frame, is public. `max-age=0` is deliberate:
// a deploy reaches the browser, and the CDN holds the copy.
export function policyHeaders(decision: Decision, answer: PolicyAnswer): Headers {
	const headers = new Headers({ "cache-control": NO_STORE });
	const { maxAge, swr, tags } = decision.cdn;
	if (decision.policy !== "shared" || decision.class !== "public" || maxAge === undefined) return headers;
	if (answer.status < 200 || answer.status > 299 || answer.errored === true) return headers;
	headers.set(
		"cache-control",
		`public, max-age=0, s-maxage=${seconds(maxAge)}, stale-while-revalidate=${seconds(swr ?? "0s")}`,
	);
	const list = typeof tags === "function" ? tags({ params: answer.params }) : (tags ?? []);
	if (list.length > 0) headers.set("cache-tag", list.join(", "));
	return headers;
}

// A .response() page keeps its own Cache-Control, except on a chain that requires or reads auth, which is
// `private, no-store`, as B43 does for a server function (dx/cache.md "How the decision is made").
export function responseHeaders(source: Headers, auth: EffectiveAuth): Headers {
	const headers = new Headers(source);
	if (auth.requires || auth.reads) headers.set("cache-control", NO_STORE);
	return headers;
}

// The Set-Cookie values each answer finalize built left its stage with. A rendered page's are its route's own.
const staged = new WeakMap<Response, readonly string[]>();

export function recordCookies(response: Response): Response {
	staged.set(response, response.headers.getSetCookie());
	return response;
}

// The exit of a mount and of the middleware chain. An answer a shared cache may store that carries a cookie its
// stage did not set, such as one a middleware added, leaves `private, no-store`. A Response with no record, such as
// a middleware's rewrap, fails closed: every cookie on it is late, even under `allowCookies` (dx/cache.md).
export function exitHeaders(response: Response): Headers {
	const headers = new Headers(response.headers);
	const control = headers.get("cache-control");
	if (control === null || /\b(?:private|no-store)\b/i.test(control)) return headers;
	const late = foreignCookies({ route: staged.get(response) ?? [], all: headers.getSetCookie() });
	if (late.length === 0) return headers;
	headers.set("cache-control", NO_STORE);
	headers.delete("cache-tag");
	return headers;
}
