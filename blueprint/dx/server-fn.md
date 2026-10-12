# createServerFn

```ts
export const echo = createServerFn({ method: "post" })
  .authenticate()
  .input(validator)
  .authorize(({ auth, input }) => boolean)
  .handler(async ({ input, auth, env, request, serverContext, revalidate }) => data)
```

`name` is not a config field (B85). The id is the B41 hash of the root-relative path and the export name. A `createServerFn` that is not a direct export fails the build (`vite/route-meta/ids.test.ts` `export name`, `not exported`).

The boundary transform rewrites each `createServerFn({ method })` to `createServerFn({ method, __id, __name })` in every graph, and adds `__client: true` in the client and worker graphs. These fields are internal and are not part of the typed config. `.handler()` and `.stream()` return a callable that carries `{ id, name, record }`. With `__client`, the callable is the HTTP stub; called directly during a client render, it throws before any work (B45, `client-stub.test.tsx` `client stub`). Without it, the callable is the in-request call.

An in-request call, a server function called from a loader, another server function, or `.response()`, runs authenticate, input, authorize, then the handler in-process, with no HTTP and no CSRF check. It uses the active request's `env`, `request`, `serverContext`, and session. The session is one memoized `authenticate` per request, shared by the page gate and every server function, so `authenticate` still runs once (`dx/server.md`). It returns the handler value, or throws the thrown error unprojected. Called with no active request it throws `server function called outside a request` (`dispatch.test.ts` `in request`, `no request`).

`.stream(async function* (ctx) { yield value })` replaces `.handler`. Setting both throws.

Each method may be called once, as on a route builder (`dx/builder.md`). A second `.input()`, `.authorize()`, `.cache()`, or `.authenticate()` throws when the chain is built, and the type no longer offers a method once it is called. A second `.input()` would otherwise silently replace the first validator. The call order is free; the run order is always authenticate, input, authorize, handler (`server/server-fn/builder.test.ts` `once`).

| call | required | default | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- |
| `method` | no | `"post"` | `"get"` or `"post"` | | `builder.test.ts` `default method` |
| `authenticate()` | no | off | required session. The app's `createServer({ authenticate })` runs once. `callerData` is `[]` and `callerChain` is one entry whose `route` is the export name (`server.md`) | there is no `authenticateOptional` on a server function. Optional means not calling `authenticate` and reading `auth`, which is null when anonymous. That still counts as reading identity for CSRF fail-open: fail-open is off when `authenticate` or `authorize` is set. The method takes no arguments. A null session is 401 and the handler is not called | `csrf.test.ts` `fail closed`; `server/auth/caller.test.ts` `server fn`; `envelope.test.ts` `null session` |
| `input(validator)` | no | input is `undefined` | Standard Schema, `{ parse }`, or a function. A promise from any of the three is awaited. Each issue is `{ message, path }`. `fieldErrors` at the first path segment is a `string[]`. A segment `{ key }` uses `key`. An empty path is only in `issues` | GET input is the `_i` param. POST input is the JSON body | `input.test.ts` `promise`, `field array`, `empty path` |
| `authorize(fn)` | no | absent | `false` is 403 with the message `Forbidden`. The handler is not called. This is JSON, not the page walk, and it does not open the dev overlay | | `dispatch.test.ts` `order`, `forbidden` |
| `cache: { maxAge }` | no | `private, no-store` | accepts a duration. Legal only when `method` is `"get"` and there is no `authenticate` and no `authorize` | any other combination throws when the chain is built | `cache-control.test.ts` `opt in`, `duration` |

## Handler context

| field | present | outcome |
| --- | --- | --- |
| `input` | always | the validator's output, or `undefined` |
| `auth` | always | the session, or `null` when `authenticate` was not called |
| `env` | always | the fetch env, typed by `FlareRegister["env"]` |
| `request` | always | the request |
| `serverContext` | always | the object `createServer`'s request context produced. Typed by `FlareRegister["serverContext"]` |
| `revalidate` | handler only | `({ keys?, tags? }) => void`. The work is passed to `waitUntil` |
| `signal` | stream only | the request `AbortSignal` |

There is no `piggyback`. The query helpers are in `features.md`.

## Types

`.input()` replaces the input type. The start is `void`: the client function takes no argument, and `ctx.input` is `undefined`. After `.input()`, the client argument is the validator's input type and the handler's `ctx.input` is its output, because the validator runs on the server: a Standard Schema's `types.input` and `types.output`, the parameter and return of `{ parse }`, or of a function. A transforming validator such as `z.string().transform(Number)` takes a string from the caller and hands the handler a number. The argument crosses as JSON, so a validator should accept the JSON form (`z.coerce.date()`, not `z.date()`). A fresh extra key fails when that input is a closed object. A Standard Schema whose input is `unknown`, or a function typed `(value: unknown)`, does not reject a bad key.

The client type is `(input: TInput) => Promise<TOutput>`, or `() => Promise<TOutput>` while the input is `void`. The promise resolves to the handler's return. No field is stripped. The type is not the envelope.

