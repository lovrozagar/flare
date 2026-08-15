# Defer

Layer 2. Pure utility, no Flare deps. Used by loader-pipeline and ndjson-server.

Deferred streaming control. Wraps async work so results stream as NDJSON chunks after initial response.

## Types

```ts
interface Deferred<T> {
	__deferred: true;
	key: string;
	promise: Promise<T>;
}

interface DeferContext {
	defer: DeferFn;
	entries: () => DeferredEntry[];
}

type DeferFn = <T>(fn: () => Promise<T>, options?: { key?: string }) => Deferred<T>;

interface DeferredEntry {
	key: string;
	matchId: string;
	promise: Promise<unknown>;
}
```

## Exports

```ts
createDeferContext(matchId: string): DeferContext
isDeferred(value: unknown): value is Deferred<unknown>
```

## Behavior

### `createDeferContext`

Creates a per-route defer factory. Each matched route gets its own context, scoped by `matchId`.

- Internal counter for auto-generated keys: `d0`, `d1`, `d2`, ...
- Internal `Map<string, Deferred>` for deduplication
- Returns `{ defer, entries }`:
  - `defer`: the `DeferFn` passed to loader callbacks
  - `entries()`: returns all deferred entries registered so far

### `defer(fn, options?)`

Wraps a lazy async function for streaming.

1. Generate key: `options?.key ?? `d${counter++}``
2. **Deduplication**: if key already exists in this context, return existing `Deferred` (fn NOT called)
3. Call `fn()` immediately — starts the promise
4. Create `Deferred<T>`: `{ __deferred: true, key, promise }`
5. Register entry: `{ key, matchId, promise }`
6. Return the `Deferred<T>` as part of loader data

**Key** used for:

- NDJSON chunk targeting (`t:"c"` message includes `k` field)
- Client-side promise resolution (match pending promise by `matchId:key`)
- Error targeting (`t:"e"` message with `k` field for deferred-specific errors)

### `isDeferred`

```ts
value != null && typeof value === "object" && "__deferred" in value && value.__deferred === true;
```

### Lifecycle

```
Server (loader):
  ctx.defer(() => fetchReviews(id), { key: "reviews" })
    → calls fn() immediately, starts promise
    → returns { __deferred: true, key: "reviews", promise }
    → entry tracked in DeferContext

Server (serialization):
  Loader data serialized:
    { reviews: { __deferred: true, key: "reviews" } }
    promise field stripped (not JSON-serializable)

Server (streaming):
  Promise resolves → send NDJSON chunk: { t: "c", m: matchId, k: "reviews", d: resolvedValue }
  Promise rejects  → send NDJSON chunk: { t: "e", m: matchId, k: "reviews", e: { message } }
  All settled       → send: { t: "d" }

Client (hydration):
  Receive loader data with deferred markers
  Create pending promises with stored resolvers keyed by matchId:key

Client (chunk arrival):
  Match chunk to resolver by matchId + key
  Resolve or reject the pending promise
  Suspense boundary re-renders
```

### Deferred in Loader Data

Deferred values can be at any depth in the loader return object:

```ts
.loader(async (ctx) => ({
  product: await fetchProduct(id),              /* resolved immediately */
  reviews: ctx.defer(() => fetchReviews(id)),   /* streams later */
  related: {
    products: ctx.defer(() => fetchRelated(id)), /* nested OK */
  },
}))
```

Serialization walks the loader data tree, finds `Deferred` values via `isDeferred()`, strips `promise` field, keeps `__deferred` and `key` as markers.

### Server → Client Deferred Shape Transformation

Server `Deferred` (`{ __deferred: true, key, promise }`) undergoes two transformations:

1. **Serialization** (spec 09 `serializeLoaderData`): strips `promise`, produces marker `{ __deferred: true, key }` in FlareState/NDJSON
2. **Hydration** (spec 11 `hydrateLoaderData`): converts marker to client `Deferred` — renames `key` → `__key`, creates new `promise` tied to a resolver, adds `__resolved?` / `__error?` fields for pre-resolution.

