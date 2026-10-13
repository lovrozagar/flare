# 03 — Public surface

A subpath exists because the entry is a different runtime, an optional peer, or a build transform (S2). `./seo` is the one extra, and B58 records why.

Every entry ships `types` and `default` (compiled ESM). Framework sources contain no JSX, so one compiled file serves the DOM and the server, and Solid's own packages pick their build by the app's conditions (B18). `./server-fn` alone keeps conditional exports.

## `.`

| export | from |
| --- | --- |
| `createPage`, `createLayout`, `createRootLayout`, `createPathSegment` | `shared/route-builder` |
| `createRouter` | `shared/router` |
| `redirect`, `notFound`, `unauthenticated`, `unauthorized` | `shared/errors` |
| `markSafeError` | re-export of Solid's, via `shared/errors/safe.ts` |
| `Link`, `Outlet`, `InterceptOutlet`, `ViewTransitionBoundary`, `ViewTransitionCSS`, `Stylesheet` | `shared/components` |
| `useNavigation`, `useNavigationProgress`, `useLoaderData`, `useParams`, `useSearch`, `useLocation`, `useMatch`, `useNavigate`, `useBlocker`, `usePreloaderContext` | `client/navigation`, `shared/router` |
| `createServerOnlyFn`, `createClientOnlyFn`, `createIsomorphicFn` | `shared/env` |
| `nonce` | `shared/csp` |
| `navigate` | `client/navigation/navigate.ts` |
| `Href` | `shared/url/href.ts` |
| `LocationRewrite` | type from `shared/url/types.ts` |
| `FlareRegister` | type from `shared/route-builder/register.ts` |
| `SearchOutput`, `ParamsOutput` | types from `shared/route-builder/register.ts`. They read the output type a route's typed `.input()` step records, so `types.gen.d.ts` can name `routeSearchParams` and `routeParams` as `SearchOutput<typeof import("<file>").route>` without deriving types from text |
| `ThemeProvider`, `ThemeScript`, `useTheme` | `features/theme` |
| `DirectionProvider`, `DirectionScript`, `useDirection` | `features/direction` |
| `createFont`, `FontCSS` | `features/fonts` |
| `Image` | `features/image` |
| `useDeferred` | `shared/components/use-deferred.ts`. The one deferred read (B80) |

`createServerOnlyFn`, `createClientOnlyFn`, and `createIsomorphicFn` are on the root because app code on both graphs imports them. The boundary transform deletes the illegal body (B9). `nonce` is on the root for the same reason: server render and client navigation read one value.

## `./client`

`createClient`. The callbacks are `dx/client.md`.

## `./server`

`createServer`, `serverCtx`, `withFetchDedupe`, `createMiddleware` and the middleware types (`Middleware`, `MiddlewareEntry`, `MiddlewareFilter`), `mount`, `proxy`, `security` config type, `revalidate`, `createRevalidateFn`, `FlareStore`, `createMemoryStore`, `createAssetsStore`.

## `./server-fn`

`createServerFn`, plus the types `ServerFn`, `StreamFn`, `ServerFnBuilder`, and `FnContext`.

The entry has conditional exports, because the in-request call imports the server dispatch path and a client chunk may not contain `src/server` (B45). The chain, the call-once rule, and the render guard live in `shared/server-fn/builder.ts`, which imports no server module. The condition order is `types`, `workerd`, `browser`, `worker`, `default`. `workerd` comes first and resolves to the server entry, because Cloudflare's Vite plugin builds the Workers server with `workerd`, `worker`, `module`, and `browser`, and the first matching key wins; without it a Workers server would get the client stub. `browser` and `worker` resolve to `src/exports/server-fn-client.ts`, which binds the chain to the booted transport: it reads `self.flare.call` at call time and throws `server function called before the client booted` before boot. `default` resolves to `src/exports/server-fn.ts`, which binds it to the in-request call. A client build that imports a server function passes the tripwire (`vite/boundary/tripwire.test.ts` `server fn import`).

## `./query`

Peer `@tanstack/solid-query`. `createQueryClientGetter`, `useSuspenseQuery`, `serverFnQueryOptions`, `serverFnMutationOptions`.

## `./i18n`

`createTranslations`, `formatMessage`, `LocaleProvider`, `LocaleScript`, `useLocale`, `useLoaderT`, `usePreloaderT`.

## `./i18n/server`

Peers `negotiator`, `isbot`, `@formatjs/intl-localematcher`. `i18n`.

## `./seo`

`sitemap`, `indexNow` (and `indexNow.file`), `googleIndexing`, `bingIndexing`. Arguments are `dx/seo.md`.

## `./adapters/node`

`createNodeListener`, `toRequest`. Arguments are `dx/adapters.md`.

## `./adapters/bun`

`createBunFetch`. The return shape is `dx/adapters.md`.

## `./adapters/workers`

`createWorkersHandler`. Arguments are `dx/adapters.md`.

## `./stores/fs`

`createFilesystemStore`, `fileAssets`. Arguments are `dx/store.md`.

## `./stores/cache-api`

`createCacheApiStore`. Arguments are `dx/store.md`.

## `./vite`

`flare`. Peers `vite`, `@solidjs/vite-plugin`, `oxc-parser`, `magic-string`. `sharp` is an optional peer, loaded only when `flare({ image })` is set. The options are `dx/plugin.md`. The types condition declares `*.avif?image`, `*.jpg?image`, `*.jpeg?image`, `*.png?image`, `*.tiff?image`, and `*.webp?image` as `{ src, width, height, variants }` (B88). A plain image import stays `vite/client`'s URL string. `./validation`, `./generators`, and `./virtual-types` are not exports. No public type names a `virtual:` module (B89).

## `./fonts/<id>`

