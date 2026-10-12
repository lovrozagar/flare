# Bit 09 — Cacheability

Creates every `P9` row. This bit decides the policy. It does not write a store. Bit 10 is the only writer, and it refuses anything this bit did not mark `shared`.

## Route header steps

`.headers()` and `.security()` (`dx/builder.md`) were not built by bits 01 to 03. Bit 03's `route security`, `false removes`, `headers() cannot`, and `both cookies` rows exercised `server/security/apply.ts` alone. This bit builds both steps before the policy header, because the decision overwrites what `.headers()` returns. They take the slots after `head` and before `render`. Each runs per match after its loader, on a document and on a data or prefetch response alike, and receives `{ params, search, loaderData, preloaderContext }` (`dx/types.md`).

Neither step grows `createPage` past its 1100 budget. Both are server-only and the client graph removes them, so a raise would pay for code no browser calls. Before either step lands, `typedSteps` builds every forwarding wrapper from `ORDER`'s keys, so a new step costs its `ORDER` slot and its `put` arrow. `createChain` keeps its steps written out: measured, a generated `put` list was 1140 because gzip compresses the repeated literal better than the machinery. The existing chain, page, layout, and propagation tests pass unchanged on that refactor, and `createPage` measured 1088 after it (6ab1f52).

### `vite/boundary/allow.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `security removed` | `routeMethod("security")` | `remove`. Before this row, `.security()` in a route file was an unknown method and failed the client build |

### `shared/route-builder/chain.test.ts`

| test | case | result |
| --- | --- | --- |
| `headers step` | `.head().headers(fn).security(config).render()` | builds. `.headers()` after `.security()` or after `.render()` throws `order`, and a second `.headers()` throws |
| `forwarded steps` | the keys of a layout and a page builder, and `keyof BuilderSteps` | a layout's keys are the forwarded steps plus `render`, a page's add `intercept` and `response`, and the type's keys minus `render` are the same forwarded steps. This pins ORDER's key arrangement: a page's own steps first, `render` last |
| `security step` | `.security(config)` and `.security((ctx) => config)` | both build. A layout and a root layout have both steps. A segment has neither |

### `server/loaders/run.test.ts`

| test | case | result |
| --- | --- | --- |
| `headers merge` | the root, a layout, and the page each return headers | parent to child. A child key wins. `set-cookie` appends parent values then child values. An undefined child value keeps the parent |
| `headers after throw` | the layout loader throws | the layout's `.headers()` is not called. The page's still runs when its loader resolved |
| `headers throw` | the page's `.headers()` throws | that match's headers are omitted and the status is unchanged (B82) |
| `security merge` | server, layout, and page configs | outside-in. A set key replaces. `false` removes, including a parent value. A function receives the four fields and no `nonce` |

### `server/lifecycle/finalize.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `cookies kept` | an answer with two `Set-Cookie` values | both arrive. finalize appends each `getSetCookie()` value. A `set()` kept only the last |

### `tests/integration/ingress.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `route security` | the page's `.security({ "X-Frame-Options": "SAMEORIGIN" })` | the document and its data response carry `SAMEORIGIN`. `.security({ "X-Frame-Options": false })` on another page removes it |
| `route string csp` | the page's `.security()` sets a string CSP | the header is that string, and no script or style tag in the document has a `nonce` attribute (B68) |
| `headers cannot secure` | the page's `.headers()` sets `Content-Security-Policy` and `X-Frame-Options` | the security values win |

## Extends

`server/lifecycle/policies.test.ts` now calls `decide` instead of returning the skeleton default for every document.

## Cases

### `server/cacheability/decide.test.ts`

| test | case | result |
| --- | --- | --- |
| `no config` | a page with no `cache` | `no-store` |
| `ssr public` | `cache.ssr` and the chain does not require or read auth | `shared` |
| `required auth` | `cache.ssr` and the chain requires | `no-store` |
| `optional auth` | `cache.ssr` and the chain reads | `shared`, policy class `anonymous`. The store key has no class segment (B73) |
| `isr` | `cache.isr` and the chain does not read auth | `shared` |
| `isr under auth` | `cache.isr` and the layout requires | `no-store` |
| `cdn private` | `cache.cdn.private: true` | `private` |
| `cdn without a mode` | `cache.cdn` and no `ssr`, `ssg`, or `isr` | `no-store` |
| `optional with session` | `cache.ssr`, the chain reads, and the request has a session | `private` |
| `ssg` | `cache.ssg` and the chain does not read auth | `shared`, class `public` |
| `ssg under auth` | `cache.ssg` and the layout requires | `no-store` |
| `segment cdn` | a segment sets `cdn.maxAge` `"60s"`, and the page sets `cache.isr` and `cdn.swr` but no `maxAge` | the decision's `cdn` is `{ maxAge: "60s", swr }`. A page `maxAge` would win over the segment's |
| `private sticky` | a layout sets `cdn.private: true` and the page sets `cdn.private: false` | `private` |

