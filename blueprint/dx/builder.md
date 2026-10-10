# Route builders

The id string is the first argument. Codegen writes it. The runtime matches the generated pattern, not this string. A mismatch is a build error (`vite/codegen/id-string.test.ts`).

Each method may be called once. Calling it twice throws when the chain is built (`shared/route-builder/chain.test.ts` `second render throws`).

## Who has which method

| method | page | layout | root layout | segment |
| --- | --- | --- | --- | --- |
| `intercept` | yes | | | |
| `cache` | yes | yes | yes | yes |
| `input` | yes | yes | yes | |
| `authenticate` | yes | yes | yes | |
| `authenticateOptional` | yes | yes | yes | |
| `authorize` | yes | yes | yes | |
| `effects` | yes | yes | | |
| `preloader` | yes | yes | yes | |
| `loader` | yes | yes | yes | |
| `response` | yes | | | |
| `head` | yes | yes | yes | |
| `headers` | yes | yes | yes | |
| `security` | yes | yes | yes | |
| `render` | yes | yes | yes | fixed, returns `children` |
| `errorRender` | yes | yes | yes | |
| `notFoundRender` | yes | yes | yes | |
| `unauthenticatedRender` | yes | yes | yes | |
| `unauthorizedRender` | yes | yes | yes | |

A layout has no `intercept` and no `response`. A segment has `render` fixed and an optional `cache`. Tests: `page.test.ts`, `layout.test.ts`, `root-layout.test.ts`, `segment.test.ts`.

Order is the order in this table. A later method called too early is absent from the type and throws (`chain.test.ts` `order`, `propagation.test.ts` `method order`). The type of every callback is the matrix in `dx/types.md`.

## Methods

