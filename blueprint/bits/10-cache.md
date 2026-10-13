# Bit 10 — Cache

Creates every `P10` row. One write function. Memory, filesystem, and Cache API stores. The gate from bit 04 and the policy from bit 09 are what this bit obeys.

## Extends

`src/exports/server.ts` re-exports `revalidate`, `createRevalidateFn`, `FlareStore`, `createMemoryStore`, and `createAssetsStore`.

`server/lifecycle/create.ts` calls the read path only when the policy is `shared`.

`tests/integration/nonce.test.ts` gains `stored sentinel` and `hit matches`. The stored bytes contain the entry's sentinel and do not contain the first request's nonce in a nonce attribute or in the state field. The hit body's nonce attributes and `self.flare.nonce` equal the hit's CSP nonce. `text kept`: a text node equal to the first nonce is unchanged.

### `server/lifecycle/create.test.ts` (extended)

These rows live in `server/lifecycle/create-store.test.ts`, split from `create.test.ts` at the 500-line limit.

| test | case | result |
| --- | --- | --- |
| `store function` | `store: (env) => store` | the function is called once on that request with that `env`, and the returned store is the one read |
| `static function` | `static: (env) => store` | the same, for the SSG read |
| `store without site` | `createServer({ store })` with no `site` | throws at the call and names `site`. `site` is validated there too: absolute, `https` (`http` only in dev), no path |

## Cases

### `shared/route-builder/chain.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `cache forms` | `ssr.tags` as a function of params, `isr: { revalidate, defer, params, dynamicParams }`, `ssg` as a params function and as `{ params, defer }` | each builds. `ssr: {}` does not type-check, and `isr` has no `tags` field |

### `server/navigation/response.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `isr stream stays a hole` | a stored run of `isr: { defer: "stream" }` | the placeholder stays and the function is not called. Before this row, `cache.isr.defer` was ignored |

### `server/cache/key.test.ts`

| test | case | result |
| --- | --- | --- |
| `shape` | build `b`, route `home`, params `{ id: "042" }`, policy class `anonymous`, search `?q=1` | `static:b:home:042`. The key has no class segment and no search. Empty params omit the last segment |
| `catch all` | a catch-all whose segments are `a` and `b` | those segments are joined with `/` inside the raw-params segment |
| `encode` | a param value containing `/` and `%` | both characters are percent-encoded in the key |
| `route order` | route `/[a]/[b]` and the record `{ b: "two", a: "one" }`, the order the matcher builds | `static:b:<route>:one/two`. The order comes from the route's declared params, never from the record's key order, so a prerender seed keyed from `params()` and a runtime lookup agree |
| `absent optional` | route `/[[a]]/static/[[b]]` at `/static/x` and at `/x/static` | two different keys, `…:/x` and `…:x/`. Every declared param keeps its slot. An absent optional is the empty string. Only a route that declares no params omits the segment |
| `required` | class `required` | throw. There is no key |
| `build id` | `build-info.ts`'s source `buildId`, then another id | `dev`, then that id. Bit 12's `flare()` writes the manifest's id into that module in production |
| `no callback` | the module's exports | there is no function that accepts an author key |

### `server/cache/write.test.ts`