### `server/cacheability/variant.test.ts`

| test | case | result |
| --- | --- | --- |
| `three urls` | `/a`, `/a?_flare=data`, `/a?_flare=prefetch` | three variant ids |
| `user search stays` | `/a?q=1&_flare=data` | the variant id contains `q=1` and does not contain `_flare` |
| `no vary` | the module | it does not set a `Vary` header |

### `server/cacheability/cookies.test.ts`

| test | case | result |
| --- | --- | --- |
| `set-cookie downgrades` | a shared decision and a `Set-Cookie` header | the decision becomes `private` |
| `allow` | `cache.cdn.allowCookies: true` | the decision stays `shared` |
| `locale cookie` | a shared document | bit 13 is what must not set the cookie. This test only checks the downgrade |
| `late cookie` | `allowCookies: true`, and a `Set-Cookie` appears after the page stage, as a middleware adds one | `private`. The route's own cookie alone stays `shared` |

### `server/lifecycle/policies.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `header` | a shared document with `maxAge` and `swr` | `public, max-age=0, s-maxage=<maxAge>, stale-while-revalidate=<swr>` |
| `private header` | a private document | `private, no-store` |
| `no-store header` | the default | `private, no-store` |
| `cache tag` | a shared document with `cdn.tags` `["a", "b"]` | `Cache-Tag: a, b` |
| `anonymous header` | `shared`, class `anonymous`, with `cdn.maxAge` and `cdn.tags` | `private, no-store` and no `Cache-Tag` |
| `error status` | a `public` shared decision and a 302, 401, 403, 404, or 500 | `private, no-store` and no `Cache-Tag` |
| `data error frame` | a `public` shared decision and a 200 data response with an `e` frame or a redirect | `private, no-store` |
| `headers cannot` | `.headers()` returns `Cache-Control: public, max-age=60` and `Cache-Tag: x` on a page with no `cache` | `private, no-store` and no `Cache-Tag` |
| `response auth` | a `.response()` page under `authenticateOptional` returns `Cache-Control: public, max-age=60` | `private, no-store`. The same page with no auth keeps `public, max-age=60` |

### `server/lifecycle/policies.test.ts` (exit)

| test | case | result |
| --- | --- | --- |
| `exit headers` | `exitHeaders` on a public answer finalize recorded with its cookie, the same answer after a middleware appends a cookie, a rebuilt copy, a public answer with no cookie, and a private answer with a cookie | the recorded answer and the cookieless one keep the public header. The late cookie and the rebuilt copy leave `private, no-store` with no `Cache-Tag`. The private answer is untouched |

### `server/lifecycle/answers.test.ts`

The rendered-page answers move out of `create.ts` unchanged at the 300-line limit. The decision is made here, before `runLoaders`.

| test | case | result |
| --- | --- | --- |
| `one session` | a public `cache` on a chain that reads, with a session | `private, no-store`, and authenticate runs once: the decision and the gate share the memoized session |
| `public chain` | a public `cache` on a chain that does not read auth | the public header, and authenticate is never called |
| `session throw` | a chain that reads, whose authenticate throws | the gate's 500 and `private, no-store`. The decision counts a throw as a session |
| `data error frame` | a public page whose loader throws, on a data request | HTTP 200 with an `e` frame, `private, no-store`, and no `Cache-Tag` |

### `server/middleware/run.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `rewrap keeps body` | a middleware returns `new Response(res.body, res)` | the router's body arrives. Before this row, the runner cancelled the router's stream whenever the returned Response was another object, so the rewrap failed with a disturbed body |

### `tests/integration/cacheability.test.ts`

| test | case | result |
| --- | --- | --- |
| `required chain` | `cache.ssr` and `cdn.maxAge` under a layout that requires, with a session | `private, no-store` |
| `optional chain` | `cache.isr` and `cdn.maxAge` on a chain that reads | without a session, `private, no-store` and `runLoaders` receives `shared: true`. With a session, `private, no-store` and `shared: false` |
| `public page` | `cache.isr`, `cdn.maxAge`, and `cdn.tags` on a public chain | the document, data, and prefetch responses each carry the same public `Cache-Control` and `Cache-Tag` |
| `route cookie` | the public page's `.headers()` sets a cookie | `private, no-store` |
| `middleware cookie` | a middleware adds `Set-Cookie` to the public page's response | `private, no-store` |
| `not found` | the public page's loader throws `notFound()` | 404 and `private, no-store` |
| `rewrapped answer` | a middleware returns `new Response(res.body, res)` for the public page, whose `.headers()` sets a cookie under `allowCookies: true` | `private, no-store`. The exit knows the route's cookies only on the answer the page built, so a rewrapped answer that carries a public header and any `Set-Cookie` fails closed |

## Done

A required-auth route cannot be classified `shared`. `Set-Cookie` downgrades a shared decision. Variants are URLs.
