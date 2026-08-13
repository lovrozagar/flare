/**
 * QueryClientProvider - Solid Context-based QueryClient access
 *
 * Provides QueryClient to the component tree via Solid context.
 * Components can then use createQuery/createMutation without
 * explicitly passing the client.
 *
 * @example
 * ```tsx
 * // In your app root
 * import { QueryClient } from "@tanstack/query-core"
 * import { QueryClientProvider } from "@flare/v0/query-client/query-client-provider"
 *
 * const queryClient = new QueryClient({
 *   defaultOptions: {
 *     queries: { staleTime: 60 * 1000 }
 *   }
 * })
 *
 * <QueryClientProvider client={queryClient}>
 *   <App />
 * </QueryClientProvider>
 *
 * // In components - no need to pass client explicitly
 * const query = createSuspenseQuery(() => ({ queryKey: ["posts"], queryFn: fetchPosts }))
 * ```
 */

import type { QueryClient } from "@tanstack/query-core"
import { createContext, type JSX, useContext } from "solid-js"
import { isServer } from "solid-js/web"

/* ============================================================================
 * Global Client for Hydration (Global Singleton)
 * ============================================================================ */

const GLOBAL_CLIENT_KEY = "__FLARE_QUERY_CLIENT__"

/**
 * Get the global QueryClient (for hydration/internal use)
 * Uses globalThis to survive module duplication
 */
export function getGlobalQueryClient(): QueryClient | undefined {
	return (globalThis as Record<string, unknown>)[GLOBAL_CLIENT_KEY] as QueryClient | undefined
}

/**
 * Set the global QueryClient
 * Called by QueryClientProvider on mount
 */
function setGlobalQueryClient(client: QueryClient): void {
	;(globalThis as Record<string, unknown>)[GLOBAL_CLIENT_KEY] = client
}

/**
 * Get server-side QueryClient set by setServerQueryClient.
 * Returns undefined if not on server or not set.
 */
function getServerQueryClient(): QueryClient | undefined {
	if (!isServer) return undefined
	return (globalThis as Record<string, unknown>).__FLARE_SERVER_QUERY_CLIENT__ as
		| QueryClient
		| undefined
}

/* ============================================================================
 * QueryClient Context (Global Singleton)
 * ============================================================================ */

/*
 * Use a global singleton for the context to survive module duplication.
 * In Vite dev mode, the same module can be loaded from different paths,
 * creating multiple context instances. Using globalThis ensures only one exists.
 */
const CONTEXT_KEY = "__FLARE_QUERY_CLIENT_CONTEXT__"

function getOrCreateContext(): ReturnType<typeof createContext<QueryClient>> {
	const g = globalThis as Record<string, unknown>
	if (!g[CONTEXT_KEY]) {
		g[CONTEXT_KEY] = createContext<QueryClient>()
	}
	return g[CONTEXT_KEY] as ReturnType<typeof createContext<QueryClient>>
}

/**
 * Context for QueryClient
 * Uses globalThis singleton to survive module duplication in dev mode
 */
export const QueryClientContext = getOrCreateContext()

/**
 * Get the QueryClient from context
 *
 * Falls back to:
 * 1. Server QueryClient during SSR
 * 2. Global client (set by QueryClientProvider) for hydration edge cases
 *
 * @throws Error if no QueryClient is found anywhere
 */
export function useQueryClient(): QueryClient {
	const client = useContext(QueryClientContext)
	if (client) {
		return client
	}

	/* Server fallback: use request-scoped client set by handler */
	const serverClient = getServerQueryClient()
	if (serverClient) {
		return serverClient
	}

	/* Client fallback: use global client if context not available (hydration edge case) */
	const globalClient = getGlobalQueryClient()
	if (!isServer && globalClient) {
		return globalClient
	}

	throw new Error(
		"useQueryClient: No QueryClient found. " +
			"Wrap your app in <QueryClientProvider client={queryClient}>.",
	)
}

/**
 * Try to get the QueryClient from context, returns undefined if not found
 * Falls back to global client (set by provider) for hydration scenarios
 */
export function tryUseQueryClient(): QueryClient | undefined {
	try {
		const contextClient = useContext(QueryClientContext)
		return contextClient ?? getGlobalQueryClient()
	} catch {
		return getGlobalQueryClient()
	}
}

/* ============================================================================
 * QueryClientProvider Component
 * ============================================================================ */

export interface QueryClientProviderProps {
	/** The QueryClient instance to provide */
	client: QueryClient
	/** Children to render */
	children?: JSX.Element
}

/**
 * Provides a QueryClient to the component tree
 *
 * @example
 * ```tsx
 * const queryClient = new QueryClient()
 *
 * <QueryClientProvider client={queryClient}>
 *   <App />
 * </QueryClientProvider>
 * ```
 */
export function QueryClientProvider(props: QueryClientProviderProps): JSX.Element {
	/* Set global reference for hydration/fallback access */
	if (typeof window !== "undefined") {
		setGlobalQueryClient(props.client)
	}

	return (
		<QueryClientContext.Provider value={props.client}>{props.children}</QueryClientContext.Provider>
	)
}
