# Router Primitives

Layer 0. Pure functions, zero deps. Ships to both server and client.

## Types

```ts
type RouteMeta = {
	authenticate?: boolean
	gcTime?: number
	prefetch?: PrefetchStrategy
	prefetchGcTime?: number
	prefetchStaleTime?: number
	staleTime?: number
}

type PrefetchStrategy = false | "intent" | "render" | "viewport"

type RouteData = {
	e: string /* exportName (debug/dev) */
	o: RouteMeta /* route options */
	p: () => Promise<{ default: unknown }> /* page lazy loader */
	t: "r" | "x" /* type: "r" = render, "x" = response */
	v: string /* variablePath: "/products/[id]" */
	x: string /* virtualPath: "_root_/(auth)/login" */
}

type TreeNode = {
	c?: TreeNode /* catchAll [...slug] */
	n?: string /* paramName */
	o?: TreeNode /* optionalCatchAll [[...slug]] */
	p?: TreeNode /* param [id] */
	r?: RouteData /* route data (terminal) */
	s: Map<string, TreeNode> /* static children */
}

type MatchResult = {
	params: Record<string, string | string[]>
	route: RouteData
}
```

Single-char keys for bundle size. Radix tree with O(depth) matching.

### Location

```ts
interface Location<
	TParams = Record<string, string | string[]>,
	TSearch = Record<string, string>,
	THash = string,
> {
	hash: THash
	params: TParams
	pathname: string
	search: TSearch
	url: URL
	variablePath: string
	virtualPath: string
}
```

Constructed per-request from matched route. Passed to loaders, preloaders, render fns, error boundaries.

### buildLocation

```ts
function buildLocation<
	TParams extends Record<string, string | string[]>,
	TSearch = Record<string, string>,
	THash = string,
>(
	url: URL,
	params: TParams,
	virtualPath: string,
	variablePath: string,
	search?: TSearch,
	hash?: THash,
): Location<TParams, TSearch, THash>
```

- If `search` not provided, parses from `url.searchParams`
- If `hash` not provided, uses `url.hash`
- Pure factory — no side effects

### Path Validation Types

```ts
type RootLayoutPath = `_${string}_`

type VirtualPath = RootLayoutPath | `${RootLayoutPath}/${string}`
```

Runtime validators:

```ts
isRootLayoutPath(path: string): path is RootLayoutPath
/* >= 3 chars, starts/ends with _, no mid-path root patterns */
```

### Match ID

Deterministic cache key for a matched route. Changes when params or loader deps change → triggers loader re-execution.

```ts
interface ComputeMatchIdOptions {
  loaderDeps?: (ctx: { search: Record<string, string> }) => unknown[]
  params: Record<string, string | string[]>
  routeId: string
  search: Record<string, string>
}

interface ParsedMatchId {
  deps: unknown[]
  params: Record<string, string | string[]>
  routeId: string
}

computeMatchId(options: ComputeMatchIdOptions): string
parseMatchId(matchId: string): ParsedMatchId | null
```

Format: `${routeId}:${JSON.stringify(sortedParams)}:${JSON.stringify(deps)}`

## Exports

```ts
/* Tree construction */
createTreeNode(paramName?: string): TreeNode
insertRoute(tree: TreeNode, path: string, route: RouteData): void

/* Matching */
matchRoute(tree: TreeNode, pathname: string): MatchResult | null

/* Location */
buildLocation(url, params, virtualPath, variablePath, search?, hash?): Location

/* Match ID */
computeMatchId(options: ComputeMatchIdOptions): string
parseMatchId(matchId: string): ParsedMatchId | null

/* Path utilities */
deriveLayouts(virtualPath: string): string[]
extractLayoutKey(virtualPath: string): string
deriveParams(variablePath: string): string[]
toUrlPath(virtualPath: string): string
toVirtualPath(urlPath: string, root: RootLayoutPath): string
stripGroups(path: string): string
isRootLayoutPath(path: string): boolean
```

## Behavior

### `createTreeNode`

Creates an empty tree node with `s = new Map()`. Optional `paramName` sets the `n` field (used when creating param/catchAll nodes).

