# Bit 07 — Server functions and the boundary

Creates every `P7` row. One oxc extraction, one strip, one env rewrite, one tripwire. Server-function ids are a hash of the file path and the export name.

This bit starts by running the extractor against a fixture that contains every shape below, and the tripwire against a real `vite build` of the minimal app. A fixture that only unit-tests a string replace is not done.

## Extends

`src/exports/server.ts` does not re-export `createServerFn`. That name lives on `./server-fn`.

`src/exports/index.ts` re-exports `createServerOnlyFn`, `createClientOnlyFn`, and `createIsomorphicFn`.

## Cases

### `shared/protocol/get-codec.test.ts`

| test | case | result |
| --- | --- | --- |
| `round trip` | `{ a: 1, b: "x" }` | equal after encode and decode |
| `cap` | an encoded string of 8193 characters | the encoder throws, the decoder returns 400 |
| `extra param` | `?_i=%7B%7D&x=1` | 400 |
| `missing` | a GET with no `_i` | input is `undefined` |

### `server/server-fn/ids.test.ts`

| test | case | result |
| --- | --- | --- |
| `stable` | path `src/fns/echo.ts`, name `echo` | the same 16 hex chars on two runs |
| `two names` | `echo` and `echo2` in one file | two ids |
| `same name two files` | `echo` in `a.ts` and `b.ts` | two ids |
| `collision` | two pairs forced to the same hash by a test double | build error naming both files |
| `export name` | `export const echo = createServerFn()` | the id is sha256 of the root-relative path, NUL, and `echo`, truncated to 16 hex. There is no `name` field |
| `not exported` | `createServerFn()` is not a direct export | build error |

### `server/server-fn/builder.test.ts`

| test | case | result |
| --- | --- | --- |
| `default method` | no method | `post` |
| `get with auth and maxAge` | `.authenticate().cache({ maxAge: "1s" })` on GET | throw when the chain is built |
| `stream or handler` | both set | throw |

### `server/server-fn/csrf.test.ts`

| test | case | result |
| --- | --- | --- |
| `same origin` | Origin matches the adapter origin | pass |
| `cross site` | `Sec-Fetch-Site: cross-site` | 403 |
| `same site listed` | host `app.example.com` on the allow-list, site `same-site` | pass |
| `same site unlisted` | the same host not on the list | 403 |
| `none is GET only` | `Sec-Fetch-Site: none` on POST | 403 |
| `none on GET` | the same on GET | pass |
| `fail open` | Origin, Sec-Fetch-Site, and Referer all absent, no auth | pass |
| `fail closed` | the same absence, with `authenticate` | 403 |
| `origin wins` | `Origin` fails and `Sec-Fetch-Site` would have passed | 403. The later header is not consulted |

### `server/server-fn/input.test.ts`

| test | case | result |
| --- | --- | --- |
| `body cap` | a POST body of 1 MiB + 1 | 413 |
| `validator failure` | input fails the schema | 400 and `errors` on the envelope |
| `promise` | any of the three input shapes returns a promise | the promise is awaited |
| `field array` | an issue path whose first segment is `email` | `fieldErrors.email` is a `string[]`. A segment `{ key }` uses `key` |
| `empty path` | an issue whose path is empty | the issue is only in `issues` |

### `server/server-fn/cache-control.test.ts`

| test | case | result |
| --- | --- | --- |
| `default` | a handler that returns data | `Cache-Control: private, no-store` |
| `pass through` | a handler that returns `new Response(null, { headers: { "cache-control": "public, max-age=60" } })` | still `private, no-store` |
| `opt in` | GET, no auth, `cache.maxAge` `60s` | `public, max-age=60` |
| `duration` | `maxAge: "60s"` | accepted. The value is a duration |

### `server/server-fn/dispatch.test.ts`

