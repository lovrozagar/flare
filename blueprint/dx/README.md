# dx — what the user passes

This folder is the contract for every value an app passes to Flare. A property is in v1 only if a table here lists it. The columns are:

| column | meaning |
| --- | --- |
| required | the call does not type-check without it, and the runtime throws if a cast bypasses the type |
| default | the value when the property is omitted. `—` means there is no default because the property is required or because omission means "absent", which is different from a default |
| accepts | the values that type-check |
| outcome | what the running app does |
| pitfall | the case that looks right and is wrong |
| test | the test that is written first. The file is the sibling test named in `files.tsv` unless the cell names another file |

An omitted property and a property set to `undefined` are the same. A property set to its default is the same as omitting it.

Durations accept a number of milliseconds or a string: `ms`, `s`, `m`, `h`, `d`, including compounds such as `1m30s`. Anything else throws at the call, not at the request. The test is `shared/duration/parse.test.ts` (`garbage`).

There is no CSR mode (B66). Rendering is a document on the first load and a data request after that.

A name from v0 that no file here lists is not a v1 prop. The cuts are B4 and B10–B16, plus `envFn` in B9, in `01-decisions.md`. An agent does not add a prop because v0 had a field with a similar name.

| file | user-facing surface |
| --- | --- |
| `router.md` | `createRouter` |
| `routes.md` | filesystem route ids, the public URL, and params |
| `builder.md` | `createPage`, `createLayout`, `createRootLayout`, `createPathSegment`, `.security()`, and the context objects |
| `cache.md` | `.cache()` and the router's `cache.client` |
| `defer.md` | `defer()` and how it behaves under SSR, SSG, ISR, and prefetch |
| `link.md` | `<Link>` and prefetch, including `modules: "all"` |
| `navigate.md` | `navigate` and the hooks |
| `head.md` | `.head()` |
| `server.md` | `createServer`, middleware, mount, proxy, security, response headers, `serverCtx`, `withFetchDedupe` |
| `types.md` | `FlareRegister`, `src/_gen/types.gen.ts`, and the propagation matrix |
| `server-fn.md` | `createServerFn` |
| `env.md` | `createServerOnlyFn`, `createClientOnlyFn`, `createIsomorphicFn` |
| `client.md` | `createClient` |
| `plugin.md` | `flare()` in the Vite config |
| `store.md` | `FlareStore`, the stores, `createAssetsStore`, `revalidate` |
| `adapters.md` | Node, Bun, Workers |
| `seo.md` | sitemap, IndexNow, Google, Bing |
| `observability.md` | logger, `onError`, request log, request id, tracing, the dev log bridge, the configuration matrix, privacy |
| `testing.md` | `createTestServer`, `flarePage` |
| `features.md` | theme, direction, i18n, image, fonts, query |