| test | case | result |
| --- | --- | --- |
| `render completes before store` | a stored page whose component reads a suspense query under `<Loading>`, the query resolving 50 ms after the shell | the stored body holds the resolved boundary's fragment and its `$R` resolution, not the fallback, and a hit hydrates to the value with no client request (BUGS.md B15) |
| `stream defer stays a hole` | the same page plus a Flare `"stream"` defer | the defer's boundary is stored as the fallback hole and the query's boundary as resolved |
| `incomplete render not stored` | a suspense query that never settles, the clock advanced past 10 s after the shell | nothing is written, the response is `private, no-store`, and one `warn` names the route id |
| `prerender incomplete fails` | prerender of a page with a never-settling query | the build fails and names the route |
| `2xx complete` | 200, body contains `<html>` and `</body>` | written |
| `401` | 401 | not written |
| `403` | 403 | not written |
| `404` | 404 | not written |
| `redirect` | 302 | not written |
| `incomplete` | 200, body is `<div>` | not written |
| `data not ok` | the document is 200 and the data variant failed | not written |
| `storedAt` | the render started at T and finished at T+5s | `storedAt` is T |
| `ttl` | `revalidate: "60s"` | TTL is 120s |
| `ttl cap` | `revalidate: "30d"` | TTL is 24h |
| `ssr ttl` | `ssr: { ttl: "60s" }` | TTL is 60s, not 120s |
| `ssr ttl missing` | `ssr: {}` | does not type-check. Untyped, the server throws when it loads that chain, before any render, and the request is a 500 that names the route. The check is server-side so createPage carries no bytes for it |
| `stale over ttl` | `staleTime` greater than `ttl` | the server throws when it loads that chain, before any render, and the request is a 500 that names the route |
| `resolved defer` | `defer: "resolve"` and a promise of `1` | the stored HTML and NDJSON contain `1` and no placeholder |
| `streamed defer` | `defer: "stream"` | the stored HTML contains the placeholder and no `c` frame. The function was not called |
| `on demand` | `isr: true` | TTL is 24h. After that the read is a miss. No refresh starts before the TTL |
| `empty object` | `isr: {}` | not rendered at build. TTL is 24h. Same expiry as `isr: true` |
| `revalidate omitted` | `isr: { params }` and no `revalidate` | rendered at build because `params` exist. TTL is 24h. After that the read is a miss. No refresh starts before the TTL. Purge still misses sooner |
| `no timing` | `ssg: true`, and a page with no `cache` | no mutable-store timing. `ssg` reads only the static seeds |
| `shared request` | a miss, a stale refresh, and a prerender | each request URL is `site` plus the canonical pathname. It has no search and no request headers. The stored body is the body served for that miss |
| `location stripped` | the render set `Location` | the stored headers have no `Location` |
| `security stripped` | the render set `Content-Security-Policy` | the stored headers do not contain it |
| `host` | the request `Host` is `evil` and `site` is `https://example.com` | the stored body contains `https://example.com` and does not contain `evil` |
| `sentinel` | the rendered body has `nonce="abc"` and the state field `abc` | the stored body has the entry's sentinel in both places, and the entry records that sentinel |
| `entry tags` | `ssr.tags` `["posts", "home"]`, a `cdn.tags` function of params, and an absent source | `posts`, `home`, `post:7`: resolved with the raw params and deduped |

### `server/auth/gate.test.ts` and `server/loaders/run.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| gate `optional anonymous` | the same chain as a data request, and as a run that is not shared | the data request reads the store too (02-system step 11). A run that is not shared reads nothing. The read's result rides on the proceed result as `looked` |
| run `order` | a shared run of a document, a data, and a prefetch request | validate, authenticate, preloader, authorize, then the store read, for all three. A run that read the store runs no loader: the caller serves the hit, or renders the miss on the shared request |

### `client/navigation/navigate.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `stale data` | a stored NDJSON that carries the `l` frame of a page the client sent in `_flare_stale` | the landed frame wins over the cached match |

### `server/cache/serve.test.ts`

| test | case | result |
| --- | --- | --- |
| `no store` | a shared public page and no `store` | a live render of the real request, the public header, and no `flare-cache` |
| `data miss` | a data request for a stored page, then a prefetch | the data request runs the shared render and serves the NDJSON it stored, with `flare-cache: miss` and the public header. The prefetch is a hit on that same entry |
| `not stored` | the shared render throws `notFound()`, or the render throws before the shell | the document is 404 or 500, the data variant 404, and nothing is written |
| `rejected resolve` | a `"resolve"` value rejects | the document and the data variant leave `private, no-store`, and nothing is written |
| `render location` | a request `/p?secret=alice` to a stored page whose render prints `useLocation()` | the stored HTML and the served miss show search `{}`. The render, not only the loaders, runs on the shared request |
| `server context` | `serverContext` reads the request's `Cookie`, the request sends `user=alice`, and the loader and the render print `serverCtx()` | the stored and served bodies hold the value for a request with no headers. `serverContext` runs again for the shared request, with the same `env` |
| `miss as hit` | a document miss | its body is the entry's HTML with the entry's sentinel replaced by this request's nonce, the same bytes a hit would serve, and its nonce attributes equal the CSP header's |
| `long shell` | a page whose shell is larger than one stream chunk | the stored and served HTML end with `</html>`. The shell is read until `</html>`, not as one chunk |
| `shared context throws` | `serverContext` throws for the shared request, which has no cookie, and not for the visitor's | the visitor's request renders live, with no `flare-cache`, and nothing is written |

