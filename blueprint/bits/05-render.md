# Bit 05 — Render

Creates every `P5` row. The projector and the abort race. `renderToStream`'s `signal` option is passed, and the adapter also races the chunk-0 wait and every later pull, because on `@solidjs/web` 2.0.0-rc.13 aborting the signal does not close the writable (N3-2). The race stays if a later pin starts closing it.

## Extends

`server/render/document.test.ts` gains the abort and shell cases. `shared/errors/status.test.ts` gains the render-phase 404. `server/render/head.test.ts` gains `head throw`: a throw omits that match's head, the document status stays the loader status, it is a dev bug, and it does not open `errorRender`. `shared/errors/index.ts` re-exports `devErrorPayload` and `reportDevError` from `dev-report.ts`. `shared/route-builder/boundaries.test.ts` gains `four kinds`: the record that a page, layout, or root layout `render` returns has `errorRender`, `notFoundRender`, `unauthenticatedRender`, and `unauthorizedRender`, each stores its function under `boundaries`, and the methods are not enumerable. `boundary once` covers each method. The router reads `boundaries.notFoundRender`. `shared/components/index.ts` re-exports `boundaryAt`, `boundaryFallback`, and `boundaryKind`. `server/loaders/cascade.ts` reads `boundaryKind` from it, so the status-to-function table exists once. The public entry does not.

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

### `server/render/abort.test.ts`

| test | case | result |
| --- | --- | --- |
| `before shell` | abort before the first chunk | the response ends, no chunk is written, the render dispose spy was called |
| `mid stream` | abort after chunk 0 | the next pull rejects or returns done, and the socket ends |
| `idempotent` | abort twice | one dispose |

### `server/render/document.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `shell hook` | a shell with `</body>` | `onCompleteShell` ran before the shell chunk was observed by the test reader |
| `3 MiB shell` | a text node of 3 MiB | the response completes and the status was 200 before the body was fully read |
| `two fragments` | two `defer()` calls, each read by `createMemo(async () => deferred.promise)` under its own `<Loading>` | the shell contains both fallback strings and neither resolved string. The fast string is written before the slow promise resolves. The slow fallback is still the only text for that slot until its fragment |
| `reject keeps shell` | one of those promises rejects and the other resolves | status stays 200. The shell is not replaced by an error document. The resolved fragment contains its string |
| `client import` | the document | beside the state script, `<script type="module" async>import("<url>")</script>`. The dev URL is `/` plus the project-relative client entry. The production URL is that entry's hashed file. A missing production entry fails the build |
| `hydration capture` | an HTML document | one capture script in `head`, before `#flare-critical`, emitted by `generateHydrationScript`. It contains `_$HY`, the listeners `click` and `input`, and `<!--xs-->`. With a nonce, the script has that nonce. With a string CSP, it has no nonce attribute. A data response does not contain `_$HY` |

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

## Done

A thrown secret does not leave the process in production. In dev the stack is in the uncommitted body and Vite's overlay opens. Aborting the client ends the server stream.