| method | required args | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `intercept({ from, render })` | `from` is a non-empty array of route ids. `render` is a string | a client navigation from one of `from` opens `InterceptOutlet` and keeps the background page mounted. The child paints the preview. A direct visit and a reload render the page (`dx/navigate.md`) | `from` is route ids, not URL paths. `render` is a label, not a component | `shared/components/intercept-outlet.test.tsx` |
| `cache(config)` | the object in `cache.md` | | both `ssr` and `isr`, or any other pair, does not type-check | `shared/route-builder/chain.test.ts` `one mode` |
| `input({ params?, searchParams? })` | at least one | validators run before auth. A document failure is HTTP 400, `Content-Type: application/json`, body `{ issues, fieldErrors }`, and no HTML shell. A data request with the same failure is that same JSON. It is not an `e` frame. The client does not commit and does not push. Each side's output replaces that side for later callbacks (`dx/types.md`) | both omitted does not type-check and throws at the call. Both validators receive `Record<string, string \| string[]>`. One search key is a string. Two or more, in appearance order, is a `string[]`. Passing only one side leaves the other at its default | `server/loaders/run.test.ts` `input failure`, `data input`; `propagation.test.ts` `input empty`, `input one side` |
| `authenticate(...callerData)` | args optional | required auth. Null session is 401. Args are `callerData`, not the mode. The app function receives the leaf's args (`dx/server.md`) | `.authenticate("optional")` throws. The method is `.authenticateOptional`. A layout's args are not `callerData` when the page does not call `authenticate` | `server/auth/caller.test.ts` `leaf`; `shared/route-builder/chain.test.ts` `optional argument` |
| `authenticateOptional(...callerData)` | args optional | the session may be null. The chain reads identity, so a shared store keeps the anonymous render only | the method is absent when a parent seed is `true` (`dx/types.md` `cannot loosen`) | `server/auth/effective.test.ts` `optional reads`; `propagation.test.ts` `cannot loosen` |
| `authorize(fn)` | `fn` returns boolean | `fn` receives the fields in `dx/types.md`. `auth` is the resolved mode: a public route that only authorizes sees the session or `null`. `false` is 403. A throw is the loader-throw outcome and is not 403 (B82). Sequential, parent before child. A chain that has `authorize` runs preloader, then `authorize`, before a shared hit. The stored body is not used when `authorize` returns `false`. Without `authenticate`, the chain still reads identity | a child cannot loosen a parent `authenticate`. `authorize` does not see this route's own preloader return. A route with no `authorize` still hits the cache | `server/auth/gate.test.ts` `response route`, `authorize throw`; `tests/integration/cache.test.ts` `authorize before hit`; `propagation.test.ts` `authorize reads` |
| `effects({ loaderDeps?, shouldRefetch? })` | at least one | see below | both omitted throws | `client/router/match-cache.test.ts` `loader deps` |
| `preloader(fn)` | `fn` | `fn` receives `{ auth }`, the session or `null`. Runs after auth and before `authorize`, parent before child. Its return is `preloaderContext`. When the chain has `authorize`, this runs before a shared hit. A generic throw is the loader-throw outcome (B82). A layout or root throw also fails its descendants | it is not cached separately from the loader. A null session on a required match skips it, and skips everything inside that match. The throw is not 403 | `server/loaders/run.test.ts` `order`, `auth args`, `preloader throw` |
| `loader(fn)` | `fn` | `fn` receives `{ auth }`, the session or `null`. Parallel after every authorize. Return value is loader data | a non-flare throw on a document is HTTP 500 and the walked `errorRender` (B77). In dev the uncommitted body contains the message and the stack, and Vite's overlay opens. Production omits the stack (B76). A data or prefetch response stays HTTP 200: an `e` frame for that match, no `l` frame, and no `.head()` or `.headers()` for that match. `notFound()`, `unauthenticated()`, and `unauthorized()` stay 404, 401, and 403 on both, with no `e` frame. Render does not receive `auth` | `server/loaders/cascade.test.ts` `document throw`, `data throw`, `prefetch throw`, `named status` |
| `response(fn)` | `fn` returns `Response` | runs after auth and preloader. No render, no loader. The response still passes through finalize | `.authenticate().authorize(() => false).response(...)` is 403, and `fn` is not called | `server/auth/gate.test.ts` `response route` |
| `head(fn, options?)` | `fn` | `options.replace` defaults to `false`. The merge rules are `dx/head.md` (B83). A throw omits this match's head. The document status stays the loader status. It is a dev bug and does not open `errorRender` (B82) | `fn` runs on the server for a match whose loader did not throw. The client receives this route's own return in an `h` frame. A thrown loader emits no `h` for that match | `server/render/head.test.ts` `merge`, `replace`, `head throw` |
| `headers(fn)` | `fn` returns `Record<string, string \| string[]>` | merged parent to child. A child key wins, except `set-cookie`, which appends parent values then child values. An undefined child value keeps the parent. Does not run when that match's loader threw. A throw omits this match's headers and leaves the status unchanged (B82) | cannot set a security header. Finalize overwrites those | `server/security/apply.test.ts` `headers() cannot`, `both cookies` |
| `security(config)` | `SecurityConfig` or `(ctx) => SecurityConfig` | the route override of `createServer({ security })`. Merge is outside-in: server, then layouts, then the page. A set key replaces. `false` removes, including a parent value | a string CSP drops the nonce on the header and on every tag (B68). `ctx` is `{ params, search, loaderData, preloaderContext }` and has no `nonce`. The function runs on the server after loaders and before render | `server/security/apply.test.ts` `route security` |
| `render(fn)` | `fn` | the component. Props are below | | `shared/route-builder/page.test.ts` `page render` |
| boundary renders | `fn` | one each, after `render`. Optional. The walk and the built-in `div` are below (B77) | calling one twice throws. A segment has none | `boundaries.test.ts` `boundary once`; `shared/components/boundary.test.ts`; `shared/components/outlet.test.tsx` |

## Boundaries

A segment is skipped. The walk starts at the failed match and moves toward the root. The first match with that function paints it in the failed match's slot.

| failure | function |
| --- | --- |
| `notFound()` | `notFoundRender` |
| 401, `unauthenticated()` | `unauthenticatedRender` |
| 403, `unauthorized()` | `unauthorizedRender` |
| anything else | `errorRender` |

One failure uses one column. A 401 does not call `errorRender`.

The failed match's `render` does not run. Its descendants do not render. Ancestors render, including the match that supplied the function. A page failure painted by the layout keeps that layout's chrome and paints the layout's function in the outlet. `params` and `search` are the function's own route (`dx/types.md`).

A function that throws is skipped and the walk continues at the next ancestor. That throw is a dev bug (B76). The built-in does not throw.

When the walk finds no function, the slot is one `div` and nothing else.

| failure | text |
| --- | --- |
| anything else | `Something went wrong` |
| `notFound()` | `Page not found` |
| 401 | `Please log in` |
| 403 | `Access denied` |

If the failed match is the root, that `div` is the body.

`reset()` on `errorRender` replaces the current pathname and search in place and revalidates. It does not push. There is no `retry` prop (`shared/components/boundary.test.ts` `reset`).

