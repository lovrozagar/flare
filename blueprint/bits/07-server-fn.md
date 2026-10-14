# Bit 07 — Server functions and the boundary

Creates every `P7` row. One oxc extraction, one strip, one env rewrite, one tripwire. Server-function ids are a hash of the file path and the export name.

This bit starts by running the extractor against a fixture that contains every shape below, and the tripwire against a real `vite build` of the minimal app. A fixture that only unit-tests a string replace is not done.

## Extends

`src/exports/server.ts` does not re-export `createServerFn`. That name lives on `./server-fn`.

One validator runner. `shared/validation/schema.ts` `runValidator` accepts a function, a `{ parse }`, or a Standard Schema `~standard.validate`, awaits it, and returns `{ ok: true, value }` or `{ ok: false, errors: { issues, fieldErrors } }`. A throw becomes its `issues` when it has them, else its message at an empty path. It reads no `process.env`: the caller passes `dev`, and outside dev a thrown message is the generic one (B76). `server/server-fn/input.ts` and the route input stage both call it, and neither carries its own runner. bit 02's `schema.test.ts` rows stay and gain `parse validator` and `async validator`.

Route `.input()` lands in this bit, because it shares the runner. The builder stores `.input({ params?, searchParams? })` (both omitted throws, `dx/builder.md`). `createServer` runs every match's validators root-down on the raw records before `authenticate`, as 02-system step 10 requires. A failure is HTTP 400 `application/json` `{ issues, fieldErrors }` on a document and on a data request, with no HTML shell and no `e` frame, and `authenticate` is not called. The output replaces that side for the match's later callbacks and render props: `preloader`, `authorize`, `.response()`, `loader`, and `.head()` get `params` and `search`, and the state script carries each match's. The match id, `useLocation()`, and a boundary's `reset()` still read the raw records (B31), so `Located` and the hook returns are `unknown` until the generated types narrow them. `server/lifecycle/create-input.test.ts` holds `page input` (a bad search param is the 400 JSON on a document and on `_flare=data`, and the authenticate spy is not called) and `input output` (the loader, the render props, and `useSearch({ from })` see the validator output, not the raw record), split from `create.test.ts` to keep it under 500 lines. `outlet.test.tsx` `reset wired` rebuilds the URL from the raw location while the painted records are an output. `tests/size/budget.json` `createPage` rises from 1400 to 1450 gzip bytes for the `input` step. A data response carries each validated match's output on its `l` frame as `v` (02-system), so a client navigation paints the same records the document did: `server/navigation/data.test.ts` `input output` (the `l` frame has `v` for a match with `.input()` and none without) and `navigate.test.ts` `input output` (after a data navigation, `useSearch({ from })` returns the output, not the raw record).