`<id>` is a key of `features/fonts/registry.json`. The module is `features/fonts/shared/generated/<id>.ts` and its default export is that family's metadata (B78). The package `exports` key is `./fonts/*`. It does not go through `src/exports/`. There is no `./fonts` key. `createFont` and `FontCSS` stay on `.` and do not import these modules.

## `./generated`

Imported by `routes.gen.ts` only. `defineRouteTree`, `defineLayouts`, the record types.

## `./testing`

`createTestServer` and `flarePage`. Arguments are `dx/testing.md`.

## `./package.json`

The package metadata entry. There is no `dependencies` key. Peers and the exact dev pins are B79.

## Builder chain

`createPage(id)` returns methods in this order. Each method may be called once.

`intercept` → `cache` → `input` → `authenticate` or `authenticateOptional` → `authorize` → `effects` → `preloader` → `loader` or `response` → `head` → `headers` → `security` → `render` → any of the boundary renders.

`loader` and `response` are mutually exclusive. `render` exists only after `security`. A `.response()` chain has no `render` (B89).

Every argument is in `dx/builder.md`. A method that file does not list does not exist.

`createLayout` has no `intercept` and no `response`. `createRootLayout` has no `intercept`, no `response`, and its `render` returns the document. `createPathSegment` has `render` fixed as the identity and an optional `cache`.

`createServerFn({ method? })` then `authenticate` → `input` → `authorize` → `handler` or `stream`. There is no `name` field (B85). `method` is `"get"` or `"post"`, default `"post"`. `cache: { maxAge }` accepts a duration and is legal only when `method` is `"get"` and the chain has no auth (B43).

## Route files

The filename is not a URL segment. The id is the directory under `src/routes`. The public URL drops the root marker and group segments. The table, including `_root_/about`, `(blog)`, `[id]`, `[...path]`, `[[locale]]`, and `_admin_/dashboard`, is `dx/routes.md`.

```
src/routes/_root_/root.root-layout.tsx
src/routes/_root_/home.page.tsx                   id _root_, URL /
src/routes/_root_/(auth)/auth.layout.tsx          (group) adds no URL segment
src/routes/_root_/users/[id]/user.page.tsx        [id]  [...rest]  [[opt]]  [[...opt]]
src/routes/_root_/_parts/widget.tsx               a folder starting with _ but not _x_ is ignored
src/routes/[locale]/_root_/locale.root-layout.tsx a param above a root is a second root
src/routes/_root_/[[locale]]/locale.segment.ts
src/client.tsx
src/server.ts
src/router.ts
src/_gen/routes.gen.ts
src/_gen/types.gen.d.ts
```

Crossing from one `*.root-layout.tsx` to another is a full document load, not a data navigation (`dx/routes.md`). The generated `FlareRegister` maps are `dx/types.md`.

## `createServer` fields

| field | required | meaning |
| --- | --- | --- |
| `router` | yes | the isomorphic router |
| `site` | for any shared cache or sitemap | absolute origin written into stored HTML (B50) |
| `authenticate` | no | `(ctx) => session \| null`. The context, including `callerData`, is `dx/server.md` |
| `locale` | no | the object `i18n()` returns (B55) |
| `middleware` | no | ordered list |
| `mounts` | no | `{ prefix, fetch }[]`. `prefix` of `"/"` throws. The full table is `dx/server.md` |
| `rewrite` | no | `(path) => path \| undefined` |
| `security` | no | CSP, HSTS, and the rest; defaults apply when omitted |
| `sameSite` | no | hosts allowed to pass a `same-site` CSRF check (B44) |
| `trustProxy` | no | hop count, default 0 (B51) |
| `bodyLimit` | no | bytes, default 1 MiB (B52) |
| `store` | no | `FlareStore`. Absent means no shared cache |
| `static` | no | read-only `FlareStore` of SSG artifacts, or `(env) => FlareStore`. `dx/server.md`, `dx/store.md` |
| `serverContext` | when `FlareRegister` declares it | `(ctx: { request, env }) => value`. `serverCtx()` returns it (B75) |
| `documentResponseDefer` | no | `"stream"` or `"buffer"`. Default `"stream"`. A rendered HTML document only (B92). The full table is `dx/server.md` |

## `createRouter` fields

| field | default | meaning |
| --- | --- | --- |
| `layouts`, `routeTree` | required | from codegen |
| `basePath` | `"/"` | prefix, itself a route |
| `caseSensitive` | `false` | static segment folding |
| `trailingSlash` | `"preserve"` | `"always"` or `"never"` also legal |
| `notFoundMode` | `"root"` | `"fuzzy"` renders the longest layout prefix, including a layout-only directory (B73). v0 defaulted to `"fuzzy"` |
| `scrollRestoration` | `true` | `sessionStorage` |
| `viewTransitions` | `false` | |
| `theme` | absent | resolved config on the router context. The feature reads it. `dx/features.md` |
| `direction` | absent | the same. The locale is a prop on the direction components, not a field here |
| `locale` | absent | types the param. It does not redirect. The server slot is `createServer({ locale })` |
| `prefetch` | `{ modules: "all", data: false }` | see `dx/link.md`. A string sets both fields. `modules: "all"` is legal only here |
| `cache.client` | `staleTime` `0`, `gcTime` `"5m"` | no `ssr`, `ssg`, `isr`, or `cdn` on the router. The full table is `dx/router.md` |

## Package `exports` map

The keys are exactly the subpaths in this file. Adding a key means adding a decision row and an `src/exports/<name>.ts` row in the same change.

`bin` is `{ "flare": "<compiled>/bin/codegen.js" }` with the single command `codegen`.

`files` is `dist`, `src`, `README.md`, `LICENSE`.

`sideEffects` is `false`.