The client type of `.stream()` returns `AsyncIterable<TChunk>`, the yielded value. The generator's return type is dropped. The stream context has `signal` and has no `revalidate`. The handler has `revalidate` and has no `signal`.

There is no `.authenticateOptional`. Skipping `.authenticate()` types `ctx.auth` as `null`. `.authenticate()` takes no arguments and types `ctx.auth` as the registered session. Until the app augments `auth`, that session type is `null`.

Calling the client function during a component or route render type-checks. The stub throws at runtime for that direct call. `queryFn` is not that call (B85). The guard is an owned, untracked call: an owner exists and no reactive observer is running, which is a component or route body. A call inside a `createMemo` or an effect compute, an event handler, an effect callback, or async code after an `await` does not throw. Solid offers no public way to tell an `onSettled` callback from a render body, so a direct call there throws too; call it after an `await`, or from an event or `queryFn` (`client-stub.test.tsx` `client stub`, `memo call`, `on settled`).

The cases are `propagation.test.ts` (`server fn input`, `server fn input void`, `server fn return`, `server fn stream`, `server fn no optional`, `server fn auth null`, `server fn auth required`, `server fn render call`).

## Wire

POST body is JSON, capped at `bodyLimit` (default 1 MiB). Over the cap is 413.

GET input is `?_i=<JSON>`, capped at 8,192 characters. Any other query param is 400. The client throws before sending when the encoded input would pass the cap.

The response envelope is `{ name, status, data?, message?, errors?, digest?, stack?, redirect? }`. `name` on the wire is the export name. A thrown `Error` in production has a generic `message` and a `digest`, and `stack` is absent. In dev `message` is the thrown message, `stack` is the stack, and `digest` is absent. `markSafeError` keeps the message in production and still omits `stack`. A dev bug also opens Vite's overlay (B76). `notFound()`, `unauthenticated()`, and `unauthorized()` are JSON at 404, 401, and 403 with that message. They do not walk the page and they do not open the overlay. A null session, or a missing `authenticate` option when `.authenticate()` was set, is 401 and the handler is not called (`envelope.test.ts` `helpers`, `null session`). A validator failure is 400 and `errors` is `{ issues, fieldErrors }`. A thrown `redirect()` is HTTP 200 and `{ name, status, redirect: { to, status, replace } }` with no `data`. `to` is the built URL, with search and hash, or the `href` when that form was used. `replace` is always present and defaults to `true`. A same-origin `to` is followed by the internal URL navigation with that `replace`. It does not call public `navigate({ to })`, because `to` there is a route id. An `href` (`http:` or `https:` only) is a full page load. The promise then rejects with that redirect. Any other failure rejects an `Error` whose `message`, `stack`, and `digest` are the envelope's. A 400 puts `{ issues, fieldErrors }` on that error. The response is not an HTML 303. A `redirect()` thrown while rendering a page is that page's document 3xx or its `x` frame, and it is not this envelope (`envelope.test.ts` `redirect`; `client/server-fn/call.test.ts` `reject`).

Only a returned `Response` is the HTTP response. Status and body are kept. The server marks it with the response header `flare-fn: response` (and drops any copy of that header the handler set), and the client resolves the call with that `Response` untouched, body unread, whatever its status. Every other answer is an envelope or a bare framework status (an unknown id, a wrong method), so a handler's own JSON is never parsed as an envelope (`client/server-fn/call.test.ts` `returned response`, `json response`). Other headers are kept, then finalize runs, and `Cache-Control` is overwritten by B43. A thrown `Response` is an ordinary thrown error (`envelope.test.ts` `returned response`, `thrown response`).

An in-request call uses that request's session, env, request, and `serverContext`. No active request throws. There is no `http://localhost` fallback (`dispatch.test.ts` `in request`, `no request`). On the client, `queryFn` does HTTP. On the server it is that in-request call.

A response `flare-build` that differs from `self.flare.build`, when both are non-empty, document-loads once under the `flare_chunk_reload` guard and rejects the promise. The handler has already run. The server does not read a `flare-build` request header (B7, B84). A missing response id still returns the data (`client/server-fn/call.test.ts` `build mismatch`).

The client and worker chunks contain neither the handler, the stream generator, the `authorize` callback, nor the input validator. The SSR chunk keeps all four. A sentinel in each fails the build (`vite/boundary/tripwire.test.ts` `four bodies`). The server still runs validation and `authorize`.

`.stream()` writes one envelope per yielded value as NDJSON. The client function returns an async iterator.

CSRF uses the adapter's origin. The first present header wins, in order `Origin`, `Sec-Fetch-Site`, `Referer`. A present header that fails is 403, and the later headers are not consulted. The table is in bit 07 and is not repeated here. The tests in `server/server-fn/csrf.test.ts` are the contract.

The client calls `echo(input)`. The stub throws if that direct call runs during a component or route render on the client. `queryFn` does not throw for that reason. The build fails if the handler, the stream generator, the `authorize` callback, or the input validator is in a client or worker chunk.
