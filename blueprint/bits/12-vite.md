# Bit 12 — Dev server and prerender

Creates every `P12` row. `flare codegen` writes the same files the plugin writes. Prerender fails the build when a route does not return 2xx.

## Extends

`vite/codegen/auth-hint.test.ts` is now also executed from `vite/prerender/run.ts`.

`tests/e2e/playwright.config.ts` gains `node-prod-chromium`, `node-prod-firefox`, `node-prod-webkit`, and the same three browsers for `bun-prod` and for `workers-prod` (B70). `boot.test.ts` gains `node prod`, `bun prod`, and `workers prod`: each answers GET `/` with 200, and the HTML contains no `@vite/client`. It also gains `disconnect survives` for each of the three (BUGS.md B28): against the `docs` app's prod boot, a raw request to `/playground` whose socket is destroyed after the headers, five times and once before them, is followed by GET `/healthz`, which answers 200. The Bun case runs `createBunFetch` in the real Bun child `boot` already spawns, so it needs no Bun inside the Node test process. `workers` with `mode: "dev"` still throws. Each prod call runs `vite build` on Node, with `NODE_ENV=production` so a test runner's `test` cannot select Solid's development server build, into its own temp `outDir` under the repo's `node_modules/.flare-e2e/`, so the built server's external imports resolve as a deploy's would. That is not the app directory. The Node listener and `createBunFetch` serve that output in a child process behind a test-only static layer for the client files, since the adapters serve none (B13). miniflare runs the worker bundle in process with `modulesRoot`, the app's compatibility settings, and the assets binding with `has_user_worker`. They do not run the build. `apps/basepath/wrangler.jsonc` is born in this bit so `workers-prod` can boot `basepath`. `vite preview` is not a project. The Playwright files that already exist run on those nine projects with no new cases.

## Cases

### `vite/dev/guard.test.ts`

| test | case | result |
| --- | --- | --- |
| `same origin` | `Sec-Fetch-Site: same-origin` | the endpoint runs |
| `missing site` | no `Sec-Fetch-Site` header | the endpoint runs |
| `same site` | `Sec-Fetch-Site: same-site` | 403 |
| `none` | `Sec-Fetch-Site: none` | 403 |
| `cross site` | `Sec-Fetch-Site: cross-site` | 403 |
| `no star` | a response from a dev endpoint | no `Access-Control-Allow-Origin: *` |
| `absent in prod` | the plugin's prod config | the dev endpoints are not registered |

### `vite/prerender/run.test.ts`

| test | case | result |
| --- | --- | --- |
| `200` | a real build of an app with an ssg page and `prerender: true`; then one with an `authorize` page, and one whose server entry exports no `server` | the seed is written through the write path under the build's own id, and the assets store of that build reads it. The second build fails naming the route, the third naming the entry |
| `401` | an `ssg` page, or an `isr` page rendered at the build, whose chain requires auth, on a layout or on the page itself | exit 1, stderr contains the route id, nothing written. Seeds are public files under the assets path |
| `500` | the loader throws | exit 1, the route id on stderr |
| `hint mismatch` | codegen's hint and the loaded modules' effective auth disagree, either way | exit 1 before rendering, naming the route. The hint is the codegen scan of the chain's files, so a layout that authenticates makes its pages `requires` |
| `credential less` | the populate request | the URL is `site` plus the pathname. No search, no cookie, no authorization, and no copied request headers |
| `dynamic false` | `dynamicParams: false` and a slug that was not listed | that slug is not rendered and is not written |
| `defer rejected` | `defer: "resolve"` and the promise rejects | exit 1, stderr contains the route id, nothing written |
| `missing params` | a dynamic SSG route with no `params` and no parent params | exit 1 before rendering |
| `no static store` | an SSG route and `createServer` has no `static` | the server renders per request and reports it once per route, at error level so production shows it (B89) |
| `concurrency` | the default | one route renders at a time |
| `env` | `env: () => ({ TOKEN: "t" })` | the function is called at prerender, and the request env is `{ TOKEN: "t" }` |
| `exclude` | the route id is in `exclude` | that route is not rendered |
| `prerender off` | an SSG route and `prerender` omitted | exit 1, stderr names the route, nothing written |
| `isr true` | `isr: true` and `prerender` omitted | exit 0, that route is not rendered |
| `isr empty` | `isr: {}` and `prerender` omitted | exit 0, that route is not rendered |
| `authorize` | `authorize` anywhere on the chain | exit 1, stderr names the route, nothing written |
| `optional auth` | `authenticateOptional` and no `authorize` | the anonymous body is prerendered |
| `middleware runs` | a middleware redirect on a prerendered route | exit 1 naming the route and the status, nothing written: a seed never holds a page the middleware would have changed |

### `server/cache/prerender.test.ts`

What prerender reads of a built server, under the registry symbol `Symbol.for("flare.prerender")` on the `server` object (`shared/protocol/prerender.ts`). No package entry exports it. A render runs the whole pipeline, middleware and mounts included, on `site` plus the page's path under the router's base. A shared answer of an ssg page, or an isr page, goes through `sharedRender` and `buildEntry`, the same shared render and entry an ISR populate writes, and the entry is captured instead of stored.

