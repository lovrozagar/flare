# Caches

Layer 4. Depends on router-primitives (RouteMeta — gcTime, staleTime, prefetchGcTime, prefetchStaleTime).

Client-side caching for matched route data and prefetch timestamps.

## matchCache

Caches loader data per route match. Keyed by `matchId`.

### Types

```ts
interface CachedMatch {
	data: unknown;
	invalid: boolean;
	matchId: string;
	preloaderContext?: Record<string, unknown>;
	updatedAt: number;
}

interface InvalidateOptions {
	filter?: (match: CachedMatch) => boolean;
	matchId?: string;
	routeId?: string;
}

interface MatchCache {
	clear(): void;
	delete(matchId: string): void;
	get(matchId: string): CachedMatch | undefined;
	getAll(): CachedMatch[];
	has(matchId: string): boolean;
	invalidate(options?: InvalidateOptions): void;
	isStale(matchId: string, staleTime: number): boolean;
	set(match: CachedMatch): void;
	size(): number;
}
```

### Exports

```ts
createMatchCache(): MatchCache
```

### Behavior

**`set(match)`**: stores or replaces entry by `matchId`. Sets `updatedAt` to current timestamp if not provided.

**`get(matchId)`**: returns cached entry or `undefined`.

**`isStale(matchId, staleTime)`**:

- No entry → `true`
- Entry marked `invalid` → `true`
- `Date.now() - entry.updatedAt > staleTime` → `true`
- Otherwise → `false`

**`invalidate(options?)`**:

- No options → invalidate ALL entries (`invalid = true`)
- `{ matchId }` → invalidate specific entry
- `{ routeId }` → invalidate all entries whose `matchId` starts with `routeId + ":"` (colon prevents prefix collisions — `/products` won't match `/products-old`)
- `{ filter }` → invalidate entries where `filter(entry)` returns `true`
- Invalidated entries remain in cache but `isStale()` returns `true`

**`delete(matchId)`**: removes entry entirely.

**`clear()`**: removes all entries.

**`getAll()`**: returns all entries as array. Order not guaranteed.

### Cache Population

1. **SSR hydration**: initial matches from `FlareState.m` populate cache
2. **CSR navigation**: NDJSON loader messages update cache entries
3. **Prefetch**: prefetch results update cache (same as navigation)

### Garbage Collection

Entries older than `gcTime` (from route's `RouteMeta`) can be cleaned up. Framework runs periodic cleanup:

```
for each entry in cache:
  if Date.now() - entry.updatedAt > gcTime:
    cache.delete(entry.matchId)
```

Default `gcTime`: `5 * 60 * 1000` (5 minutes). Configurable per-route via `RouteOptions.gcTime`.

### Staleness Check

Navigation flow:

1. Check `matchCache.isStale(matchId, route.staleTime)`
2. If fresh → use cached data, skip loader (no fetch)
3. If stale → fetch new data, wait for response, update cache, then update UI

This is fetch-then-show, not stale-while-revalidate. Stale data exists in cache but navigation waits for fresh data before updating signals. The cache is a skip-or-fetch decision. Layout persistence (spec 17) keeps the existing UI mounted during fetch — `isNavigating` signal is true until data arrives.

Default `staleTime`: `0` (always refetch). Configurable per-route via `RouteOptions.staleTime`.

---

## prefetchCache

Tracks prefetch timestamps per URL. Prevents duplicate prefetch requests.

### Types

```ts
interface PrefetchCache {
	cleanup(maxAge: number): void;
	clear(): void;
	delete(url: string): void;
	get(url: string): number | undefined;
	has(url: string): boolean;
	isStale(url: string, staleTime: number): boolean;
	mark(url: string): void;
	set(url: string, fetchedAt: number): void;
	shouldPrefetch(url: string, staleTime: number): boolean;
	size(): number;
}
```

### Exports

```ts
createPrefetchCache(): PrefetchCache
```

### Behavior

**`mark(url)`**: sets `fetchedAt = Date.now()`. Called BEFORE fetch starts to prevent concurrent duplicates for same URL.

**`shouldPrefetch(url, staleTime)`**: returns `true` if URL not in cache or stale. Inverse of `!isStale`.

**`isStale(url, staleTime)`**:

- No entry → `true`
- `Date.now() - fetchedAt > staleTime` → `true`
- Otherwise → `false`

**`cleanup(maxAge)`**: removes entries older than `maxAge`. Called periodically.

### Prefetch Flow

```
1. Link enters viewport / user hovers
2. shouldPrefetch(url, prefetchStaleTime) → true?
3. mark(url) → set timestamp BEFORE fetch
4. Fetch NDJSON with flare-prefetch: "1" header
5. On success: update matchCache with loader data
6. On failure: delete(url) → allow retry
```

Default `prefetchStaleTime`: `30_000` (30 seconds). Configurable per-route.
Default `prefetchGcTime`: `5 * 60 * 1000` (5 minutes).

---

## Test Cases

```
matchCache:
  set + get → returns cached entry
  get missing → undefined
  has existing → true
  has missing → false
  delete → removes entry, get returns undefined
  clear → empties cache, size returns 0
  getAll → returns all entries as array

  isStale:
    No entry → true
    Entry just set, staleTime 1000 → false
    Entry set 2000ms ago, staleTime 1000 → true
    Entry marked invalid → true regardless of time
    staleTime 0 → always true (always refetch)
    staleTime Infinity → never stale

  invalidate:
    No options → all entries invalid
    { matchId: "x" } → only "x" invalid
    { routeId: "/products" } → matches starting with "/products" invalid
    { filter: fn } → entries where fn returns true invalid
    Invalid entry still in cache (not deleted)
    isStale returns true for invalid entry

  set updates:
    set same matchId → overwrites
    updatedAt reflects insertion time

prefetchCache:
  mark + has → true
  has missing → false
  delete → removes entry
  clear → empties cache
  get → returns fetchedAt timestamp

  shouldPrefetch:
    No entry → true
    Just marked, staleTime 30000 → false
    Marked 31000ms ago, staleTime 30000 → true

  isStale:
    No entry → true
    Fresh entry → false
    Expired entry → true

  cleanup:
    Entries older than maxAge removed
    Fresh entries preserved

  mark before fetch:
    mark(url) then shouldPrefetch(url) → false (prevents duplicate)
    Concurrent: two mark() calls for same url → second overwrites, both prevented
```

## Notes

- Both caches are plain `Map`-based — no persistence across page reloads
- SSR data populates matchCache on hydration — initial navigation uses cached data
- `invalidate()` marks entries but doesn't delete — invalidated entries re-fetched on next navigation
- `matchId` as cache key ensures granular per-route caching (different params = different matchId)
- Prefetch cache keyed by URL string, not matchId — simpler for `<Link>` components
- TanStack Query is optional in v2 (spec 33) — matchCache is the primary client data cache, QueryClient is supplemental for non-route-scoped queries
- GC runs on navigation or timer — not on every cache read
