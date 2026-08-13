/**
 * Navigation Types
 *
 * Common interfaces for client navigation.
 * Shared between NDJSON and HTML nav implementations.
 */

import type { MatchCache } from "../router/_internal/match-cache"
import type { HeadConfig } from "../router/_internal/types"

interface MatchState {
	id: string
	loaderData: unknown
	preloaderContext?: unknown
}

interface RouteState {
	matches: MatchState[]
	params: Record<string, string | string[]>
	pathname: string
}

interface QueryState {
	data: unknown
	key: unknown[]
	staleTime?: number
}

interface NavState {
	matches: MatchState[]
	params: Record<string, string | string[]>
	pathname: string
	queries: QueryState[]
}

interface NavFetchOptions {
	prefetch?: boolean
	signal?: AbortSignal
	url: string
}

interface PerRouteHead {
	head: HeadConfig
	matchId: string
}

interface NavFetchResult {
	error?: Error
	head?: HeadConfig
	html?: string
	perRouteHeads?: PerRouteHead[]
	state?: NavState
	success: boolean
}

interface NavFetcher {
	fetch: (options: NavFetchOptions) => Promise<NavFetchResult>
}

interface NavFetcherConfig {
	baseUrl: string
	fetch?: typeof globalThis.fetch
}

interface QueryClient {
	setQueryData: (
		key: unknown[],
		data: unknown,
		options?: { staleTime?: number; updatedAt?: number },
	) => void
}

/**
 * Update match cache from navigation state
 */
function updateMatchCache(matchCache: MatchCache, state: NavState): void {
	const now = Date.now()
	for (const match of state.matches) {
		matchCache.set({
			data: match.loaderData,
			invalid: false,
			matchId: match.id,
			preloaderContext: match.preloaderContext,
			routeId: match.id,
			updatedAt: now,
		})
	}
}

/**
 * Update query client from navigation state
 */
function updateQueryClient(queryClient: QueryClient, queries: QueryState[]): void {
	const now = Date.now()
	for (const query of queries) {
		queryClient.setQueryData(query.key, query.data, {
			staleTime: query.staleTime,
			updatedAt: now,
		})
	}
}

export type {
	MatchState,
	NavFetcher,
	NavFetcherConfig,
	NavFetchOptions,
	NavFetchResult,
	NavState,
	PerRouteHead,
	QueryClient,
	QueryState,
	RouteState,
}

export { updateMatchCache, updateQueryClient }
