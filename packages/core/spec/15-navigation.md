# Navigation

Layer 5. Depends on router-primitives (matchRoute, deriveLayouts, computeMatchId, buildLocation), caches (MatchCache, PrefetchCache), ndjson-client (fetchNDJSON), hydration (loadRouteModules), errors (RedirectResponse), ssr (mergeHeadConfigs).

Client-side navigation. Pushes/replaces history, fetches data via NDJSON, loads route modules, updates app state.

## Types

```ts
/* NavigateOptions, PrefetchOptions, BuildUrlOptions defined in spec 17 (outlet) */
/* They use type-safe generics with RegisteredRoutes, HasRequiredParams, etc. */

/* Full HistoryState and ScrollPosition defined in spec 26 (history). Repeated here for context: */

interface ScrollPosition {
	x: number
	y: number
}

interface HistoryState {
	historyIndex: number
	key: string
	params: Record<string, string | string[]>
	pathname: string
	scroll?: ScrollPosition
	search: string
	state?: unknown
}
```

Navigation types (`NavigateOptions`, `PrefetchOptions`, `BuildUrlOptions`, `ViewTransitionConfig`) are defined in spec 17 alongside `FlareRouter`.

## Exports

```ts
setupNavigation(ctx: FlareProviderContext): void
navigate(options: NavigateOptions): Promise<void>
prefetch(options: PrefetchOptions): Promise<void>
```

## Behavior

### `setupNavigation`

Called from `onContextReady` during hydration (spec 14). Captures `FlareProviderContext` reference. Wires up:

1. `navigate()` and `prefetch()` functions bound to context
2. `popstate` event listener on `window`
3. Garbage collection interval for matchCache + prefetchCache

After setup: CSR navigation fully operational.

### `navigate`

Full client-side navigation flow:

#### Step 1: Resolve URL

```ts
/* Resolve params in URL pattern (e.g. /products/[id] → /products/123) */
const resolvedPath = buildUrl({
	hash: options.hash,
	params: options.params,
	search: options.search,
	to: options.to,
})
const url = new URL(resolvedPath, window.location.href)
```

`buildUrl` (spec 03) resolves path parameters, appends search params, and sets hash. This converts type-safe route patterns from `NavigateOptions.to` (e.g. `/products/[id]`) into real URLs. Internal callers like `invalidate()` and `refetch()` pass `window.location.href` directly — `buildUrl` passes through URLs with no bracket params unchanged.

#### Step 2: Same-URL guard

```ts
if (url.href === window.location.href && !options.revalidate) return
```

Navigating to same URL without `revalidate` is a no-op.

#### Step 3: Abort previous navigation + set navigating

```ts
if (currentController) currentController.abort()
const controller = new AbortController()
currentController = controller
ctx.setIsNavigating(true)
```

Module-level `currentController: AbortController | null` and `navigationVersion: number`. Only one navigation in-flight at a time. Previous navigation's `fetchNDJSON` reader gets cancelled, pending deferred resolvers rejected. Navigation version increments per `navigate()` call — after async operations, check `myVersion === navigationVersion` before updating signals (double-safety beyond abort controller for race conditions in signal updates).

#### Step 4: Match route

```ts
const match = matchRoute(ctx.routeTree, url.pathname)
```

If no match → set `ctx.setNotFound(true)`, `ctx.setIsNavigating(false)`, return. Outlet renders global notFound boundary.

#### Step 4b: Cross-root detection + response route detection

```ts
const currentRoot = ctx.matches()[0]?.virtualPath.split("/")[0]
const newRoot = match.route.x.split("/")[0]
if (currentRoot && newRoot && currentRoot !== newRoot) {
	ctx.setIsNavigating(false)
	currentController = null
	window.location.href = url.href
	return
}

/* Response routes (t: "x") return raw Response, not renderable JSX */
if (match.route.t === "x") {
	ctx.setIsNavigating(false)
	currentController = null
	window.location.href = url.href
	return
}
```

Different roots (e.g. `_root_` → `_docs_`) trigger a full page reload — clean teardown + fresh SSR. Response routes (`route.t === "x"`, API endpoints, webhooks) also trigger full page navigate — they return raw `Response`, not JSX renderable by the client. The `t` field on `RouteData` (spec 01) enables this check before module loading — no need to call `route.p()` first.

#### Step 5: Save scroll + update history

