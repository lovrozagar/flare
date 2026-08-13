/**
 * Prefetch Cache
 *
 * Tracks when URLs were prefetched to avoid redundant requests.
 * Used by Link to decide whether to prefetch on hover/viewport.
 */

interface PrefetchCache {
	cleanup: (maxAge: number, now?: number) => void
	clear: () => void
	delete: (url: string) => void
	get: (url: string) => number | undefined
	has: (url: string) => boolean
	isStale: (url: string, staleTime: number, now?: number) => boolean
	mark: (url: string) => void
	set: (url: string, fetchedAt: number) => void
	shouldPrefetch: (url: string, staleTime: number, now?: number) => boolean
	size: () => number
}

function createPrefetchCache(): PrefetchCache {
	const cache = new Map<string, number>()

	function get(url: string): number | undefined {
		return cache.get(url)
	}

	function set(url: string, fetchedAt: number): void {
		cache.set(url, fetchedAt)
	}

	function has(url: string): boolean {
		return cache.has(url)
	}

	function deleteEntry(url: string): void {
		cache.delete(url)
	}

	function clear(): void {
		cache.clear()
	}

	function isStale(url: string, staleTime: number, now?: number): boolean {
		const fetchedAt = cache.get(url)
		if (fetchedAt === undefined) {
			return true
		}
		const currentTime = now ?? Date.now()
		return currentTime - fetchedAt > staleTime
	}

	function shouldPrefetch(url: string, staleTime: number, now?: number): boolean {
		return isStale(url, staleTime, now)
	}

	function mark(url: string): void {
		cache.set(url, Date.now())
	}

	function size(): number {
		return cache.size
	}

	function cleanup(maxAge: number, now?: number): void {
		const currentTime = now ?? Date.now()
		for (const [url, fetchedAt] of cache.entries()) {
			if (currentTime - fetchedAt > maxAge) {
				cache.delete(url)
			}
		}
	}

	return {
		cleanup,
		clear,
		delete: deleteEntry,
		get,
		has,
		isStale,
		mark,
		set,
		shouldPrefetch,
		size,
	}
}

export type { PrefetchCache }

export { createPrefetchCache }