### `insertRoute`

`path` is the route's **variablePath** (e.g. `/products/[id]`), NOT virtualPath.

Walks segments, creating tree nodes as needed. Segment classification:

- `[[...param]]` → node at `o` (optionalCatchAll)
- `[...param]` → node at `c` (catchAll)
- `[param]` → node at `p` (param)
- anything else → node in `s` Map (static, lowercased key)

Terminal node gets `r = routeData`. Duplicate insertion on same path overwrites `r` (last wins).

### `matchRoute`

Priority order: static > param > catchAll > optionalCatchAll.

- Case-insensitive static matching (lowercased)
- Recursive with backtracking (static fails → try param → try catchAll)
- Params extracted into `Record<string, string | string[]>`
- Catch-all params are `string[]`, regular params are `string`
- Param values preserve original case
- Returns `null` if no match
- Leading/trailing slashes stripped, empty segments filtered

### `buildLocation`

Factory for Location objects. If search/hash not provided, defaults from URL.

- Search default: `Object.fromEntries(url.searchParams)` — multi-value params take last value
- Hash default: `url.hash` (includes `#` prefix)

### `computeMatchId`

`routeId` is the route's **virtualPath** (`RouteData.x`), e.g. `_root_/products/[id]`.

- Params sorted alphabetically by key before serialization
- Catch-all params (`string[]`) serialized as arrays
- loaderDeps called with `{ search }`, result serialized. No loaderDeps → empty array `[]`
- Deterministic: same inputs → same ID

### `parseMatchId`

- Splits on first `:{` and last `:[`
- Returns `{ routeId, params, deps }` or `null` if malformed

### `deriveLayouts`

Builds layout keys for all ancestor layouts of a route's virtualPath.

Algorithm:

1. `extractLayoutKey(virtualPath)` → strips URL segments, keeps only virtual segments (`_root_`, `(groups)`, `[params]`)
2. Split result by `/` into segments
3. Walk segments left-to-right, accumulating into a path string
4. On each `_root_` or `(group)` segment: look ahead and absorb any trailing non-group virtual segments (params), then emit the accumulated path
5. Non-group segments (params) only appear as trailing parts of a group's key, never trigger their own emission

### `extractLayoutKey`

Strips URL segments from virtualPath, keeps only virtual segments joined by `/`.

### `deriveParams`

Extracts param names from variablePath patterns: `[id]`, `[...slug]`, `[[...slug]]`.

### `toUrlPath`

Converts virtualPath to URL path by removing root and group segments.

### `stripGroups`

Removes `(group)` segments from a path.

### `toVirtualPath`

Prepends root layout path to a URL path. Does NOT reconstruct groups — produces a minimal virtualPath.

- Strips leading `/` from urlPath before joining
- `toVirtualPath("/login", "_root_")` → `"_root_/login"`
- `toVirtualPath("/", "_root_")` → `"_root_"`

### `isRootLayoutPath`

Validates `_${name}_` pattern:

- Minimum 3 chars
- Starts and ends with `_`
- No `/` (no path segments)

## Test Cases

### insertRoute + matchRoute

```
Static:
  "/" → root route
  "/about" → about route
  "/About" → about route (case-insensitive)
  "/products/details" → nested static

Params:
  "/products/123" → { id: "123" }
  "/products/123/reviews/456" → { id: "123", reviewId: "456" }

Catch-all:
  "/docs/a/b/c" with [...slug] → { slug: ["a", "b", "c"] }

Optional catch-all:
  "/docs" with [[...slug]] → { slug: [] }
  "/docs/a/b" with [[...slug]] → { slug: ["a", "b"] }

Priority:
  "/products/details" matches static over param
  "/products/123" matches param when no static "123"

No match:
  "/nonexistent" → null
  "" → root route (empty string = root)

Duplicate insertion:
  insertRoute same path twice → second route data overwrites first

Root with optional catch-all:
  "/" with [[...slug]] → root match, { slug: [] }
  "/a/b" with [[...slug]] → { slug: ["a", "b"] }

Edge cases:
  "///multiple///slashes///" → normalized
  "/trailing/" → trailing slash stripped
```

