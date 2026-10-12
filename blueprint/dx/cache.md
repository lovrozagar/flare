# Cache

`.cache()` accepts exactly one of `ssr`, `ssg`, `isr`. All three at once, or any pair, does not type-check (`chain.test.ts` `one mode`). Omitting all three means the route is rendered per request and stored nowhere.

`cdn` and `client` may be set beside the one mode, or alone. Alone, with no mode, the document is `no-store` and `cdn` only affects a response that some other decision marked `shared`. In practice that means `cdn` without a mode does nothing. The test `server/cacheability/decide.test.ts` `cdn without a mode` expects `no-store`.

There is no `csr` key (B66).

## ssr

A live render stored in the `FlareStore` passed to `createServer({ store })`.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `ttl` | yes | — | duration | the entry is stored for this long. After it, the next request is a miss | omitting `ttl` throws at the call. A store with no expiry was the entry that could not be purged | `server/cache/write.test.ts` `ttl` |
| `staleTime` | no | `0` | duration, `0` to `ttl` | after this, a hit still serves the body and re-renders in the background. The served body stays until the re-render finishes | `staleTime` greater than `ttl` throws | `server/cache/read.test.ts` `stale serves` |
| `tags` | no | `[]` | `string[]` or `(ctx: { params }) => string[]` | tag purge bumps these epochs | a function that reads the request is a build error. The argument is `params` only | `server/cache/epoch.test.ts` `tag purge` |
| `defer` | no | `"resolve"` | `"resolve"`, `"stream"` | see `defer.md` | | `server/cache/write.test.ts` `resolved defer` |

There is no `key` function. The framework builds the key (B32, B86). It is `static:<build>:<routeId>:<rawParams>`. Route-order param values are joined with `/`. The order is the route's declared params, not the record's key order. Every declared param keeps its slot, and an absent optional is the empty string, so `/static/x` and `/x/static` on `/[[a]]/static/[[b]]` cannot share a key. A catch-all joins its segments with `/`. A route that declares no params omits that last segment. `/` and `%` inside a value are percent-encoded. There is no identity class. A `key` field does not type-check (`chain.test.ts` `no author key`; `server/cache/key.test.ts` `shape`, `catch all`, `encode`).

## ssg

Rendered at `vite build`. The build fails, and names the route, when this route exists and `prerender` is omitted or `false` (`vite/prerender/run.test.ts` `prerender off`). The files ship with the client assets, under `<assetsBase>/_flare-static/<buildId>/`. The server reads them from `createServer({ static })`, which is `createAssetsStore` (`store.md`). Without `static`, the route renders per request and the server warns once (`vite/prerender/run.test.ts` `no static store`).

| form | when | outcome |
| --- | --- | --- |
| `true` | the route has no dynamic segment, or it inherits `params` from a parent | one page |
| `{ defer? }` | same | `defer` defaults to `"resolve"` |
| `(ctx) => params[]` | the route has a dynamic segment | shorthand for `{ params }` |
| `{ params, defer? }` | the route has a dynamic segment | `params` is required |

`params` is `(ctx: { params }) => FlatParams[] | Promise<...>`. The parent params are in `ctx.params`. A dynamic segment without `params`, and without a parent that provides them, is a build error (`vite/prerender/run.test.ts` `missing params`).

A static route is not revalidated on a timer. Purge does not apply. `revalidate` does not delete files under `_flare-static`. The next deploy replaces the files because the directory includes the build id. The seed's `tags` field is `[]` when the route declares none, and that build succeeds (`vite/prerender/artifacts.test.ts` `empty tags`). On a request, SSG checks the chain's `params()` and 404s when the slug is absent. A listed slug whose seed file is missing renders once and is not written to the asset store (`server/cache/seed.test.ts` `absent slug`, `missing file`). `authorize` anywhere on the chain fails prerender and names the route. `authenticateOptional` without `authorize` still prerenders the anonymous body (`vite/prerender/run.test.ts` `authorize`, `optional auth`).

## isr

