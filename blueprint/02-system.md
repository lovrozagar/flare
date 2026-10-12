# 02 — The running system

## Shape of an app

Three files, plus routes.

```ts
/* src/router.ts — imported by the server and the client */
import { createRouter } from "@lovrozagar/flare";
import { layouts, routeTree } from "./_gen/routes.gen";

export const router = createRouter({ layouts, routeTree });
```

```ts
/* src/server.ts */
import { createServer } from "@lovrozagar/flare/server";
import { router } from "./router";

export default createServer({ router, site: "https://example.com" });
```

```ts
/* src/client.tsx */
import { createClient } from "@lovrozagar/flare/client";
import { router } from "./router";

createClient(router);
```

`createServer(...).fetch(request, env, ctx)` is the production entry. Node wraps it with `createNodeListener`. Bun wraps it with `createBunFetch`. Workers exports it as `fetch`. `vite preview` is not that entry (B53).

## What Solid does, and what Flare does not redo

| Solid | Flare |
| --- | --- |
| `renderToStream` | calls it with `signal`, `onError`, `onHead`, `nonce`, `manifest` |
| `hydrate`, delegated roots | calls `hydrate` after reading the state script |
| request event, `locals` | `serverCtx()` reads that event |
| `useHead` | route `.head()` results are passed to `useHead` |
| `markSafeError`, `sanitizeServerError` | the projector calls them |
| cookies, tracing | used as provided. Flare does not parse cookies itself. Flare writes no `Server-Timing` field |
| `composeMiddleware` | Flare middleware is a list Solid composes |
| `lazy`, `clientOnly` | used as provided |
| `server-only`, `client-only` | mark a whole module. A function boundary is `createServerOnlyFn`, `createClientOnlyFn`, or `createIsomorphicFn` (B9) |
| node server entry | not used (B51) |

## Solid 2.0 purity

The installed pin is `solid-js` 2.0.0-rc.14 (B90). Its dev server prints `[SERVER_WRITE]` when a setter runs during a server render, and names the owner path root first. The repair guide shipped in the package is `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`. A later Solid release throws on that call (B90).

Flare's server render seeds state and does not call a signal setter, a store setter, or an optimistic setter. A value that only mirrors a prop is a memo. Theme and direction are signals because client storage and `flare.sync` write them after the seed. The server passes `defaultTheme` or `defaultDir`. `setTheme` and `setDirection` throw on the server. After the client graph settles, an `onSettled` callback may write the stored value. That callback does not run during a server render. It reserves a hydration id. `matchMedia` and `BroadcastChannel` are registered in that callback. A message or a media-query event is an event write.

Document `queries` are serialized into the state script. The client applies that object as the initial value before hydrate. The server does not push those entries through a setter.

`createEffect` takes a compute function and an apply function. The apply function returns a cleanup or nothing. A setter expression as that return throws in development. `createResource`, `batch`, `startTransition`, and `useTransition` are absent from this pin and are not called. `renderToString` is exported by `@solidjs/web`. Flare does not call it. The document render is `renderToStream`. `flush` is not called inside an effect callback, an action, or an `onSettled` callback. Development throws on the action and on `onSettled`. Async data is a memo or a promise read under `<Loading>`. Solid `"use server"` stays unused (B1). A live prop is not destructured in the parameter list. A one-time read is `untrack`.

`useHead`, `Set-Cookie`, and every other response header are written before the first shell flush. A `<Loading>` fallback can flush that shell, so a tag or a cookie from inside the fallback does not reach the browser. A component does not place an async iterable in the document. A server-function stream is the NDJSON response. A child position receives a value or a call, not a bare function. The document shell is legal HTML, so Solid's frame markers stay paired.

Flare does not depend on `@solidjs/diagnostics` and does not enable attribution. An app component that calls a setter during SSR still warns. The owner path lists every ancestor, including Flare's providers. The setter belongs to the component that called it. `provider.test.tsx` `server pure` renders `ThemeProvider`, `DirectionProvider`, and `LocaleProvider` on the server, subscribes to `DEV.diagnostics`, and fails when the code is `SERVER_WRITE`.

## Ingress

The adapter has already rejected a malformed request target and attached `clientIp`, `secure`, and `resolvedOrigin`. Then, in this order, and no other:

1. **Internal params.** Read `_flare` and `_flare_stale`. Delete them from the URL. Classify `document`, `data`, `prefetch`, or `fill`. A `fill` asks for a stored page's `"stream"` values: it is `no-store`, renders live, and never reads or writes the store (`dx/defer.md`). A bad `_flare` value is 400.
2. **Canonical path.** Compute it. A hostile path is 400. A non-canonical safe path is 301 for GET and HEAD and 308 for every other method (B22). A `/_flare/fn/` path is exempt from the trailing-slash and case redirects, so a server-function POST is never redirected; a hostile one is still 400 (`server/lifecycle/canonical-redirect.test.ts` `method kept`, `fn path exempt`). `Location` is the canonical pathname plus the query that remains after step 1. The request has no hash, and none is added. Later stages see only the canonical path. A request that passes this step runs `serverContext` once, before mounts, when that option is set (B75).
3. **Mounts.** A matching mount handles the request. Its response still passes through finalize.
4. **Rewrite.** Optional `createServer({ rewrite })`. The replacement path is canonicalized again. A rewrite that does not terminate in one step is 500.
5. **Locale.** `createServer({ locale })`, if set (B55).
6. **Middleware.** User list, in declared order.
7. **Server function.** Path `<basePath>/_flare/fn/<id>` (B41) is dispatched through `createServer({ serverFns })` and does not enter the router. An unknown id is 404 before the method check.
8. **Match.** The canonical path is matched against the route tree.
9. **Method.** A normal page allows GET, HEAD, and OPTIONS. OPTIONS is 204 with `Allow: GET, HEAD, OPTIONS`. Anything else is 405 with that `Allow`, and a POST body is drained. A `.response()` page has no method list. An unmatched GET or HEAD is not-found. Any other unmatched method is 405 with that `Allow` (B87).
10. **Validate, then authenticate.** Load the matched modules. Compute effective auth (B25, B26). `input` validators run first. A failure is 400 and does not call `authenticate`, and the store is not read. When the chain reads identity, `authenticate` runs once. A public chain does not call it. A null session skips preloader, `authorize`, and loader on the first required match and everything inside it. Public matches outside that match still run. A required chain with a null session is 401 and does not read the store (B27, B73).
11. **Authorize, then cache read.** A chain that has `authorize` runs preloader, then `authorize`, before the store is read. `false` is 403 and the stored body is not used. A chain with no `authorize` may read the store without running them. A document, data, or prefetch request whose policy is `shared` may read it. One entry per key holds the HTML and the NDJSON, and a miss of any of the three runs one shared render that writes both. A `fill` request never reads or writes it. The key is `static:<build>:<routeId>:<rawParams>`, with no identity class (B73).
12. **Loaders.** On a miss, and on a request that does not read the store, loaders run in parallel. `.head()` and `.headers()` run for a match whose loader did not throw. A throw from either omits that match's head or headers and leaves the status at the loader status (B82). A non-flare loader throw on a document is HTTP 500 and the walked `errorRender` (B77). A generic throw from `preloader` or `authorize` is that same outcome and is not 403. A layout or root preloader throw also fails its descendants. A data or prefetch response stays HTTP 200: an `e` frame for the failed match, no `l` frame, and no head or headers for that match. `notFound()`, `unauthenticated()`, and `unauthorized()` stay 404, 401, and 403 on both, with no `e` frame. When several matches fail, the document status is the first of 401, then 403, then 404, then 500. Then the cascade (B29).
13. **Body.** A document renders HTML. A data or prefetch request writes NDJSON. HEAD keeps the headers and sends no body.
14. **Finalize.** Policy, security headers, `flare-build`, `flare-render`, `flare-cache`. This is the only exit. Flare writes no `Server-Timing` field.

Between step 12 and step 13 the merged security policy is resolved. A directives object generates one nonce. A string or `false` CSP sets that nonce to empty. The pipeline writes that string on the request event, then step 13 renders. Any component calls `nonce()` and reads it there. The value is not passed down the tree and it is not a `serverContext` field. Step 14 writes the header from the same string. The rules are `dx/server.md`.

A stage that wants to stop calls `finish(response)` and the pipeline goes to step 14. It does not return a `Response` itself (B34).

## Document response