| test | case | result |
| --- | --- | --- |
| `pages` | ssg pages static and listed, isr pages with and without params, a live page, a `.response()` page, and chains with `authenticate`, `authorize`, and an authenticated layout | every ssg and isr page, with its mode, whether its pattern is dynamic, whether it lists params, its effective auth, and whether it has `authorize`. The live and `.response()` pages are not listed |
| `params` | an ssg function, ssg `{ params }`, isr `params`, and a page without them | each function is called with `{ params: {} }`, and a page without one is one page, `[{}]` |
| `render` | a listed ssg slug, an isr slug, and the home page and a page under base path `/app` | status 200, the key `static:<build>:<route>:<params>`, and the entry a stored miss writes: the HTML under the entry's sentinel, the NDJSON, the render mode, and the tags |
| `refused` | a live page, an isr page without params, an unknown id, and a server without `site` | each throws and names the route, or names `site` |
| `not stored` | a chain that requires auth, on the page or on a layout; a `resolve` value that rejects; a render that throws; a middleware redirect | 401 with no entry; no entry; 500 with no entry; the redirect status with no entry |

### `shared/protocol/prerender.test.ts`

| test | case | result |
| --- | --- | --- |
| `registry key` | the key | `Symbol.for("flare.prerender")`, so a built server's own copy of the module and prerender's agree |
| `prerenderer of` | a server with a whole prerenderer, and values without one | the prerenderer, else `undefined` |

### `vite/prerender/artifacts.test.ts`

| test | case | result |
| --- | --- | --- |
| `seed shape` | a successful prerender | the JSON has `renderedAt`, `tags`, `seed: true`, and `data` |
| `path` | route id `_root_/about`, build `b`, default `assetsBase` | the file is `<client>/assets/_flare-static/b/<sha256 hex of _root_/about>.json`, the path `artifactPath` returns (dx/store.md) |
| `base follows assets` | `assetsBase: "/cdn"` | the file is under `/cdn/_flare-static/` |
| `empty tags` | an SSG route that declares no tags | the file is written and `tags` is `[]`. `revalidate` does not delete it |

An SSG route with no tags still prerenders. Purge does not apply to `_flare-static` (`dx/cache.md`). A seed file whose `tags` key is absent is refused by the bit 10 checker.

### `vite/bin/codegen.test.ts`

| test | case | result |
| --- | --- | --- |
| `writes both` | a fixture app | `routes.gen.ts` and `types.gen.d.ts` match what the plugin would write |
| `watch is the plugin` | the bin's command list | the only command is `codegen` |

### `vite/plugin/environments.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `order` | a real builder with a `wrangler.jsonc` | buildApp builds client, ssr, then worker, each once. The worker environment is the Workers bundle, a server graph with `workerd` conditions, written to `<outDir>/worker/index.js` |
| `no worker` | no wrangler config | the worker environment is absent, and buildApp builds client and ssr |
| `web worker` | a client that starts a Vite `?worker` from a module that imports the package's server code, then one with a `createServerOnlyFn` body | the first build fails and names the server module (B45). The second builds without the body. flare() puts the boundary into `worker.plugins` with the client graph |
| `css order` | the ssr environment built before the client | the build fails: the server reads the client build's stylesheet (`vite/css/inject`), so the client must build first |
| `urls agree` | a real client and ssr run with Vite `base: "/app/"`, then `assetsBase: "/cdn"`, then `assetsBase: "/"` | the client entry URL, a lazy chunk URL as the entry resolves it, the stylesheet `builtHref`, a CSS `url()` asset, and the seeds' public URL all start with the same prefix (`/app/assets/`, `/cdn/`, `/`). One function, `assetUrl`, resolves it: `clientUrl`, `stylesheetOf`, and Vite's `renderBuiltUrl` call it. A chunk URL is relative to the entry chunk. The seed directory `createAssetsStore` reads is the path inside the client output, `/<assetsDir>/_flare-static`, without Vite `base` |
| `chunk urls` | a real client build of a generated `routes.gen.ts` | each `chunks` source path becomes the chunk its lazy import loads, an emitted chunk reference rendered relative to the entry chunk, so the content hash covers it. No `/src/routes/` path is left. `vite dev` keeps the source paths, which are the dev URLs |
| `after build` | buildApp once every environment is built | prerender runs with the app root, the client output, the built server file, the assets base, and the parsed `prerender` option |
| `config file` | a builder from a `vite.config` file that calls `flare()` | the ssr bundle holds the client's stylesheet. The builder shares one config and one plugin set across environments (`sharedConfigBuild`, `sharedPlugins`): Vite would otherwise load the config file again per environment, and its `flare()` call would make new plugins that never saw the client build |
| `css server only` | a real client and ssr build of an app with CSS | the ssr bundle's `builtSheet` is the client's one stylesheet and its `builtHref` that file's URL. No client JavaScript chunk contains the CSS text |

