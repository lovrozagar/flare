/**
 * Static Assets Middleware
 *
 * Serves static assets via Cloudflare's ASSETS binding.
 * Bypasses all other middleware for matched paths.
 *
 * @example
 * ```typescript
 * import { staticAssets } from "@flare/v0/server/middleware/static-assets"
 *
 * createServerHandler({
 *   middlewares: [
 *     staticAssets({
 *       paths: ["/assets/", "/favicon.ico"],
 *     }),
 *   ],
 * })
 * ```
 */

import type { FlareMiddleware } from "../index"

export interface StaticAssetsConfig {
	/**
	 * Paths to serve as static assets
	 * - Paths ending with "/" match prefixes (e.g., "/assets/" matches "/assets/foo.js")
	 * - Exact paths match exactly (e.g., "/favicon.ico")
	 */
	paths: string[]
}

/**
 * Creates a static assets middleware
 *
 * @param config - Configuration for static asset paths
 * @returns Middleware that serves static assets via ASSETS binding
 */
export function staticAssets<TEnv extends { ASSETS: { fetch: typeof fetch } }>(
	config: StaticAssetsConfig,
): FlareMiddleware<TEnv> {
	const { paths } = config

	/* Pre-process paths into prefix and exact matches for O(1) exact / O(n) prefix lookup */
	const prefixes: string[] = []
	const exact = new Set<string>()

	for (const path of paths) {
		if (path.endsWith("/")) {
			prefixes.push(path)
		} else {
			exact.add(path)
		}
	}

	return async (ctx, _next) => {
		const { pathname } = ctx.url

		/* Check exact matches first (O(1)) */
		if (exact.has(pathname)) {
			const response = await ctx.env.ASSETS.fetch(ctx.request)
			return { response, type: "bypass" }
		}

		/* Check prefix matches (O(n) where n = number of prefixes) */
		for (const prefix of prefixes) {
			if (pathname.startsWith(prefix)) {
				const response = await ctx.env.ASSETS.fetch(ctx.request)
				return { response, type: "bypass" }
			}
		}

		/* Not a static asset - continue to next middleware */
		return { type: "next" }
	}
}
