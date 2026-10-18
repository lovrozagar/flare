import { registeredQuery } from "../../shared/protocol/index.ts"
import type { MatchCache } from "../router/match-cache.ts"
import type { Prefetcher } from "./prefetch.ts"

// Forgetting the visitor drops every match-cache entry, every held prefetch, the query client's cache, and the
// document's state: the state script and the fields it wrote on `self.flare`, which hold the data the page was
// rendered with (BUGS.md 363). A server function whose own Response wrote a cookie forgets before its answer is used;
// `invalidate()` forgets, then refetches the page on screen (B133).
export function invalidation(parts: {
	cache: Pick<MatchCache, "clear">
	prefetcher: Pick<Prefetcher, "forget">
	revalidate: () => Promise<void>
}): { forget: () => void; invalidate: () => Promise<void> } {
	const forget = (): void => {
		parts.cache.clear()
		parts.prefetcher.forget()
		registeredQuery()?.clear?.()
		dropState()
	}
	return {
		forget,
		invalidate: () => {
			forget()
			return parts.revalidate()
		},
	}
}

// Hydrate read the state once (boot/hydrate.ts). Only the booted transport, `call`, stays on `self.flare`, the same
// object, which a server function reads at call time.
function dropState(): void {
	for (const script of document.querySelectorAll("script#flare-state")) script.remove()
	const flare: unknown = Reflect.get(globalThis, "flare")
	if (typeof flare !== "object" || flare === null) return
	for (const key of Object.keys(flare)) if (key !== "call") Reflect.deleteProperty(flare, key)
}
