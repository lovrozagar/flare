# createServerOnlyFn, createClientOnlyFn, createIsomorphicFn

```ts
const readDb = createServerOnlyFn(() => db.query())
const focus = createClientOnlyFn(() => el.focus())
const format = createIsomorphicFn()
  .server(() => serverFormat())
  .client(() => clientFormat())
```

The three are exports of `@lovrozagar/flare`. `envFn` is not an export.

The call is rewritten by oxc in the client, ssr, and worker environments. The worker environment is scanned like the client: a server body there fails the build. The ssr environment keeps the server body. A runtime throw remains for a call that still executes on the wrong side. The test that the body is gone is the tripwire, which builds a fixture and fails when the body is forced into the wrong chunk.

A legal call is a direct call. The callee may be the import, an alias (`import { createServerOnlyFn as mark }`), or a namespace (`flare.createServerOnlyFn`). The argument is a function expression or an arrow, written in the call. `async` is allowed. These are build errors:

- a local binding that shadows the imported name
- `const mark = createServerOnlyFn; mark(fn)`
- an identifier argument (`createServerOnlyFn(readDb)`), because that body would survive the rewrite
- an isomorphic chain broken by an intermediate binding
- an isomorphic call with one side
- `.server` or `.client` called twice

Either side may be set first. Both are required. `createIsomorphicFn().server(a).client(b)` and `createIsomorphicFn().client(b).server(a)` are the two legal shapes, each as one expression.

There is no module path that the scanner skips. The v0 `/env-fn/` exemption does not exist.

| call | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `createServerOnlyFn(fn)` | yes | — | a function expression or an arrow, inline | the ssr graph keeps `fn`. The client and worker graphs do not contain its source. Calling the result on the server runs `fn`. Calling the rewritten result on the client or in a worker throws, and `fn` does not run | the throw is the backstop. A chunk that still contains the body fails the build | `shared/env/server-only.test.ts` `returns`, `backstop`; `vite/boundary/env.test.ts` `server direct`; `vite/boundary/tripwire.test.ts` `server only body` |
| `createClientOnlyFn(fn)` | yes | — | the same | the client graph keeps `fn`. The ssr graph does not contain its source. Calling the result on the client runs `fn`. Calling the rewritten result on the server throws, and `fn` does not run | the same backstop rule | `shared/env/client-only.test.ts` `returns`, `backstop`; `env.test.ts` `client body`; `tripwire.test.ts` `client only body` |
| `createIsomorphicFn().server(fn).client(fn)` | both sides | — | each side is an inline function expression or arrow | ssr runs the server function and does not contain the client function. Client and worker run the client function and do not contain the server function | one side returns `undefined` in v0. v1 fails the build. A missing side that still executes throws | `shared/env/isomorphic.test.ts` `server`, `client`, `missing`; `env.test.ts` `iso server`, `iso client`, `iso one side`; `tripwire.test.ts` `iso server body` |

The shapes that fail the build (`env.test.ts`):

| test | case |
| --- | --- |
| `server alias` | `import { createServerOnlyFn as mark }` still deletes the server body from the client graph |
| `server namespace` | `flare.createServerOnlyFn` does the same |
| `server shadow` | a local `createServerOnlyFn` |
| `server indirect` | the function is copied to a variable and that variable is called |
| `server identifier` | the argument is an identifier |
| `iso worker` | the worker graph keeps the client function and drops the server function |
| `iso split` | `.server()` and `.client()` are split across two statements |
| `iso order` | `.client()` then `.server()` in one expression keeps both sides |
| `quote in a regex` | a regex literal that contains a quote, in the same file, still rewrites the call |

Solid's `server-only` and `client-only` packages mark a whole module. A file that is only a driver may import them. A function inside a shared module uses the helpers above. `isServer` does not delete a body from a chunk.