```ts
/* Save current scroll into scroll store (spec 26) keyed by current history key */
const currentState = parseHistoryState(history.state)
if (currentState) {
	scrollStore.save(currentState.key, getCurrentScroll())
}

/* Increment history index for direction tracking (spec 26) */
incrementHistoryIndex()

/* Push or replace via pushHistoryState / replaceHistoryState (spec 26) */
if (options.replace) {
	replaceHistoryState(url.pathname, match.params, url.search, {
		hash: url.hash,
		historyIndex: getHistoryIndex(),
		state: options.state,
	})
} else {
	pushHistoryState(url.pathname, match.params, url.search, {
		hash: url.hash,
		historyIndex: getHistoryIndex(),
		state: options.state,
	})
}
```

Save BEFORE pushState — preserves current scroll for back navigation.

#### Step 5b: Shallow navigation guard

```ts
if (options.shallow) {
	ctx.setParams(match.params)
	ctx.setSearch(Object.fromEntries(url.searchParams))
	ctx.setIsNavigating(false)
	currentController = null
	return
}
```

`shallow: true` updates URL and params/search signals without fetching data or loading modules. Useful for URL-driven filter/sort state that doesn't need a server round-trip.

#### Step 6: Load route modules

```ts
const modules = await loadRouteModules(url.pathname, ctx.routeTree, ctx.layouts)
```

Loads page + layout JS chunks. Browser-cached for previously visited routes (near-instant). For new routes, downloads chunks.

If `controller.signal.aborted` after load → return silently (superseded by newer navigation).

#### Step 7: Compute match IDs + check staleness

```ts
const search = Object.fromEntries(url.searchParams)
const allModules = [...modules.layouts, modules.page]
const staleMatchIds: string[] = []

for (const mod of allModules) {
	const deps = mod.effectsConfig?.loaderDeps?.({ search }) ?? []
	const matchId = computeMatchId({
		routeId: mod.virtualPath,
		params: modules.params,
		search,
		loaderDeps: () => deps,
	})

	const staleTime = mod.options?.staleTime ?? 0
	const refetch = mod.effectsConfig?.shouldRefetch?.({
		location: {
			current: {
				hash: ctx.location().hash,
				params: ctx.location().params,
				pathname: ctx.location().pathname,
				search: ctx.location().search,
			},
			next: { hash: url.hash, params: modules.params, pathname: url.pathname, search },
		},
		trigger: "navigation",
	})

	if (options.revalidate || refetch || ctx.matchCache.isStale(matchId, staleTime)) {
		staleMatchIds.push(matchId)
	}
}
```

#### Step 8: Fetch if needed

```ts
let fetchResult: NDJSONFetchResult | null = null

if (staleMatchIds.length > 0) {
	fetchResult = await fetchNDJSON({
		matchIds: staleMatchIds,
		signal: controller.signal,
		url: url.href,
	})
}
```

If `controller.signal.aborted` after fetch → return silently.

`x-m` header sends only stale matchIds — server skips fresh loaders.

If ALL matches fresh → no NDJSON fetch, instant navigation from cache.

#### Step 9: Update matchCache

```ts
if (fetchResult) {
	const now = Date.now()
	for (const match of fetchResult.matches) {
		ctx.matchCache.set({
			data: match.loaderData,
			invalid: false,
			matchId: match.matchId,
			preloaderContext: match.preloaderContext,
			updatedAt: now,
		})
	}
}
```

#### Step 10: Build matches

```ts
const clientMatches = allModules.map((mod) => {
	const deps = mod.effectsConfig?.loaderDeps?.({ search }) ?? []
	const matchId = computeMatchId({
		routeId: mod.virtualPath,
		params: modules.params,
		search,
		loaderDeps: () => deps,
	})
	const cached = ctx.matchCache.get(matchId)

	return {
		_type: mod._type,
		errorRender: mod.errorRender,
		loaderData: cached?.data,
		notFoundRender: mod.notFoundRender,
		preloaderContext: cached?.preloaderContext,
		render: mod.render,
		unauthorizedRender: mod.unauthorizedRender,
		virtualPath: mod.virtualPath,
	}
})
```

Merges loaded component functions with cached/fetched data.

#### Step 11: Update state

```ts
const update = () => {
	ctx.setNotFound(false)
	ctx.setMatches(clientMatches)
	ctx.setParams(modules.params)
	ctx.setSearch(search)
}

if (document.startViewTransition) {
	document.startViewTransition(update)
} else {
	update()
}
```

