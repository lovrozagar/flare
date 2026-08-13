/**
 * API Proxy Middleware
 *
 * Forwards requests from a path prefix to a service binding (e.g., Gateway).
 * Typically used in local development to proxy /api/* to the gateway worker.
 *
 * @example
 * ```typescript
 * import { apiProxy } from "@flare/v0/server/middleware/api-proxy"
 *
 * createServerHandler({
 *   middlewares: [
 *     apiProxy({
 *       enabled: ({ env }) => env.PUBLIC_ENVIRONMENT === "local",
 *       pathPrefix: "/api",
 *       target: ({ env }) => env.GATEWAY_SERVICE,
 *       rewrite: (path) => path.slice(4), // /api/v1/... → /v1/...
 *     }),
 *   ],
 * })
 * ```
 */

import type { FlareMiddleware } from "../index"

export interface ServiceBinding {
	fetch: (request: Request) => Promise<Response>
}

export interface ApiProxyConfig<TEnv = unknown> {
	/**
	 * Whether the proxy is enabled
	 * @default true
	 */
	enabled?: boolean | ((ctx: { env: TEnv }) => boolean)
	/**
	 * Path prefix to match (e.g., "/api")
	 */
	pathPrefix: string
	/**
	 * Service binding to forward requests to
	 */
	target: (ctx: { env: TEnv }) => ServiceBinding
	/**
	 * Rewrite the path before forwarding
	 * @example (path) => path.slice(4) // /api/v1/... → /v1/...
	 */
	rewrite?: (path: string) => string
	/**
	 * Additional headers to add to the proxied request
	 */
	headers?: (ctx: { env: TEnv; request: Request }) => Record<string, string>
}

export function apiProxy<TEnv>(config: ApiProxyConfig<TEnv>): FlareMiddleware<TEnv> {
	const { pathPrefix, target, rewrite, headers, enabled = true } = config
	const prefixWithSlash = pathPrefix.endsWith("/") ? pathPrefix : `${pathPrefix}/`

	return async (ctx, _next) => {
		/* Check if enabled */
		const isEnabled = typeof enabled === "function" ? enabled({ env: ctx.env }) : enabled
		if (!isEnabled) {
			return { type: "next" }
		}

		/* Check path match */
		const { pathname } = ctx.url
		if (!pathname.startsWith(prefixWithSlash) && pathname !== pathPrefix) {
			return { type: "next" }
		}

		/* Rewrite path */
		const targetPath = rewrite ? rewrite(pathname) : pathname.slice(pathPrefix.length)
		const targetUrl = new URL(targetPath + ctx.url.search, ctx.url.origin)

		/* Create proxy request */
		const proxyRequest = new Request(targetUrl.toString(), ctx.request)

		/* Apply custom headers */
		if (headers) {
			const customHeaders = headers({ env: ctx.env, request: ctx.request })
			for (const [key, value] of Object.entries(customHeaders)) {
				proxyRequest.headers.set(key, value)
			}
		}

		/* Forward to target service */
		const service = target({ env: ctx.env })
		const response = await service.fetch(proxyRequest)

		/* Bypass - API responses don't need response handlers */
		return { response, type: "bypass" }
	}
}
