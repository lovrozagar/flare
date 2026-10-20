import { parseDuration } from "../../shared/duration/index.ts"
import type { ServerFnRecord } from "../../shared/server-fn/builder.ts"

const PRIVATE = "private, no-store"

type Caching = Pick<ServerFnRecord, "method" | "authenticate" | "authorize" | "cache">

// A server function is private unless it is a GET with no `authenticate`, no `authorize`, and a `cache.maxAge`
// duration. Whole seconds, rounded down (B43).
export function fnCacheControl(record: Caching): string {
	const shared = record.method === "get" && !record.authenticate && record.authorize === undefined
	if (!shared || record.cache === undefined) return PRIVATE
	return `public, max-age=${Math.floor(parseDuration(record.cache.maxAge) / 1000)}`
}

// Whether a 2xx answer with no Set-Cookie is public: a stream's header goes out before its outcome is known.
export function fnIsPublic(record: Caching): boolean {
	return fnCacheControl(record) !== PRIVATE
}

// A returned Response keeps its other headers, and this one is overwritten (B43). Only a 2xx answer with no Set-Cookie
// may be public: an error envelope, a thrown status, or a cookie is one visitor's, and no CDN may keep it
// (BUGS.md 166).
export function setCacheControl(headers: Headers, record: Caching, status: number): void {
	const cacheable = status >= 200 && status <= 299 && headers.getSetCookie().length === 0
	headers.set("cache-control", cacheable ? fnCacheControl(record) : PRIVATE)
}
