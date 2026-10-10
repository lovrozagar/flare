# URL Utilities

Layer 0. Pure functions, zero deps.

## Exports

```ts
interface BuildUrlOptions {
  hash?: string
  params?: Record<string, string | string[] | undefined>
  search?: Record<string, unknown>
  to: string
}

buildUrl(options: BuildUrlOptions): string
resolvePathParams(path: string, params: Record<string, string | string[] | undefined>): string
serializeSearchParams(search: Record<string, unknown>): string
```

## Behavior

### `resolvePathParams`

Processes 4 param types in strict order (prevents regex conflicts):

1. `[[...param]]` optional catch-all → join with `/` if array, remove segment if missing/empty
2. `[[param]]` optional single → replace if string + non-empty, remove segment if missing/empty
3. `[...param]` required catch-all → join with `/`, **throws** if missing or not array
4. `[param]` required single → replace, **throws** if missing or array

Regex patterns:

- Optional catch-all: `/\[\[\.\.\.(\w+)\]\]/`
- Optional single: `/\[\[(?!\.\.\.)([\w]+)\]\]/g` (negative lookahead avoids catch-all)
- Required catch-all: `/\[\.\.\.(\w+)\]/`
- Required single: `/\[(\w+)\]/g`

All values `encodeURIComponent`'d. Array values joined with `/`.

#### Optional single `[[param]]` removal

Two-step removal handles all positions:

1. `resolved.replace("/[[paramName]]", "")` — mid-path with leading slash
2. `resolved.replace("[[paramName]]", "")` — start-of-path without slash

Empty string and undefined both treated as missing → segment removed.

If result becomes empty string after removal, defaults to `/`.

#### Error messages

| Condition                             | Message                                       |
| ------------------------------------- | --------------------------------------------- |
| Missing required `[param]`            | `"Missing required param: ${name}"`           |
| Required `[param]` receives array     | `"Param ${name} must be string, got array"`   |
| Missing required `[...param]`         | `"Missing required catch-all param: ${name}"` |
| Required `[...param]` receives string | `"Missing required catch-all param: ${name}"` |

### `serializeSearchParams`

- Keys sorted alphabetically
- `null`/`undefined` values skipped
- `false` included as `"false"`
- Empty string `""` included as `key=`
- Numbers converted to string
- Arrays expand to multiple `key=value` pairs
- `true` included as `"true"`
- All keys/values `encodeURIComponent`'d
- Nested objects not supported — only primitives, arrays of primitives, null, undefined
- Returns empty string for empty object

### `buildUrl`

Composes in order:

1. `resolvePathParams(to, params ?? {})` — undefined params treated as empty
2. Append `?${serializeSearchParams(search)}` if non-empty
3. Append `#${hash}` — normalizes leading `#` (no double `#`)

## Test Cases

### resolvePathParams