View transition wraps state update for smooth visual transition. Progressive enhancement — works without it.

#### Step 12: Update document head

```ts
if (fetchResult?.perRouteHeads.length) {
	applyHeadToDocument(fetchResult.perRouteHeads)
}
```

See `applyHeadToDocument` below.

#### Step 13: Scroll

```ts
if (options.scroll !== false) {
	if (url.hash) {
		const el = document.getElementById(url.hash.slice(1))
		if (el) el.scrollIntoView()
		else window.scrollTo(0, 0)
	} else {
		window.scrollTo(0, 0)
	}
}
```

`scroll: false` preserves current scroll position (e.g. search/filter changes). Default `true`. Back/forward restores saved scroll (handled in popstate).

#### Step 14: Cleanup

```ts
ctx.setIsNavigating(false)
currentController = null
```

### Optimization: Parallel fetch for new routes

When modules aren't browser-cached (first visit to route), loading them takes a network round-trip. The framework optimizes by starting both in parallel:

```ts
const [modules, fetchResult] = await Promise.all([
	loadRouteModules(url.pathname, ctx.routeTree, ctx.layouts),
	fetchNDJSON({ url: url.href, signal: controller.signal }),
])
```

No `x-m` header in this case — can't compute stale matchIds without modules. Server runs all loaders. After both complete, proceeds from step 9.

Detection: route modules are "known cached" if the route was visited before in this session. Track visited virtualPaths in a `Set<string>`.

### `popstate` handler

Handles browser back/forward:

```ts
createHistoryListener((event: HistoryNavigateEvent) => {
	/* Update history index for direction tracking */
	setHistoryIndex(event.historyIndex)

	navigate({
		replace: true,
		to: window.location.href,
	}).then(() => {
		/* Restore scroll from scroll store (spec 26) */
		const savedScroll = scrollStore.get(event.key)
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (savedScroll) restoreScroll(savedScroll)
				else scrollToTop()
			})
		})
	})
})
```

- `replace: true` — don't push another history entry
- Scroll restored from `history.state.scroll` after navigation completes
- Same abort/fetch logic as forward navigation

### Scroll Restoration

Browser's default scroll restoration disabled:

```ts
if ("scrollRestoration" in history) {
	history.scrollRestoration = "manual"
}
```

Framework manages scroll via scroll store (spec 26):

- **Forward navigation**: scroll to top (or hash target), double rAF for paint
- **Back/forward**: restore from scroll store keyed by `HistoryState.key`
- **Replace navigation**: scroll to top (or hash target)

Scroll saved into scroll store BEFORE pushState — captures position at time of navigation.

### View Transitions

Progressive enhancement. Available in Chrome 111+, Safari 18+.

```ts
if (document.startViewTransition && viewTransitionConfig) {
	const direction = getViewTransitionDirection(previousHistoryIndex, getHistoryIndex())
	document.startViewTransition({
		types: resolveViewTransitionTypes(viewTransitionConfig, direction, fromLocation, toLocation),
		update: () => {
			ctx.setMatches(newMatches)
			ctx.setParams(newParams)
			ctx.setSearch(newSearch)
		},
	})
} else {
	ctx.setMatches(newMatches)
	ctx.setParams(newParams)
	ctx.setSearch(newSearch)
}
```

State updates happen inside transition callback. Browser captures before/after snapshots and animates between them. Solid's fine-grained reactivity ensures minimal DOM changes within the callback.

### Redirect Handling

When `fetchNDJSON` encounters `t:"x"` message, it throws `RedirectResponse`:

```ts
try {
  fetchResult = await fetchNDJSON({ ... })
} catch (error) {
  if (error instanceof RedirectResponse) {
    if (redirectCount >= 10) throw new Error("Redirect loop detected")
    return navigate({ to: error.url, replace: error.replace ?? true })
  }
  if (error instanceof DOMException && error.name === "AbortError") return
  throw error
}
```

- Redirect → recursive `navigate()` to new URL
- Max 10 redirects to prevent infinite loops
- AbortError → silently bail (superseded navigation)
- Other errors → propagate to caller

### 404 Handling (Client-Side)

When `matchRoute` returns `null`:

```ts
if (!match) {
	ctx.setNotFound(true)
	ctx.setMatches([])
	return
}
```

Outlet checks `notFound` signal and renders global notFound boundary. No server call — client knows the route doesn't exist.

