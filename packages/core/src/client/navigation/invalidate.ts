import { registeredQuery } from "../../shared/protocol/index.ts"
import type { MatchCache } from "../router/match-cache.ts"
import type { Prefetcher } from "./prefetch.ts"

// Forgetting the visitor drops every match-cache entry, every held prefetch, and the query client's cache. A server
// function whose own Response wrote a cookie forgets before its answer is used; `invalidate()` forgets, then refetches
// the page on screen (B133).
export function invalidation(parts: {
	cache: Pick<MatchCache, "clear">
	prefetcher: Pick<Prefetcher, "forget">
	revalidate: () => Promise<void>
}): { forget: () => void; invalidate: () => Promise<void> } {
	const forget = (): void => {
		parts.cache.clear()
		parts.prefetcher.forget()
		registeredQuery()?.clear?.()
	}
	return {
		forget,
		invalidate: () => {
			forget()
			return parts.revalidate()
		},
	}
}