When several matches fail, the document status is the first of 401, then 403, then 404, then 500. A descendant `notFound()` does not downgrade a 500 (`shared/errors/status.test.ts` `rank`, `not found keeps 500`).

An unknown URL is not a failed match. `notFoundMode` is unchanged (`dx/router.md`). The selected layout's `render` runs. The outlet is that layout's `notFoundRender`, else the root layout of that chain, else the `Page not found` div. Ancestors of the selected layout render. That root is the chain's root layout, including `_admin_`.

`boundaryAt` and `boundaryFallback` live in `shared/components/boundary.ts`. They are not a public export.

## effects

| prop | required | default | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- |
| `loaderDeps` | no | — | `(ctx: { search, params }) => unknown[]`. Both are the raw records, including when this route validated them (`dx/types.md`) | the match id ignores this array (B31, B81). Values are compared with `JSON.stringify`. A new array with the same values does not refetch. Putting a decoded search into the array changes the values, so a stay refetches. A validator-only field is not on `ctx.search` | `client/router/match-cache.test.ts` `loader deps`, `loader deps same`; `propagation.test.ts` `loader deps raw` |
| `shouldRefetch` | no | — | `(ctx) => boolean`. `ctx.trigger` is `"initial"`, `"navigation"`, or `"revalidation"`. `ctx.location.current` and `.next` carry hash, params, pathname, search. `params` and `search` are the raw records | returning `true` from `"initial"` refetches during hydrate. Do not | `client/router/match-cache.test.ts` `should refetch`; `propagation.test.ts` `should refetch raw` |

## Render props

The render function receives:

| prop | when | outcome |
| --- | --- | --- |
| `params` | always | this route's params. Brackets, unless this file's `.input({ params })` replaced them |
| `search` | always | this file's search validator output, or the raw record when this file did not validate search |
| `loaderData` | always | this route's loader data only. `void` when this route has no loader. Promises are awaited. `Deferred<T>` stays wrapped (`dx/defer.md`) |
| `preloaderContext` | always | parents outside-in, then this route's preloader return. An empty chain is `{}` |
| `children` | layout, root, segment | `JSX.Element` |

A page render has no `children`. `props.auth` does not type-check. There is no `location` and no `router` on these props. The stale-loader runtime still withholds a fresh value; the type stays this route's loader data. Tests live in `shared/components/outlet-nodes.test.ts` (`page props`, `layout children`) and `propagation.test.ts` (`render auth`, `loader absent`, `parent loader hidden`).

## Server callbacks

Loader, preloader, `authorize`, and `.response()` receive `env`, `request`, and `serverContext`. The full field list is `dx/types.md`. The loader also receives `defer`, `buildUrl`, `notFound`, `redirect`, `unauthenticated`, `unauthorized`, and `cause`.

`cause` is `"enter"` (navigation or document), `"prefetch"`, or `"stay"` (a refetch of the current route). A prefetch still runs loaders when `data` prefetch is on, and it does not run `defer` functions (`dx/defer.md`).

`redirect({ to, params?, search?, hash?, href?, status?, replace? })` defaults `status` to `303` and `replace` to `true`. `replace` is always present on the wire. `navigate` and `Link` keep `replace` default `false`. `to` is a page route id (`dx/types.md`). The wire carries the built URL, with search and hash. A same-origin URL is followed as a navigation. `href` is only `http:` or `https:` and is a full page load. Any other scheme throws at the call. `status` is `301`, `302`, `303`, `307`, or `308`. Anything else throws at the call. A document uses that status. A data response stays HTTP 200 and is one `x` frame whose `s` is the status, `u` is the built URL, and `r` is `replace` (`server/redirect/target.test.ts` `replace default`, `href https`, `href bad`, `status`; `server/navigation/response.test.ts` `redirect`).

Preloader, `authorize`, and loader receive `{ auth }`. On a required route the type is the session, because a null session does not call those callbacks. On an optional route, and on a public route that authorizes, the type is the session or `null` (`dx/types.md`). The render props have no `auth`. A null session skips preloader, `authorize`, and loader on the first required match and on everything inside it. Public matches outside that match still run (`server/auth/gate.test.ts` `layout gate`, `outer public`).

`buildUrl({ to, params?, search?, hash? })` returns a path. `to`, `params`, and `search` follow `dx/types.md`. It throws when a required param is missing (`shared/url/href.test.ts` `missing param`).