`renderToStream` writes the shell. A production HTML document holds that shell, inserts critical CSS, then flushes. Live SSR, SSG prerender, and ISR populate all use this render. The stored body keeps the style, and a cache hit serves that body without extracting again. The full stylesheet is the non-blocking preload, the `<noscript>` link, and the swap script. The critical block is `<style id="flare-critical">`, the last element in `head`, with no `data-dh` (B83). It is inside the flushed shell. Its rules are the ones in the built file that match the shell. Its nonce is the request nonce. If the shell contains `<html` and no doctype, Flare prefixes `<!DOCTYPE html>` before the flush. The root layout does not write the doctype. `renderToStream` receives `nonce`, `onError`, `onHead`, `signal`, and `manifest`. `manifest` may supply scripts and does not emit the app CSS href. Flare inserts the state script and the client script into the shell before `</body>`, so the shell ends at `</html>`. Solid's `onCompleteShell` write would land after `</html>`. HTML that streams after the shell is not scanned. A data or prefetch response does not extract and does not contain that style. Dev does not extract. `flare({ css: { reset: true } })` prepends the preflight to that one cached file, and the critical block of an HTML document includes the preflight rules that match the shell. There is no second reset file. The default is off.

Flare injects one state script before `</body>`, escaped with `escapeInlineScript`. The script assigns `self.flare`. The client reads that value once during hydrate.

The shell `head` also contains Solid's hydration capture script, once, before `<style id="flare-critical">` (B91). `generateHydrationScript` emits it. The listeners are `click` and `input`. When the request has a nonce, the script carries it. The script assigns `window._$HY` and is followed by `<!--xs-->`. `hydrate` reads that object. A click or an input before hydrate is stored on `_$HY.events` and replayed after the target is claimed. A data or prefetch response does not include the script. The root layout does not render `<HydrationScript>`. Dev, SSG, and ISR documents include it, because each of those is an HTML document.

The state object contains:

- `build` — the build id
- `nonce` — the request nonce, or `""` when the policy has none. Client code reads it with `nonce()`
- `matches` — `{ id, params, search, data, preloader, head, error }`. `error` is `{ name, message }` plus `stack` in dev or `digest` in production. The client builds the `Error` before hydrate. There is no short key (B83)
- `queries` — the request's query cache. The client seeds the getter before hydrate. This is not a `q` frame (B6, B16)
- deferred placeholders `{ __deferred: true, key }` where a loader returned `defer()`, with `hole: true` on a stored `"stream"` value the render did not run
- `fill` — `true` when the render left such a hole. After hydrate the client sends one `?_flare=fill` revalidation of the same URL

Deferred values that resolve during the stream are appended by Solid's own stream mechanism as instructions the client already understands. Flare does not invent a second HTML streaming protocol. Values that are not yet resolved when the document ends are delivered on the next data request for that URL; the placeholder stays a placeholder. Bit 05 names the exact Solid APIs used, taken from the installed `renderToStream` types, not from memory of an older release.

A document-less root is 500 in production (B37).

## Data response

`Content-Type: application/x-ndjson`. One JSON object per line, `\n` terminated. A line longer than 1 MiB is an `e` frame and the stream ends.

| `t` | when | fields |
| --- | --- | --- |
| `l` | one per matched route, immediately | `m` match id, `d` loader data (promises replaced by placeholders), `p` preloader context when present, `v` `{ params, search }` validator output when that match has `.input()` (the client never runs validators, B8). A match without `.input()` sends no `v` and the client uses the raw records. A stale-skipped page keeps the `v` its cache entry holds |
| `e` | loader or deferred failure | `m`, `e` `{ message, stack }` in dev and `{ message, digest }` in production (no `stack` key). `k` is present only for a deferred failure. A loader failure has no `k` |
| `h` | one per matched route that has a head result | `m`, `d` head config. A skipped route emits no `h` and no `l`. A match whose loader threw emits no `h` and no `l` |
| `r` | loaders have settled | none |
| `c` | a deferred resolved | `m`, `k`, `d` |
| `x` | the chain redirected | `s` status, `u` the built URL with search and hash, `r` replace. `r` is always present |
| `d` | the stream is finished | none |

Order: all `l` and loader-level `e`, then all `h`, then `r`, then zero or more `c` or deferred `e`, then `d`. Each `c` is written when that promise settles, and a slow one does not hold a fast one. `d` is written after the last of them. A deferred `e` does not cancel the others (B80). An `x` replaces the whole body: it is the only frame. The HTTP status of that response is 200. The redirect status lives in `s`.

`_flare_stale` may omit page `l` frames. Layout `l` frames are always present (B30).

## Navigation on the client

