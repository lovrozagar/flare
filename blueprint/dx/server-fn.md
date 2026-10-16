# createServerFn

```ts
export const echo = createServerFn({ method: "post" })
  .authenticate()
  .input(validator)
  .authorize(({ auth, input }) => boolean)
  .handler(async ({ input, auth, env, request, serverContext }) => data)
```

`name` is not a config field (B85). The id is the B41 hash of the root-relative path and the export name. A `createServerFn` that is not a direct export fails the build (`vite/route-meta/ids.test.ts` `export name`, `not exported`).

The boundary transform rewrites each `createServerFn({ method })` to `createServerFn({ method, __id, __name })` in every graph, and adds `__client: true` in the client graph. These fields are internal and are not part of the typed config. `.handler()` and `.stream()` return a callable that carries `{ id, name, record }`. With `__client`, the callable is the HTTP stub; called directly during a client render, it warns in dev and then makes the call (B45, `client-stub.test.tsx` `client stub`). Without it, the callable is the in-request call.

An in-request call, a server function called from a loader, another server function, or `.response()`, runs authenticate, input, authorize, then the handler in-process, with no HTTP and no CSRF check. It uses the active request's `env`, `request`, `serverContext`, and session. The session is one memoized `authenticate` per request, shared by the page gate and every server function, so `authenticate` still runs once (`dx/server.md`). It returns the handler value, or throws the thrown error unprojected. Called with no active request it throws `server function called outside a request` (`dispatch.test.ts` `in request`, `no request`).

`.stream(async function* (ctx) { yield value })` replaces `.handler`. Setting both throws.

Each method may be called once, as on a route builder (`dx/builder.md`). A second `.input()`, `.authorize()`, `.cache()`, or `.authenticate()` throws when the chain is built, and the type no longer offers a method once it is called. A second `.input()` would otherwise silently replace the first validator. The call order is free; the run order is always authenticate, input, authorize, handler (`server/server-fn/builder.test.ts` `once`).

| call | required | default | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- |
| `method` | no | `"post"` | `"get"` or `"post"` | | `builder.test.ts` `default method`; `tests/integration/server-fn.test.ts` `method`; e2e `docs-data.test.ts` `server fn get cached`, `server fn post validates` |
| `authenticate()` | no | off | required session. The app's `createServer({ authenticate })` runs once. `callerData` is `[]` and `callerChain` is one entry whose `route` is the export name (`server.md`) | there is no `authenticateOptional` on a server function. Optional means not calling `authenticate` and reading `auth`, which is null when anonymous. That still counts as reading identity for CSRF fail-open: fail-open is off when `authenticate` or `authorize` is set. The method takes no arguments. A null session is 401 and the handler is not called | `csrf.test.ts` `fail closed`; `server/auth/caller.test.ts` `server fn`; `envelope.test.ts` `null session`; `tests/integration/server-fn.test.ts` `authenticate`; e2e `docs-cache.test.ts` `revalidate tag` |
| `input(validator)` | no | input is `undefined` | Standard Schema, `{ parse }`, or a function, checked in that order: a callable Standard Schema (ArkType's `type`, Effect's `Schema.standardSchemaV1`) validates as a schema; a plain Effect `Schema` is wrapped with `Schema.standardSchemaV1` (`tests/integration/builder.test.ts` `input libraries`, BUGS.md 154). Unwrapped, it is no validator: the server checks before validating, and the request is a 500 whose logged error names the route or server function and the fix, never a quiet 400 (`input plain effect`, BUGS.md 157). A promise from any of the three is awaited. Each issue is `{ message, path }`. `fieldErrors` at the first path segment is a `string[]`. A segment `{ key }` uses `key`. An empty path is only in `issues` | GET input is the `_i` param. POST input is the JSON body | `input.test.ts` `promise`, `field array`, `empty path`; `tests/integration/server-fn.test.ts` `input`; e2e `docs-data.test.ts` `server fn post validates` |
| `authorize(fn)` | no | absent | `false` is 403 with the message `Forbidden`. The handler is not called. This is JSON, not the page walk, and it does not open the dev overlay | | `dispatch.test.ts` `order`, `forbidden`; `tests/integration/server-fn.test.ts` `authorize`; e2e `docs-cache.test.ts` `revalidate tag` |
| `cache: { maxAge }` | no | `private, no-store` | accepts a duration. Legal only when `method` is `"get"` and there is no `authenticate` and no `authorize`. Only a 2xx answer with no `Set-Cookie` is public: an invalid input, a thrown `notFound()` or error, and a returned `Response` that sets a cookie are `private, no-store` (`tests/integration/server-fn.test.ts` `cache errors private`, BUGS.md 166) | any other combination throws when the chain is built | `cache-control.test.ts` `opt in`, `duration`; `tests/integration/server-fn.test.ts` `cache`; e2e `docs-data.test.ts` `server fn get cached` |

