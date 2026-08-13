/**
 * Match ID Computation
 *
 * Computes unique match IDs for client-side caching.
 * Format: routeId:paramsHash:depsHash
 *
 * Changes to params or loaderDeps produce different match IDs,
 * triggering loader re-execution.
 */

interface ComputeMatchIdOptions {
	loaderDeps?: (ctx: { search: Record<string, string> }) => unknown[]
	params: Record<string, string | string[]>
	routeId: string
	search: Record<string, string>
}

interface ParsedMatchId {
	deps: unknown[]
	params: Record<string, string | string[]>
	routeId: string
}

/**
 * Compute match ID from route, params, and search.
 * Sorted params ensure consistent ordering.
 */
function computeMatchId(options: ComputeMatchIdOptions): string {
	const { loaderDeps, params, routeId, search } = options

	/* Sort params for consistent ordering */
	const sortedParams: Record<string, string | string[]> = {}
	const paramKeys = Object.keys(params).sort()
	for (const key of paramKeys) {
		const value = params[key]
		if (value !== undefined) {
			sortedParams[key] = value
		}
	}

	/* Compute deps from search if loaderDeps provided */
	const deps = loaderDeps?.({ search }) ?? []

	const paramsHash = JSON.stringify(sortedParams)
	const depsHash = JSON.stringify(deps)

	return `${routeId}:${paramsHash}:${depsHash}`
}

/**
 * Parse match ID back into components.
 * Returns null if invalid format.
 */
function parseMatchId(matchId: string): ParsedMatchId | null {
	if (!matchId) {
		return null
	}

	/* Find first colon after routeId (routeId can contain colons in theory but shouldn't) */
	const firstColonIdx = matchId.indexOf(":{")
	if (firstColonIdx === -1) {
		return null
	}

	const routeId = matchId.slice(0, firstColonIdx)
	const rest = matchId.slice(firstColonIdx + 1)

	/* Find the boundary between params and deps */
	const depsStartIdx = rest.lastIndexOf(":[")
	if (depsStartIdx === -1) {
		return null
	}

	const paramsJson = rest.slice(0, depsStartIdx)
	const depsJson = rest.slice(depsStartIdx + 1)

	try {
		const params = JSON.parse(paramsJson) as Record<string, string | string[]>
		const deps = JSON.parse(depsJson) as unknown[]

		return { deps, params, routeId }
	} catch {
		return null
	}
}

export type { ComputeMatchIdOptions, ParsedMatchId }

export { computeMatchId, parseMatchId }
