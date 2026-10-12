# Bit 08 — Middleware, mounts, proxy

Creates every `P8` row.

## Extends

`src/exports/server.ts` re-exports the middleware type, `mount`, and `proxy`.

## Cases

### `server/middleware/filters.test.ts`

| test | case | result |
| --- | --- | --- |
| `exact` | filter `/about`, path `/about` | match |
| `case` | filter `/About`, path `/about` | match |
| `prefix boundary` | filter `/admin`, path `/administrator` | no match |
| `prefix hit` | filter `/admin`, path `/admin/users` | match |

Filters are `exact` or `prefix`. There is no regular expression.

### `server/middleware/run.test.ts`

| test | case | result |
| --- | --- | --- |
| `order` | two middleware | the first calls `next`, the second runs, then the first's after-code runs |
| `respond` | the first calls `respond` | the second does not run, finalize does |
| `bypass` | the first calls `bypass` | the router does not run, finalize does |
| `second next` | `next()` twice | 500 |
| `onResponse throw` | the after-code throws | 500, the original body is discarded |
| `after sees redirect` | the router returns 303 | `next()` resolves with that response |
| `throw before` | the router throws before any response | `next()` rejects and the after-code does not run |
| `path is canonical` | the request was `/About` and folded | `ctx.path` is `/about` |
| `return replaces` | the middleware returns a `Response` | that response replaces the router response. Returning void keeps it. `respond` and `bypass` return void, stash that response, and skip `next()` |

### `server/mount/mount.test.ts`

| test | case | result |
| --- | --- | --- |
| `match` | mount `{ prefix: "/api", fetch }` and path `/api/x` | `fetch` runs |
| `no match` | path `/about` | the router runs |
| `segment boundary` | prefix `/api`, path `/apiv2` | the router runs |
| `root prefix` | prefix `"/"` | throw at startup |
| `headers` | the mount returns a body | finalize adds the security set. The mount does not get to omit it |
| `longer prefix wins` | mounts `/api` and `/api/v2` | `/api/v2/x` hits `/api/v2` |
| `equal prefix` | two mounts with the same prefix | throw at startup |
| `strip` | prefix `/api`, path `/api/x?q=1` | `fetch` sees `/x?q=1`. After the strip, `//`, a backslash, or a control character is 400 |
| `sync handler` | a handler that returns a plain `Response`, and one that throws synchronously | the `Response` is the answer. The throw is the projected 500 |
| `env` | a handler reading its second and third arguments | it receives `createServer`'s env and the adapter's `ctx`, whose `waitUntil` runs the work |
| `server context` | `serverContext` set and `serverCtx()` called in the mount | the value is returned, and `serverContext` ran once |

### `server/proxy/proxy.test.ts`

| test | case | result |
| --- | --- | --- |
| `hop by hop dropped` | upstream sends `Connection` and `Transfer-Encoding` | those headers are absent on the way out and on the way back |
| `cookie off` | the incoming request has `Cookie` | the upstream request does not, unless `forwardCookies: true` |
| `authorization off` | the incoming request has `Authorization` | the same, unless `forwardAuthorization: true` |
| `redirect manual` | upstream returns 302 | the client receives 302 |
| `location rewritten` | upstream `Location: /secret` and the mount prefix is `/api` | `Location: /api/secret` |
| `hostile location` | upstream `Location: //evil` | 502, the `Location` is not forwarded |
| `raw body` | a POST body with bytes that are not valid UTF-8 | the upstream receives the same bytes |
| `set-cookie relay` | upstream sends `Set-Cookie` | the client response has it only when `relaySetCookie: true` |
| `named connection` | `Connection: x-custom` and upstream sends `X-Custom` | `X-Custom` is dropped |
| `cookie on` | `forwardCookies: true` | the upstream request has the `Cookie` header |
| `authorization on` | `forwardAuthorization: true` | the upstream request has the `Authorization` header |
| `set-cookie many` | `relaySetCookie: true` and two `getSetCookie()` values, including on a 302 | both values are appended unchanged. `Path` and `Domain` are not rewritten. A `Connection` token of `set-cookie` does not remove them. `false` deletes every `Set-Cookie` |
| `no mount` | `proxy` with no active mount | throw |
| `absolute location` | upstream `Location` is `https://example.com/a` | 502. The `Location` is not forwarded. A single-slash path is still prefixed |
| `decoded body` | upstream sends `Content-Encoding: gzip` and a `Content-Length` | both are absent on the way back and the body is the decoded text, because `fetch` decompressed it |

### `tests/integration/middleware.test.ts`

| test | case | result |
| --- | --- | --- |
| `filter` | a middleware filtered to `/admin` | a request to `/about` does not enter it |
| `mount and page` | a mount and a page | each path hits its handler, and both responses have the security set |
| `proxy` | a mount that proxies to a local test server | the body round-trips and hop-by-hop headers do not |

## Done

Middleware cannot skip finalize. A proxy cannot forward a scheme-relative `Location`.
