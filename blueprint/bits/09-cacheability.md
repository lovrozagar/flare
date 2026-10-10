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

### `server/lifecycle/policies.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `header` | a shared document with `maxAge` and `swr` | `public, max-age=0, s-maxage=<maxAge>, stale-while-revalidate=<swr>` |
| `private header` | a private document | `private, no-store` |
| `no-store header` | the default | `private, no-store` |
| `cache tag` | a shared document with `cdn.tags` `["a", "b"]` | `Cache-Tag: a, b` |

## Done

A required-auth route cannot be classified `shared`. `Set-Cookie` downgrades a shared decision. Variants are URLs.
