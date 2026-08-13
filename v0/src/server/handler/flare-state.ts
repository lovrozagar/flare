/**
 * Flare State Serialization
 *
 * Builds self.flare state for SSR hydration.
 * State structure:
 * - s: signature for CSR data requests
 * - r: route/match data
 * - q: query states
 * - c: context (routerDefaults, locale, dir, theme)
 */

import type { HeadConfig, PrefetchStrategy } from "../../router/_internal/types"
import type { NavFormat } from "./constants"

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

interface ContextState {
	dir?: string
	locale?: string
	routerDefaults?: {
		gcTime?: number
		navFormat?: NavFormat
		prefetchIntent?: PrefetchStrategy
		prefetchStaleTime?: number
		staleTime?: number
	}
	theme?: string
}

interface PerRouteHead {
	head: HeadConfig
	matchId: string
}

interface DevError {
	message: string
	name: string
	source: string
	stack?: string
}

interface FlareState {
	c: ContextState
	/** Dev-only: SSR errors for client overlay */
	e?: DevError[]
	h?: HeadConfig
	ph?: PerRouteHead[]
	q: QueryState[]
	r: RouteState
}

/**
 * Escape script tags to prevent XSS
 */
function escapeJsonScript(json: string): string {
	return json.replace(/<\/script>/gi, "<\\/script>")
}

/**
 * Serialize flare state to JSON string
 */
function serializeFlareState(state: FlareState): string {
	const json = JSON.stringify(state)
	return escapeJsonScript(json)
}

/**
 * Build self.flare assignment script
 */
function buildFlareStateScript(state: FlareState): string {
	const json = serializeFlareState(state)
	return `self.flare=${json};`
}

export type { ContextState, DevError, FlareState, MatchState, PerRouteHead, QueryState, RouteState }

export { buildFlareStateScript, serializeFlareState }
