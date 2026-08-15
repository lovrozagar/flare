# State Parser

Layer 4. Depends on router-primitives (MatchResult), defer (isDeferred, Deferred).

Parses `self.flare` (FlareState) from SSR-injected inline script. Converts deferred markers back to real promises with resolver tracking.

## Types

```ts
interface FlareState {
	c: ContextState; /* dir, locale, router, theme */
	dk?: string[]; /* dynamic registry keys (spec 18) */
	e?: DevError[]; /* dev-only SSR errors for client overlay */
	m: FlareMatchState[]; /* matched routes */
	p: string; /* pathname */
	ph?: PerRouteHead[]; /* per-route head configs for client init */
	q?: QueryState[]; /* TanStack Query hydration (optional) */
	r: Record<string, string | string[]>; /* params */
	s: Record<string, string>; /* search */
}

interface FlareMatchState {
	d: unknown; /* loaderData (deferred markers) */
	h?: HeadConfig; /* per-route head config */
	i: string; /* matchId */
	p?: Record<string, unknown>; /* preloaderContext */
	v: string; /* virtualPath */
}
```

Same types as SSR spec (08) — serialized by server, parsed by client. See spec 25 for `ContextState`, `DevError`, `PerRouteHead`, `QueryState` type definitions.

### Deferred Marker

Serialized form of `Deferred<T>` (promise stripped):

```ts
interface DeferredMarker {
	__deferred: true;
	key: string;
}
```

### Hydrated Match

```ts
interface HydratedMatch {
	headConfig?: HeadConfig;
	loaderData: unknown;
	matchId: string;
	preloaderContext?: Record<string, unknown>;
	virtualPath: string;
}

interface ParseResult {
	matches: HydratedMatch[];
	params: Record<string, string | string[]>;
	pathname: string;
	resolvers: Map<string, DeferredResolver>;
	search: Record<string, string>;
}

interface DeferredResolver {
	reject: (error: Error) => void;
	resolve: (data: unknown) => void;
}
```

## Exports

```ts
parseFlareState(raw: unknown): FlareState | null
hydrateFlareState(state: FlareState): ParseResult
hydrateLoaderData(matchId: string, data: unknown, resolvers: Map<string, DeferredResolver>): unknown
isDeferredMarker(value: unknown): value is DeferredMarker
```

## Behavior

### `parseFlareState`

Validates the raw `self.flare` value:

1. If `null`, `undefined`, or not an object → return `null`
2. Check required fields: `c` (object), `m` (array), `p` (string), `r` (object), `s` (object)
3. If valid → return cast as `FlareState`
4. If invalid → return `null`

No deep validation — trusts server output. Defensive only against missing/wrong top-level shape.

### `hydrateFlareState`

Converts `FlareState` to `ParseResult`:

1. Create resolver map: `Map<string, DeferredResolver>`
2. For each match in `state.m`:
   - Call `hydrateLoaderData(match.i, match.d, resolvers)` to convert deferred markers
   - Build `HydratedMatch` with hydrated loaderData
3. Return `{ matches, params: state.r, pathname: state.p, resolvers, search: state.s }`

### `hydrateLoaderData`

Recursively walks loader data tree, converting deferred markers to real `Deferred<T>` objects:

1. If `isDeferredMarker(value)`:
   - Create `new Promise` and capture `resolve`/`reject` refs
   - Store in resolvers map keyed by `${matchId}:${value.key}`
   - Return `{ __deferred: true, __key: value.key, promise }` (rename `key` → `__key` to avoid collision with user data)
2. If `Array.isArray(value)`: recurse each element
3. If object: recurse each value
4. Primitives: return unchanged

### `isDeferredMarker`

```ts
value != null &&
	typeof value === "object" &&
	"__deferred" in value &&
	value.__deferred === true &&
	"key" in value &&
	typeof value.key === "string";
```

Stricter than `isDeferred` (requires `key` field, no `promise` field expected).

### Client Bootstrap

```ts
const raw = (self as { flare?: unknown }).flare;
const state = parseFlareState(raw);
if (!state) throw new Error("No valid flare state found");

const { matches, params, pathname, resolvers, search } = hydrateFlareState(state);
/* resolvers passed to NDJSON client for chunk resolution */
```

## Test Cases

```
parseFlareState:
  Valid FlareState → returns typed FlareState
  null → returns null
  undefined → returns null
  "string" → returns null
  {} (empty object) → returns null (missing m, p, r, s)
  { c: {}, m: [], p: "/", r: {}, s: {} } → returns FlareState
  Missing c field → returns null
  Missing m field → returns null
  Missing p field → returns null

hydrateFlareState:
  Empty matches → { matches: [], resolvers empty }
  Single match, no deferred → match with original loaderData, resolvers empty
  Single match, one deferred → Deferred with promise, one resolver in map
  Multiple matches → each hydrated independently
  Preserves headConfig from match
  Preserves preloaderContext from match
  Preserves virtualPath from match

hydrateLoaderData:
  Primitive (string, number, null) → unchanged
  Object with no deferred → unchanged
  Object with deferred marker → { __deferred: true, __key, promise } (key renamed to __key)
  Resolver stored as "matchId:key"
  Nested deferred: { a: { b: marker } } → { a: { b: Deferred } }
  Array with deferred: [marker, "x"] → [Deferred, "x"]
  Multiple deferred in same object → each gets resolver
  Same key in different matchIds → different resolver entries

isDeferredMarker:
  { __deferred: true, key: "d0" } → true
  { __deferred: true, key: "reviews" } → true
  { __deferred: false, key: "x" } → false
  { __deferred: true } → false (no key)
  { key: "x" } → false (no __deferred)
  null → false
  "string" → false

Resolver integration:
  After hydration, resolvers map has entry for each deferred
  Calling resolver.resolve(data) resolves the Deferred's promise
  Calling resolver.reject(error) rejects the Deferred's promise
  Resolver key format: "matchId:deferredKey"
```

## Notes

- `self.flare` is a global assignment injected by SSR — available synchronously before any JS module executes
- No `JSON.parse` needed — `self.flare` is assigned as a JS object literal, already parsed by the engine
- Resolver map is passed to NDJSON client for chunk message resolution (spec 13)
- `parseFlareState` validates `c`, `m`, `p`, `r`, `s` as required; `dk`, `e`, `ph`, `q` are optional
- `parseFlareState` is defensive but not paranoid — trusts server output shape after top-level checks
- Deferred markers in SSR state will be resolved by NDJSON chunks streamed after initial HTML
