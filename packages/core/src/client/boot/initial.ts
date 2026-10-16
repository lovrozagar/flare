import { defined } from "../../shared/errors/index.ts"
import type { Match, Router } from "../../shared/router/create-router.ts"
import type { Location } from "../../shared/url/index.ts"
import type { Landed } from "../navigation/frames.ts"
import { cacheFor, cachedMatches, remember, type CachePlan, type MatchCache } from "../router/match-cache.ts"
import type { StoreSnapshot } from "../router/store.ts"

// The client's match cache, made at hydrate (BUGS.md 139). The document's matches enter it on the document's own
// clock, the render time its state carries, never later than now: a client clock ahead of the server's reads the data
// as older and refetches early. A state with no time is as old as the hydration. Matches at and below a failure were
// not rendered and are not held. Then the cache plans once with "initial": `initial.fetch` says a page asked to
// refetch. The boot sends at most one request: a fill, when the document has holes, runs every loader live and so is
// that refetch too (dx/navigate.md, dx/defer.md).
export function hydrateCache(
	router: Router,
	input: { match: Match; location: Location; snapshot: StoreSnapshot; at: number | undefined },
): { cache: MatchCache; initial: CachePlan } {
	const cache = cacheFor(router.cache.client, router.routeCacheMaxEntries)
	const now = Date.now()
	const { snapshot } = input
	const cached = cachedMatches(input.match, input.location)
	const rendered = snapshot.matches.slice(0, snapshot.failure?.index ?? snapshot.matches.length)
	const landing: Required<Pick<Landed, "data" | "heads" | "preloaders" | "values">> = {
		data: {},
		heads: {},
		preloaders: {},
		values: {},
	}
	for (const [index, match] of rendered.entries()) {
		landing.data[match.id] = match.data
		landing.preloaders[match.id] = defined(match.preloader, "the document's preloader context")
		landing.values[match.id] = { params: match.params, search: match.search }
		const head = snapshot.heads[index]
		if (head !== undefined) landing.heads[match.id] = head
	}
	remember(cache, cached, { ...landing, at: Math.min(input.at ?? now, now) })
	const here = { ...input.location, params: {} }
	const initial = cache.plan({ matches: cached, trigger: "initial", revalidate: false, current: here, next: here })
	return { cache, initial }
}
