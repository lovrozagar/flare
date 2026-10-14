# Bit 03 — Ingress

Creates every `P3` row. Security headers, the Bun and Workers adapters, and method discipline on every status.

## Extends

`server/lifecycle/finalize.test.ts` gains the header cases. `adapters/node/request.test.ts` gains nothing new; bit 01 already covers the hostile targets.

`src/exports/index.ts` re-exports `nonce`.

`server/render/document.test.ts` gains `nonce option`: `renderToStream` is called with the request nonce string. A string CSP calls it without a nonce.

`server/render/state.test.ts` gains `nonce field`: the script assigns the nonce it was given, and `empty nonce`: `""` is assigned as `""`.

`server/render/head.test.ts` gains `jsonld nonce`: the jsonLd script's nonce equals the request nonce.

`tests/e2e/playwright.config.ts` gains `bun-dev-chromium`, `bun-dev-firefox`, and `bun-dev-webkit`. `boot.test.ts` gains `bun dev`: `{ app: "minimal", runtime: "bun", mode: "dev" }` answers GET `/` with 200. `workers` with `mode: "dev"` still throws. There is no `workers-dev` project. The Playwright files that already exist run on all three `bun-dev` browsers with no new cases (B70).

## Cases

### `server/security/defaults.test.ts`

| test | case | result |
| --- | --- | --- |
| `no powered by` | a default response | no `X-Powered-By` |
| `hsts` | an https response | `max-age` and `includeSubDomains`, no `preload` |
| `nosniff` | every response | `X-Content-Type-Options: nosniff` |
| `referrer` | every response | `Referrer-Policy: strict-origin-when-cross-origin` |

The full default set is those three plus `X-Frame-Options: DENY` and `Cross-Origin-Opener-Policy: same-origin`. A test lists the names so adding a header is a deliberate change.

### `server/security/csp.test.ts`

| test | case | result |
| --- | --- | --- |
| `nonce pair` | a default policy | `script-src` and `style-src-elem` contain the nonce. `style-src` does not |
| `style attr` | the default | `style-src-attr` is `'unsafe-inline'` |
| `per request` | two candidates | two different nonces |
| `string drops nonce` | CSP set to a string | the string is sent and it contains no nonce |
| `false drops header` | CSP set to `false` | no `Content-Security-Policy` header is produced, and the nonce is `""` |
| `length` | a default policy | the nonce is 32 hex characters |
| `dev http` | the request URL is `http://localhost` | `upgrade-insecure-requests` is absent |
| `permissions deny` | the default | `payment=()` and the other nine features are `()` |
| `star` | one feature set to `true` | that feature is `*` |
| `origin quote` | an allowlist entry containing `"`, a space, or `;` | throw, naming the feature |
| `partial keeps defaults` | the directives object names only `img-src` | `img-src` is the user's list. `script-src`, `style-src-elem`, and the other unnamed directives stay at the defaults, and the nonce is still appended |
| `style copy` | `style-src` is set and `style-src-elem` is not | `style-src-elem` is that list plus the nonce |
| `named directives` | `frame-ancestors`, `form-action`, `media-src`, and an empty `frame-src`; then the two booleans | each appears, in the header's order after `worker-src`, the empty one as its bare name, and none without a value; `upgrade-insecure-requests: false` removes it on https and `true` adds it on http; `block-all-mixed-content` appears only when `true` (BUGS.md 112) |
| `permission values` | `camera: "self"`, a string policy, `false` | `camera=(self)`; the string as written; no header (BUGS.md 112) |
| `dev extras` | `vite dev` | `connect-src` contains the four localhost `ws:` and `http:` sources, `script-src` contains `'unsafe-eval'`, `worker-src` contains `blob:`, and HSTS and COOP are absent. The nonce stays |

### `server/security/apply.test.ts`

