# Bit 09 — Cacheability

Creates every `P9` row. This bit decides the policy. It does not write a store. Bit 10 is the only writer, and it refuses anything this bit did not mark `shared`.

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

### `tests/integration/cacheability.test.ts`

| test | case | result |
| --- | --- | --- |
| `required chain` | `cache.ssr` and `cdn.maxAge` under a layout that requires, with a session | `private, no-store` |
| `optional chain` | `cache.isr` and `cdn.maxAge` on a chain that reads | without a session, `private, no-store` and `runLoaders` receives `shared: true`. With a session, `private, no-store` and `shared: false` |
| `public page` | `cache.isr`, `cdn.maxAge`, and `cdn.tags` on a public chain | the document, data, and prefetch responses each carry the same public `Cache-Control` and `Cache-Tag` |
| `route cookie` | the public page's `.headers()` sets a cookie | `private, no-store` |
| `middleware cookie` | a middleware adds `Set-Cookie` to the public page's response | `private, no-store` |
| `not found` | the public page's loader throws `notFound()` | 404 and `private, no-store` |

## Done

A required-auth route cannot be classified `shared`. `Set-Cookie` downgrades a shared decision. Variants are URLs.