Server-side 404 (loader throws `NotFoundError`) handled via NDJSON error messages + boundary system.

### `applyHeadToDocument`

Updates `<head>` after CSR navigation:

```ts
function applyHeadToDocument(heads: PerRouteHead[]): void
```

1. Merge per-route heads via `mergeHeadConfigs` (same merge logic as SSR)
2. Apply to DOM:
   - `document.title = merged.title ?? ""`
   - Update `<meta>` tags (description, robots, og:_, twitter:_)
   - Update `<link rel="canonical">` href
   - Update JSON-LD `<script type="application/ld+json">`
3. Tags managed by Flare tracked via `headByRoute` Map (per-route ownership)
4. On each navigation: removed routes' head elements cleaned up, new routes' elements applied

### `prefetch`

Prefetches data + code for a URL. Called by `<Link>` component.

```ts
async function prefetch(options: PrefetchOptions): Promise<void> {
  const url = new URL(options.to, window.location.href)
  const staleTime = /* route's prefetchStaleTime or default 30_000 */

  if (!ctx.prefetchCache.shouldPrefetch(url.href, staleTime)) return

  ctx.prefetchCache.mark(url.href)

  try {
    const [fetchResult] = await Promise.all([
      fetchNDJSON({ prefetch: true, url: url.href }),
      loadRouteModules(url.pathname, ctx.routeTree, ctx.layouts),
    ])

    const now = Date.now()
    for (const match of fetchResult.matches) {
      ctx.matchCache.set({
        data: match.loaderData,
        invalid: false,
        matchId: match.matchId,
        preloaderContext: match.preloaderContext,
        updatedAt: now,
      })
    }
  } catch {
    ctx.prefetchCache.delete(url.href)
  }
}
```

- Deduplication via `prefetchCache.shouldPrefetch()`
- Mark BEFORE fetch to prevent concurrent duplicates
- Data + modules fetched in parallel
- On success: matchCache populated (navigate later uses cache)
- On error: prefetchCache entry removed (allows retry)
- No abort controller — prefetch is fire-and-forget

### Garbage Collection

Periodic cleanup started by `setupNavigation`:

```ts
const GC_INTERVAL = 60_000 /* 1 minute */

setInterval(() => {
  const now = Date.now()
  for (const entry of ctx.matchCache.getAll()) {
    const gcTime = /* route's gcTime or default 5 * 60 * 1000 */
    if (now - entry.updatedAt > gcTime) {
      ctx.matchCache.delete(entry.matchId)
    }
  }
  ctx.prefetchCache.cleanup(5 * 60 * 1000)
}, GC_INTERVAL)
```

## Test Cases