1. `navigate` rejects a target whose origin is not the app origin.
2. The data URL is the canonical path plus `_flare=data`. `_flare_stale` lists page match ids inside `staleTime` whose `shouldRefetch` did not return `true`. Layout ids are never listed. The param is omitted when every page loader will run (B84).
3. The client fetches that URL. Starting a navigation aborts the previous data request. The aborted attempt does not commit and is not a network failure. On a build-id mismatch, when both ids are non-empty, a navigation document-loads and does not apply frames. A prefetch mismatch is ignored (B7, B84).
4. The match cache is updated only for a successful `l` payload. A loader `e` (no `k`) is not cached. A deferred `e` rejects that promise and is not a cache write.
5. The commit is the `r` frame. History is pushed then. A later `c` or deferred `e` updates the committed page and does not push (B80). Revalidation of the current URL does not push. A popstate commit does not push or replace.
6. `useBlocker` returns void. Only the last registered callback runs, and it does not run for `"initial"`, popstate, or a same-URL revalidation. `false` cancels before the history write. Popstate that skips more than one entry is replayed one entry at a time (B84).
7. Scroll positions live in `sessionStorage`, keyed by the history index unless `getScrollRestorationKey` is set. `history.scrollRestoration` is `"manual"`. Hydrate `replaceState`s index `0` when `history.state` has no index. It does not push. A document load does not read the store.
8. A data landing whose `d` arrives with a placeholder no frame settled holds a stored `"stream"` hole. Once it commits, and while that page is still on screen, the client sends one `?_flare=fill` revalidation of the same URL, which writes no history and settles those same values. A `fill` landing never asks again.
9. `useNavigationProgress` reads the same pending flag as `useNavigation`. Prefetch leaves it idle. The return is `{ pending, value }`. It renders nothing (`dx/navigate.md`).

Prefetch is two fields (B64). `modules` loads route code and does no server work. `data` runs loaders and loads the modules too. The router default is `{ modules: "all", data: false }`: after load and idle, every route chunk is `<link rel="prefetch">` and no loader runs. A string sets both fields. Data Saver and 2G skip `"all"` and fall back to viewport module prefetch. A data prefetch requests `_flare=prefetch`, uses the same cache entry as a navigation, and does not commit the screen. It does not call `defer`. The tables are `dx/link.md`.

## Auth chain

The order is steps 10 through 12 (B73).

Preloader, `authorize`, and loader receive the session or `null`. Render does not. A null session skips those three on the first required match and on everything inside it. Public matches outside that match still run. When the chain has `authorize`, preloader and then `authorize` run before a shared hit. `false` is 403 and the stored body is not used. A chain with no `authorize` may serve that hit without running them.

Page and layout loaders that do run are parallel. A loader may call `defer()`. On a response that will be stored, `defer` defaults to `resolve` (B65). `stream` stores the placeholder and fills it later with a `no-store` data request. `createServer({ documentResponseDefer })` defaults to `stream` and applies only to a rendered HTML document. `buffer` holds that document until the running defers settle. A stored hit, a data request, a prefetch, and a client navigation ignore it. It does not change the route `defer` field (B92). The tables are `dx/defer.md`.

`.response()` runs validation, `authenticate`, preloader, and `authorize`, then the response function. It does not render. The response function receives `auth` and `preloaderContext`. Render still does not.

## Cache

Shared store key: `static:<build>:<routeId>:<rawParams>`. There is no identity class in the key (B73). A required chain has no key, because it is never stored (B27). The policy class `anonymous` is not a key segment.

Every shared render, including a miss, a stale refresh, and prerender, requests `site` plus the canonical pathname. That request has no search and no request headers. The body stored is the body served for that miss. A page whose HTML depends on search or headers is private.

Write path, one function:

- policy is `shared`
- status is 2xx and the body is a complete document
- `storedAt` is the start of the render
- TTL is set. For `ssr` the TTL is `cache.ssr.ttl`, which is required (B67). For ISR, a set `revalidate` makes the TTL `revalidate * 2`, capped at 24 hours, and `stale` begins at `revalidate`. `isr: true`, `isr: {}`, and an omitted `revalidate` use 24 hours. That 24 hour TTL is a real miss. Nothing background-refreshes before it (B47, B73)
- a `resolve` defer has settled. A `stream` defer is stored as the placeholder and is not run
- tags come from the route's `cdn.tags` and `ssr.tags`
- nonce attributes whose value is the request nonce, and the state object's `nonce` field, are rewritten to the entry's sentinel (`__FLARE_NONCE_` plus 16 random bytes in hex, made at each write and recorded in the entry; only that value becomes the hit nonce) before the bytes are stored. A streaming response that is not stored keeps the real nonce from the first byte

