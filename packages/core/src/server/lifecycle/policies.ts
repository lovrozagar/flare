import { parseDuration } from "../../shared/duration/index.ts";
import type { EffectiveAuth } from "../auth/effective.ts";
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