Client shape: `{ __deferred: true, __key?, __resolved?, __error?, promise }` (spec 37). The `__key` prefix avoids collision with user data keys.

### Error Handling

- Deferred promise rejects → error sent as NDJSON `t:"e"` with the deferred's `key`
- Only `message` sent to client (no stack traces — security)
- Client receives error, rejects the pending promise
- `<Suspense>` fallback or error boundary catches on client side
- Server-side: errors logged, do NOT crash the stream

### Key Scoping

- Keys are unique **within a single route's loader** (scoped by matchId)
- Same key string across different routes is fine — resolved by matchId prefix
- NDJSON resolver key: `${matchId}:${key}`

## Test Cases

```
createDeferContext:
  Returns { defer, entries }
  entries() initially returns []
  After defer() call, entries() returns one entry
  matchId stored in each entry

defer():
  Returns Deferred with __deferred: true
  Returns Deferred with key field
  Returns Deferred with promise field
  Auto-generates keys: first call → "d0", second → "d1", third → "d2"
  Custom key: defer(fn, { key: "reviews" }) → key is "reviews"
  Starts promise immediately: fn() called synchronously within defer()
  Deferred.promise is the actual promise returned by fn()
  fn returning resolved value → promise resolves with that value
  fn throwing → promise rejects with that error

isDeferred:
  isDeferred({ __deferred: true, key: "x", promise: Promise.resolve() }) → true
  isDeferred({ __deferred: false, key: "x" }) → false
  isDeferred(null) → false
  isDeferred(undefined) → false
  isDeferred("string") → false
  isDeferred(42) → false
  isDeferred({}) → false
  isDeferred({ key: "x" }) → false (no __deferred)
  isDeferred({ __deferred: true }) → true (key optional for guard)

Deduplication:
  defer(fn1, { key: "x" }) then defer(fn2, { key: "x" }) → same Deferred returned
  fn2 NOT called — fn1's promise reused
  entries() returns one entry, not two
  Auto-generated keys don't collide: d0 ≠ d1

Key scoping:
  Two DeferContexts with same matchId → different contexts, independent counters
  Two DeferContexts with different matchIds → entries isolated
  Key "reviews" in route A and "reviews" in route B → different entries (different matchId)

Serialization walkthrough:
  { product: "data", reviews: Deferred } → isDeferred finds reviews
  Nested: { a: { b: Deferred } } → found at depth 2
  Array: [Deferred, "x"] → found at index 0
  Mixed: { x: Deferred, y: { z: Deferred } } → both found

Error scenarios:
  fn() throws synchronously → promise rejects
  fn() returns rejecting promise → promise rejects
  Multiple deferred, one rejects → others unaffected
```

## Notes

- `__deferred: true` is a brand check — plain objects with this field would be misidentified. Acceptable tradeoff for bundle size vs Symbol.
- `promise` field stripped during serialization (not JSON-serializable)
- `fn` is lazy (`() => Promise<T>`) not a raw promise — defer controls when work starts
- DeferContext is per-route (per matchId), not per-request. Each matched route has independent defer tracking.
- NDJSON protocol details in ndjson-server spec (Layer 3)
- Client consumption details in ndjson-client spec (Layer 4)
- No `awaitOnInitialLoad` option in v2 — all deferred values stream. Use `await` in loader to block if needed.
- Nested deferreds not supported — a deferred callback must return final resolved values, not another `ctx.defer()`. NDJSON chunk data is delivered as-is to the client resolver, not re-processed through `hydrateLoaderData`. An inner deferred marker in chunk data would be a dead object on the client.
- **Two Deferred shapes**: server-side `{ __deferred: true, key, promise }` (this spec) vs client-side hydrated `{ __deferred: true, __key?, __resolved?, __error?, promise }` (spec 37 Await). Server serializes with `key`, client receives `__key` after NDJSON parsing. `__resolved` / `__error` set when chunk arrives before component renders — enables immediate render without flash.
