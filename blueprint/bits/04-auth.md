# Bit 04 — Auth and loaders

Creates every `P4` row. Effective auth is computed from the loaded modules before any store read. There is still no store; the gate's "do not store" answer is asserted by the caller, and bit 10 is what obeys it.

## Extends

`server/loaders/run.test.ts` gains the phase-order cases. `src/exports/server.ts` re-exports `serverCtx` and `withFetchDedupe`.

The route builder stores what it accepts, because `tests/integration/auth.test.ts` boots real route modules. `shared/route-builder/chain.test.ts` gains `stores in order`: `cache`, `authenticate`, `authorize`, `preloader`, `loader`, and `render` land on the record in the `dx/builder.md` order, a later method called early throws `order`, and `response` excludes `loader` both ways. It also gains `authenticate records`: `authenticate(...callerData)` records `{ mode: true, callerData }`, `authenticateOptional(...callerData)` records `{ mode: "optional", callerData }`, and calling both throws. `page.test.ts` gains `page chain`: the page record carries the stored methods, and `.response()` ends the chain with no render. `layout.test.ts` gains `layout chain`. `root-layout.test.ts` gains `root chain`: the record keeps `document: true` and the stored loader.

`shared/router/create-router.test.ts` gains `matched chain`: a tree node carries its route record as `module`, and `match()` returns `chain` root-down, the layouts whose id is the page id or a segment prefix of it, then the page. The home page `_root_/` has the root layout `_root_` and the page as two entries. It also gains `not found chain`: in `"root"` mode an unknown path's chain is the root layout only. In `"fuzzy"` mode it is the longest owning layout and its ancestors.

`create-router.test.ts` also gains `params and base path`: the router strips `basePath`, then ranks the tree with the bracket matcher from bit 01, and returns the raw params. `/app/users/42` under `/app` is `_root_/users/[id]` with `{ id: "42" }`, `/app/users/new` is the static page, and a path outside the base matches nothing. It gains `not found roots`: the root is the root layout that owns the path by its root folder, so a `[locale]/_root_` tree resolves `/en/missing` to `[locale]/_root_` and its `notFoundRender`, an `_admin_`-only tree resolves to `_admin_`, `_root_` wins a tie with another root, and a path no root owns has an empty chain. It gains `fuzzy group`: a layout id is its URL prefix, so `_root_/(blog)` owns `/post/missing` and its `notFoundRender` runs. It gains `prefixed root`: a `site/_root_` tree resolves `/missing` to `site/_root_`. `shared/route-tree/segments.test.ts` gains `id pattern`: `idPattern` is the one id-to-URL rule (`dx/routes.md`) that the router uses for layout ownership and codegen uses for `path`. The root folder (`_x_`, three or more characters) is removed, a param folder before it stays, any other folder before it is removed, and a group adds no segment. `site/_root_/about` is `/about`, `[locale]/_root_/about` is `/[locale]/about`, `_shop_/cart` is `/cart`, `_root_/(blog)/post` is `/post`, `_root_` is `/`, and `__/x` is `/__/x`.

`createServer` runs the real chain, because `tests/integration/auth.test.ts` boots it. The `page` option is gone (it was never in `dx/server.md`). The stages follow `order.ts`: canonical, `serverContext`, match, method, then validate, the gate, and the loaders inside `runLoaders`, then render and finalize. Each match that rendered paints its own `render` output in order. The `Outlet` and the walked boundary stay in bits 05 and 06. `server/lifecycle/create.test.ts` keeps `page` and `miss` on route modules, and gains `no authenticate`: a reading chain with no `authenticate` option sees a null session, and a required chain is 401. It also gains `methods`: through `createServer`, HEAD on an unknown path is 404, POST on an unknown path and on a page is 405, OPTIONS on a page is 204, and HEAD on a page is 200. The route builder also stores `.head(fn)`, so `chain.test.ts` `stores in order` and `layout.test.ts` `layout chain` include it, and the `.head()` result type `HeadConfig` (`dx/head.md`) moves to `shared/route-builder/types.ts` beside the builder. `server/auth` reads the stored record directly: `effective.test.ts` and `caller.test.ts` take `{ auth: { mode, callerData }, authorize }`, an `authorize` function by itself makes a chain read identity, and `resolveCaller` returns the app function's result. Preloader, `authorize`, and loader receive `{ auth, request, env }` (`dx/types.md`). `run.test.ts` `order` also asserts that `runLoaders` returns the rendered matches' loader data and head results. The package root exports `createLayout` and `createRootLayout` (`03-surface.md`). `create.test.ts` also gains `security on every status`: the security set is resolved once per request, before the status is known, so the 404, a 401 from a required page, a 405, and a canonical 301 carry the same `content-security-policy` and `permissions-policy` as the 200 (bit 03). It gains `state matches`: `self.flare.matches` has one B83 entry per rendered match, root down, with that match's loader data, the page's raw params (an absent optional param is left out), and the raw search. `run.test.ts` gains `policy class`: `runLoaders` returns the gate's policy class, two requests with different `Authorization` sessions on an optional chain are both `anonymous`, and a required chain is `required`. `router.match()` always returns `params`, `{}` on a miss. `tests/integration/auth.test.ts` also gains `response binary`: a `.response()` answer's bytes `0x89 0x50 0x4e 0x47 0xff 0xfe 0x00 0x80` come back identical, so the body passes through `finalize` unread and is never decoded as text. It gains `response stream`: an endless stream's first chunk can be read and the fetch resolves before the stream ends. `finalize` takes any body a `Response` accepts and stays the only `Response` constructor.

