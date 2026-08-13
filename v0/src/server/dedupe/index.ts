/**
 * Server Request Deduplication
 *
 * Wrap async functions for per-request deduplication.
 * Same function + same args + same request = same promise.
 *
 * Also provides automatic fetch deduplication (like Next.js).
 */

import { getServerRequestContext } from "../context"

type DedupeCache = Map<string, Promise<unknown>>

const DEDUPE_CACHE_KEY = "__flare_dedupe__"
const FETCH_CACHE_KEY = "__flare_fetch_dedupe__"

let fnCounter = 0

function getDedupeCache(): DedupeCache {
	const ctx = getServerRequestContext()
	let cache = ctx.get<DedupeCache>(DEDUPE_CACHE_KEY)
	if (!cache) {
		cache = new Map()
		ctx.set(DEDUPE_CACHE_KEY, cache)
	}
	return cache
}

function getFetchCache(): Map<string, Promise<Response>> {
	const ctx = getServerRequestContext()
	let cache = ctx.get<Map<string, Promise<Response>>>(FETCH_CACHE_KEY)
	if (!cache) {
		cache = new Map()
		ctx.set(FETCH_CACHE_KEY, cache)
	}
	return cache
}

/**
 * Wrap async function for per-request deduplication.
 * Key auto-generated from function identity + serialized args.
 *
 * @example
 * const getUser = dedupe(async (id: string, env: Env) =>
 *   env.D1.prepare("SELECT * FROM users WHERE id = ?").bind(id).first()
 * )
 *
 * // In root preloader
 * const user = await getUser("123", env)  // executes
 *
 * // In page loader (same request)
 * const user = await getUser("123", env)  // returns cached promise
 */
function dedupe<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
	const fnId = `dedupe:${++fnCounter}`

	return (...args) => {
		const cache = getDedupeCache()
		const key = `${fnId}:${JSON.stringify(args)}`
		const existing = cache.get(key) as Promise<TResult> | undefined
		if (existing) return existing

		const promise = fn(...args)
		cache.set(key, promise)
		return promise
	}
}

/**
 * Headers excluded from cache key (trace/correlation IDs change per-request).
 * Same as Next.js behavior.
 */
const EXCLUDED_HEADERS = new Set(["traceparent", "tracestate", "x-request-id", "x-correlation-id"])

/**
 * Generate stable header string for cache key.
 * Includes headers that affect response (Auth, Accept, etc).
 */
function getHeadersKey(headers?: HeadersInit): string {
	if (!headers) return ""

	let entries: Array<[string, string]>

	if (headers instanceof Headers) {
		entries = Array.from(headers.entries())
	} else if (Array.isArray(headers)) {
		entries = headers as Array<[string, string]>
	} else {
		entries = Object.entries(headers)
	}

	/* Filter out excluded headers, sort for stability */
	const filtered = entries
		.filter(([key]) => !EXCLUDED_HEADERS.has(key.toLowerCase()))
		.sort(([a], [b]) => a.localeCompare(b))

	if (filtered.length === 0) return ""

	return JSON.stringify(filtered)
}

/**
 * Generate cache key for fetch request.
 * Only dedupes GET/HEAD requests (safe, idempotent).
 * Key includes URL + method + headers (for auth safety).
 */
function getFetchCacheKey(input: RequestInfo | URL, init?: RequestInit): string | null {
	let method: string
	let url: string
	let headers: HeadersInit | undefined

	if (input instanceof Request) {
		method = input.method.toUpperCase()
		url = input.url
		headers = input.headers
	} else {
		method = init?.method?.toUpperCase() ?? "GET"
		url = typeof input === "string" ? input : input.href
		headers = init?.headers
	}

	/* Only dedupe safe methods */
	if (method !== "GET" && method !== "HEAD") {
		return null
	}

	const headersKey = getHeadersKey(headers)

	return `fetch:${method}:${url}:${headersKey}`
}

/**
 * Create deduplicated fetch that caches GET/HEAD requests per server request.
 * Returns cloned responses so each caller gets their own body stream.
 */
function createDedupedFetch(originalFetch: typeof fetch): typeof fetch {
	return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		let cache: Map<string, Promise<Response>>
		try {
			cache = getFetchCache()
		} catch {
			/* Outside request context - use original fetch */
			return originalFetch(input, init)
		}

		const key = getFetchCacheKey(input, init)

		/* Non-deduplicatable request (POST, etc) */
		if (!key) {
			return originalFetch(input, init)
		}

		const existing = cache.get(key)
		if (existing) {
			/* Return clone so each caller gets own body stream */
			const response = await existing
			return response.clone()
		}

		const promise = originalFetch(input, init).then((response) => {
			/* Store the response - we'll clone it for each caller */
			return response
		})

		cache.set(key, promise)

		const response = await promise
		return response.clone()
	}
}

let originalFetchRef: typeof fetch | null = null

/**
 * Enable automatic fetch deduplication for the current request.
 * Patches globalThis.fetch to dedupe GET/HEAD requests.
 *
 * Called automatically by Flare handler when dedupeFetch: true.
 */
function enableFetchDedupe(): void {
	if (originalFetchRef) return

	originalFetchRef = globalThis.fetch
	globalThis.fetch = createDedupedFetch(originalFetchRef)
}

/**
 * Disable fetch deduplication and restore original fetch.
 */
function disableFetchDedupe(): void {
	if (originalFetchRef) {
		globalThis.fetch = originalFetchRef
		originalFetchRef = null
	}
}

/**
 * Check if fetch deduplication is enabled.
 */
function isFetchDedupeEnabled(): boolean {
	return originalFetchRef !== null
}

export { dedupe, disableFetchDedupe, enableFetchDedupe, isFetchDedupeEnabled }
