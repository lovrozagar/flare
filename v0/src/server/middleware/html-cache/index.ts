/**
 * HTML Cache Middleware
 *
 * SWR (Stale-While-Revalidate) cache using Cloudflare Cache API.
 * Caches HTML pages and static files with background revalidation.
 *
 * @example
 * ```typescript
 * import { htmlCache } from "@flare/v0/server/middleware/html-cache"
 *
 * createServerHandler({
 *   middlewares: [
 *     htmlCache({
 *       enabled: ({ env }) => env.PUBLIC_ENVIRONMENT !== "local",
 *       name: "app-cache",
 *       skip: /^(\/assets\/|\/_static\/|\/_fn\/)/i,
 *       html: { cacheControl: "public, max-age=60, stale-while-revalidate=86400" },
 *       files: [
 *         { path: "sitemap.xml", cacheControl: "public, max-age=3600" },
 *         { path: "robots.txt", cacheControl: "public, max-age=3600" },
 *       ],
 *     }),
 *   ],
 * })
 * ```
 */

import type { FlareMiddleware, MiddlewareContext } from "../index"

export interface FileCacheRule {
	/**
	 * Path suffix to match (e.g., "sitemap.xml")
	 */
	path: string
	/**
	 * Cache-Control header value
	 */
	cacheControl: string
}

export interface HtmlCacheConfig<TEnv = unknown> {
	/**
	 * Whether caching is enabled
	 * @default true
	 */
	enabled?: boolean | ((ctx: { env: TEnv }) => boolean)
	/**
	 * Cache namespace name
	 */
	name: string
	/**
	 * Path pattern to skip caching (regex match)
	 */
	skip?: RegExp
	/**
	 * HTML pages cache config
	 */
	html: { cacheControl: string }
	/**
	 * Static files cache config
	 */
	files?: FileCacheRule[]
}

interface CacheDirectives {
	maxAge: number
	staleWhileRevalidate: number | null
}

const CACHED_AT_HEADER = "x-cached-at"
const CACHE_STATUS_HEADER = "x-swr-status"
const SKIP_CACHE_HEADER = "x-skip-cache"
const SKIP_CACHE_PARAM = "xskipcache"

/**
 * Parse Cache-Control header directives
 */
function parseCacheControl(cacheControl: string): CacheDirectives | null {
	const maxAgeMatch = /max-age=(\d+)/.exec(cacheControl)
	if (!maxAgeMatch?.[1]) return null

	const swrMatch = /stale-while-revalidate=(\d+)/.exec(cacheControl)

	return {
		maxAge: parseInt(maxAgeMatch[1], 10),
		staleWhileRevalidate: swrMatch?.[1] ? parseInt(swrMatch[1], 10) : null,
	}
}

/**
 * Extract nonce from cached HTML response
 * Looks for nonce="..." in first 4KB of response
 */
async function extractNonceFromHtml(response: Response): Promise<string | null> {
	const contentType = response.headers.get("content-type")
	if (!contentType?.includes("text/html")) return null

	const body = response.clone().body
	if (!body) return null

	const reader = body.getReader()
	const decoder = new TextDecoder()

	const maxBytes = 4096
	let bytesRead = 0
	let buffer = ""

	try {
		while (bytesRead < maxBytes) {
			const { done, value } = await reader.read()
			if (done) break

			buffer += decoder.decode(value, { stream: true })
			bytesRead += value?.length ?? 0

			const idx = buffer.indexOf('nonce="')
			if (idx !== -1) {
				const endIdx = buffer.indexOf('"', idx + 7)
				if (endIdx !== -1) {
					return buffer.slice(idx + 7, endIdx)
				}
			}
		}
	} finally {
		reader.cancel()
	}

	return null
}