```
Required params:
  "/products/[id]", { id: "123" } → "/products/123"
  "/[a]/[b]", { a: "x", b: "y" } → "/x/y"
  "/users/[userId]/posts/[postId]", { postId: "456", userId: "123" } → "/users/123/posts/456"
  "/products/[id]", {} → throws "Missing required param: id"
  "/products/[id]", { id: ["1", "2"] } → throws "Param id must be string, got array"

Required catch-all:
  "/docs/[...slug]", { slug: ["a", "b"] } → "/docs/a/b"
  "/docs/[...slug]", { slug: ["api", "auth", "tokens"] } → "/docs/api/auth/tokens"
  "/docs/[...slug]", {} → throws "Missing required catch-all param: slug"
  "/docs/[...slug]", { slug: "single" } → throws "Missing required catch-all param: slug"

Optional catch-all:
  "/[[...slug]]", { slug: ["a", "b"] } → "/a/b"
  "/[[...slug]]", { slug: ["intro", "getting-started"] } → "/intro/getting-started"
  "/[[...slug]]", { slug: [] } → "/"
  "/[[...slug]]", {} → "/"

Optional single:
  "/[[locale]]/compare", { locale: "en" } → "/en/compare"
  "/[[locale]]/compare", {} → "/compare"
  "/[[locale]]/compare", { locale: undefined } → "/compare"
  "/[[locale]]/compare", { locale: "" } → "/compare"
  "/[[locale]]", { locale: "en" } → "/en"
  "/[[locale]]", {} → "/"
  "/shop/[[category]]/products", { category: "electronics" } → "/shop/electronics/products"
  "/shop/[[category]]/products", {} → "/shop/products"

Combined optional + required:
  "/[[locale]]/products/[id]", { id: "123", locale: "en" } → "/en/products/123"
  "/[[locale]]/products/[id]", { id: "123" } → "/products/123"

Encoding:
  "/[id]", { id: "hello world" } → "/hello%20world"
  "/[...s]", { s: ["a/b", "c"] } → "/a%2Fb/c"
  "/[[locale]]/compare", { locale: "en US" } → "/en%20US/compare"
  "/search/[query]", { query: "hello world" } → "/search/hello%20world"
  "/docs/[...slug]", { slug: ["hello world", "test"] } → "/docs/hello%20world/test"

Extra unused params (silently ignored):
  "/products/[id]", { id: "123", unused: "x" } → "/products/123"

Static paths (no params):
  "/about", {} → "/about" (unchanged)
```

### serializeSearchParams

```
  {} → ""
  { page: 1, sort: "name" } → "page=1&sort=name"
  { b: 2, a: 1 } → "a=1&b=2" (sorted)
  { x: null, y: undefined, z: 1 } → "z=1"
  { tags: ["a", "b"] } → "tags=a&tags=b"
  { enabled: false } → "enabled=false"
  { enabled: true } → "enabled=true"
  { q: "" } → "q="
  { page: 1 } → "page=1"
  { q: "hello world" } → "q=hello%20world"
  { a: 1, b: undefined } → "a=1"
  { a: 1, b: null } → "a=1"
```

### buildUrl

```
Simple paths:
  { to: "/about" } → "/about"
  { to: "/" } → "/"

With params:
  { to: "/products/[id]", params: { id: "123" } } → "/products/123"
  { to: "/users/[userId]/posts/[postId]", params: { postId: "456", userId: "123" } } → "/users/123/posts/456"
  { to: "/docs/[...slug]", params: { slug: ["api", "auth"] } } → "/docs/api/auth"

With search:
  { to: "/products", search: { page: 2, sort: "name" } } → "/products?page=2&sort=name"
  { to: "/", search: { ref: "nav" } } → "/?ref=nav"

With hash:
  { to: "/products/[id]", params: { id: "123" }, hash: "reviews" } → "/products/123#reviews"
  { to: "/about", hash: "#section" } → "/about#section" (no double #)
  { to: "/about", hash: "section" } → "/about#section"
  { to: "/", hash: "top" } → "/#top"

Empty search (no ? appended):
  { to: "/about", search: {} } → "/about"

Combined:
  { to: "/products/[id]", params: { id: "123" }, search: { tab: "specs" }, hash: "details" } → "/products/123?tab=specs#details"

Optional params:
  { to: "/[[locale]]/compare", params: { locale: "en" } } → "/en/compare"
  { to: "/[[locale]]/compare" } → "/compare"
  { to: "/[[locale]]/compare", params: { locale: "de" }, search: { ref: "nav" } } → "/de/compare?ref=nav"
  { to: "/[[locale]]/products/[id]", params: { id: "123", locale: "en" }, hash: "details" } → "/en/products/123#details"
  { to: "/[[locale]]/products/[id]", params: { id: "123" } } → "/products/123"
```

## Notes

- `buildUrl` is low-level: string in, string out
- `buildLocation` (router-primitives) wraps URL + route match into full `Location` object
- Error propagation: `buildUrl` calls `resolvePathParams` — missing required params throw from there