## Cases

### `server/auth/effective.test.ts`

| test | case | result |
| --- | --- | --- |
| `authenticate requires` | a page calls `authenticate()` | `{ requires: true, reads: true }` |
| `optional reads` | `authenticateOptional()` | `{ requires: false, reads: true }` |
| `authorize reads` | `authorize` with no authenticate | `{ requires: false, reads: true }` |
| `layout requires` | the page has no auth and the layout calls `authenticate()` | the chain requires |
| `hint is ignored` | the generated hint says public and the module calls `authenticate()` | the result requires |

### `server/auth/identity.test.ts`

| test | case | result |
| --- | --- | --- |
| `required` | the chain requires | class `required`, and the key builder in bit 10 will refuse to store |
| `anonymous` | the chain reads and the session is null | policy class `anonymous`. The key in bit 10 has no class segment |
| `session does not enter the key` | two different sessions on an optional chain | the same policy class `anonymous`, and the same key |

### `server/auth/caller.test.ts`

| test | case | result |
| --- | --- | --- |
| `leaf` | layout args `["a"]`, page args `["b"]` | `callerData` is `["b"]`. The app function ran once |
| `chain` | the same | `callerChain` is `[{ route, args: ["a"] }, { route, args: ["b"] }]` from the root down |
| `layout only` | the layout calls `authenticate("admin")` and the page calls neither | `callerData` is `[]`. The layout's args are on `callerChain` |
| `leaf empty` | the page calls `authenticate()` with no arguments | `callerData` is `[]` |
| `authorize only` | `authorize` and no `authenticate` | the app function runs once, `callerData` is `[]`, `callerChain` is `[]` |

### `server/auth/gate.test.ts`

| test | case | result |
| --- | --- | --- |
| `missing session` | required chain, `authenticate` returns null | 401, and the `readStore` spy is not called |
| `optional anonymous` | optional chain, null session | proceed, policy class `anonymous` |
| `response route` | `authenticate("admin").authorize(() => false).response(...)` | 403, the response function is not called |
| `response route passes` | authorize returns true | the response function is called with `auth` set |
| `authorize throw` | `authorize` throws `Error` | the loader-throw outcome, not 403. `false` stays 403 |
| `authenticate throw` | `authenticate` throws `Error` | 500, and it is not 401. `redirect()`, `notFound()`, `unauthenticated()`, and `unauthorized()` keep their status. Returning `null` is the only anonymous signal |

### `server/loaders/run.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `order` | spies on validate, authenticate, preloader, authorize, loader | that order. Validate is first. A shared route with `authorize` runs preloader and authorize before the store read |
| `auth args` | a session is present | preloader, authorize, and loader are called with that session |
| `authorize is sequential` | a parent authorize and a child loader | the loader starts after the parent authorize resolves |
| `loaders are parallel` | two loaders | both start before either resolves |
| `input failure` | the validator fails on a document | 400, `application/json`, body `{ issues, fieldErrors }`, no HTML shell, authenticate is not called, the overlay sender is not called |
| `data input` | the same failure on `_flare=data` | the same JSON, not an `e` frame |
| `preloader throw` | `preloader` throws `Error` | the loader-throw outcome. The status is not 403. A layout or root throw also fails its descendants |
| `preloader context` | the root preloader returns `{ a: 1 }`, the layout preloader `{ b: 2 }`, the page preloader `{ c: 3 }` | the root preloader and the root `authorize` receive no `preloaderContext`. The layout preloader and the layout `authorize` receive `{ a: 1 }`. The layout loader receives `{ a: 1, b: 2 }`. The page loader, the page `.response()`, and the page `.head()` receive `{ a: 1, b: 2, c: 3 }` (`dx/types.md`) |
| `preloader merge` | a parent returns `{ role: "editor", x: 1 }` and the child returns `{ role: "admin" }`. Another preloader returns `undefined` | later callbacks see `{ role: "admin", x: 1 }`: a shallow merge, outside-in, where the child key wins. An `undefined` return adds nothing. A chain with no preloader gives `{}` |

### `server/lifecycle/create.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `state preloader` | GET a page whose chain has the preloaders of `preloader context` | each `self.flare.matches` entry's `preloader` is the context accumulated through that match: `{ a: 1 }` for the root, then `{ a: 1, b: 2 }`, then `{ a: 1, b: 2, c: 3 }`. A chain with no preloader writes `{}`, not `null` (B83) |

### `server/loaders/cascade.test.ts`