| test | case | result |
| --- | --- | --- |
| `overwrites` | the body arrived with a stored `Content-Security-Policy` | the fresh policy replaces it |
| `route security` | the page's `.security()` sets `X-Frame-Options` to `SAMEORIGIN` | that value wins over the server default |
| `callback override` | a callback that sets `X-Frame-Options` to `SAMEORIGIN`, with the request's context, then without one | that value is the header, and the callback saw the nonce the result carries; without a context it does not run and `DENY` holds (BUGS.md 112) |
| `every key` | each of the nine keys as a string, then each as `false` from a route, then none; then a rebuild with the first set's candidate | each string is its header; every header is gone; `Cross-Origin-Resource-Policy` and `X-Powered-By` are absent by default; the rebuild keeps the nonce (BUGS.md 112) |
| `false removes` | `.security({ "X-Frame-Options": false })` | the header is absent |
| `headers() cannot` | `.headers()` sets `Content-Security-Policy` | the security value still wins |
| `both cookies` | the parent sets `set-cookie` to `a` and the child sets it to `b` | both values, parent then child. An undefined child value keeps the parent. Every other header is child-wins |
| `server security` | `serveWith` with `serverContext`, a security callback returning a directives CSP, HSTS, and `X-Powered-By`, and a page whose `.security()` sets Permissions-Policy `camera: "self"`; GET `/` with an env, an unknown path, then `//x` | the document carries `frame-ancestors 'self'`, `camera=(self)`, `max-age=1`, and `X-Powered-By: flare`; the callback saw serverContext's value, the env, the path, and the nonce the CSP carries; the 400 carries the default HSTS and no `X-Powered-By`, and the callback ran twice, not three times (BUGS.md 112) |
| `dev policy` | the server's dev mode, then production | dev's `worker-src` is `'self' blob:`, so Vite's ping worker runs. Production's stays `'self'`. The server and a route's `.security()` both pass the mode |

### `server/lifecycle/finalize.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `401 has the set` | a thrown `unauthenticated()` | 401 and every default security header |
| `404 has the set` | no match | 404 and the same headers |
| `redirect has the set` | a 301 | 301, `Location`, and the same headers |
| `500 has the set` | a thrown `Error` | 500 and the same headers |
| `flare-build` | any response | `flare-build` is the build id |
| `no server timing` | any response | Flare set no `Server-Timing` field |

### `server/lifecycle/methods.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `order` | a page that matches | match runs, then the method rule |
| `response methods` | a `.response()` page, OPTIONS and POST | both reach the function. The adapter does not drain the POST body first. There is no method list |
| `unmatched post` | no route matches, POST | 405 with `Allow: GET, HEAD, OPTIONS`. On Workers the assets binding is not called. An unmatched GET or HEAD is not-found |

### `adapters/node/body.test.ts`

| test | case | result |
| --- | --- | --- |
| `unread post` | POST to a page, which is 405, with a body | the body is drained or the socket is closed before the next request on that connection |
| `response route keeps the stream` | a `.response()` route reads the body | the adapter does not drain it first |

### `adapters/bun/serve.test.ts`

| test | case | result |
| --- | --- | --- |
| `body limit` | `bodyLimit: 1024` | the Bun serve options contain `maxRequestBodySize: 1024` |
| `default` | no `bodyLimit` | `maxRequestBodySize` is 1 MiB |
| `server limit` | `createBunFetch(createServer({ router, bodyLimit: 2048 }))`, then no `bodyLimit`, then `0`, `1.5`, and 32 MiB plus one | `maxRequestBodySize` is 2048, then 1 MiB; 32 MiB is accepted; each out-of-range value throws `bodyLimit is an integer from 1 to 33554432 bytes` (BUGS.md 110) |

| `trust proxy` | a POST with a body and `X-Forwarded-Proto: https`, with `{ trustProxy: 1 }` and then without; a GET without the header; then hop count `6` | the server sees `POST https://site.test/a` with its body, then `POST http://site.test/a`, then the GET unchanged; `6` throws (BUGS.md 109) |

The test imports the options builder, not `Bun.serve`, so it runs under Node. `body limit` and `default` pass a hand-made server; `server limit` passes the one `createServer` returns.

### `shared/url/forwarded.test.ts` (BUGS.md 109)