### `server/cache/read.test.ts`

| test | case | result |
| --- | --- | --- |
| `concurrent miss` | 8 overlapping misses of one key, with a store whose `set` resolves late | one render, one write, and all 8 bodies from that render; each answers `flare-cache: miss` (BUGS.md B31) |
| `miss after render` | a request whose lookup ran before another flight's write landed, arriving after that render settled | it renders nothing and serves the stored entry as `flare-cache: hit` (BUGS.md B33) |
| `slot frees after write` | a flight's write settles; a render that throws; a write that throws | a later stale refresh starts a new flight in each case, so no slot is left held |
| `hit` | a fresh entry | status 200, the body, and `flare-cache: hit`. Loaders and `.headers()` do not run |
| `miss` | no entry | the rendered body, and `flare-cache: miss` |
| `tombstone` | a tombstone newer than `storedAt` | miss |
| `epoch` | a tag epoch newer than `storedAt` | miss |
| `expired` | `storedAt + ttl` is in the past | miss |
| `stale serves` | `staleTime` has passed and `ttl` has not | the stored body is served and a re-render starts |
| `no replay` | the stored record is hand-built with `Location` and a CSP | the hit response has neither |
| `replay` | a stored `X-Robots-Tag` and a stored `Set-Cookie` | `X-Robots-Tag` is replayed. `Location`, `Set-Cookie`, and the security headers are not. Finalize sets the security headers. A shared response with no `cdn.maxAge` is `Cache-Control: private, no-store` |
| `refresh fails` | the background refresh throws | the previous entry stays. The in-flight slot is cleared |
| `no etag` | a hit, and the request sends `If-None-Match` | status 200. No `ETag`. The conditional header is ignored. A stale serve is still `flare-cache: hit` |
| `hit nonce` | the stored body contains `__FLARE_NONCE__` and this request's nonce is `def` | the sent body has `def` in the nonce attributes and in the state field, and the CSP header contains `def` |
| `bad record` | a store record whose data is not a stored page: not an object, a field of the wrong type, an unknown `render`, headers that are not a list | a miss. Header pairs that are not two strings, and security values that are not a string or `false`, are dropped |

### `server/cache/nonce.test.ts`

| test | case | result |
| --- | --- | --- |
| `attribute` | `nonce="abc"` rewritten from `abc` to the sentinel | the attribute is the sentinel |
| `quotes` | the attribute is single-quoted | the same replacement |
| `text` | a text node whose text is `abc` | the text stays `abc` |
| `other attr` | `id="abc"` | the attribute stays |
| `state field` | the state assignment contains `"nonce":"abc"` | that field is the sentinel |
| `round trip` | the sentinel rewritten to `def` | attributes and the state field are `def` |
| `strip` | the sentinel rewritten to empty | the nonce attributes are removed and the state field is `""` |
| `per entry` | two writes of the same page | two different sentinels, each 16 random bytes in hex with a fixed prefix. A constant sentinel would let stored content carry it |
| `planted sentinel` | stored content (raw HTML from loader data) holds `<script nonce="__FLARE_NONCE__">` or a nonce attribute holding another entry's sentinel | on a hit that attribute is unchanged. Only the entry's own sentinel becomes the hit nonce, so stored markup can never be granted the CSP nonce |

### `server/cache/scrub.test.ts`