export function htmlCache<TEnv>(config: HtmlCacheConfig<TEnv>): FlareMiddleware<TEnv> {
	const { enabled = true, name, skip, html, files = [] } = config

	/* Pre-process file rules */
	const fileRules = new Map<string, string>()
	for (const file of files) {
		fileRules.set(file.path, file.cacheControl)
	}

	/* Cache instance (lazy initialized) */
	let cacheInstance: Cache | null = null

	return async (ctx: MiddlewareContext<TEnv>, _next) => {
		/* CF Cache API not available - skip caching */
		if (typeof caches === "undefined") {
			return { type: "next" }
		}

		/* Check if enabled */
		const isEnabled = typeof enabled === "function" ? enabled({ env: ctx.env }) : enabled
		if (!isEnabled) return { type: "next" }

		/* Only cache GET requests */
		if (ctx.request.method !== "GET") return { type: "next" }

		/* Skip if matches pattern */
		if (skip?.test(ctx.url.pathname)) return { type: "next" }

		/*
		 * Skip cache read via header or query param
		 * - header: x-skip-cache: "1"
		 * - query: ?xskipcache=1
		 */
		const skipCacheHeader = ctx.request.headers.get(SKIP_CACHE_HEADER)
		const skipCacheParam = ctx.url.searchParams.get(SKIP_CACHE_PARAM)
		const skipCache = skipCacheHeader === "1" || skipCacheParam === "1"

		/* Determine cache config for this path */
		let cacheControl: string | null = null

		/* Check file rules */
		for (const [suffix, cc] of fileRules) {
			if (ctx.url.pathname.endsWith(suffix)) {
				cacheControl = cc
				break
			}
		}

		/* Check if HTML (no extension) */
		if (!cacheControl) {
			const hasExtension = ctx.url.pathname.includes(".")
			if (!hasExtension) {
				cacheControl = html.cacheControl
			}
		}

		/* Not cacheable */
		if (!cacheControl) return { type: "next" }

		/* Parse cache directives */
		const directives = parseCacheControl(cacheControl)
		if (!directives) return { type: "next" }

		/* Get cache instance (lazy init) */
		if (!cacheInstance) {
			cacheInstance = await caches.open(name)
		}
		const cache = cacheInstance

		/* Check cache (skip lookup if skipCache is set) */
		const cached = skipCache ? null : await cache.match(ctx.request)

		if (cached) {
			const cachedAtStr = cached.headers.get(CACHED_AT_HEADER)
			const cachedAt = cachedAtStr ? parseInt(cachedAtStr, 10) : 0
			const age = Date.now() - cachedAt
			const maxAgeMs = directives.maxAge * 1000

			/* Check if FRESH */
			const isFresh = age < maxAgeMs

			/* Check if within SWR window */
			const isWithinSwr =
				directives.staleWhileRevalidate !== null
					? age < maxAgeMs + directives.staleWhileRevalidate * 1000
					: false

			if (isFresh || isWithinSwr) {
				/* Extract nonce from cached HTML for security headers */
				const extractedNonce = await extractNonceFromHtml(cached)
				if (extractedNonce) {
					ctx.serverRequestContext.set("nonce", extractedNonce)
				}

				/* Background revalidation if stale */
				if (!isFresh && isWithinSwr) {
					ctx.executionContext.waitUntil(
						(async () => {
							/* Re-fetch fresh response - this will go through the full render pipeline */
							const freshUrl = new URL(ctx.request.url)
							freshUrl.searchParams.set("_revalidate", "1")

							try {
								const freshRequest = new Request(freshUrl.toString(), {
									headers: ctx.request.headers,
									method: "GET",
								})

								/* Fetch through the worker itself for fresh content */
								const freshResponse = await fetch(freshRequest)

								if (freshResponse.ok) {
									const toCache = new Response(freshResponse.body, freshResponse)
									toCache.headers.set(CACHED_AT_HEADER, Date.now().toString())
									await cache.put(ctx.request, toCache)
								}
							} catch {
								/* Revalidation failed - keep serving stale */
							}
						})(),
					)
				}

				/* Return cached response with status header */
				const response = new Response(cached.body, cached)
				response.headers.set("Cache-Control", cacheControl)
				response.headers.set(CACHE_STATUS_HEADER, isFresh ? "HIT" : "STALE")
				response.headers.delete(CACHED_AT_HEADER)

				return { response, type: "respond" }
			}
		}

		/* Cache miss or expired - register handler to store after render */
		ctx.onResponse((response) => {
			if (response.ok) {
				const toCache = response.clone()
				toCache.headers.set(CACHED_AT_HEADER, Date.now().toString())
				ctx.executionContext.waitUntil(cache.put(ctx.request, toCache))
			}
			return response
		})

		return { type: "next" }
	}
}