```
navigate:
  Basic navigation → history.pushState called, URL updated
  replace: true → history.replaceState called
  Same URL, no revalidate → no-op
  Same URL, revalidate: true → re-fetches
  search option → URL search params updated
  hash option → URL hash updated
  state option → stored in history.state

isNavigating:
  Set to true at start of navigate → isNavigating() === true
  Set to false after state update → isNavigating() === false
  Aborted navigation → set to false
  Shallow navigation → briefly true, then false (no fetch)

scroll option:
  scroll: true (default) → scrollTo(0, 0)
  scroll: false → scroll position unchanged
  scroll: false + hash → no scroll (hash ignored)

shallow option:
  shallow: true → URL updated, params/search signals updated
  shallow: true → no fetchNDJSON, no loadRouteModules
  shallow: true → matches NOT updated (existing components stay)
  shallow: false (default) → normal navigation

Cross-root + response route:
  Same root → normal CSR navigation
  Different root (_root_ → _docs_) → window.location.href = url (full reload)
  Cross-root → isNavigating reset to false before reload
  Response route (route.t === "x") → window.location.href = url (full reload)
  Response route → isNavigating reset to false before reload

Concurrent navigation:
  Start nav A, then nav B before A completes → A aborted
  Aborted nav → fetchNDJSON reader cancelled
  Aborted nav → pending deferred resolvers rejected
  AbortError → silently ignored, no error thrown
  After abort, state not updated (no stale render)
  Navigation version mismatch after async → state update skipped

Route matching:
  Pathname matches route tree → loads page + layouts
  No match → setNotFound(true), no server call
  NotFound renders global notFound boundary

Staleness check:
  All matches fresh (staleTime > age) → no NDJSON fetch
  Some matches stale → x-m header with stale matchIds only
  All stale → x-m header with all matchIds
  revalidate: true → all matches treated as stale
  staleTime: 0 (default) → always stale, always fetch
  shouldRefetch returns true → treated as stale regardless of cache age

Module loading:
  Previously visited route → modules browser-cached, near-instant
  New route → modules downloaded from network
  New route optimization → fetchNDJSON and loadRouteModules in parallel

Cache update:
  Fetched matches → stored in matchCache with updatedAt
  Fresh matches → not overwritten (preserved from cache)
  matchCache.set called for each fetched match

State update:
  setMatches called with merged modules + data
  setParams called with matched params
  setSearch called with parsed search
  setNotFound(false) on successful navigation

View transitions:
  startViewTransition available + config enabled → state update wrapped in transition
  startViewTransition unavailable → direct state update
  Direction detected via historyIndex: back (lower), forward (higher), none (equal)
  ViewTransitionConfig types resolved per-navigation (spec 17)
  Fine-grained Solid updates inside transition callback

Scroll:
  Forward nav → scrollTo(0, 0)
  Forward nav with hash → scrollIntoView for hash element
  Hash element not found → scrollTo(0, 0)
  history.scrollRestoration set to "manual"

Scroll save/restore:
  Before pushState → current scroll saved to scroll store by history key
  After popstate → scroll restored from scroll store by event key
  No saved scroll → scrollToTop()
  Double rAF ensures scroll set after Solid reactive updates paint

Popstate:
  Back button → navigate with replace: true, historyIndex updated
  Forward button → navigate with replace: true, historyIndex updated
  Scroll restored from scroll store after navigation completes
  Non-Flare history entries (no key) → ignored

Redirect:
  t:"x" in NDJSON → recursive navigate to redirect URL
  Redirect with replace → navigate({ replace: true })
  10+ redirects → throws redirect loop error
  Redirect during aborted nav → ignored

Head update:
  perRouteHeads from NDJSON → merged and applied to document
  document.title updated
  Meta tags tracked per-route via headByRoute Map
  Removed routes' head elements cleaned up before new ones applied
  No perRouteHeads → head not touched

prefetch:
  Calls prefetchCache.shouldPrefetch before fetch
  Already prefetched (fresh) → returns immediately
  Marks prefetchCache BEFORE fetch (prevents duplicates)
  Data + modules loaded in parallel
  Success → matchCache populated with loader data
  Error → prefetchCache entry deleted (allows retry)
  NDJSON sent with x-p: "1" header
  No abort controller (fire-and-forget)

Garbage collection:
  matchCache entries older than gcTime deleted
  prefetchCache entries older than maxAge deleted
  Runs on interval (60s)

404 handling:
  Client-side: matchRoute returns null → notFound state, no fetch
  Server-side: loader throws NotFoundError → NDJSON error → boundary
```

## Notes

- `navigate()` returns when state is updated — deferred chunks continue streaming in background
- Module-level `currentController` ensures strict single-navigation-in-flight
- History state management, scroll store, and scroll restoration delegated to spec 26 (history)
- View transitions are progressive enhancement — zero-cost when unavailable
- View transition direction (`back`/`forward`/`none`) detected via `historyIndex` from spec 26
- `x-m` header optimization requires modules loaded first (for loaderDeps) — unavailable on first visit to a route
- `prefetch()` has no abort controller — intentionally fire-and-forget, doesn't interfere with navigation
- Redirect loop guard (max 10) prevents infinite server-driven redirect chains
- `applyHeadToDocument` delegates to `applyPerRouteHeads` (spec 27) — per-route ownership via `headByRoute` Map prevents conflicts with static head content
- Cross-root navigation (e.g., `_root_` → `_docs_`) triggers a full page reload (`window.location.href = url`). Different roots are effectively different apps — clean teardown and fresh SSR is simpler and safer than attempting CSR component tree swap. Detection: compare current root layout virtualPath prefix with new match's root prefix; if different, hard navigate.
- Response routes (`route.t === "x"`) also trigger full page navigate — they return raw `Response` (API endpoints, webhooks), not JSX. Client cannot render them in the SPA shell. The `t` field on `RouteData` (spec 01) is available without loading the route module.
- GC interval is coarse (60s) — not per-navigation. Entries may outlive gcTime by up to 60s.
- `shouldRefetch` uses `trigger: "navigation"` — distinguishes from `"revalidation"` (manual invalidate) and `"initial"` (first load)