| test | case | result |
| --- | --- | --- |
| `unknown id` | a hash that was not registered | 404 |
| `OPTIONS` | OPTIONS | 204, `Allow` lists the declared method and OPTIONS |
| `wrong method` | GET on a POST function | 405, `Allow` set |
| `order` | spies | parse, lookup, method, csrf, auth, input, handler |
| `client stub` | the stub is called and `__client` is true | throw, no secret work. The throw is a direct call during render. `queryFn` is not that call |
| `forbidden` | `authorize` returns false | 403, message `Forbidden`, the handler is not called. JSON, not the page walk, and the overlay does not open |
| `in request` | a server function calls another during a request | the inner call uses that request's session, env, request, and `serverContext` |
| `no request` | the same call with no active request | throw. There is no `http://localhost` fallback |

### `server/server-fn/envelope.test.ts`

| test | case | result |
| --- | --- | --- |
| `ok` | handler returns `{ n: 1 }` | `{ name, status: 200, data: { n: 1 } }` |
| `thrown secret` | handler throws `Error("secret")` in production | `message` does not contain `secret`, `digest` is set, `stack` is absent, the overlay sender is not called |
| `dev stack` | handler throws `Error("secret")` in dev | `message` is `secret`, `stack` contains a frame, `digest` is absent, the sender is called |
| `safe` | `markSafeError(new Error("visible"))` in production | `message` is `visible`, `digest` is set, `stack` is absent |
| `redirect` | the handler throws `redirect({ to, search, hash })` | HTTP 200, `{ name, status: 303, redirect: { to, status: 303, replace: true } }`, no `data`. `to` is the built URL, with the search and the hash. The overlay sender is not called |
| `href` | the handler throws `redirect({ href: "https://example.com/a" })` | HTTP 200. `redirect.to` is that URL. The client performs a full page load |
| `helpers` | `notFound()`, `unauthenticated()`, and `unauthorized()` | JSON at 404, 401, and 403. They do not walk the page and do not open the overlay |
| `null session` | `.authenticate()` and the session is null, or the authenticate option is missing | 401. The handler is not called |
| `reject` | the client receives a failure envelope | the promise rejects with an `Error` whose message, stack, and digest are the envelope's. A 400 puts `{ issues, fieldErrors }` on that error. A same-origin redirect is the internal URL navigation with the envelope's `replace`, not public `navigate({ to })`, and the promise still rejects |
| `returned response` | the handler returns a `Response` | that status and body are the HTTP response. Other headers are kept, finalize runs, and `Cache-Control` is overwritten |
| `thrown response` | the handler throws a `Response` | an ordinary thrown error |
| `build mismatch` | the response `flare-build` differs from `self.flare.build` and both are non-empty | one document load under `flare_chunk_reload`, and the promise rejects. The handler has already run |

### `server/server-fn/stream.test.ts`

| test | case | result |
| --- | --- | --- |
| `two yields` | the handler yields 1 then 2 | two lines, then the stream ends |

### `client/server-fn/codec.test.ts`

| test | case | result |
| --- | --- | --- |
| `builds _i` | `{ a: 1 }` | the URL contains only `_i` |
| `cap` | a value whose encoding exceeds 8192 | throw before fetch |

### `client/server-fn/call.test.ts` and `stream.test.ts`

| test | case | result |
| --- | --- | --- |
| `posts` | a POST function | the request URL is `/_flare/fn/<id>` and the method is POST |
| `iterator` | a stream function | the async iterator yields both values |

### `vite/route-meta/extract.test.ts`

Run against oxc, not a regex.

| test | case | result |
| --- | --- | --- |
| `direct` | `export const echo = createServerFn().handler(...)` | one record, the export name, the handler span |
| `alias` | `import { createServerFn as csf }` | the same record |
| `namespace` | `flare.createServerFn` | the same record |
| `quote in a regex` | a regex literal containing a quote in the same file | the import is still found |
| `shadowed` | a local `createServerFn` | build error |
| `wrapper` | the builder is created in file A and `.handler` is called in file B | build error |
| `optional call` | `.handler?.()` | build error |
| `element call` | `["handler"]()` | build error |
| `non literal config` | `.cache(sharedConfig)` | build error |

