# Bit 05 — Render

Creates every `P5` row. The projector and the abort race. `renderToStream`'s `signal` option is passed, and the adapter also races the chunk-0 wait and every later pull, because on `@solidjs/web` 2.0.0-rc.13 and rc.14 aborting the signal does not close the writable (N3-2, rechecked on rc.14). The race stays if a later pin starts closing it.

## Extends

`server/render/document.test.ts` gains the abort and shell cases. Solid's `renderToStream` receives the signal of an `AbortController` the render owns, never the request's signal (BUGS.md B28). `renderDocument` captures the request event when it starts. A request abort and a consumer cancel of the body both call one `stop()`, which aborts that controller inside `provideRequestEvent(event, …)`, so Solid's disposal and every `onCleanup` run under the request the render ran under. `stop()` runs once. Solid disposes inside the controller's `abort` dispatch, and an `EventTarget` reports a listener's throw instead of rethrowing it, so no `try` around `abort()` can catch an app cleanup that throws; @solidjs/web rc.14 exposes no other stop (its `abandon()` is behind module-private symbols). Flare does not hand Solid a hand-built signal to work around that, because it would depend on how Solid uses the signal internally. The residual is in `dx/server.md`. The stop lives in `server/render/abort.ts` as `renderStop(requestSignal, event)`, which returns `{ signal, stop }`. `abort.test.ts` gains, as unit cases with no Solid render: `stop under request event` (the request aborts from outside its scope, and an abort listener on the returned signal reads `getRequestEvent()` and gets the event), `cancel stops under request event` (the same through `stop()` from a body cancel), and `stop runs once` (a request abort then a cancel fire the returned signal's listeners once). `document.test.ts` keeps the end-to-end proof through a real Solid render, red first: `abort cleanup in request` (the request aborts after the shell, and an `onCleanup` that reads `getRequestEvent()` sees that request's event). `signal follows the request signal` keeps its name: Solid's signal still aborts when the request aborts, now through `stop()`. `shared/errors/status.test.ts` gains the render-phase 404. `server/render/head.test.ts` gains `head throw`: a throw omits that match's head, the document status stays the loader status, it is a dev bug, and it does not open `errorRender`. `shared/errors/index.ts` re-exports `devErrorPayload` and `reportDevError` from `dev-report.ts`. `shared/route-builder/boundaries.test.ts` gains `four kinds`: the record that a page, layout, or root layout `render` returns has `errorRender`, `notFoundRender`, `unauthenticatedRender`, and `unauthorizedRender`, each stores its function under `boundaries`, and the methods are not enumerable. `boundary once` covers each method. The router reads `boundaries.notFoundRender`. `server/lifecycle/create.test.ts` gains `root children` (the root layout's `children` is the page), `unknown render` (an unknown URL is 404 and the root paints the `Page not found` div in its outlet), `unknown failure` (the root loader throws on an unknown URL: 500 and the built-in div is the body), `boundary throw` (a throwing page `errorRender` sends its own payload, and the root's `errorRender` paints), `unknown no owner` (no root layout owns the path: a bare 404), and `loader redirect` (a loader `redirect()` keeps its status and paints no boundary). `tests/integration/skeleton.test.ts` `GET /` asserts a full `html` and `body` document around the page, and `GET /nope` asserts the `Page not found` div inside `body`. `server/render/document.ts` serializes the state before the render, so `bigint` fails before the shell. `server/loaders/cascade.test.ts` gains `ranked`: a root throw, a layout `unauthenticated()`, and a page `notFound()` give 401 by `rankStatus`. The paint slot is still the root-most failure, the error is the 401 one, and no data is kept. `server/render/document.test.ts` `signal is the request signal` becomes `signal follows the request signal`: renderToStream's signal aborts with the request and also with a consumer cancel, which is how `cancel disposes` reaches the render. `adapters/node/listener.ts` aborts the request signal when the response closes before it finished, so a client disconnect reaches the render (`stream.test.ts` `abort closes`). `adapters/node/listener.test.ts` gains `finish keeps signal` (a close after a finished response leaves `request.signal` not aborted, so `waitUntil` work keeps it, as on Workers and Bun) and `disconnect aborts` (a close before the finish aborts it). `shared/components/index.ts` re-exports `boundaryAt`, `boundaryFallback`, and `boundaryKind`. `server/loaders/cascade.ts` reads `boundaryKind` from it, so the status-to-function table exists once. The public entry does not.

## Cases

### `shared/components/boundary.test.ts`

| test | case | result |
| --- | --- | --- |
| `own` | the page index, and the page has `errorRender` | that index |
| `parent` | the page omits it and the layout has it | the layout index |
| `segment` | a segment between the page and the layout has `errorRender`, and the layout has it | the layout index |
| `segment only` | the only `errorRender` is on a segment | null |
| `separate` | the failure is `notFound()` and the page has only `errorRender` | null |
| `auth separate` | a 401, and the only function is `errorRender` | null |
| `none` | no match defines the function | null |
| `text` | each kind | `Something went wrong`, `Page not found`, `Please log in`, `Access denied` |
| `reset` | `reset()` | replaces the current URL in place with `revalidate: true` and does not push. There is no `retry` prop |

### `shared/components/outlet.test.tsx` (extended)

| test | case | result |
| --- | --- | --- |
| `page boundary` | the page has `errorRender` and its loader throws | the page function's text is present. The page `render` text is absent. The layout `render` text is present |
| `layout chrome` | the page omits `errorRender` and the layout has it | the layout function's text is in the page slot. The layout `render` text is present. The page `render` text is absent. `params` are the layout's |
| `descendant skipped` | the layout loader throws and the layout has `errorRender` | the page `render` text is absent. The root `render` text is present. The layout `render` text is absent |
| `page builtin` | no match defines `errorRender` and the page loader throws | one `div` whose text is `Something went wrong`. The layout `render` text is present. The page `render` text is absent. In production the body does not contain the thrown message |
| `root builtin` | the root loader throws and the root defines no `errorRender` | the body is that `div`. The root `render` text is absent |
| `not found own` | the page calls `notFound()` and defines `notFoundRender` | that function's text is present. `errorRender` is not called |
| `login` | a 401 and no `unauthenticatedRender` | one `div` whose text is `Please log in`. `errorRender` is not called |
| `denied` | a 403 and no `unauthorizedRender` | one `div` whose text is `Access denied` |
| `boundary throws` | the page `errorRender` throws and the layout has one | the layout function's text is present. In dev the overlay sender is called with the boundary's message |
| `unknown builtin` | an unknown path, `notFoundMode` `"root"`, and the root has `render` and no `notFoundRender` | the root `render` text is present and the outlet `div` text is `Page not found` |
| `unknown admin` | `notFoundMode` `"fuzzy"`, the longest prefix is under `_admin_` and omits `notFoundRender`, and that root defines it | the admin root's `notFoundRender` text is present and its `render` text is present |
| `layout stays` | a navigation whose layout match id is unchanged | the layout stays mounted, including its component state. `<Outlet />` has no props and renders no `<Loading>` and no `<Reveal>` |
| `page remounts` | the page match id changes, and a loader refresh that keeps the id | the page remounts when the id changes. A loader refresh does not remount |
| `no render` | a layout module with no `render` | its slot paints the next slot, as a segment does |

### `shared/errors/safe.test.ts`

| test | case | result |
| --- | --- | --- |
| `delegates` | `markSafeError(new Error("hi"))` | Solid's `markSafeError` is the function that was called |
| `no local sanitize` | the module source | it does not define a sanitizer |

### `shared/errors/dev-report.test.ts`

| test | case | result |
| --- | --- | --- |
| `payload` | `new Error("secret")` | `{ type: "error", err: { message: "secret", stack } }` and `stack` contains a frame |
| `string` | the thrown value `"secret"` | `message` is `"secret"` and `stack` is `""` |
| `sends` | a send function | it is called once with that payload |
| `no send` | the send function is omitted | no throw |

### `server/render/projector.test.ts`

| test | case | result |
| --- | --- | --- |
| `prod generic` | a thrown `Error("secret")` in production, and the error document is written | status 500, body does not contain `secret` or a stack frame, body contains a digest, the overlay sender is not called, the log contains the digest and not `secret` |
| `prod safe` | `markSafeError(new Error("visible"))` | the message `visible` is in the body, a stack frame is not, the sender is not called |
| `dev detail` | a thrown `Error("secret")` in dev, and `errorRender` returns text that contains neither the message nor the stack | the body contains `secret` and a stack frame, the sender is called with that message and stack, the log contains both |
| `not found in render` | the component calls `notFound()` | status 404, the overlay sender is not called |
| `unauthenticated in render` | the component calls `unauthenticated()` | status 401, the overlay sender is not called |
| `render has no auth` | a route with a session | the render props have no `auth` field |
| `bigint` | loader data contains a bigint | 500 before the shell is committed |
| `null title` | head title is null | the head omits the title, the response is 200 |
| `string thrown` | the loader throws the string `"plain secret"` in dev | the state error is `{ message: "plain secret", stack: "" }`, and the sender is called with that message and `stack: ""` |
| `dev sink` | `devSink({ env: { DEV: true }, hot })`, then `{ env: { DEV: false } }` | the first sends `hot.send("flare:error", payload)`. The second is not dev and has no sender (B93) |

### `server/render/abort.test.ts`

| test | case | result |
| --- | --- | --- |
| `before shell` | abort before the first chunk | the response ends, no chunk is written, the render dispose spy was called |
| `mid stream` | abort after chunk 0 | the next pull rejects or returns done, and the socket ends |
| `idempotent` | abort twice | one dispose |
| `cancel` | the consumer cancels, then the request aborts | one dispose, and the source is cancelled |

### `server/render/document.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `shell hook` | a shell with `</body>` | `onCompleteShell` ran before the shell chunk was observed by the test reader |
| `3 MiB shell` | a text node of 3 MiB | the response completes and the status was 200 before the body was fully read |
| `two fragments` | two `defer()` calls, each read by `createMemo(async () => deferred.promise)` under its own `<Loading>` | the shell contains both fallback strings and neither resolved string. The fast string is written before the slow promise resolves. The slow fallback is still the only text for that slot until its fragment |
| `reject keeps shell` | one of those promises rejects and the other resolves | status stays 200. The shell is not replaced by an error document. The resolved fragment contains its string |
| `client import` | the document | beside the state script, `<script type="module" async>import("<url>")</script>`. The dev URL is `/` plus the project-relative client entry. The production URL is that entry's hashed file. A missing production entry fails the build |
| `hydration capture` | an HTML document | one capture script in `head`, before `#flare-critical`, emitted by `generateHydrationScript`. It contains `_$HY`, the listeners `click` and `input`, and `<!--xs-->`. With a nonce, the script has that nonce. With a string CSP, it has no nonce attribute. A data response does not contain `_$HY` |
| `abort after shell` | the request aborts after the shell, while a fragment is pending | the next read is done. The pending fragment is not written |
| `failure after shell` | the render fails after writing the shell | the shell bytes are read unchanged, then the body errors. Flushed bytes are not rewritten (B76) |
| `state nonce` | a document with a nonce, and one with a string CSP | with a nonce, the `self.flare` script carries `nonce="<n>"` and `self.flare.nonce` is that string. With a string CSP, the script has no nonce attribute (B68) |
| `matches required` | `renderDocument` with no `matches` | does not type-check. There is no placeholder state entry: every `self.flare.matches` entry is a real match (B83) |

### `shared/errors/status.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `render NotFoundError` | the error class thrown by `notFound()` | 404, including when the throw happens after headers would have been 200 |
| `rank` | one match is 500 and a descendant calls `notFound()` | the document status stays 500 |
| `not found keeps 500` | a loader throw and a later `notFound()` | 500, not 404 |

### `tests/integration/stream.test.ts`

| test | case | result |
| --- | --- | --- |
| `abort closes` | the client aborts after the first byte | the server request's socket closes within one second |
| `throw before shell` | the root throws immediately in production | status 500, body length 0, the overlay sender is not called |
| `dev before shell` | the root throws immediately in dev | status 500, the body contains the message and a stack frame, the sender is called |
| `cancel disposes` | the readable is cancelled | the render's dispose ran |

### `shared/url/href.test.ts` (extended)

`buildUrl` turns a route id into its URL with `idPattern` and `patternSegments` from `shared/route-tree`. It has no parser of its own, so a built URL is always one the router matches.

| test | case | result |
| --- | --- | --- |
| `group and root` | `_root_/(blog)/post`, `_admin_/dashboard`, `site/_root_/about`, `_shop_/cart` | `/post`, `/dashboard`, `/about`, `/cart` |
| `param before root` | `[locale]/_root_/about` with `{ locale: "en" }` | `/en/about` |
| `literal bracket` | `_root_/[_]id]` | `/[id]`. The brackets are a static segment and are path-encoded the way the matcher compares them |
| `optional` | `_root_/optional-locale/[[locale]]` with and without `locale` | `/optional-locale/fr` and `/optional-locale` |
| `catch-all` | `_root_/files/[...path]` with `{ path: ["a", "b c"] }` | `/files/a/b%20c`. Each value is one encoded segment. A value containing `/` throws. An empty array throws for a required catch-all and gives `/files` for an optional one |
| `round trip` | each URL above | `router.match()` returns that route id and the same raw params |
| `search and hash` | `{ to, search: { q: "a b" }, hash: "top" }` | the search is written by `writeUrl` and the hash keeps one leading `#` |

### `server/lifecycle/create.test.ts` (extended)

A thrown `redirect()` from `authenticate`, a preloader, `authorize`, or a loader on a document request answers the redirect status (B73). The data-request `x` frame is bit 06.

| test | case | result |
| --- | --- | --- |
| `loader redirect` | a loader throws `redirect({ to: "_root_/users/[id]", params: { id: "7" }, search: { tab: "a" }, hash: "x", status: 302 })` | 302. `Location` is `buildUrl`'s URL under `basePath`, here `/users/7?tab=a#x`. The body is empty, no `render` or boundary runs, the security set is present, and the overlay sender is not called |
| `redirect href` | `redirect({ href: "https://example.com/a", status: 303 })` | 303 and `Location: https://example.com/a` |
| `redirect from auth` | `authenticate` and `authorize` each throw `redirect({ to: "_root_/login" })` | 307, the `redirect()` default, and `Location: /login` for both |
| `target kept` | `redirect({ to, params, search, hash })` | the thrown `RedirectError` carries `params`, `search`, and `hash` as well as `to`, `href`, `status`, and `replace`, so the server can build `Location` from it |
| `authenticate throw` | `authenticate` throws a plain `Error` | 500, an empty body, and no `Location`. It is not a redirect and not 401 (B82) |

## Done

A thrown secret does not leave the process in production. In dev the stack is in the uncommitted body and Vite's overlay opens. Aborting the client ends the server stream.
