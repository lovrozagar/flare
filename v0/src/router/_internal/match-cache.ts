/**
 * Match Cache
 *
 * Client-side cache for loader data by matchId.
 * Supports invalidation by routeId, matchId, or filter.
 */

interface CachedMatch {
	data: unknown
	invalid: boolean
	matchId: string
	preloaderContext?: unknown
	routeId: string
	updatedAt: number
}

interface InvalidateOptions {
	filter?: (match: CachedMatch) => boolean
	matchId?: string
	routeId?: string
}

interface MatchCache {
	clear: () => void
	delete: (matchId: string) => void
	get: (matchId: string) => CachedMatch | undefined
	getAll: () => CachedMatch[]
	has: (matchId: string) => boolean
	invalidate: (options?: InvalidateOptions) => void
	isStale: (matchId: string, staleTime: number, now?: number) => boolean
	set: (match: CachedMatch) => void
	size: () => number
}

function createMatchCache(): MatchCache {
	const cache = new Map<string, CachedMatch>()

	function get(matchId: string): CachedMatch | undefined {
		return cache.get(matchId)
	}

	function set(match: CachedMatch): void {
		cache.set(match.matchId, match)
	}

	function has(matchId: string): boolean {
		return cache.has(matchId)
	}

	function deleteMatch(matchId: string): void {
		cache.delete(matchId)
	}

	function clear(): void {
		cache.clear()
	}

	function invalidate(options?: InvalidateOptions): void {
		if (!options) {
			/* Invalidate all */
			for (const match of cache.values()) {
				match.invalid = true
			}
			return
		}

		if (options.matchId) {
			const match = cache.get(options.matchId)
			if (match) {
				match.invalid = true
			}
			return
		}

		if (options.routeId) {
			for (const match of cache.values()) {
				if (match.routeId === options.routeId) {
					match.invalid = true
				}
			}
			return
		}

		if (options.filter) {
			for (const match of cache.values()) {
				if (options.filter(match)) {
					match.invalid = true
				}
			}
		}
	}

	function isStale(matchId: string, staleTime: number, now?: number): boolean {
		const match = cache.get(matchId)
		if (!match) {
			return true
		}
		if (match.invalid) {
			return true
		}
		const currentTime = now ?? Date.now()
		return currentTime - match.updatedAt > staleTime
	}

	function getAll(): CachedMatch[] {
		return Array.from(cache.values())
	}

	function size(): number {
		return cache.size
	}

	return {
		clear,
		delete: deleteMatch,
		get,
		getAll,
		has,
		invalidate,
		isStale,
		set,
		size,
	}
}

export type { CachedMatch, InvalidateOptions, MatchCache }

export { createMatchCache }
