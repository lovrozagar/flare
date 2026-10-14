# Adapters

The production entry is one of these. `vite preview` is not (B53). `bodyLimit` is a `createServer` field (`server.md`), which Flare's own reader enforces on every runtime. `trustProxy` is the Node and Bun adapters' own option, below: the adapter is what sees the socket and the proxy's headers (BUGS.md 109).

## Node

```ts
createNodeListener(server, { trustProxy? }?): (req, res) => void
toRequest({ url, headers?, socketAddress?, trustProxy? }): { status, secure, clientIp, resolvedOrigin, url }
```

`server` is the object `createServer` returns. It is required.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `trustProxy` | no | `0` | hop count, integer `0`–`5` | how many proxy hops in front of the server are trusted. With at least one, `X-Forwarded-Proto: https` makes the request the server sees https, so its origin, a redirect's `Location`, and `Strict-Transport-Security` follow. With `0` a client's own `X-Forwarded-Proto` is ignored | behind a proxy that ends TLS, `0` serves the app as plain http. `true` does not type-check; v0's boolean trusted the whole chain. Any other key, `bodyLimit` included, throws, and so does a count out of range | `adapters/node/listener.test.ts` `trust proxy`; `shared/url/forwarded.test.ts` `hops`, `https` |

`toRequest` is the step the listener runs: it rejects a bad target and computes `secure`, `clientIp`, and the origin (`server.md` Client address).

The listener writes each chunk as it arrives and waits on backpressure. It calls `server.fetch(request, undefined, { waitUntil })`, retains that promise, and does not delay the response for it. Every `getSetCookie()` value is its own `Set-Cookie`. The listener does not rebuild that header with `headers.forEach` (`listener.test.ts` `wait until`, `set-cookie`). `toRequest` rejects a target of `//`, a backslash, an absolute-form request line, and a control character before it parses a URL (`request.test.ts`). `trustProxy` defaults to `0`. The hop count is the server's when the listener calls `toRequest`. `clientIp` follows `dx/server.md`.

An unread POST body is drained, or the connection is closed, before the next request on that socket (`body.test.ts` `unread post`). A `.response()` route receives the stream. The adapter does not drain it first.

## Bun

```ts
createBunFetch(server, { trustProxy? }?): { fetch, maxRequestBodySize }
```

`fetch` is `(request: Request) => Promise<Response>`. `maxRequestBodySize` is Bun's own default, 128 MiB, a platform ceiling and not the enforcement: Flare's capped reader answers a body over `bodyLimit`, at most 32 MiB, with 413 first, as on Node. A body over the ceiling makes Bun cut the connection, which a client reads as `EPIPE` or `ECONNRESET`, not a status (`serve.test.ts` `ceiling`, `bun oversized post`; BUGS.md 114). The app passes both to `Bun.serve`:

```ts
Bun.serve(createBunFetch(server));
```

Setting `maxRequestBodySize` at or below the server's `bodyLimit` puts Bun's cut before Flare's 413: an oversized POST then reads as a dropped connection. The second argument is `trustProxy`, as on Node: with a trusted hop, `X-Forwarded-Proto: https` rebuilds the request as https, its method and body kept (`serve.test.ts` `trust proxy`).

## Workers

```ts
createWorkersHandler(server, { assets? }): { fetch(request, env, ctx) }
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `server` | yes | — | the `createServer` return | `fetch` calls `server.fetch` | | `adapters/workers/handler.test.ts` `waitUntil` |
| `assets` | no | absent | the env binding name, a string | after routing, an unmatched `GET` or `HEAD` is forwarded to `env[assets].fetch` with the canonical path | a missing binding is 500, logged once. It is not a silent 404 | `handler.test.ts` `assets GET`, `assets missing` |

A file the binding has is its response, untouched. A path the binding answers with 404 is the app's own not-found answer, with its security headers, as on Node and Bun (`assets miss`). An unmatched `POST` is 405 and the binding is not called (`assets POST`). The path is canonical before the binding sees it (`assets escape`). `ctx.waitUntil` receives the promises the handler scheduled (`waitUntil`). There is no `staticAssets` middleware (B13).

This binding is not the SSG store. A route that matched is read from `createServer({ static })`, which on Workers is `createAssetsStore` (`store.md`). The binding runs only after the router found no route.

### Client disconnect on Workers

Stopping a stream or closing a tab ends the request on the client at once (`server-fn.md`, BUGS.md B40). Whether the worker learns of it depends on the runtime. Cloudflare documents that `request.signal` aborts on a client disconnect only with the `enable_request_signal` compatibility flag, so an app that relies on a server-side abort (a long `.stream()`, a render that should stop) sets it in its Wrangler configuration; the docs app does. Local Miniflare (miniflare 4.20260708, workerd 1.20260708) never reports a disconnect to the worker, with or without the flag: the signal never aborts and the response body is not cancelled, so a stream's generator runs to its end there (BUGS.md B45). `tests/workerd/disconnect.test.ts` pins that local behavior as a canary: a Miniflare that starts reporting disconnects turns it red, and the skipped `docs-data` `stream abort` case on `workers-*` is then turned back on.

Local Miniflare also resets a kept-alive client connection when the worker answers a request without reading its body, as a CSRF 403 does: the next request on that socket fails with `ECONNRESET` (BUGS.md B56). Node's and Bun's servers keep the connection. Miniflare puts its own Node HTTP front on the client connection, while on Cloudflare the client talks to the edge, so the adapter does not drain an unread body: that would spend the worker's CPU and delay every early answer for a simulator artifact. Whether the real edge resets too is plan 13.11's deployed check. A `connection: close` request header does not reliably avoid the reset: on a kept-alive Node agent the next request still failed in 100 of 100 rounds, while a fresh connection per request did not. A request with no body leaves nothing unread and never triggers it, so a test that expects an early answer to a POST on the local Workers runtime sends that POST without a body. `disconnect.test.ts` pins the reset as a second canary that turns red when Miniflare keeps the connection. The same holds for the body cap: under local workerd (`wrangler dev`, the e2e boot), the 413 for an oversized POST is answered without reading the body, and the connection closes with the body unread, so a client still uploading, or reading the answer late, gets `ECONNRESET` instead of the 413. Test it with `Expect: 100-continue`, which sends no body the server does not ask for, or on a fresh connection; local workerd sends no `100 Continue`, so only an answer that reads no body comes back (BUGS.md 104).