## Handler context

| field | present | outcome |
| --- | --- | --- |
| `input` | always | the validator's output, or `undefined` |
| `auth` | always | the session, or `null` when `authenticate` was not called |
| `env` | always | the fetch env, typed by `FlareRegister["env"]` |
| `request` | always | the request |
| `serverContext` | always | the object `createServer`'s request context produced. Typed by `FlareRegister["serverContext"]` |
| `signal` | stream only | the request `AbortSignal` |

The fields are `tests/integration/server-fn.test.ts` `handler context`; on a page, e2e `docs-data.test.ts` `server context` and `stream abort`. There is no `piggyback` and no `revalidate` field: a handler purges stored pages by calling `revalidate()` from `@lovrozagar/flare/server`, which hands its work to the request's `waitUntil` (`store.md`, BUGS.md 122). The query helpers are in `features.md`.

## Types

`.input()` replaces the input type. The start is `void`: the client function takes no argument, and `ctx.input` is `undefined`. After `.input()`, the client argument is the validator's input type and the handler's `ctx.input` is its output, because the validator runs on the server: a Standard Schema's `types.input` and `types.output`, the parameter and return of `{ parse }`, or of a function. A transforming validator such as `z.string().transform(Number)` takes a string from the caller and hands the handler a number. The argument crosses as JSON, so a validator should accept the JSON form (`z.coerce.date()`, not `z.date()`). A fresh extra key fails when that input is a closed object. A Standard Schema whose input is `unknown`, or a function typed `(value: unknown)`, does not reject a bad key.

The client type is `(input: TInput) => Promise<TOutput>`, or `() => Promise<TOutput>` while the input is `void`. The promise resolves to the handler's return. No field is stripped. The type is not the envelope.

The client type of `.stream()` returns `AsyncIterable<TChunk>`, the yielded value. The generator's return type is dropped. The stream context has `signal`. Neither context has `revalidate`, and the handler has no `signal`.

There is no `.authenticateOptional`. Skipping `.authenticate()` types `ctx.auth` as `null`. `.authenticate()` takes no arguments and types `ctx.auth` as the registered session. Until the app augments `auth`, that session type is `null`.

Calling the client function during a component or route render type-checks. In dev, the stub logs one `console.warn` for that direct call, naming the function and suggesting an event, an effect, or `serverFnQueryOptions`, and then makes the call. It never throws, and a production bundle has no check (B45). The check is an owned, untracked call: an owner exists and no reactive observer is running. That also matches a library callback run synchronously inside a render, such as a suspense query's first `queryFn`, and an `onSettled` callback, which is why it only warns: a throw there failed the query with no request and froze navigation (BUGS.md B36). `serverFnQueryOptions`'s `queryFn` runs the call outside any owner, so it never warns. A call inside a `createMemo` or an effect compute, an event handler, an effect callback, or async code after an `await` does not warn (`client-stub.test.tsx` `client stub`, `memo call`, `on settled`; `features/query/shared/options.test.ts` `queryFn inside a render`).

The cases are `tests/types/server-fn.test.ts` (`server fn input`, `server fn input void`, `server fn schema unknown`, `server fn return`, `server fn stream`, `server fn no optional`, `server fn auth null`, `server fn auth required`, `server fn render call`, `server fn methods`).

## Wire

Through the real server: `tests/integration/server-fn.test.ts` `round trip`, `csrf`, `no store`, `wire limits`, `wire envelope`, `wire redirect`, `wire response`, `wire stream`; on a page, e2e `docs-data.test.ts` `server fn post validates`, `safe error`, `unsafe error`, `stream`, and `docs-server.test.ts` `csrf`, `body limit`.

POST body is JSON, capped at `bodyLimit` (default 1 MiB). Over the cap is 413.