| form | outcome | test |
| --- | --- | --- |
| `true` | on-demand. Not rendered at build time. Stored on the first request. TTL is 24h. That TTL is a real miss, and nothing background-refreshes before it. Tag or key purge still misses sooner | `server/cache/write.test.ts` `on demand` |
| `{}` | the same as `true` | `server/cache/write.test.ts` `empty object` |
| `{ revalidate?, defer?, params?, dynamicParams? }` | an omitted `revalidate` uses the 24h TTL and is rendered at build only when `params` exist. `isr: {}` has no `params`, so it is on-demand. A set `revalidate` means TTL is `revalidate * 2`, capped at 24h, and `stale` begins at `revalidate`. The route is still rendered at build only when `params` exist | `server/cache/write.test.ts` `ttl`, `ttl cap`, `revalidate omitted` |

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `revalidate` | no | absent | duration | see the form table | | |
| `defer` | no | `"resolve"` | `"resolve"`, `"stream"` | `defer.md` | | `server/cache/write.test.ts` `resolved defer` |
| `params` | required when the pattern has a dynamic segment and the route is rendered at build time | — | the same function as SSG | the slugs that are built | `isr: true` and `isr: {}` skip the build, so `params` is not required there. An omitted `revalidate` is built only when `params` exist | `vite/prerender/run.test.ts` `200` |
| `dynamicParams` | no | `true` | boolean | `false`: a slug `params()` did not return is 404 and is not stored. A purged listed slug renders live and may be stored again. `true`: an unlisted param is a live render and may be stored under the ISR rules | `false` plus a stored 404 was the bug. v1 never stores the 404. Document and data both use the normal 404 | `tests/integration/cache.test.ts` `not found`, `purged listed` |

An ISR page under a required-auth layout is `no-store`. The build fails if prerender was going to render it (`vite/prerender/run.test.ts` `401`).

## cdn

Applied only when the policy is `shared` and the class is `public` (How the decision is made, below).

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `maxAge` | no | absent | duration | `Cache-Control: public, max-age=0, s-maxage=<seconds>, stale-while-revalidate=<swr>`. Browsers revalidate. The CDN holds the copy | `max-age=0` is deliberate so a deploy reaches the browser | `server/lifecycle/policies.test.ts` `header` |
| `swr` | no | `0` | duration | the `stale-while-revalidate` seconds | | same |
| `private` | no | `false` | boolean | `true` forces policy `private` and `Cache-Control: private, no-store` | this wins over `ssr` / `isr` | `server/cacheability/decide.test.ts` `cdn private` |
| `tags` | no | `[]` | `string[]` or `(ctx: { params }) => string[]` | sent as `Cache-Tag`, comma-separated | there is no `vary` field. Variants are URLs | `server/lifecycle/policies.test.ts` `cache tag`; `server/cacheability/variant.test.ts` `no vary` |
| `allowCookies` | no | `false` | boolean | `false`: a `Set-Cookie` on this response downgrades it to `private` and it is not stored. `true`: the response stays shared and may be stored, but the cookie is stripped from the entry and never replayed on a hit. Only the miss that set it sends it | `true` is how a locale cookie poisoned a CDN. Leave it false | `server/cacheability/cookies.test.ts` |

### How the decision is made

`decide` covers a rendered page: its document, data, and prefetch responses. All three take one decision, and each is its own URL, so each is its own CDN entry (`variant.test.ts` `three urls`). A `.response()` page, a server function (B43), and a mount are outside it.

| input | decision | test |
| --- | --- | --- |
| no `ssr`, `ssg`, or `isr` on the page | `no-store` | `decide.test.ts` `no config` |
| a mode, and the chain neither requires nor reads auth (B26) | `shared`, class `public` | `ssr public`, `isr`, `ssg` |
| a mode, and the chain requires | `no-store` (B27) | `required auth`, `isr under auth`, `ssg under auth` |
| a mode, the chain reads, and the request has no session | `shared`, class `anonymous`. The store may hold it. `Cache-Control` is still `private, no-store` and no `Cache-Tag` is sent, because Flare sends no `Vary` and a CDN cannot tell a session from none | `optional auth`; `policies.test.ts` `anonymous header` |
| a mode, the chain reads, and the request has a session | `private`. Only the anonymous answer is shared (B27) | `optional with session` |
| `cdn.private: true` on any match of the chain | `private`. A child cannot turn it off | `cdn private`, `private sticky` |

The mode comes from the page. A mode on a layout or a root layout does not store the pages under it. `cdn` on a layout, a root layout, or a segment is a default for the pages under it. The chain merges each field from the root to the page, and the nearer match wins, except `private` (`decide.test.ts` `segment cdn`). That is why a segment's `cache` holds only `cdn`.

The public header (`public, max-age=0, s-maxage=…`, plus `Cache-Tag`) is sent only for class `public` with `cdn.maxAge`. Everything else is `private, no-store`. These also send `private, no-store`, whatever the decision:

- a status that is not 2xx (`policies.test.ts` `error status`);
- a data or prefetch response that carries an `e` frame or a redirect, because it stays HTTP 200 (B73) (`data error frame`);
- a `Set-Cookie` the route did not set, such as one a middleware added after the page stage, even with `allowCookies` (`cookies.test.ts` `late cookie`). `allowCookies` covers only the route's own `.headers()` cookies.

A public answer, document or data, is sent only after every deferred value it started has settled, whatever `documentResponseDefer` says. A rejection is an error frame, so the answer leaves `private, no-store`. A CDN copy never holds a hole or a deferred error, and a CDN hit serves it without that wait (`answers.test.ts` `public waits`, `deferred rejection`). A `"stream"` deferred is not run in a shared render from bit 10 on (`defer.md`), so it adds no wait there.

`.headers()` cannot set `Cache-Control` or `Cache-Tag` on a rendered page. The decision overwrites them, as finalize does the security headers (`policies.test.ts` `headers cannot`). A `.response()` page keeps the `Cache-Control` of the `Response` it returns, except on a chain that requires or reads auth, where it is `private, no-store`, as B43 does for a server function (`policies.test.ts` `response auth`).

A `tags` function on `cdn` receives the raw params, the values the store key uses (B32).

## client

The in-memory match cache. `false` turns it off for that route.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `staleTime` | no | the router's, which is `0` | duration | a cached match younger than this is reused and no data request is sent | `0` means every navigation hits the server | `client/router/match-cache.test.ts` `stale time` |
| `gcTime` | no | the router's, which is `"5m"` | duration | the entry is dropped after this with no read | | `client/router/match-cache.test.ts` `gc` |
| `prefetch` | no | the router's `prefetch` | `link.md` | the route layer of prefetch precedence | a string sets both `modules` and `data`. It does not mean "modules only" | `client/navigation/prefetch.test.ts` `route string` |
| `prefetchStaleTime` | no | `"30s"` | duration | how long a prefetched data entry is fresh, on its own clock. A navigation that uses the entry turns it into a normal entry on `staleTime`. The default does not follow `staleTime`: with `staleTime` 0, a completed intent prefetch would be stale before the click and the opt-in would do nothing | | `client/navigation/prefetch.test.ts` `prefetch stale` |
| `prefetchGcTime` | no | `gcTime` | duration | how long a prefetched entry is kept | | same |
| `cacheDeferred` | no | `false` | boolean | `false`: a match that still contains a deferred placeholder is never reused. Back-navigation refetches. `true`: once the `c` frame fills the value, the match is cached like any other | `true` plus a placeholder that never resolves shows the fallback forever on back | `client/router/match-cache.test.ts` `deferred placeholder` |

## What gets stored

A shared write happens only when the status is 2xx, the document contains `<html>` and `</body>`, the data response for that URL is ok, the chain is allowed to be stored, and every `resolve` defer has settled. Redirects, 401, 403, 404, and incomplete bodies are not stored (`server/cache/write.test.ts` `401`, `403`, `404`). `Location` and security headers are not stored. The origin in the body is `createServer({ site })`, never the request `Host`.

Every shared render, including a miss, a stale refresh, and prerender, requests `site` plus the canonical pathname. The request has no search and no request headers. The body stored is the body served for that miss. A page whose HTML depends on search or headers is private. The store key has no search slot (`server/cache/key.test.ts` `shape`; `server/cache/write.test.ts` `shared request`).

SSG reads only the static seed and ignores tombstones (`server/cache/seed.test.ts` `ssg ignores tombstone`). `delete` on the mutable store writes a tombstone (`tombstone.test.ts` `delete writes`). A purge `get` returns `{ data: { tombstone: true }, storedAt }`, not null. An ISR seed is served only when its `renderedAt` is greater than that `storedAt` (`purged beats seed`). A tag purge gets and sets `epoch:<tag>`, a number. `revalidate` does not call `deleteByTags` (`epoch.test.ts` `tag purge`).

A stored hit is always 200. `If-None-Match` is ignored and no `ETag` is sent. A stale serve is `flare-cache: hit`. A failed background refresh keeps the previous entry and clears the in-flight slot (`server/cache/read.test.ts` `hit`, `stale serves`, `refresh fails`). A hit does not run loaders or `.headers()`. It replays stored headers except `Location`, `Set-Cookie`, and the security headers. Finalize sets those. A shared response with no `cdn.maxAge` is `Cache-Control: private, no-store` (`read.test.ts` `replay`, `no etag`).

Tests: `server/cache/write.test.ts` and `tests/integration/cache.test.ts`.