| test | case | result |
| --- | --- | --- |
| `no cookie` | the populate request | `cookie` is null and `authorization` is null |
| `anonymous render` | an optional-auth page | the stored body is the anonymous render |
| `shell chunks` | `shellOf` over a stream that splits the shell across chunks and then closes with a late boundary template after `</html>`, a root with no `<html>`, a stream that ends first, and a stream still open 10 s after `</html>` (fake timers) | the whole body including the late template, the first chunk alone, what was sent, and `undefined` for the one still open (revised by BUGS.md B15: a stored body is the completed render) |

### `server/cache/seed.test.ts`

| test | case | result |
| --- | --- | --- |
| `valid` | `seed: true`, `renderedAt`, `tags` | accepted |
| `no flag` | the same without `seed: true` | refused |
| `no tags` | `seed: true` and the `tags` key is absent | refused |
| `empty tags` | `seed: true` and `tags: []` | accepted |
| `purged beats seed` | a purge `get` returns `{ data: { tombstone: true }, storedAt }` and an ISR seed whose `renderedAt` is not greater | the seed is not served. It is served only when `renderedAt` is greater than that `storedAt` |
| `absent slug` | an SSG request whose slug `params()` did not return | 404 |
| `missing file` | a listed slug whose seed file is missing | one live render. The body is not written to the asset store |
| `ssg ignores tombstone` | an SSG seed and a newer tombstone in the mutable store | the SSG read returns the seed |
| `listed slugs` | a page's `params()` list, against a catch-all, a param the URL lacks, and two params; `isr` with and without `dynamicParams: false`; no list | a listed entry matches when each of its own params equals the URL's, a catch-all by its joined segments. `isr` checks only under `dynamicParams: false`. No list takes any slug |
| `seed epochs` | an ISR seed with no file, one no newer than the store's record, one a key epoch or a tag epoch passed, and one with no tags | no stand-in for the first two. The epochs purge it. A seed with no tags is checked against the key epoch alone |
| `ssg authorize` | an SSG page whose `authorize` returns `false`, with its seed present | 403. `authorize` runs before a static seed is read, as before a stored one (B73) |

### `server/cache/tombstone.test.ts` and `epoch.test.ts`

| test | case | result |
| --- | --- | --- |
| `key purge` | `revalidate({ keys: [key] })` | a tombstone for that key, and the key's own epoch `epoch:key:<key>` set to now |
| `purge during render` | a shared render starts at T0, `revalidate({ keys: [key] })` runs at T1, then the render writes its entry with `storedAt` T0 | the next read is a miss: the key's epoch T1 is at or after T0. A late write cannot undo a purge |
| `delete writes` | `delete(key)` on a mutable store | a tombstone for that key. The next `get` returns `{ data: { tombstone: true }, storedAt }`, not null |
| `tag purge` | `revalidate({ tags: ["p"] })` | gets and sets `epoch:p`, a number. `revalidate` does not call `deleteByTags` |
| `get cost` | a read of an entry with two tags | one get for the key and one for its own epoch, in parallel, then one per tag: four gets, and no list operation |
| `epoch newer` | an entry at `storedAt` 100 and its tag's epoch at 99, then at 100 | not purged, then purged. A tie is purged: a purge in the render's start millisecond may follow the data read, and one extra render is the safe cost. A missing key is a miss, and an entry with no tags is never purged by an epoch |

### `server/cache/memory.test.ts`

| test | case | result |
| --- | --- | --- |
| `round trip` | put then get | the entry |
| `isolated` | two stores | a write to one is invisible to the other |
| `ttl` | `set` with a ttl of 1000 ms | the entry is read until 1000 ms have passed, then the read is a miss |

### `server/cache/inflight.test.ts`

| test | case | result |
| --- | --- | --- |
| `coalesce` | two misses of the same key | one render |
| `different keys` | two keys | two renders |
| `annotation` | the module | the map carries `// per-process-constant: in-flight renders` |

### `server/cache/revalidate.test.ts`