Route chunks (from bit 06). Codegen's `chunks` map gives each route id the project-relative source path of its lazy module, which is the dev chunk URL, by the same rule as `clientUrl`. The production build rewrites each entry to that module's hashed file from the Vite manifest, and a missing entry fails the build. Prefetch `all modules` reads `router.chunks`.

### `vite/plugin/wrangler.test.ts`

| test | case | result |
| --- | --- | --- |
| `jsonc` | comments, a `//` and `/*` and `,}` inside strings, an escaped quote, and trailing commas | the JSON a parser reads, with the strings kept |
| `fields` | `compatibility_date`, `compatibility_flags` with a non-string, and `assets.binding`; then a config without them, and one that is not an object | the binding, the date, and the string flags; then none of them; then a throw |
| `absent` | no Workers config | `undefined`: no worker environment |
| `toml` | a `wrangler.toml` | throws and names `wrangler.jsonc` |

### `vite/plugin/build-id.test.ts`

| test | case | result |
| --- | --- | --- |
| `dev` | no client manifest, or `vite dev` | the id is `dev` |
| `hash` | a manifest with two JS files and one CSS file | the id is the first 12 hex digits of sha256 over the sorted deduped root-relative URLs |
| `missing` | a production build and the manifest path is absent | the build fails and names that path |
| `wired` | a server built with that id | every pipeline response carries `flare-build: <id>` from finalize, and `self.flare.build` in the document state is the same id. Bit 06's client mismatch check then runs on real values (it passes `""` until this row lands) |

### `vite/dev/handler.test.ts`

Moved to bit 06, which needs a real client document for its e2e navigation rows. The dev handler, its rows, and the `error relay` are born there.

### `vite/plugin/environments.test.ts` (build shape)

| test | case | result |
| --- | --- | --- |
| `defaults` | `flare()` with no outDir override | client output is `dist/client` with the manifest on. SSR output is `dist/server/server.js`. `cssCodeSplit` is false |
| `assets dir` | `assetsBase: "/"` and `build.assetsDir` set to something other than `assets` | the plugin throws. The URL prefix is `/` and the on-disk directory is `assets` |

### `vite/plugin/options.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `prerender` | omitted, `false`, `true`, a whole object, a record `env`, and bad values | `false`, `false`, `{}`, the object as given; a non-integer or zero `concurrency`, a non-list or non-string `exclude`, a non-object `env`, and an unknown key throw and name the key |

### `vite/plugin/flare.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `solid options` | the `solid()` call | the argument is `{ ssr: true, extensions: [".tsx", ".jsx"] }` and `start` is absent |

### `vite/codegen/routes.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `client literals` | a route whose `cache.client` and `intercept` are literals | the generated record carries `prefetch`, `staleTime`, `gcTime`, `prefetchStaleTime`, `prefetchGcTime`, `cacheDeferred`, `intercept.from`, and `intercept.render` |
| `no auth copy` | the route calls `authenticate` and sets `ssg` | those fields are not on the generated record. A non-literal client field is omitted and is not a build error |

### `vite/codegen/write.test.ts`

The writer the plugin and `flare codegen` share. It writes `src/_gen/routes.gen.ts`, `types.gen.d.ts`, and `server-fns.gen.ts`. The plugin calls it in `buildStart`, so a build and `vite dev` write first and a failure fails the start. The e2e apps commit their generated files, so a run writes nothing in the app directory (B70).

| test | case | result |
| --- | --- | --- |
| `unchanged` | the scan result is the same | the files are not written again, and they keep their time |
| `empty` | the route set becomes empty; then two pages whose folders differ only in case | the route and type files are removed, and the server function list stays. Files are read in UTF-16 code unit order |
| `watch` | a source under `src` changes during `vite dev`, twice; a change inside `src/_gen` or outside `src`; then a change that fails codegen | the files are written once after a 50 ms debounce. A generated file or an outside path does not trigger. A failure is reported as `[flare:codegen]` and the watch goes on |

### `tests/e2e/static.test.ts`

The minimal app gains `/static` (`ssg: true`) and `/static/[slug]` (`ssg` with `params` returning `a` and `b`). Its server passes `static`: `createAssetsStore(fileAssets(<client output>))` on Node and Bun, and on Workers a `read` over the `ASSETS` binding.

| test | case | result |
| --- | --- | --- |
| `ssg served` | node-prod, bun-prod, and workers-prod load `/static` and `/static/a` | 200, `flare-render: ssg`, the seeded body, a nonce equal to the CSP header, and the page hydrates with no console error. The seed files exist under the client output at the hashed `artifactPath` |
| `ssg unlisted` | `/static/zzz` on the same projects | 404 from the router, nothing served from a seed |
| `ssg dev` | node-dev loads `/static/a` | a live render, no `flare-render: ssg` |

## Done

A prerender that produces a 401 fails the build and writes nothing. Dev endpoints are absent from the production plugin. `vite dev` on Node and Bun is `vite/dev/handler.ts`.
