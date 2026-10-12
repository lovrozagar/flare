# Bit 10 — Cache

Creates every `P10` row. One write function. Memory, filesystem, and Cache API stores. The gate from bit 04 and the policy from bit 09 are what this bit obeys.

## Extends

`src/exports/server.ts` re-exports `revalidate`, `createRevalidateFn`, `FlareStore`, `createMemoryStore`, and `createAssetsStore`.

`server/lifecycle/create.ts` calls the read path only when the policy is `shared`.

`tests/integration/nonce.test.ts` gains `stored sentinel` and `hit matches`. The stored bytes contain the entry's sentinel and do not contain the first request's nonce in a nonce attribute or in the state field. The hit body's nonce attributes and `self.flare.nonce` equal the hit's CSP nonce. `text kept`: a text node equal to the first nonce is unchanged.

### `server/lifecycle/create.test.ts` (extended)

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
| `build id` | no `FLARE_BUILD_ID` defined, then one defined | `dev`, then the defined id. Bit 12's `flare()` defines it in production |
| `no callback` | the module's exports | there is no function that accepts an author key |

### `server/cache/write.test.ts`

| test | case | result |
| --- | --- | --- |
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

### `server/cache/read.test.ts`

| test | case | result |
| --- | --- | --- |
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

### `server/cache/tombstone.test.ts` and `epoch.test.ts`

| test | case | result |
| --- | --- | --- |
| `key purge` | `revalidate({ keys: [key] })` | a tombstone for that key |
| `delete writes` | `delete(key)` on a mutable store | a tombstone for that key. The next `get` returns `{ data: { tombstone: true }, storedAt }`, not null |
| `tag purge` | `revalidate({ tags: ["p"] })` | gets and sets `epoch:p`, a number. `revalidate` does not call `deleteByTags` |
| `get cost` | a read of an entry with two tags | one get for the key plus one per tag, so three gets, and no list operation |
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

### `adapters/stores/fs/store.test.ts`

| test | case | result |
| --- | --- | --- |
| `dir` | no argument | the directory is `.flare/cache` under the cwd |
| `no collision` | keys `a/b` and `a_b` | two files |
| `backslash` | a key containing `\\` | throw, nothing written |
| `long key` | a key that would exceed the filesystem name limit | throw, the key is not truncated |

### `adapters/stores/fs/assets.test.ts`

| test | case | result |
| --- | --- | --- |
| `inside` | `root/a.txt` | the bytes |
| `missing` | a path inside `root` that is not a file | `null` |
| `escape` | `root/../secret` | throw |

### `shared/cache/artifact-path.test.ts`

| test | case | result |
| --- | --- | --- |
| `about` | key `static:b:_root_/about`, build `b`, default base | `/assets/_flare-static/b/_root_%2Fabout.json` |
| `params` | key `static:b:home:042` | `/assets/_flare-static/b/home%3A042.json` |
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

### `tests/workerd/cache-api.test.ts`

| test | case | result |
| --- | --- | --- |
| `real cache` | put, purge by tag, get | the get misses |

### `tests/integration/cache.test.ts`

| test | case | result |
| --- | --- | --- |
| `401 not stored` | an ISR page under an auth layout, no session | 401, a second request runs authenticate again |
| `authorize before hit` | a shared route with `authorize` returning `false`, and a stored body | 403. The stored body is not served |
| `hit without authorize` | a shared route with no `authorize`, and a stored body | the stored body is served |
| `anonymous stored` | an optional-auth ISR page | the second request is a hit and the body has no session text |
| `two users` | two `Authorization` values | neither hit contains the other's token |
| `not found` | an unknown slug on `dynamicParams: false` | 404 on the document and on the data URL. A second request is still 404 from the router, not a stored 200 |
| `purged listed` | a listed slug whose tombstone is newer | a live render, and the body may be stored again |
| `set-cookie` | a shared page that sets a cookie | the response is private and the store spy is not called |

### `tests/e2e/navigation.test.ts` (extended)

Moved from bit 06. It adds a page under `minimal` whose cache config leaves `/` and `/about` unchanged. It does not add an app.

| test | case | result |
| --- | --- | --- |
| `stored stream fills` | a stored page whose defer mode is `stream` | the HTML has the placeholder, then a `no-store` `?_flare=fill` request fills it |
| `stored hit hydrates` | a second load of a stored page whose `"resolve"` defer sits under two nested `<Loading>` boundaries | the hit's HTML holds the value, the page hydrates with no console error or hydration warning, and a client navigation away and back works |

## Done

A 401 cannot be read back as a 200. A second user cannot receive the first user's body. Purge does not depend on listing keys.