### `vite/route-meta/literals.test.ts`

| test | case | result |
| --- | --- | --- |
| `literal cache` | `.cache({ ssr: { staleTime: "1s" } })` | accepted |
| `spread` | `.cache({ ...base })` | build error |

### `vite/boundary/allow.test.ts`

| test | case | result |
| --- | --- | --- |
| `kept` | `render`, `errorRender`, `notFoundRender`, `unauthenticatedRender`, `unauthorizedRender`, `intercept`, `effects`, `cache.client` | present in the client output |
| `removed` | `loader`, `preloader`, `authenticate`, `authenticateOptional`, `authorize`, `headers`, `head`, `response`, `input`, `cache.ssr`, `cache.ssg`, `cache.isr`, `cache.cdn` | absent |

### `vite/boundary/split.test.ts`

| test | case | result |
| --- | --- | --- |
| `drops the import` | a loader that imports a module the render does not import | the client graph does not contain that module |
| `keeps render import` | the render imports a component | the component stays |
| `unknown method` | `.middleware()` on the chain | build error |

### `vite/boundary/tripwire.test.ts`

Each row is a fixture built with Vite. The mutation is inserting the bad pattern.

| test | case | result |
| --- | --- | --- |
| `handler body` | the handler returns the string `SENTINEL_FN` | the client chunk does not contain it, and a fixture that forces it into the chunk fails the build |
| `server path` | a chunk that imports `src/server/lifecycle/create.ts` | build error |
| `worker` | the workers environment build | the same two checks |
| `server only body` | `createServerOnlyFn` returns the string `SENTINEL_ENV` | the client chunk and the worker chunk do not contain it. A fixture that forces it into either chunk fails the build. The ssr chunk contains it |
| `client only body` | `createClientOnlyFn` returns the string `SENTINEL_CLIENT` | the ssr chunk does not contain it. A fixture that forces it into the ssr chunk fails the build. The client chunk contains it |
| `iso server body` | the `.server()` body is `SENTINEL_ISO` | absent from the client chunk and the worker chunk, present in the ssr chunk |
| `clean` | the minimal app | the build passes |
| `four bodies` | a sentinel in the handler, the stream generator, the `authorize` callback, and the input validator | absent from the client chunk and the worker chunk. Present in the SSR chunk. A fixture that forces any of the four into the client or worker chunk fails the build |

### `shared/env/server-only.test.ts`

| test | case | result |
| --- | --- | --- |
| `returns` | SSR, call the result | the body ran |
| `backstop` | the client graph, call the result | throw, and the body did not run |

### `shared/env/client-only.test.ts`

| test | case | result |
| --- | --- | --- |
| `returns` | the client graph, call the result | the body ran |
| `backstop` | SSR, call the result | throw, and the body did not run |

### `shared/env/isomorphic.test.ts`

| test | case | result |
| --- | --- | --- |
| `server` | both sides, SSR | the server body ran and the client body did not |
| `client` | both sides, the client graph | the client body ran and the server body did not |
| `missing` | one side, call the result | throw |

### `vite/boundary/env.test.ts`

Run against oxc, not a regex. `SECRET`, `SERVER`, and `CLIENT` are the bodies under test.

| test | case | result |
| --- | --- | --- |
| `server direct` | `createServerOnlyFn(() => SECRET)` in the client environment | the output does not contain `SECRET` |
| `server alias` | `import { createServerOnlyFn as mark }` | `SECRET` is gone from the client output |
| `server namespace` | `flare.createServerOnlyFn` | `SECRET` is gone from the client output |
| `server shadow` | a local `createServerOnlyFn` | build error |
| `server indirect` | `const mark = createServerOnlyFn; mark(() => SECRET)` | build error |
| `server identifier` | `createServerOnlyFn(readDb)` | build error |
| `client body` | `createClientOnlyFn(() => SECRET)` in the ssr environment | `SECRET` is gone |
| `client kept` | the same call in the client environment | `SECRET` remains |
| `iso server` | `.server(() => SERVER).client(() => CLIENT)` in ssr | `SERVER` remains and `CLIENT` is gone |
| `iso client` | the same source in the client environment | `CLIENT` remains and `SERVER` is gone |
| `iso worker` | the same source in the worker environment | `CLIENT` remains and `SERVER` is gone |
| `iso one side` | only `.server()` | build error |
| `iso split` | the two sides are split across two statements | build error |
| `iso order` | `.client(() => CLIENT).server(() => SERVER)` | both sides are found and the wrong one is deleted |
| `quote in a regex` | a regex literal containing a quote in the same file | the call is still rewritten |

