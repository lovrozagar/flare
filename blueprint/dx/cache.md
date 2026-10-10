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

There is no `key` function. The framework builds the key (B32, B86). It is `static:<build>:<routeId>:<rawParams>`. Route-order param values are joined with `/`. A catch-all joins its segments with `/`. Empty params omit that last segment. `/` and `%` inside a value are percent-encoded. There is no identity class. A `key` field does not type-check (`chain.test.ts` `no author key`; `server/cache/key.test.ts` `shape`, `catch all`, `encode`).

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

Applied only when the policy is `shared`.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `maxAge` | no | absent | duration | `Cache-Control: public, max-age=0, s-maxage=<seconds>, stale-while-revalidate=<swr>`. Browsers revalidate. The CDN holds the copy | `max-age=0` is deliberate so a deploy reaches the browser | `server/lifecycle/policies.test.ts` `header` |
| `swr` | no | `0` | duration | the `stale-while-revalidate` seconds | | same |
| `private` | no | `false` | boolean | `true` forces policy `private` and `Cache-Control: private, no-store` | this wins over `ssr` / `isr` | `server/cacheability/decide.test.ts` `cdn private` |
| `tags` | no | `[]` | `string[]` or `(ctx: { params }) => string[]` | sent as `Cache-Tag`, comma-separated | there is no `vary` field. Variants are URLs | `server/lifecycle/policies.test.ts` `cache tag`; `server/cacheability/variant.test.ts` `no vary` |
| `allowCookies` | no | `false` | boolean | `false`: a `Set-Cookie` on this response downgrades it to `private` and it is not stored. `true`: the cookie is stored with the shared body | `true` is how a locale cookie poisoned a CDN. Leave it false | `server/cacheability/cookies.test.ts` |

## client

The in-memory match cache. `false` turns it off for that route.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `staleTime` | no | the router's, which is `0` | duration | a cached match younger than this is reused and no data request is sent | `0` means every navigation hits the server | `client/router/match-cache.test.ts` `stale time` |
| `gcTime` | no | the router's, which is `"5m"` | duration | the entry is dropped after this with no read | | `client/router/match-cache.test.ts` `gc` |
| `prefetch` | no | the router's `prefetch` | `link.md` | the route layer of prefetch precedence | a string sets both `modules` and `data`. It does not mean "modules only" | `client/navigation/prefetch.test.ts` `route string` |
| `prefetchStaleTime` | no | `staleTime` | duration | how long a prefetched data entry is fresh | | `client/navigation/prefetch.test.ts` `prefetch stale` |
| `prefetchGcTime` | no | `gcTime` | duration | how long a prefetched entry is kept | | same |
| `cacheDeferred` | no | `false` | boolean | `false`: a match that still contains a deferred placeholder is never reused. Back-navigation refetches. `true`: once the `c` frame fills the value, the match is cached like any other | `true` plus a placeholder that never resolves shows the fallback forever on back | `client/router/match-cache.test.ts` `deferred placeholder` |

## What gets stored

A shared write happens only when the status is 2xx, the document contains `<html>` and `</body>`, the data response for that URL is ok, the chain is allowed to be stored, and every `resolve` defer has settled. Redirects, 401, 403, 404, and incomplete bodies are not stored (`server/cache/write.test.ts` `401`, `403`, `404`). `Location` and security headers are not stored. The origin in the body is `createServer({ site })`, never the request `Host`.

Every shared render, including a miss, a stale refresh, and prerender, requests `site` plus the canonical pathname. The request has no search and no request headers. The body stored is the body served for that miss. A page whose HTML depends on search or headers is private. The store key has no search slot (`server/cache/key.test.ts` `shape`; `server/cache/write.test.ts` `shared request`).

SSG reads only the static seed and ignores tombstones (`server/cache/seed.test.ts` `ssg ignores tombstone`). `delete` on the mutable store writes a tombstone (`tombstone.test.ts` `delete writes`). A purge `get` returns `{ data: { tombstone: true }, storedAt }`, not null. An ISR seed is served only when its `renderedAt` is greater than that `storedAt` (`purged beats seed`). A tag purge gets and sets `epoch:<tag>`, a number. `revalidate` does not call `deleteByTags` (`epoch.test.ts` `tag purge`).

A stored hit is always 200. `If-None-Match` is ignored and no `ETag` is sent. A stale serve is `flare-cache: hit`. A failed background refresh keeps the previous entry and clears the in-flight slot (`server/cache/read.test.ts` `hit`, `stale serves`, `refresh fails`). A hit does not run loaders or `.headers()`. It replays stored headers except `Location`, `Set-Cookie`, and the security headers. Finalize sets those. A shared response with no `cdn.maxAge` is `Cache-Control: private, no-store` (`read.test.ts` `replay`, `no etag`).

Tests: `server/cache/write.test.ts` and `tests/integration/cache.test.ts`.