### buildLocation

```
buildLocation(new URL("http://x.com/products/1?tab=info#top"), { id: "1" }, "_root_/products/[id]", "/products/[id]")
  → { pathname: "/products/1", params: { id: "1" }, search: { tab: "info" }, hash: "#top", ... }

buildLocation(url, params, vp, varp, { custom: "search" })
  → uses provided search, ignores URL.searchParams

buildLocation(url, params, vp, varp, undefined, "override")
  → uses provided hash, ignores url.hash
```

### computeMatchId

```
{ routeId: "_root_/products/[id]", params: { id: "123" }, search: {}, loaderDeps: undefined }
  → "_root_/products/[id]:{"id":"123"}:[]"

Same route, different params → different ID
Same route, different loaderDeps result → different ID
Params sorted: { b: "2", a: "1" } same as { a: "1", b: "2" }

Catch-all params:
  { routeId: "_root_/docs/[...slug]", params: { slug: ["a", "b"] }, search: {} }
    → "_root_/docs/[...slug]:{"slug":["a","b"]}:[]"

With loaderDeps:
  { routeId: "_root_/search", params: {}, search: { q: "test" }, loaderDeps: ({ search }) => [search.q] }
    → "_root_/search:{}:["test"]"

Empty params:
  { routeId: "_root_/about", params: {}, search: {} }
    → "_root_/about:{}:[]"
```

### parseMatchId

```
Valid: "_root_/products/[id]:{"id":"123"}:[]" → { routeId: "_root_/products/[id]", params: { id: "123" }, deps: [] }
With deps: "_root_/search:{}:["test"]" → { routeId: "_root_/search", params: {}, deps: ["test"] }
Malformed: "garbage" → null
```

### deriveLayouts

```
"_root_/(auth)/login" → ["_root_", "_root_/(auth)"]
"_root_/(layout)/products/(detail)/[id]" → ["_root_", "_root_/(layout)", "_root_/(layout)/(detail)/[id]"]
"_root_/about" → ["_root_"]
"_root_/(a)/(b)/page" → ["_root_", "_root_/(a)", "_root_/(a)/(b)"]
```

### extractLayoutKey

```
"_root_/(layout-tests)/layout-tests/(dynamic)/dynamic/[orgId]" → "_root_/(layout-tests)/(dynamic)/[orgId]"
"_root_/(auth)/login" → "_root_/(auth)"
"_root_/about" → "_root_"
```

### deriveParams

```
"/products/[id]" → ["id"]
"/[...slug]" → ["slug"]
"/[[...slug]]" → ["slug"]
"/products/[id]/reviews/[reviewId]" → ["id", "reviewId"]
"/about" → []
```

### toUrlPath

```
"_root_/blog/[slug]" → "/blog/[slug]"
"_root_/(auth)/login" → "/login"
"_root_" → "/"
```

### stripGroups

```
"/(auth)/login" → "/login"
"/(admin)/(dashboard)/users" → "/users"
```

### toVirtualPath

```
toVirtualPath("/login", "_root_") → "_root_/login"
toVirtualPath("/", "_root_") → "_root_"
toVirtualPath("/products/123", "_docs_") → "_docs_/products/123"
toVirtualPath("/about", "_admin_") → "_admin_/about"
```

### isRootLayoutPath

```
"_root_" → true
"_admin_" → true
"_x_" → true
"_root" → false (no trailing _)
"root_" → false (no leading _)
"__" → false (< 3 chars)
"_" → false (< 3 chars)
"" → false
"_root_/something" → false (contains /)
```

## Notes

- `[[param]]` optional single — NOT a tree node type. Handled by URL utilities (spec 03) for URL building. Routes with optional single params register multiple tree entries via the code generator.
- Carried forward from v0 mostly unchanged — proven, well-tested
- Single-char field names intentional (bundle size)
- `t` field enables pre-load route type detection (navigation needs to know response routes before loading modules)
- `RouteMeta` fields defined here, consumed by route-builder (Layer 1)
- `buildLocation` is pure — higher layers may wrap it with route match context
- Match ID enables fine-grained loader cache invalidation
