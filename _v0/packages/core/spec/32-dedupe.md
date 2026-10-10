# Dedupe

Layer 1. Depends on server-context (getServerRequestContext).

Per-request deduplication for server-side async operations and fetch calls.

## Types

```ts
type DedupeCache = Map<string, Promise<unknown>>;
```

## Exports

```ts
/* Function deduplication */
dedupe<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult>

/* Fetch deduplication */
enableFetchDedupe(): void
disableFetchDedupe(): void
isFetchDedupeEnabled(): boolean
```

## Behavior

### `dedupe()`

Wraps async function for per-request deduplication. Same function + same args + same request = same promise.

```ts
const getUser = dedupe(async (id: string, env: Env) =>
	env.D1.prepare("SELECT * FROM users WHERE id = ?").bind(id).first(),
);

/* In root preloader — executes */
const user = await getUser("123", env);

/* In page loader (same request) — returns cached promise */
const user = await getUser("123", env);
```

Implementation:

1. Each `dedupe()` call gets a unique `fnId` (monotonic counter)
2. Cache key: `${fnId}:${JSON.stringify(args)}`
3. Cache stored in `serverRequestContext` — isolated per request
4. Cache hit → return existing promise
5. Cache miss → call function, store promise, return it

### Fetch Deduplication

`enableFetchDedupe()` patches `globalThis.fetch` with a deduplicating wrapper.

**Only deduplicates GET/HEAD requests** — safe, idempotent methods only. POST/PUT/DELETE pass through.

Cache key: `fetch:${METHOD}:${URL}:${headersKey}`

Headers key excludes trace/correlation headers that change per-request:

- `traceparent`, `tracestate`, `x-request-id`, `x-correlation-id`

**Response cloning**: cached responses are cloned for each caller — each gets its own body stream.

```ts
function createDedupedFetch(originalFetch: typeof fetch): typeof fetch {
	return async (input, init?) => {
		const key = getFetchCacheKey(input, init);
		if (!key) return originalFetch(input, init); /* non-deduplicatable */

		const cache = getFetchCache(); /* from serverRequestContext */
		const existing = cache.get(key);
		if (existing) return (await existing).clone();

		const promise = originalFetch(input, init);
		cache.set(key, promise);
		return (await promise).clone();
	};
}
```

**Fallback**: if called outside request context (no `AsyncLocalStorage`), uses original fetch. No error.

### Server Handler Integration

`createServerHandler` calls `enableFetchDedupe()` when `dedupeFetch: true` (default). Called once at startup — patches global fetch.

Per-request cache isolation via `serverRequestContext`:

- Each request gets its own `Map` in `AsyncLocalStorage`
- Request ends → context GC'd → fetch cache GC'd

## Test Cases

```
dedupe:
  Same fn + same args + same request → same promise
  Same fn + different args → different promises
  Same args + different request → different promises (isolated)
  Original function called once per unique key
  Concurrent calls → single execution
  Cache per-request (not global)

Fetch deduplication:
  GET same URL → single fetch, responses cloned
  GET same URL different headers → separate fetches
  POST → not deduplicated (pass-through)
  PUT → not deduplicated
  HEAD same URL → deduplicated
  Trace headers excluded from key (traceparent, x-request-id)
  Each caller gets own Response body stream (cloned)
  Outside request context → original fetch (no error)

enableFetchDedupe:
  Patches globalThis.fetch
  Idempotent: second call no-op
  disableFetchDedupe restores original

isFetchDedupeEnabled:
  After enable → true
  After disable → false
  Before enable → false
```

## Notes

- `dedupe()` uses `JSON.stringify(args)` for key — objects must serialize consistently
- Fetch dedup is opt-in via `createServerHandler({ dedupeFetch: true })` (default: true)
- Only GET/HEAD deduplicated — matches Next.js behavior
- Response cloning is essential — Response body is a stream consumed once
- Per-request cache prevents cross-request data leaks (security)
- Excluded headers prevent false cache misses from trace infrastructure
- `enableFetchDedupe()` patches globally once — not per-request. Cache isolation is per-request via `AsyncLocalStorage`.
