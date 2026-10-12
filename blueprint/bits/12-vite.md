# Bit 12 — Dev server and prerender

Creates every `P12` row. `flare codegen` writes the same files the plugin writes. Prerender fails the build when a route does not return 2xx.

## Extends

`vite/codegen/auth-hint.test.ts` is now also executed from `vite/prerender/run.ts`.

`tests/e2e/playwright.config.ts` gains `node-prod-chromium`, `node-prod-firefox`, `node-prod-webkit`, and the same three browsers for `bun-prod` and for `workers-prod` (B70). `boot.test.ts` gains `node prod`, `bun prod`, and `workers prod`: each answers GET `/` with 200, and the HTML contains no `@vite/client`. `workers` with `mode: "dev"` still throws. Each prod call runs `vite build` on Node, with `NODE_ENV=production` so a test runner's `test` cannot select Solid's development server build, into its own temp `outDir` under the repo's `node_modules/.flare-e2e/`, so the built server's external imports resolve as a deploy's would. That is not the app directory. The Node listener and `createBunFetch` serve that output in a child process behind a test-only static layer for the client files, since the adapters serve none (B13). miniflare runs the worker bundle in process with `modulesRoot`, the app's compatibility settings, and the assets binding with `has_user_worker`. They do not run the build. `apps/basepath/wrangler.jsonc` is born in this bit so `workers-prod` can boot `basepath`. `vite preview` is not a project. The Playwright files that already exist run on those nine projects with no new cases.

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
| `200` | a static page | exit 0, the body stored through the write path |
| `401` | an `ssg` page, or an `isr` page rendered at the build, whose chain requires auth, on a layout or on the page itself | exit 1, stderr contains the route id, nothing written. Seeds are public files under the assets path |
| `500` | the loader throws | exit 1, the route id on stderr |
| `hint mismatch` | the hint says public and the module requires auth | exit 1 before rendering |
| `credential less` | the populate request | the URL is `site` plus the pathname. No search, no cookie, no authorization, and no copied request headers |
| `dynamic false` | `dynamicParams: false` and a slug that was not listed | that slug is not rendered and is not written |
| `defer rejected` | `defer: "resolve"` and the promise rejects | exit 1, stderr contains the route id, nothing written |
| `missing params` | a dynamic SSG route with no `params` and no parent params | exit 1 before rendering |
| `no static store` | an SSG route and `createServer` has no `static` | the server renders per request and warns once |
| `concurrency` | the default | one route renders at a time |
| `env` | `env: () => ({ TOKEN: "t" })` | the function is called at prerender, and the request env is `{ TOKEN: "t" }` |
| `exclude` | the route id is in `exclude` | that route is not rendered |
| `prerender off` | an SSG route and `prerender` omitted | exit 1, stderr names the route, nothing written |
| `isr true` | `isr: true` and `prerender` omitted | exit 0, that route is not rendered |
| `isr empty` | `isr: {}` and `prerender` omitted | exit 0, that route is not rendered |
| `authorize` | `authorize` anywhere on the chain | exit 1, stderr names the route, nothing written |
| `optional auth` | `authenticateOptional` and no `authorize` | the anonymous body is prerendered |

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

### `vite/plugin/flare.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `solid options` | the `solid()` call | the argument is `{ ssr: true, extensions: [".tsx", ".jsx"] }` and `start` is absent |

### `vite/codegen/routes.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `client literals` | a route whose `cache.client` and `intercept` are literals | the generated record carries `prefetch`, `staleTime`, `gcTime`, `prefetchStaleTime`, `prefetchGcTime`, `cacheDeferred`, `intercept.from`, and `intercept.render` |
| `no auth copy` | the route calls `authenticate` and sets `ssg` | those fields are not on the generated record. A non-literal client field is omitted and is not a build error |
| `watch` | a route file under `src/routes` changes during `vite dev` | both generated files are rewritten after a short debounce. A startup failure fails the build. A watch failure is reported and the process stays up. File order is UTF-16 code unit |
| `unchanged` | the scan result is the same | the files are not written |
| `empty` | the route set becomes empty | both generated files are removed |

## Done

A prerender that produces a 401 fails the build and writes nothing. Dev endpoints are absent from the production plugin. `vite dev` on Node and Bun is `vite/dev/handler.ts`.
