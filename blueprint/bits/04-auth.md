# Bit 04 — Auth and loaders

Creates every `P4` row. Effective auth is computed from the loaded modules before any store read. There is still no store; the gate's "do not store" answer is asserted by the caller, and bit 10 is what obeys it.

## Extends

`server/loaders/run.test.ts` gains the phase-order cases. `src/exports/server.ts` re-exports `serverCtx` and `withFetchDedupe`.

The route builder stores what it accepts, because `tests/integration/auth.test.ts` boots real route modules. `shared/route-builder/chain.test.ts` gains `stores in order`: `cache`, `authenticate`, `authorize`, `preloader`, `loader`, and `render` land on the record in the `dx/builder.md` order, a later method called early throws `order`, and `response` excludes `loader` both ways. It also gains `authenticate records`: `authenticate(...callerData)` records `{ mode: true, callerData }`, `authenticateOptional(...callerData)` records `{ mode: "optional", callerData }`, and calling both throws. `page.test.ts` gains `page chain`: the page record carries the stored methods, and `.response()` ends the chain with no render. `layout.test.ts` gains `layout chain`. `root-layout.test.ts` gains `root chain`: the record keeps `document: true` and the stored loader.

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

## Done

A required chain never reaches a store read. A `.response()` route runs auth. Two concurrent requests cannot see each other's loader results.