Dispatch adds the `/_flare/fn/<id>` branch to `createServer`, so `server/lifecycle/exchange.ts` is born to keep `create.ts` under 300 lines: it holds the `Exchange` type and the finalized answers every stage shares (`answer`, `bare`, `typed`, and `secure`, where the request's security set wins over an app-built answer from `.response()` or a server function). `classify` passes a server-function path through with its whole query, because dispatch reads `_i` alone. `withServerContext` hands the stage its `RequestScope`, and the gate reads the same memoized session. An in-process input failure throws `InputError` (`status` 400, `issues`, `fieldErrors`). CSRF failure, `authorize` false, the body cap, and a bad `_i` answer the envelope (403 `Forbidden`, 413, 400). OPTIONS and 405 answer `Allow` with no body.

`src/exports/index.ts` re-exports `createServerOnlyFn`, `createClientOnlyFn`, and `createIsomorphicFn`.

`shared/protocol/constants.ts` gains `INPUT_PARAM` (`_i`), and `constants.test.ts` `names` lists it.

The ids are build-time work, so `ids.ts` lives in `vite/route-meta/` beside `extract.ts` and hashes with Node's `crypto`. The runtime only looks up the literal ids the transform injects. `lint/boundaries.js` permits `vite>node`, as the 00-rules environment table already allows Node in `vite/` (`boundaries.test.ts` `vite node`).

Order: the env helpers (`shared/env` server-only, client-only, isomorphic) and `vite/boundary/env.ts` land before the tripwire, then one commit wires the boundary transform into `flare()` (split in the client graph, the env rewrite in both graphs, and the `__id`, `__name`, and client-graph `__client` injection into the config span), then the tripwire, because every tripwire row builds through that transform. `server-fns.gen.ts` lands with types-gen.

Typed builders. The route builders were untyped through bit 06, so `shared/route-builder/types.ts` (P1) gets its generics here, in two steps. The types-gen heading types `.input()` and `.loader()` enough for `SearchOutput`, `ParamsOutput`, and `routeModules` to resolve, and writes `types.gen.d.ts` with `typeof import("<file>").route` values, so the generator never derives a type from text. The `tests/types/app` heading completes the chain (preloader context, auth resolution, every `app` row of the `dx/types.md` matrix) and `app.test.ts` proves it with `tsc`. Bit 07 is not done until that heading is green. Its `checks.ts` covers every `app` row of the `dx/types.md` matrix whose producer exists by the end of bit 07. The three query rows (`query options input`, `query options void`, `query client present`) and the fixture's `src/query.ts` wait for bit 13, which builds `serverFnQueryOptions` and the `./query` entry. `routes` is keyed by the public URL with a `{ params }` value as `dx/types.md` says, and the hand-written `PropagationApp` in `register.ts` moves to that shape.

## Cases

### `shared/protocol/get-codec.test.ts`

| test | case | result |
| --- | --- | --- |
| `round trip` | `{ a: 1, b: "x" }` | equal after encode and decode |
| `cap` | an encoded string of 8193 characters | the encoder throws, the decoder returns 400 |
| `extra param` | `?_i=%7B%7D&x=1` | 400 |
| `missing` | a GET with no `_i` | input is `undefined` |
| `void input` | an undefined input | the encoder refuses it, so the caller omits `_i` (`client/server-fn/codec.test.ts` `builds _i`), and the server reads `undefined` |

### `vite/route-meta/ids.test.ts`

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
| `default method` | no method | `post`, and the record's `kind` is `"handler"` |
| `stream kind` | `.stream(fn)` and, as the client graph emits it, `.stream(undefined)` | the record's `kind` is `"stream"` in both (BUGS.md B14) |
| `get with auth and maxAge` | `.authenticate().cache({ maxAge: "1s" })` on GET | throw when the chain is built |
| `stream or handler` | both set | throw |

### `server/server-fn/csrf.test.ts`

| test | case | result |
| --- | --- | --- |
| `same origin` | Origin matches the adapter origin | pass |
| `cross site` | `Sec-Fetch-Site: cross-site` | 403 |
| `same site listed` | host `blog.example.com` on the allow-list, site `same-site`, and that host in `Referer`. An `Origin` or a `Referer` from a listed host passes the same way | pass |
| `same site unlisted` | the same host not on the list, or `same-site` with no `Referer` host to check | 403 |
| `same site scheme` | an https app, and `Origin: http://blog.example.com` on a listed host, or that `Referer` under `same-site` | 403. A listed host passes only on the app's scheme |
| `same site port` | `Origin: https://blog.example.com:8443` on a listed host, the app on 443 | 403. A listed host passes on the default port or the app's own |
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
| `forbidden` | `authorize` returns false | 403, message `Forbidden`, the handler is not called. JSON, not the page walk, and the overlay does not open |
| `in request` | a server function calls another during a request | the inner call uses that request's session, env, request, and `serverContext` |
| `no request` | the same call with no active request | throw. There is no `http://localhost` fallback |
| `base path` | basePath `/app` | `/app/_flare/fn/<id>` dispatches. `/_flare/fn/<id>` is an ordinary path the router answers |

### `server/server-fn/client-stub.test.tsx`

The client graph's callable runs Solid's browser build, so these rows run in the jsdom project. `dispatch.test.ts` stays in the node project, where `withServerContext` runs.

| test | case | result |
| --- | --- | --- |
| `client stub` | the stub is called directly in a component render and `__client` is true | in dev, one `console.warn` naming the function, then the transport is called once; no throw. In a production bundle, no warn. No secret work either way (revised by BUGS.md B36) |
| `memo call` | the stub is called in a `createMemo` compute, an effect compute, and an effect callback | no throw. Each reaches the transport |
| `on settled` | the stub is called in an `onSettled` callback | in dev, one warning, as in a render body, then the call is made; no throw (revised by BUGS.md B36) |

### `server/server-fn/envelope.test.ts`

| test | case | result |
| --- | --- | --- |
| `ok` | handler returns `{ n: 1 }` | `{ name, status: 200, data: { n: 1 } }` |
| `thrown secret` | handler throws `Error("secret")` in production | `message` does not contain `secret`, `digest` is set, `stack` is absent, the overlay sender is not called |
| `dev stack` | handler throws `Error("secret")` in dev | `message` is `secret`, `stack` contains a frame, `digest` is absent, the sender is called |
| `safe` | `markSafeError(new Error("visible"))` in production | `message` is `visible`, `digest` is set, `stack` is absent |
| `redirect` | the handler throws `redirect({ to, search, hash })` | HTTP 200, `{ name, status: 303, redirect: { to, status: 303, replace: true } }`, no `data`. `to` is the built URL, with the search and the hash. The overlay sender is not called. 303 is the default only for a server function: `RedirectError.defaulted` marks a thrown redirect with no status, an explicit status stays as thrown, and a document keeps 307 |
| `href` | the handler throws `redirect({ href: "https://example.com/a" })` | HTTP 200. `redirect.to` is that URL. The client performs a full page load |
| `helpers` | `notFound()`, `unauthenticated()`, and `unauthorized()` | JSON at 404, 401, and 403. They do not walk the page and do not open the overlay |
| `null session` | `.authenticate()` and the session is null, or the authenticate option is missing | 401. The handler is not called |
| `returned response` | the handler returns a `Response` | that status and body are the HTTP response. Other headers are kept, finalize runs, and `Cache-Control` is overwritten |
| `thrown response` | the handler throws a `Response` | an ordinary thrown error |

### `server/server-fn/stream.test.ts`

| test | case | result |
| --- | --- | --- |
| `two yields` | the handler yields 1 then 2 | two lines, then the stream ends |
| `thrown yield` | the generator yields 1, then throws `Error("secret")` in production | the `1` envelope, then the projected error envelope as the last line. `secret` is not in it |
| `in request` | a stream function called in-process | the call is an iterator of the yielded values. With no active request the call throws |
| `cancel` | the client cancels the body after one line | the generator's `finally` runs |

### `client/server-fn/codec.test.ts`

| test | case | result |
| --- | --- | --- |
| `builds _i` | `{ a: 1 }` | the URL contains only `_i` |
| `cap` | a value whose encoding exceeds 8192 | throw before fetch |
| `base path` | basePath `/app` | the URL is `/app/_flare/fn/<id>` |

### `client/server-fn/call.test.ts` and `stream.test.ts`

`reject` and `build mismatch` test the client call, which a server test may not import (`lint/boundaries.js`), so they live in `call.test.ts`. The client's deps are explicit: `bootClient` sets `self.flare.call` over the navigator's deps when exports land, and the exported callable reads it at call time. Before boot it throws `server function called before the client booted`.

| test | case | result |
| --- | --- | --- |
| `stream call` | a client function built as the transform emits it (`createServerFn({ …, __client: true }).stream(undefined)`), iterated with `for await` | it goes through the streaming transport and yields each value; no `not async iterable` error and no unhandled rejection (BUGS.md B14) |
| `stop aborts` | a stream whose body yields once and then never again; the consumer calls `return()` while a `next()` is pending | the fetch's signal aborts at once and the pending `next()` resolves `{ done: true }`, with no rejection (BUGS.md B40) |
| `posts` | a POST function | the request URL is `/_flare/fn/<id>` and the method is POST |
| `returned response` | a handler returns `new Response("x", { status: 418 })` | the server sets `flare-fn: response`, and the call resolves with that Response: status 418, body `x` still readable |
| `json response` | a handler returns `Response.json({ status: 200, items: [1] })` | the call resolves with the Response, and `await res.json()` gives `{ status: 200, items: [1] }`; it is not read as an envelope |
| `iterator` | a stream function | the async iterator yields both values |
| `reject` | the client receives a failure envelope | the promise rejects with an `Error` whose message, stack, and digest are the envelope's. A 400 puts `{ issues, fieldErrors }` on that error. A same-origin redirect is the internal URL navigation with the envelope's `replace`, not public `navigate({ to })`, and the promise still rejects |
| `untrusted envelope` | an issue with no message, a non-array path, a non-array `issues`, an object with no `status` | an issue with a message keeps it, with an empty path when its path is not an array. `fieldErrors` is derived from the kept issues. No `status` rejects as the bare HTTP status |
| `build mismatch` | the response `flare-build` differs from `self.flare.build` and both are non-empty | one document load under `flare_chunk_reload`, and the promise rejects. The handler has already run |

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
| `let export` | `export let echo = createServerFn().handler(...)`, and the same with `var` | build error: the direct-export message. A reassignable export could stop naming the body the id was assigned to |

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

`splitClient(file, source)` parses once and returns `{ code, map }`, or undefined when nothing changed. A name counts as read only when an identifier in reference position has it, outside every import and every removed span. A member property, a non-computed key, a JSX attribute name, a label, a declared binding, and the exported side of a renamed export specifier are not reads, so a module only removed code reads leaves the client graph. The walk is exact: `vite/boundary/reads.ts` resolves each reference through function, arrow, block, catch, class, `for`, and `switch` scopes. `var` and a parameter belong to the nearest function, `let`, `const`, a class, an enum, and a function declaration to their block, and a named function or class expression's name to itself. A reference reads the import only when the nearest scope declaring its name is the module. A bare `import "x"` and an `import type` stay. `vite/route-meta/index.ts` is born here, and `extract.ts` gains `serverFnsOf(file, program)` so the transform does not parse twice.

| test | case | result |
| --- | --- | --- |
| `drops the import` | a loader that imports a module the render does not import | the client graph does not contain that module |
| `keeps render import` | the render imports a component | the component stays |
| `unknown method` | `.middleware()` on the chain | build error |
| `response page` | `.authenticate().response(fn)` on a page | the client output keeps `.response(undefined)`, the export is still a record, and the response function's source is absent. A removed call that ends the chain keeps the call; a middle one is cut whole |
| `cache client` | `.cache({ ssr, client })`, `.cache({ ssr })`, a server field whose value is a function (an ssg or isr `params`, a `tags` function), and a non-literal argument | `.cache({ client })`; the call cut when there is no `client`; a function value goes with its server field; a build error for anything but an object literal with named fields, so a spread or a computed key fails |
| `server fn bodies` | a server function with `input`, `authorize`, and `handler` in the client graph | each argument is `undefined`, the calls stay, and an import only those bodies read is dropped |
| `source map` | a loader cut above a render that throws | the generated line maps back to the throw's original line and column (`magic-string`, `hires`) |
| `member property` | the loader reads `db`; the render has `p.loaderData.db` and `<ui.db />` | the `db` import is removed |
| `object key` | the loader reads `db`; the render has `({ db: 1 }).db`, a class field and method named `db`, a type literal key, a label, and `import.meta` | the import is removed |
| `declaration` | the loader reads `db`; the render declares `db` as a class, a catch parameter, a pattern binding, a parameter property, or names it in `ns.db` or `continue db` | the import is removed |
| `jsx attribute` | the loader reads `db`; the render has `<div db="1" />` and `<svg db:x="1" />` | the import is removed |
| `real read` | the render reads `db.name`, `({ db })`, `<db.Panel />`, `p[db]`, `({ [db]: 1 })`, `<C x={db} />`, or the module has `export { db }` | the import stays. `export { other as db }` is not a read |
| `shadowed param` | the loader reads `db`; the render has `[1].map((db) => db)` or a function expression named `db` that reads itself | the import is removed |
| `shadowed block` | the loader reads `db`; the render reads a block `const db`, a `for (const db of ...)`, or a `catch (db)` inside its own scope | the import is removed |
| `hoisted var` | the loader reads `db`; the render has `function f() { db; var db; }` or a hoisted function declaration `db` read above it | the import is removed |
| `outer read` | the render reads `db.name` beside an unrelated local, or reads `db` after a block whose own `const db` or `function db` ended | the import stays |

### `vite/boundary/transform.test.ts`

`flare()` gains the `flare:boundary` plugin, `enforce: "pre"`, ahead of Solid. Its transform runs on an app module (under the root, outside its dependencies, a script extension, no query) and calls `boundaryTransform(file, source, graph)` with the root-relative path and the graph of `this.environment.name`: `graphOf` makes the ssr and worker environments the server graph and every other environment the client graph. One parse and one MagicString serve split (client graph), the env rewrite (both graphs, skipping a call inside a span split already removed), the `__id` and `__name` injection (plus `__client: true` in the client graph), and import pruning over every removed span. `vite/plugin/flare.test.ts` `boundary transform` covers the plugin.

| test | case | result |
| --- | --- | --- |
| `env prunes import` | `createServerOnlyFn(() => db.query())` with `db` from `./db.server` | the client output has no `./db.server`. The server output keeps it |
| `ssr prunes client import` | a browser-only import read only in `.client()` | gone from the ssr output, kept in the client output |
| `shared import kept` | the same import also read outside the removed body | the import stays |
| `ids` | `createServerFn({ method: "get" })`, `createServerFn()`, a trailing comma, `{}`, and a non-object config | the B41 `__id` and `__name` written into the literal, `__client: true` only in the client graph, and a build error for a non-object config |
| `env inside a removed body` | a `createServerOnlyFn` call inside a handler | the handler is `undefined` and the call is checked but not edited twice |

### `vite/boundary/tripwire.test.ts`

Each row is a fixture built with Vite. The mutation is inserting the bad pattern.

The tripwire is structural. `flare:boundary`'s `renderChunk` passes every module of every chunk, with its final code after every plugin (`getModuleInfo(id).code`), to `checkChunk`. A client chunk, of the browser or a Web Worker, fails when a module holds a server function body that is not `undefined`, a B8-removed route method, a server-only body, or a `.server()` body, or is a module of the package's `src/server`, `src/adapters`, or `src/vite`. A server chunk, of the ssr environment or the Workers bundle, fails when a module holds a client-only body or a `.client()` body. Every module is read, inside the app root or not, and a module that cannot be parsed fails closed. It reuses the transform's walk (`serverCode`, `wrongSideBodies`), and that is enough because B85 and dx/env.md make every shape the walk does not know a build error, so the walk covers all legal code and the tripwire catches a body a later plugin put back. Text fingerprints are not used, because a literal a loader and a render share would fail a real build. The sentinels only assert absence or presence in the emitted text. A mutation fixture puts a body back with an `enforce: "post"` plugin. The transform runs on a module whose only queries are Vite's own (`t`, `v`, `import`) and skips any other query (`?raw`, `?url`, `?worker`, `?inline`). Vite 8 strips `t` and `import` before `transform`, and `v` reaches it. `vite/plugin/flare.test.ts` `hmr keeps split` edits a route file in a running dev server and re-requests it with `?t=` and `?v=`: the loader body stays out.

| test | case | result |
| --- | --- | --- |
| `symlinked root` | `boundary()` over an app whose root is reached through a symlink | the handler body is still stripped from the client graph: a module is in the app when it is under the root or under the root's real path (BUGS.md B51) |
| `handler body` | the handler returns the string `SENTINEL_FN` | the client chunk does not contain it, and a fixture that forces it into the chunk fails the build |
| `server path` | a chunk that imports `src/server/lifecycle/create.ts` | build error |
| `worker` | the `worker` environment build, the Workers bundle | a server graph: it holds a server function body and a module of the package's `src/server`, and a client-only body forced into it fails the build as in the ssr chunk |
| `server only body` | `createServerOnlyFn` returns the string `SENTINEL_ENV` | the client chunk does not contain it, and a fixture that forces it in fails the build. The ssr and worker chunks contain it |
| `client only body` | `createClientOnlyFn` returns the string `SENTINEL_CLIENT` | the ssr chunk does not contain it. A fixture that forces it into the ssr chunk fails the build. The client chunk contains it |
| `iso server body` | the `.server()` body is `SENTINEL_ISO` | absent from the client chunk, present in the ssr and worker chunks |
| `clean` | the minimal app | the build passes |
| `four bodies` | a sentinel in the handler, the stream generator, the `authorize` callback, and the input validator | absent from the client chunk. Present in the ssr and worker chunks. A fixture that forces any of the four into the client chunk fails the build |
| `outside root` | a workspace module outside the app root with a server function handler, imported by the client entry | it is never transformed, so its body reaches the client chunk and fails the build |
| `route method` | a client module whose route chain still calls `.loader()`, or ends in `.response(answer)`, and one that cannot be parsed | each fails. `.response(undefined)` and a render-only chain pass |

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
| `iso worker` | the same source in the `worker` environment, the Workers bundle | `SERVER` remains and `CLIENT` is gone |
| `iso one side` | only `.server()` | build error |
| `iso split` | the two sides are split across two statements | build error |
| `iso order` | `.client(() => CLIENT).server(() => SERVER)` | both sides are found and the wrong one is deleted |
| `quote in a regex` | a regex literal containing a quote in the same file | the call is still rewritten |

### `vite/codegen/types-gen.test.ts` and `auth-hint.test.ts`

`generateTypes({ routeFiles, appFiles, read, routesDir? })` returns the source of `src/_gen/types.gen.d.ts` with `parents` and `modules`. `routes` is keyed by the router's pattern for the page (`/users/[id]`, `/[[locale]]`), the same `idPattern` the router matches, and holds `{ params }` from the brackets. `routeModules`, `routeParents`, `authModes`, `routeSearchParams`, and `routeParams` are keyed by route id, and every value is a `typeof import("<file>").route` expression or a `SearchOutput` or `ParamsOutput` of one. `scan.ts` gains `authorize` and the `.input()` sides, named or quoted. `authHint(chain)` is B26 over a route's chain, root down: `requires`, `reads`, or `public`. Where prerender reads it lands with prerender (bit 12). The first typing step lands here: `shared/route-builder/types.ts` gains `RouteTypes`, a type-only record field under a non-exported `unique symbol`, `ValidatorOutput`, `InputTypes`, and `TypesOf`, and `register.ts` gains `SearchOutput`, `ParamsOutput`, and `LoaderDataOf`. The page, layout, and root builders return a new builder per typed step over the same chain, so `.input()` and `.loader()` change the type without a cast, and `Steps` no longer holds them. The root exports `FlareRegister`, `SearchOutput`, and `ParamsOutput` as types, so the generated augmentation applies. `page.test.ts` `typed record` proves the three helpers on real records. `PropagationApp` moves to the URL-keyed `routes`. `tests/size/budget.json` `createPage` rises from 1450 to 1500 gzip bytes for the per-step builder.

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

Before this heading, `packages/core/tsconfig.src.json` turns on `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, and `verbatimModuleSyntax`, because the package exports point at `src` and a consumer with those flags compiles it. An index read an invariant guarantees goes through `shared/errors/defined.ts`, which throws and names what was missing, so no `!` or cast hides it. `tests/` stays on the base flags. Bit 14's `consumer strict` stays the packed-tarball proof.

Runs the types generator on `packages/core/tests/types/app` and then `tsc --noEmit` with that app's tsconfig. The one tsc run also compiles a temp file with an unused `@ts-expect-error` above a valid line, and that TS2578 is its only error, so a stale directive in the checks fails the run. The generator writes `types.gen.d.ts` into a temp dir under the repo's ignored `.tmp`, and `rootDirs` lets its imports reach the fixture's route files. The committed app has no `_gen`. `src/checks.ts`, `checks-data.ts`, and `checks-fns.ts` repeat every matrix row marked `app` in `dx/types.md`, split for the 300-line cap. The tsconfig sets `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and `noPropertyAccessFromIndexSignature`.

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
