/**
 * Query Client Getter Factory
 *
 * Creates a getQueryClient function with consumer-controlled options.
 * Server: Uses request-scoped instance (set by page-renderer for SSR consistency)
 * Client: Returns singleton instance (shared cache)
 *
 * @example
 * ```ts
 * // In your app (e.g., flare-web.query.ts)
 * export const getQueryClient = createQueryClientGetter({
 *   defaultOptions: {
 *     queries: {
 *       gcTime: 5 * 60 * 1000,
 *       refetchOnWindowFocus: false,
 *       retry: 1,
 *       staleTime: 60 * 1000,
 *     },
 *   },
 * })
 *
 * // Then use in components
 * import { getQueryClient } from "./flare-web.query"
 * const client = getQueryClient()
 * ```
 */

import { QueryClient, type QueryClientConfig } from "@tanstack/query-core"

export type { QueryClientConfig }

/**
 * Symbol used to identify functions created by createQueryClientGetter.
 * Used by createFlareRuntime to detect QueryClient configuration.
 */
export const FLARE_QUERY_CLIENT_SYMBOL = Symbol.for("flare.queryClientGetter")

/**
 * Request-scoped QueryClient for server-side rendering.
 * Uses globalThis to share state between bundled modules.
 * Set by page-renderer before render, cleared after.
 * Ensures serverLoader and components use the same instance.
 */
declare const globalThis: {
	__FLARE_SERVER_QUERY_CLIENT__?: QueryClient | null
}

function getServerQueryClient(): QueryClient | null {
	return globalThis.__FLARE_SERVER_QUERY_CLIENT__ ?? null
}

/**
 * Set the request-scoped QueryClient for server rendering.
 * Called by page-renderer to ensure consistency between
 * serverLoader prefetch and component render.
 */
export function setServerQueryClient(client: QueryClient | null): void {
	globalThis.__FLARE_SERVER_QUERY_CLIENT__ = client
}

/**
 * Creates a getQueryClient function with the specified configuration.
 *
 * @param config - QueryClient configuration (defaultOptions, queryCache, mutationCache, etc.)
 * @returns A getQueryClient function that returns the appropriate QueryClient instance
 */
export function createQueryClientGetter(config: QueryClientConfig = {}): () => QueryClient {
	let browserQueryClient: QueryClient | undefined

	const getter = function getQueryClient(): QueryClient {
		/* Server: use request-scoped instance for SSR consistency */
		if (typeof window === "undefined") {
			const serverClient = getServerQueryClient()
			if (serverClient) {
				return serverClient
			}

			/* Fallback: create new instance (shouldn't happen in normal flow) */
			return new QueryClient(config)
		}

		/* Client: singleton for shared cache */
		if (!browserQueryClient) {
			browserQueryClient = new QueryClient(config)
		}

		return browserQueryClient
	}

	/* Attach symbol marker for detection by createFlareRuntime */
	;(getter as unknown as Record<symbol, boolean>)[FLARE_QUERY_CLIENT_SYMBOL] = true

	return getter
}

export type CreateQueryClient = () => QueryClient