| test | case | result |
| --- | --- | --- |
| `same store` | the handler's store and `createRevalidateFn(store)` | a purge is visible to the next read |
| `background` | a purge started during a request | the promise is passed to `background`, which the adapter gives to `waitUntil` |
| `empty` | `revalidate({})` | throw at the call |
| `no tiers` | `revalidate({ tags: ["p"], tiers: ["cdn"] })` | throw. `tiers` is not a field |

### `server/context/ctx.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `scope store` | `withServerContext` given a store and a waitUntil, and given neither | the scope returns that store and hands that waitUntil the promise. Without them there is no store, and a rejected background promise settles without a crash |

### `adapters/stores/fs/store.test.ts`

| test | case | result |
| --- | --- | --- |
| `dir` | no argument | the directory is `.flare/cache` under the cwd |
| `no collision` | keys `a/b` and `a_b` | two files |
| `backslash` | a key containing `\\` | stored and read back. The file name is the SHA-256 hex of the key, so no key character reaches the file system |
| `long key` | a 1,000-byte key | stored and read back under a 64-character file name, not truncated |
| `case` | keys `static:b:p:ABC` and `static:b:p:abc` | two files, and each reads back its own entry. A case-insensitive file system (APFS, NTFS) cannot merge them |
| `key check` | a file whose record holds another key | a miss. The record stores its key, and a read whose key differs is not served |
| `ttl and purge` | `set` with a ttl, then `delete`, `deleteByKeys`, and `deleteByTags` | the entry expires on read. `delete` and `deleteByKeys` write tombstones. `deleteByTags` bumps the tag's epoch and lists no file |
| `unreadable` | the key's file is a directory | the read rejects. Only a missing file is a miss |

### `adapters/stores/fs/assets.test.ts`

| test | case | result |
| --- | --- | --- |
| `inside` | `root/a.txt` | the bytes |
| `missing` | a path inside `root` that is not a file | `null` |
| `escape` | `root/../secret` | throw |
| `unreadable` | a file the process may not read | the read rejects. A missing file, a directory, and a path under a file are `null` |

### `shared/cache/artifact-path.test.ts`

| test | case | result |
| --- | --- | --- |
| `about` | key `static:b:_root_/about`, build `b`, default base | `/assets/_flare-static/b/<sha256 hex of "_root_/about">.json` |
| `params` | key `static:b:home:042` | `/assets/_flare-static/b/<sha256 hex of "home:042">.json` |
| `case` | tails `p:ABC` and `p:abc` | two different paths, so a run on a case-insensitive file system writes two files |
| `other build` | the key's build id is `other` | `null` |
| `empty tail` | key `static:b:` | `null` |
| `one segment` | a route id containing `/` | the path after the build id contains no raw `/` and no raw `..` |

### `server/cache/assets.test.ts`

| test | case | result |
| --- | --- | --- |
| `workers read` | `read` returns a 200 `Response` of a valid seed | the entry's `storedAt` is `renderedAt`, and `read` was called with the artifact path |
| `node read` | `read` returns the `Uint8Array` from `fileAssets` | the same entry |
| `not ok` | `read` returns a 404 `Response` | `null`, and the body was cancelled |
| `other build` | the key names a different build | `null`, and `read` is not called |
| `bad seed` | the JSON has no `seed: true` | `null` |
| `read only` | `set`, `delete`, `deleteByKeys`, `deleteByTags` | each rejects, and the message says read-only |
| `custom base` | `base: "/cdn/_flare-static"` | `read` is called under that prefix |
| `bad base` | `base` contains `..`, a query, a hash, or a trailing slash | throw when the store is created |

### `adapters/stores/cache-api/store.test.ts`

| test | case | result |
| --- | --- | --- |
| `round trip` | a fake `caches` object | put and get |
| `no list` | the module source | it does not call `keys()` |
| `tombstone in cache` | a purge | `get` returns the tombstone object and does not list keys. The cache layer does not serve it |
| `global caches` | no `caches` option | the store opens the global `caches` |