| test | case | result |
| --- | --- | --- |
| `hops` | `{}`, `trustProxy` 5, then -1, 1.5, 6, then a `bodyLimit` key | 0, 5, then each throws `trustProxy is an integer from 0 to 5`, then `createBunFetch takes only trustProxy` |
| `https` | hop counts and `X-Forwarded-Proto` values | only a trusted hop's `https` counts |

### `adapters/workers/handler.test.ts`

| test | case | result |
| --- | --- | --- |
| `waitUntil` | a handler calls `background` | `ctx.waitUntil` received that promise |
| `assets GET` | no route matches, method GET, `assets: "ASSETS"` | the binding's `fetch` is called with the canonical request |
| `assets POST` | no route matches, method POST | 405, the binding is not called |
| `assets escape` | the path is canonicalized before the binding sees it | the binding receives the canonical path |
| `assets missing` | `assets: "ASSETS"` and the env has no such binding | 500, logged once |
| `assets miss` | no route matches, and the binding answers 404, for GET and HEAD; then a path the binding has | the app's own 404 answer, its body and headers, as on Node and Bun. The binding's file is returned untouched, with none of the app's headers |
| `connecting ip` | `CF-Connecting-IP` is `1.2.3.4`, and a request where the header is absent | `clientIp` is `1.2.3.4`, or absent |

### `tests/workerd/handler.test.ts`

| test | case | result |
| --- | --- | --- |
| `real binding` | the same unmatched GET inside workerd | the assets binding responds |
| `waitUntil` | a deferred task | `waitUntil` was invoked |

### `packages/core/lint/funnel-only.test.ts`

| test | case | result |
| --- | --- | --- |
| `new Response in loaders` | `return new Response()` under `server/loaders` | lint error |
| `new Response in finalize` | the same under `finalize.ts` | no error |
| `new Response in proxy` | the upstream `fetch` result | no error |
| `dev document` | `return new Response` in `server/render/dev-document.ts` | no error: a dev document gets its dev tags after the pipeline answered (B95 (b)) |
| `dev guard` | `return new Response` in `vite/dev/guard.ts` | no error: a dev-only endpoint answers outside the pipeline (bit 12) |

### `packages/core/lint/no-flare-header-branching.test.ts`

| test | case | result |
| --- | --- | --- |
| `request header` | `request.headers.get("flare-isr")` | lint error |
| `response header` | `headers.set("flare-render", "ssr")` inside `finalize.ts` | no error |
| `client response header` | `response.headers.get("flare-build")`, or a name in a constant, in a file under `src/client/` (bit 06) | no error. The client reads `flare-` headers on a response. Only the server must not branch on one a request sent |

### `shared/csp/nonce.test.ts`

| test | case | result |
| --- | --- | --- |
| `server read` | a request whose nonce is `abc` | `nonce()` returns `abc` |
| `server outside` | no request | throw |
| `server fn` | a server-function request | throw |
| `client` | `self.flare.nonce` is `abc` | `nonce()` returns `abc` |
| `client absent` | `self.flare` has no `nonce` | `""` |

### `tests/integration/nonce.test.ts`

| test | case | result |
| --- | --- | --- |
| `same value` | a head inline script, a jsonLd script, a custom style, and a render that prints `nonce()` | each nonce attribute equals the CSP header nonce, and the printed value equals it |
| `nested` | a page renders a child, and that child renders another child that prints `nonce()` | the child prints the CSP header nonce. The page passed no nonce prop |
| `second request` | two document requests | two nonces. Each document matches its own header |
| `string omits` | CSP is a string | the header is that string, those tags have no nonce attribute, and the printed `nonce()` is empty |
| `false omits` | CSP is `false` | no `Content-Security-Policy` header, those tags have no nonce attribute, and the printed `nonce()` is empty |

### `tests/integration/ingress.test.ts`

| test | case | result |
| --- | --- | --- |
| `preview is not required` | the test boots `createNodeListener` | the assertions pass without Vite |
| `hostile table` | the four hostile targets from bit 01 | 400 on this adapter too, through a full `fetch` |

## Done

Every status the skeleton can produce carries the security header set. Workers unmatched GET reaches the assets binding. Unmatched POST does not.
