/**
 * Navigation Helpers
 *
 * Decision logic for CSR navigation.
 * Determines which matchIds need fresh data from server.
 */

interface CachedMatchInfo {
	invalid: boolean
	updatedAt: number
}

interface RouteMatch {
	matchId: string
	routeId: string
	shouldRefetch?: boolean
	staleTime?: number
}

interface NavigationContext {
	defaultStaleTime: number
	getCachedMatch: (matchId: string) => CachedMatchInfo | undefined
	matches: RouteMatch[]
	now: number
}

/**
 * Compute which matchIds need fresh data from server.
 *
 * Returns matchIds that are:
 * - Not cached
 * - Cached but stale (updatedAt + staleTime < now)
 * - Cached but invalid
 * - shouldRefetch returns true
 */
function computeNeededMatchIds(ctx: NavigationContext): string[] {
	const { defaultStaleTime, getCachedMatch, matches, now } = ctx
	const needed: string[] = []

	for (const match of matches) {
		/* Check shouldRefetch first - overrides cache */
		if (match.shouldRefetch) {
			needed.push(match.matchId)
			continue
		}

		const cached = getCachedMatch(match.matchId)

		/* Not cached - need data */
		if (!cached) {
			needed.push(match.matchId)
			continue
		}

		/* Invalid - need fresh data */
		if (cached.invalid) {
			needed.push(match.matchId)
			continue
		}

		/* Check staleness */
		const staleTime = match.staleTime ?? defaultStaleTime
		const isStale = now - cached.updatedAt > staleTime

		if (isStale) {
			needed.push(match.matchId)
		}
	}

	return needed
}

export type { CachedMatchInfo, NavigationContext, RouteMatch }

export { computeNeededMatchIds }
