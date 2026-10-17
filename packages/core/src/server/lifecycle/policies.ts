import { parseDuration } from "../../shared/duration/index.ts"
import type { EffectiveAuth } from "../auth/effective.ts"
import { foreignCookies } from "../cacheability/cookies.ts"
import type { Decision } from "../cacheability/decide.ts"
import { buildId } from "./build-info.ts"

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
// revalidated it behind (BUGS.md 135). The tags end with the build's, `flare-build-<id>`, so after a deploy the edge copies
// of the previous build's pages can be purged once its hashed assets are gone (dx/server.md Deploying, plan 21 16.10).
export function policyHeaders(decision: Decision, answer: PolicyAnswer): Headers {
	const headers = new Headers({ "cache-control": NO_STORE })
	const { maxAge, swr, tags } = decision.cdn
	if (!isPublic(decision) || maxAge === undefined) return headers
	if (answer.status < 200 || answer.status > 299 || answer.errored === true) return headers
	headers.set("cache-control", `public, max-age=0, s-maxage=${seconds(maxAge)}`)
	const stale = swr === undefined ? "" : `, stale-while-revalidate=${seconds(swr)}`
	headers.set("cdn-cache-control", `public, max-age=${seconds(maxAge)}${stale}`)
	const list = typeof tags === "function" ? tags({ params: answer.params }) : (tags ?? [])
	headers.set("cache-tag", [...list, buildTag()].join(", "))
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

// Every header an edge cache acts on: the CDN-Cache-Control family, the surrogate headers, and the cache tag. A
// private answer carries none of them, whatever a route's `.headers()` set (BUGS.md 162).
const EDGE_CACHE = [
	"cdn-cache-control",
	"cloudflare-cdn-cache-control",
	"vercel-cdn-cache-control",
	"netlify-cdn-cache-control",
	"surrogate-control",
	"surrogate-key",
	"edge-control",
	"x-accel-expires",
	"cache-tag",
]

function withoutEdge(headers: Headers): Headers {
	for (const name of EDGE_CACHE) headers.delete(name)
	return headers
}

// An answer no shared cache may keep: `private, no-store`, and no header that a CDN would act on.
export function privately(headers: Headers): Headers {
	headers.set("cache-control", NO_STORE)
	return withoutEdge(headers)
}

// The decision's headers onto a rendered answer. A `no-store` one also drops what an edge cache would act on.
export function applyPolicy(headers: Headers, written: Headers): void {
	written.forEach((value, name) => headers.set(name, value))
	if (written.get("cache-control") === NO_STORE) withoutEdge(headers)
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
	const headers = decodedHeaders(response)
	const control = headers.get("cache-control")
	if (control === null) return headers
	// An answer something made private keeps no CDN header the decision wrote.
	if (/\b(?:private|no-store)\b/i.test(control)) return withoutEdge(headers)
	const late = foreignCookies({ route: staged.get(response) ?? [], all: headers.getSetCookie() })
	if (late.length === 0) return headers
	return privately(headers)
}

// A Response from `fetch()`, its `url` set, holds the body the platform already decoded, under the upstream's
// Content-Encoding and compressed Content-Length. Passed on as-is, Node writes a length the body overruns, Bun labels
// plain bytes gzip, and workerd encodes them again for a client that never asked, so both go. By default each
// runtime asks only for the encodings it decodes. A Response the app built keeps its encoding: its body is what the
// header says (plan 21 8.8, BUGS.md 197).
export function decodedHeaders(response: Response): Headers {
	const headers = new Headers(response.headers)
	if (response.url === "" || !headers.has("content-encoding")) return headers
	headers.delete("content-encoding")
	headers.delete("content-length")
	return headers
}

// The edge tag every public page of this build carries.
export function buildTag(): string {
	return `flare-build-${buildId}`
}
