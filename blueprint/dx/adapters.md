# Adapters

The production entry is one of these. `vite preview` is not (B53). `trustProxy` and `bodyLimit` are `createServer` fields (`server.md`). The adapters read them off the server object. They are not arguments here.

## Node

```ts
createNodeListener(server): (req, res) => void
toRequest(req, trustProxy?: number): Request
```

`server` is the object `createServer` returns. It is required. `createNodeListener` has no second argument. A second argument throws (`adapters/node/listener.test.ts` `no options`).

The listener writes each chunk as it arrives and waits on backpressure. It calls `server.fetch(request, undefined, { waitUntil })`, retains that promise, and does not delay the response for it. Every `getSetCookie()` value is its own `Set-Cookie`. The listener does not rebuild that header with `headers.forEach` (`listener.test.ts` `wait until`, `set-cookie`). `toRequest` rejects a target of `//`, a backslash, an absolute-form request line, and a control character before it parses a URL (`request.test.ts`). `trustProxy` defaults to `0`. The hop count is the server's when the listener calls `toRequest`. `clientIp` follows `dx/server.md`.

An unread POST body is drained, or the connection is closed, before the next request on that socket (`body.test.ts` `unread post`). A `.response()` route receives the stream. The adapter does not drain it first.

## Bun

```ts
createBunFetch(server): { fetch, maxRequestBodySize }
```

`fetch` is `(request: Request) => Promise<Response>`. `maxRequestBodySize` is the server's `bodyLimit` (default 1 MiB). The app passes both to `Bun.serve`:

```ts
Bun.serve(createBunFetch(server));
```

Setting a different `maxRequestBodySize` beside this object makes the platform cap and the server-fn cap disagree. The test is `adapters/bun/serve.test.ts` `body limit` and `default`. There is no options argument.

## Workers

```ts
createWorkersHandler(server, { assets? }): { fetch(request, env, ctx) }
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `server` | yes | — | the `createServer` return | `fetch` calls `server.fetch` | | `adapters/workers/handler.test.ts` `waitUntil` |
| `assets` | no | absent | the env binding name, a string | after routing, an unmatched `GET` or `HEAD` is forwarded to `env[assets].fetch` with the canonical path | a missing binding is 500, logged once. It is not a silent 404 | `handler.test.ts` `assets GET`, `assets missing` |

An unmatched `POST` is 405 and the binding is not called (`assets POST`). The path is canonical before the binding sees it (`assets escape`). `ctx.waitUntil` receives the promises the handler scheduled (`waitUntil`). There is no `staticAssets` middleware (B13).

This binding is not the SSG store. A route that matched is read from `createServer({ static })`, which on Workers is `createAssetsStore` (`store.md`). The binding runs only after the router found no route.