| test | case | result |
| --- | --- | --- |
| `document throw` | a loader throws `Error` on a document | HTTP 500 and the walked `errorRender` (B77). No `e` frame |
| `data throw` | the same loader on `_flare=data` | HTTP 200. An `e` frame for that match, no `l` frame for that match, and `.head()` and `.headers()` are not called for that match |
| `prefetch throw` | the same loader on `_flare=prefetch` | the same as `data throw` |
| `named status` | `notFound()`, `unauthenticated()`, and `unauthorized()` on a document and on `_flare=data` | 404, 401, and 403 on both. No `e` frame. The overlay sender is not called |
| `failed layout` | the layout loader throws and the page loader returns `{ secret: 1 }` on a data request | HTTP 200. An `e` for the layout, no `l` for the layout |
| `page loader did run` | the same, with a spy | the page loader was called |

### `server/loaders/defer.test.ts`

| test | case | result |
| --- | --- | --- |
| `placeholder` | `defer(() => Promise.resolve(1))` on a response that is not stored | the serialized value is `{ __deferred: true, key }` and the promise resolves to 1 |
| `key default` | no key | `d0`, then `d1`, inside that loader |
| `nested` | the function calls `defer` | the inner value is a dead object. The call throws in dev |
| `dedupe` | two calls with the same key | the second function is not called. Both return the first promise |
| `call overrides route` | the route says `stream` and the call says `prerender: "resolve"` | this call is awaited when the response is stored. Bit 10 asserts the stored body |

### `server/loaders/hints.test.ts`

| test | case | result |
| --- | --- | --- |
| `page skipped` | `_flare_stale` lists the page match id | the page loader is not called |
| `layout not skipped` | the list names the layout id | the layout loader is called |
| `unknown id` | the list names an id that is not in the match | ignored |
| `over cap` | the param is longer than 8 KiB | every page loader is skipped, every layout loader runs |

`_flare_stale` is parsed here. Bit 06 is what puts it on the wire. Until then the tests call `hints` directly.

### `server/context/ctx.test.ts`

| test | case | result |
| --- | --- | --- |
| `returns the value` | `serverContext` returns `{ user: "ada" }` | `serverCtx()` returns that object |
| `not the event` | the request event has `locals.user` and `serverContext` returns `{}` | `serverCtx()` is `{}` |
| `redirect skips` | the path is not canonical | the function is not called |
| `required` | `FlareRegister` declares `serverContext` and the option is omitted | type error |
| `throw is 500` | `serverContext` throws | HTTP 500. The body does not contain the message. The page loader is not called |
| `outside a request` | a call with no event | throw |

### `server/context/fetch-dedupe.test.ts`

| test | case | result |
| --- | --- | --- |
| `same GET` | two GETs of the same URL in one request | one upstream call |
| `POST not deduped` | two POSTs | two upstream calls |
| `next request` | the same GET on a second request | a new upstream call |
| `binding` | `withFetchDedupe(binding)` | `binding.fetch` is called with `binding` as `this` |
| `arrow misses` | a new arrow around `binding.fetch` on each call | two upstream calls |
| `over cap` | a body larger than `maxBytes` | the body streams and the second caller does not receive the memoized body |
| `no global patch` | two GETs through `globalThis.fetch` in one request | two upstream calls |
| `key` | two GETs that differ only by `traceparent` | one upstream call. HEAD and GET are separate entries. Each caller gets its own body |
| `event stream` | `content-type` is `text/event-stream` | the first caller streams. Every other caller fetches on its own |
| `post clears` | a POST after a memoized GET | the request map is cleared. The POST is not memoized |
| `rejection` | the upstream call rejects | the next caller tries again. The rejection is not reused |
| `outside` | a call with no active request | the call passes through and does not throw |

### `tests/integration/auth.test.ts`

| test | case | result |
| --- | --- | --- |
| `layout gate` | layout `authenticate`, page with no auth, no session | 401, page loader spy not observed in the body |
| `outer public` | a public layout, then a required layout, then a page, no session | 401. The public layout's loader ran. The required layout's preloader, authorize, and loader did not, and the page's did not |
| `fuzzy loaders` | `notFoundMode: "fuzzy"`, an unknown path under a layout | loaders run for that layout and its ancestors only |
| `root loaders` | the default mode, an unknown path | only the root layout's loaders run |
| `interleaved` | request A loader waits, request B loader returns a different sentinel | each body contains only its own sentinel |
| `header identity` | two requests with different `Authorization` headers on an optional-auth page | the gate class is `anonymous` for both, and neither body contains the other's header |
| `response denied` | `createServer` serves a page `.authenticate().authorize(() => false).response(fn)` with a session | 403 with the security set. `fn` is not called |
| `response no session` | the same page, and `authenticate` returns null | 401. Neither `authorize` nor `fn` is called |
| `response passes` | the same page, and `authorize` returns true | `fn` receives `{ auth, request, env, preloaderContext }`. Its status and body are served through finalize: the security set is present and `fn` cannot replace a security header. No loader and no render run. A `POST` reaches `fn`, because a `.response()` page has no method list |

## Done

A required chain never reaches a store read. A `.response()` route runs auth. Two concurrent requests cannot see each other's loader results.