### `lint/boundaries.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `node adapters` | a `node:fs` import in `adapters/node/`, `adapters/stores/fs/`, `adapters/workers/`, and `adapters/stores/cache-api/` | the first two pass, the last two fail. An adapter may use its own runtime's builtins (00-rules) |

### `tests/workerd/cache-api.test.ts`

| test | case | result |
| --- | --- | --- |
| `real cache` | put, purge by tag, get | the get misses |

### `tests/integration/cache.test.ts`

| test | case | result |
| --- | --- | --- |
| `401 not stored` | an ISR page under an auth layout, no session | 401, a second request runs authenticate again |
| `authorize before hit` | a shared route with `authorize` returning `false`, and a stored body | 403 on the document and on the data URL. The stored body is not served. An `authorize` returning `true` reaches the read, and the hit is served |
| `hit without authorize` | a shared route with no `authorize`, and a stored body | the stored body is served |
| `anonymous stored` | an optional-auth ISR page | the second request is a hit and the body has no session text |
| `two users` | two `Authorization` values | neither hit contains the other's token |
| `not found` | an unknown slug on `dynamicParams: false` | 404 on the document and on the data URL. A second request is still 404 from the router, not a stored 200 |
| `purged listed` | a listed slug whose tombstone is newer | a live render, and the body may be stored again |
| `set-cookie` | a shared page that sets a cookie | the response is private and the store spy is not called |

### `shared/components/use-deferred.test.ts`

| test | case | result |
| --- | --- | --- |
| `live value` | a live document render of a page that reads a `"stream"` value through `useDeferred`, the value resolving after the shell | the value is streamed into the document by Solid. No `ssrSource: "client"` boundary is emitted |
| `stored hole` | a stored render of the same page, so the value is a hole | the stored HTML holds the `<Loading>` fallback as a client boundary, and hydration completes (`_$HY.done`) with the hole still pending. Resolving the promise on the client renders the value |
| `plain value` | `useDeferred` given a plain `Deferred` instead of an accessor | does not type-check. Its parameter is `() => Deferred<T>` only |

### The fill request (extended)

| test | case | result |
| --- | --- | --- |
| classify `fill kind` | `?_flare=fill` | kind `fill` |
| state `fill flag` | `stateScript` with and without `fill: true` | the field is written only when true |
| answers `fill no-store` | `?_flare=fill` on a stored `isr` page whose defer is `"stream"` | the function runs, `private, no-store`, no `flare-cache`, and the store is neither read nor written |
| create-client `fill on hydrate` | a state with `fill: true` | one `?_flare=fill` request of the same URL, and no history entry |
| navigate `fill on hole landing` | a data landing whose `d` leaves a placeholder unsettled | one `?_flare=fill` revalidation of the same URL after the commit, and no history entry beyond the navigation's |
| navigate `no fill after leaving` | the holed landing's `d` arrives after the user navigated away | no fill request |
| request `fill request` | a fill trip carrying the slots a revived hole left | the request asks `?_flare=fill`, and its `c` frame resolves the promise the first value held |
| response `stored stream stays a hole`, `isr stream stays a hole` (extended) | a stored run's unrun `"stream"` value | its placeholder carries `hole: true` |

### `tests/e2e/navigation.test.ts` (extended)

Moved from bit 06. It adds a page under `minimal` whose cache config leaves `/` and `/about` unchanged. It does not add an app.

| test | case | result |
| --- | --- | --- |
| `stored stream fills` | a stored page whose defer mode is `stream`, read through `useDeferred` | the HTML has the fallback, then one `no-store` `?_flare=fill` request fills it, and the value renders with no console error |
| `live stream ssr` | the same page with no store | the value is in the document HTML with no fill request |
| `stored hit hydrates` | a second load of a stored page whose `"resolve"` defer sits under two nested `<Loading>` boundaries | the hit's HTML holds the value, the page hydrates with no console error or hydration warning, and a client navigation away and back works |

## Done

A 401 cannot be read back as a 200. A second user cannot receive the first user's body. Purge does not depend on listing keys.