Server functions take JSON only: there is no FormData, multipart, or urlencoded input, and a `<form>` posts through a client handler that calls the function (B4; `tests/structure/json-only.test.ts` keeps any form decoder out until a decision brings it back with safe decoding). GET input is `?_i=<JSON>`, capped at 8,192 characters. Any other query param is 400. The client throws before sending when the encoded input would pass the cap.

The response envelope is `{ name, status, data?, message?, errors?, digest?, stack?, redirect? }`. `name` on the wire is the export name. A thrown `Error` in production has a generic `message` and a `digest`, and `stack` is absent. In dev `message` is the thrown message, `stack` is the stack, and `digest` is absent. `markSafeError` keeps the message in production and still omits `stack`. A dev bug also opens Vite's overlay (B76). `notFound()`, `unauthenticated()`, and `unauthorized()` are JSON at 404, 401, and 403 with that message. They do not walk the page and they do not open the overlay. A null session, or a missing `authenticate` option when `.authenticate()` was set, is 401 and the handler is not called (`envelope.test.ts` `helpers`, `null session`). A validator failure is 400 and `errors` is `{ issues, fieldErrors }`. A thrown `redirect()` is HTTP 200 and `{ name, status, redirect: { to, status, replace } }` with no `data`. `to` is the built URL, with search and hash, or the `href` when that form was used. `replace` is always present and defaults to `true`. A same-origin `to` is followed by the internal URL navigation with that `replace`. It does not call public `navigate({ to })`, because `to` there is a route id. An `href` (`http:` or `https:` only) is a full page load. The promise then rejects with that redirect. Any other failure rejects an `Error` whose `message`, `stack`, and `digest` are the envelope's. A 400 puts `{ issues, fieldErrors }` on that error. The response is not an HTML 303. A `redirect()` thrown while rendering a page is that page's document 3xx or its `x` frame, and it is not this envelope (`envelope.test.ts` `redirect`; `client/server-fn/call.test.ts` `reject`).

Only a returned `Response` is the HTTP response. Status and body are kept. The server marks it with the response header `flare-fn: response` (and drops any copy of that header the handler set), and the client resolves the call with that `Response` untouched, body unread, whatever its status. Every other answer is an envelope or a bare framework status (an unknown id, a wrong method), so a handler's own JSON is never parsed as an envelope (`client/server-fn/call.test.ts` `returned response`, `json response`). Other headers are kept, then finalize runs, and `Cache-Control` is overwritten by B43. A thrown `Response` is an ordinary thrown error (`envelope.test.ts` `returned response`, `thrown response`).

An in-request call uses that request's session, env, request, and `serverContext`. No active request throws. There is no `http://localhost` fallback (`dispatch.test.ts` `in request`, `no request`). On the client, `queryFn` does HTTP. On the server it is that in-request call.

A response `flare-build` that differs from `self.flare.build`, when both are non-empty, document-loads once under the `flare_chunk_reload` guard and rejects the promise. The handler has already run. The server does not read a `flare-build` request header (B7, B84). A missing response id still returns the data (`client/server-fn/call.test.ts` `build mismatch`).

A client chunk contains neither the handler, the stream generator, the `authorize` callback, nor the input validator. A server chunk, ssr or the Workers bundle, keeps all four. A sentinel in each fails the build (`vite/boundary/tripwire.test.ts` `four bodies`). The server still runs validation and `authorize`.

`.stream()` writes one envelope per yielded value as NDJSON. The client function returns an async iterator. The record carries `kind: "handler"` or `kind: "stream"`, which survives the client strip, and the client routes a stream function to the streaming transport by it (BUGS.md B14). Stopping the iteration, by `break`, `return()`, or a thrown consumer, aborts the request at once, and a `next()` still pending resolves `{ done: true }`, not an `AbortError`, so a stream that yields rarely stops when asked and the server sees the disconnect in every engine (BUGS.md B40).

CSRF uses the adapter's origin. The first present header wins, in order `Origin`, `Sec-Fetch-Site`, `Referer`. A present header that fails is 403, and the later headers are not consulted. The table is in bit 07 and is not repeated here. The tests in `server/server-fn/csrf.test.ts` are the contract.

The client calls `echo(input)`. In dev, the stub warns if that direct call runs during a component or route render, then makes the call; it never throws (B45). The build fails if the handler, the stream generator, the `authorize` callback, or the input validator is in a client chunk.