Read path: a purge `get` returns `{ data: { tombstone: true }, storedAt }` (B86). That entry is not served. A tag epoch at or after `storedAt` is a miss on the mutable store. An ISR seed is served only when its `renderedAt` is greater than the tombstone's `storedAt`. A hit is always 200, sends no `ETag`, and does not run loaders or `.headers()`. It replays stored headers except `Location`, `Set-Cookie`, and the security headers. Finalize applies security. A stale serve is `flare-cache: hit`. Before the body is sent, the entry's sentinel in nonce attributes and in the state field becomes this request's nonce. A hit whose policy has no nonce drops those attributes and sets the state field to `""`. SSG reads only the static seed and ignores tombstones. `delete` on a mutable store writes a tombstone. A build-time ISR seed stays hidden while the tombstone is newer.

Purge: `revalidate({ keys })` writes tombstones. `revalidate({ tags })` bumps epochs. Both go through the store the handler uses. There is no second in-memory purge list.

## Server functions

The client calls `fn(input)`. The stub sends JSON to `<basePath>/_flare/fn/<id>` (B41) with the method the registration declared. The server replies with the envelope:

```ts
{ name: string; status: number; message?: string; errors?: Issues; digest?: string; stack?: string; data?: unknown; redirect?: { to: string; status: number; replace: boolean } }
```

A thrown `redirect()` is HTTP 200 and sets `redirect`. It sets no `data`. `to` is the built URL, with search and hash, or the `href` when that form was used. `replace` is always present and defaults to `true`. A same-origin `to` is followed by the internal URL navigation with that `replace`. It does not call public `navigate({ to })`. An `href` is a full page load. The promise then rejects with that redirect (B85). `notFound()`, `unauthenticated()`, and `unauthorized()` on a server function are JSON and do not walk the page.

`.stream()` replies with NDJSON of the same envelope shape, one yielded value per line, and the client function returns an async iterator.

A function thrown error uses the same projector as a render error (B38). In dev the envelope includes `message` and `stack` and omits `digest`. In production it includes a generic `message` and `digest` and omits `stack`. `markSafeError` keeps the message and still omits `stack` (B76).

## Errors the user can throw

| call | result |
| --- | --- |
| `notFound()` | 404. The walk calls `notFoundRender` only (B77) |
| `unauthenticated()` | 401. The walk calls `unauthenticatedRender` only |
| `unauthorized()` | 403. The walk calls `unauthorizedRender` only |
| `redirect({ to, params?, search?, hash?, href?, status?, replace? })` | `to` is a route id. The wire carries the built URL, with search and hash. `replace` is always present and defaults to `true`. `href` is only `http:` or `https:` and is a full page load. `status` is 301, 302, 303, 307, or 308. A document uses that status. A data request is HTTP 200 and one `x` frame (B73) |
| `input()` failure | 400, `application/json`, `{ issues, fieldErrors }`, no HTML shell. A data request uses that JSON and is not an `e` frame. `authenticate` is not called |
| `markSafeError(error)` | message preserved in production |

Anything else a loader throws is a document 500 and the walked `errorRender`, with a generic message in production. When the walk finds no function, the slot is the built-in `div` (B77). A data or prefetch response stays HTTP 200, with an `e` frame for that match and no `l` for that match (B73). In dev that document contains the thrown message and the stack when the shell is not yet committed, the `e` object is `{ message, stack }`, and Vite's overlay opens. `notFound()`, `unauthenticated()`, `unauthorized()`, `redirect()`, and an input failure do not open it. Production omits the stack everywhere and does not send the overlay (B76).

## Build

`flare codegen` and the Vite plugin write `src/_gen/routes.gen.ts` and `src/_gen/types.gen.d.ts`. The plugin calls `solid({ ssr: true, extensions: [".tsx", ".jsx"] })` and does not pass `start`. External host means Flare owns the entries, the dev server, and server functions (B89). Environments are `client`, `ssr`, and, when the Workers config is present, `worker`. The boundary transform runs in every environment and rewrites server functions and the three env helpers (B9). The tripwire runs on every emitted chunk of every environment (B45). Dev build id is `dev`. Production is the 12-hex manifest hash (B84).

Prerender runs after the server build, loads the server modules, checks auth hints (B25), and renders each SSG route and each ISR route whose `params` exist. The request is `site` plus the canonical pathname, with no search and no request headers. A bad status fails the build (B49). Such a route fails the build when `prerender` is omitted or `false`. The error names the route. `isr: true` and `isr: {}` do not render at build time and do not require `prerender`. An omitted `revalidate` does not by itself render a route at build time. An app with no such route still builds.