### `vite/codegen/types-gen.test.ts` and `auth-hint.test.ts`

| test | case | result |
| --- | --- | --- |
| `loader type` | a loader returns `{ n: number }` | `types.gen.d.ts` names that type on the route |
| `param types` | `[id]`, `[...path]`, `[[locale]]`, `[[...rest]]` | `string`, `string[]`, `string \| undefined`, `string[] \| undefined` on `routes` |
| `no params` | `/about` | `params: {}` |
| `parents` | a page under a layout | `routeParents` lists that layout id and not the page |
| `auth mode` | a page calls `authenticateOptional()` | `authModes` is `"optional"`. The file does not contain `.authenticate("optional")` |
| `search` | `.input()` validates search | `routeSearchParams` is keyed by the route id and names the validator output |
| `input params` | `.input()` validates params | `routeParams` is keyed by the route id and names the validator output |
| `keyed by route id` | a layout and a page both call `.input()` | both maps use the route id. The page entry does not contain the layout's output |
| `response route` | a page calls `.response()` | `routeModules` includes that id. `routes` does not |
| `segment parent` | a segment file on the path | `routeParents` does not list that id |
| `parents closed` | every id in `routeParents` | that id is a key of `routeModules` |
| `query client` | an app file imports `@lovrozagar/flare/query` | `hasQueryClient: true`. A comment that mentions the package does not set it. A fixture that does not import it omits the field. The scan is the import, not the text `queryClientGetter` |
| `no virtual` | the generated file | it contains no `virtual:` specifier |
| `no phantom` | the generated file | it does not mention `~flare` and it does not set `auth`, `env`, or `serverContext` |
| `hint` | a page under an auth layout | the hint says requires |

### `tests/types/app.test.ts`

Runs the types generator on `packages/core/tests/types/app` and then `tsc --noEmit` with that app's tsconfig. Exit 0. A temp copy of `src/checks.ts` with an unused `@ts-expect-error` above a valid line exits non-zero. The generator writes `types.gen.d.ts` into a temp dir. The committed app has no `_gen`. `src/checks.ts` repeats every matrix row marked `app` in `dx/types.md`. The tsconfig sets `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and `noPropertyAccessFromIndexSignature`.

`server/auth/caller.test.ts` gains `server fn`: a function named `echo` that calls `authenticate()` runs the app function once, with `callerData` `[]` and `callerChain` `[{ route: "echo", args: [] }]`.
| `hint mismatch` | the hint is edited to public | the prerender check in bit 12 fails the build. This test calls the checker directly |

### `tests/integration/server-fn.test.ts`

| test | case | result |
| --- | --- | --- |
| `round trip` | the echo function | the envelope data equals the input |
| `csrf` | a cross-site POST | 403 |
| `no store` | the response | `private, no-store` |

### `tests/e2e/server-fn.test.ts`

This file calls `boot` for the `minimal` app (B70). The project name selects `runtime`, `mode`, and the browser. `boot` receives `runtime` and `mode`. The echo function stays a file in that app.

| test | case | result |
| --- | --- | --- |
| `click` | a button that calls the echo function | the returned text is on the page |

## Done

The minimal app's client build contains no loader body, no server-function body, and no server-only function body. A non-canonical `createServerFn` or env-helper use fails the build.
