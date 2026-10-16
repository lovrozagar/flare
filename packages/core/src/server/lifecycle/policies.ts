import { parseDuration } from "../../shared/duration/index.ts"
import type { EffectiveAuth } from "../auth/effective.ts"
import { foreignCookies } from "../cacheability/cookies.ts"
import type { Decision } from "../cacheability/decide.ts"

// Every answer that no rule makes public. finalize starts from it.
export const NO_STORE = "private, no-store"

// What the answer itself says. `errored` is a data or prefetch answer with an `e` frame or a redirect, which
// stays HTTP 200 (B73). `params` are the raw params a `cdn.tags` function reads (B32).
export type PolicyAnswer = { status: number; params: Record<string, string | string[]>; errored?: boolean }

function seconds(duration: string): number {
	return Math.floor(parseDuration(duration) / 1000)
}

// The one writer of Cache-Control, CDN-Cache-Control, and Cache-Tag for a rendered page (dx/cache.md "How the decision
// is made"). Only class `public` with `cdn.maxAge`, on a 2xx answer with no error frame, is public. `max-age=0` is
// deliberate: a deploy reaches the browser, and the CDN holds the copy. stale-while-revalidate goes to the CDN alone,
// through CDN-Cache-Control (RFC 9213): on Cache-Control, Firefox served the previous document from its own cache and
// revalidated it behind (BUGS.md 135).
export function policyHeaders(decision: Decision, answer: PolicyAnswer): Headers {
	const headers = new Headers({ "cache-control": NO_STORE })
	const { maxAge, swr, tags } = decision.cdn
	if (!isPublic(decision) || maxAge === undefined) return headers
	if (answer.status < 200 || answer.status > 299 || answer.errored === true) return headers
	headers.set("cache-control", `public, max-age=0, s-maxage=${seconds(maxAge)}`)
	const stale = swr === undefined ? "" : `, stale-while-revalidate=${seconds(swr)}`
	headers.set("cdn-cache-control", `public, max-age=${seconds(maxAge)}${stale}`)
	const list = typeof tags === "function" ? tags({ params: answer.params }) : (tags ?? [])
	if (list.length > 0) headers.set("cache-tag", list.join(", "))
	return headers
}

// Whether a 2xx answer with no error frame would carry the public header.
export function isPublic(decision: Decision): boolean {
	return decision.policy === "shared" && decision.class === "public" && decision.cdn.maxAge !== undefined
}

// A .response() page keeps its own Cache-Control, except on a chain that requires or reads auth, which is
// `private, no-store`, as B43 does for a server function (dx/cache.md "How the decision is made").
export function responseHeaders(source: Headers, auth: EffectiveAuth): Headers {
	const headers = new Headers(source)
	if (auth.requires || auth.reads) privately(headers)
	return headers
}

// An answer no shared cache may keep: `private, no-store`, and no CDN header or tag that a CDN would act on.
export function privately(headers: Headers): Headers {
	headers.set("cache-control", NO_STORE)
	headers.delete("cdn-cache-control")
	headers.delete("cache-tag")
	return headers
}

// The Set-Cookie values each answer finalize built left its stage with. A rendered page's are its route's own.
const staged = new WeakMap<Response, readonly string[]>()

export function recordCookies(response: Response): Response {
	staged.set(response, response.headers.getSetCookie())
	return response
}

// The exit of a mount and of the middleware chain. An answer a shared cache may store that carries a cookie its
// stage did not set, such as one a middleware added, leaves `private, no-store`. A Response with no record, such as
// a middleware's rewrap, fails closed: every cookie on it is late, even under `allowCookies` (dx/cache.md).
export function exitHeaders(response: Response): Headers {
	const headers = new Headers(response.headers)
	const control = headers.get("cache-control")
	if (control === null) return headers
	// An answer something made private keeps no CDN header the decision wrote.
	if (/\b(?:private|no-store)\b/i.test(control)) {
		headers.delete("cdn-cache-control")
		return headers
	}
	const late = foreignCookies({ route: staged.get(response) ?? [], all: headers.getSetCookie() })
	if (late.length === 0) return headers
	return privately(headers)
}
