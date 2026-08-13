/**
 * CDN Proxy Middleware
 *
 * Serves static assets from an R2 bucket via a path prefix.
 * Browser -> /cdn/store/{slug}/files/{hash}.{ext} -> R2 (no cross-origin overhead)
 *
 * @example
 * ```typescript
 * import { cdnProxy } from "@flare/v0/server/middleware/cdn-proxy"
 *
 * createServerHandler({
 *   middlewares: [
 *     cdnProxy({
 *       pathPrefix: "/cdn",
 *       bucket: ({ env }) => env.CDN_BUCKET,
 *       cacheControl: "public, max-age=31536000, immutable",
 *     }),
 *   ],
 * })
 * ```
 */

import type { FlareMiddleware } from "../index"

/**
 * R2 bucket binding interface (minimal subset of Cloudflare R2)
 */
export interface R2BucketBinding {
	get: (key: string) => Promise<{
		body: ReadableStream
		etag: string
		httpMetadata?: { contentType?: string }
		size: number
	} | null>
}

export interface CdnProxyConfig<TEnv = unknown> {
	/**
	 * Path prefix to match (e.g., "/cdn")
	 * Will match any path starting with "{pathPrefix}/"
	 */
	pathPrefix: string
	/**
	 * R2 bucket binding getter
	 * Receives env to access the binding
	 */
	bucket: (ctx: { env: TEnv }) => R2BucketBinding
	/**
	 * Cache-Control header value
	 * @default "public, max-age=31536000, immutable"
	 */
	cacheControl?: string
	/**
	 * Use Cloudflare Cache API for edge caching
	 * Requires executionContext for waitUntil
	 * @default false
	 */
	edgeCache?: boolean
}

/**
 * Creates a CDN proxy middleware for serving R2 assets
 *
 * @param config - Configuration for the CDN proxy
 * @returns Middleware that serves assets from R2
 */
export function cdnProxy<TEnv>(config: CdnProxyConfig<TEnv>): FlareMiddleware<TEnv> {
	const {
		pathPrefix,
		bucket,
		cacheControl = "public, max-age=31536000, immutable",
		edgeCache = false,
	} = config
	const prefixWithSlash = `${pathPrefix}/`

	return async (ctx, _next) => {
		/* Check path match */
		if (!ctx.url.pathname.startsWith(prefixWithSlash)) {
			return { type: "next" }
		}

		/* CF Cache API not available - disable edge caching for this request */
		const useCache = edgeCache && typeof caches !== "undefined" && "default" in caches
		const cache = useCache ? (caches as unknown as { default: Cache }).default : null

		/* Edge cache lookup */
		if (cache) {
			const cacheKey = new Request(ctx.request.url, { method: "GET" })
			const cached = await cache.match(cacheKey)
			if (cached) {
				return { response: cached, type: "bypass" }
			}
		}

		/* Fetch from R2 */
		const key = ctx.url.pathname.slice(prefixWithSlash.length)
		const r2Bucket = bucket({ env: ctx.env })
		const object = await r2Bucket.get(key)

		if (!object) {
			return {
				response: new Response("Not Found", { status: 404 }),
				type: "bypass",
			}
		}

		const response = new Response(object.body, {
			headers: {
				"Cache-Control": cacheControl,
				"Content-Length": object.size.toString(),
				"Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
				ETag: object.etag,
			},
		})

		/* Store in edge cache */
		if (cache) {
			const cacheKey = new Request(ctx.request.url, { method: "GET" })
			ctx.executionContext.waitUntil(cache.put(cacheKey, response.clone()))
		}

		/* Bypass - static assets don't need response handlers */
		return { response, type: "bypass" }
	}
}
