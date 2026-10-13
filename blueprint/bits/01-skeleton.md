# Bit 01 — Skeleton

Creates every `P1` row. At the end, the minimal app answers `GET /` with a document, hydrates, and answers an unknown path with 404. The Node adapter is the server. There is no auth, no cache, no server function, and no data navigation yet.

`renderToStream` is called with `nonce`, `onError`, `onHead`, `signal`, `manifest`, and `onCompleteShell` (B83). `manifest` may supply scripts and does not emit the app CSS href. The state script is written from `onCompleteShell`. Bit 05 adds the abort race and the projector; this bit only requires a successful render and a failed render that becomes a 500.

## Cases

### `shared/route-tree/segments.test.ts`

| test | case | result |
| --- | --- | --- |
| `static segment` | `about` | one static segment |
| `param` | `[id]` | one dynamic segment |
| `catch-all` | `[...rest]` | one catch-all |
| `optional` | `[[id]]` and `[[...rest]]` | optional forms |
| `literal brackets` | `[_]id]` | a static segment whose text is `[id]` |
| `group is not a segment` | `(auth)` | ignored by the pattern parser |
| `bad brackets` | `[user-id]` and `[_]blog` | throw. Only the four bracket forms, and `[_]text]` with no `]` inside `text`, are legal (`dx/routes.md`) |

### `shared/route-tree/match.test.ts`

| test | case | result |
| --- | --- | --- |
| `static match` | pattern `/about`, path `/about` | match |
| `encoded static` | pattern `/a b`, path `/a%20b` | match, compared encoded |
| `case fold` | `caseSensitive: false`, path `/About` | match |
| `case strict` | `caseSensitive: true`, path `/About` | no match |
| `no match` | path `/missing` | no match |
| `dynamic` | pattern `/users/[id]`, path `/users/42` | match. `/users` and `/users/42/x` do not |
| `optional` | pattern `/optional-locale/[[locale]]` | `/optional-locale` and `/optional-locale/fr` match. `/optional-locale/fr/x` does not |
| `catch-all` | pattern `/files/[...path]` | `/files/a/b` matches with `path` `["a", "b"]`. `/files` does not |
| `group and root` | id `_root_/(blog)/post`, pattern `/post` | `/post` matches. A group or root folder adds no segment |

### `shared/route-tree/rank.test.ts`

| test | case | result |
| --- | --- | --- |
| `static wins` | `/users/new` and `/users/[id]`, path `/users/new` | `/users/new` |
| `dynamic wins over optional` | `/x/[id]` and `/x/[[locale]]`, path `/x/a` | `/x/[id]` |
| `dynamic wins over catch-all` | `/files/[id]` and `/files/[...rest]`, path `/files/a` | `/files/[id]` |
| `catch-all wins over optional catch-all` | `/docs/[...rest]` and `/docs/[[...rest]]`, path `/docs/a` | `/docs/[...rest]` |
| `leftmost segment decides` | `/a/[id]/c` and `/a/b/[...rest]`, path `/a/b/c` | `/a/b/[...rest]`. Segments compare left to right and the first difference decides |

Patterns use the codegen bracket syntax. There is no `:id` or `*rest` form. Groups and root folders add no segment.

### `shared/route-tree/params.test.ts`

| test | case | result |
| --- | --- | --- |
| `raw param` | path `/users/a%2Fb` | param is `a%2Fb`, not decoded |

### `shared/route-builder/chain.test.ts`

| test | case | result |
| --- | --- | --- |
| `second render throws` | `.render().render()` | throw at build of the chain |
| `loader then response throws` | both set | throw |
| `order` | `cache` after `loader` | throw |
| `one mode` | `.cache({ ssr: { ttl: "1m" }, isr: true })` | does not type-check, and a cast throws |
| `no author key` | `.cache({ ssr: { ttl: "1m", key: () => "x" } })` | does not type-check |
| `optional argument` | `.authenticate("optional")` | throw. The method is `.authenticateOptional` |

### `shared/route-builder/page.test.ts`, `layout.test.ts`, `root-layout.test.ts`, `boundaries.test.ts`

| test | case | result |
| --- | --- | --- |
| `page render` | a page with render only | a route record with that render |
| `layout has no response` | the layout type's method list | `response` is absent |
| `root render is the document` | root render returns `<html>` | record flagged as the document |
| `boundary once` | `errorRender` twice | throw |

### `tests/types/propagation.test.ts`

The core tsconfig includes this file. Every case name in the matrix in `dx/types.md` is one `expectTypeOf` or `@ts-expect-error` here. Executing the file under Vitest does not replace the typecheck. The fixture app and `app.test.ts` are born in bit 07.

### `shared/router/create-router.test.ts`

| test | case | result |
| --- | --- | --- |
| `defaults` | only `layouts` and `routeTree` | `basePath` `/`, `caseSensitive` false, `trailingSlash` `preserve`, `notFoundMode` `root`, `scrollRestoration` true, `scrollRestorationBehavior` `instant`, `scrollRestorationMaxEntries` 50, `routeCacheMaxEntries` 100, `prefetch` `{ modules: "all", data: false }`, `cache.client` `staleTime` 0 and `gcTime` `"5m"`, `viewTransitions` false |
| `not found root` | the default, an unknown path | the root not-found renders |
| `not found fuzzy` | `notFoundMode: "fuzzy"` | the longest layout prefix's not-found renders, including a layout-only directory. A layout with no `notFoundRender` uses the root's |
| `cache client only` | `cache: { ssr: { ttl: "1m" } }` on the router | does not type-check |
| `base path is a route` | `basePath` `/app` | `/app` matches the index, `/app/` is not a different route until bit 02 |
| `theme absent` | the field omitted | `router.theme` is absent |
| `direction absent` | the field omitted | `router.direction` is absent |

### `shared/router/context.test.ts`

| test | case | result |
| --- | --- | --- |
| `value` | the provider receives the router | `useRouter()` returns that object |
| `outside` | `useRouter()` with no provider | throw |

### `server/lifecycle/methods.test.ts`

| test | case | result |
| --- | --- | --- |
| `GET serves` | GET `/` | 200 |
| `HEAD is empty` | HEAD `/` | 200, headers of GET, body length 0 |
| `OPTIONS` | OPTIONS `/` | 204, `Allow: GET, HEAD, OPTIONS` |
| `POST is 405` | POST `/` | 405, the same `Allow` |

### `server/lifecycle/finalize.test.ts` and `policies.test.ts`

| test | case | result |
| --- | --- | --- |
| `only finalize builds a Response` | a stage returns a status and a body | the Response is created in finalize |
| `default policy` | a document with no cache config | `private, no-store` |
| `flare-render` | a live render | `flare-render: ssr` |

### `server/lifecycle/classify.test.ts`

| test | case | result |
| --- | --- | --- |
| `no param is a document` | `/` | document |
| `server fn path` | `/_flare/fn/abc` | 404, and the router is not called. Bit 07 replaces the 404 with dispatch |

Data and prefetch classification is completed in bit 06. This bit classifies those values as 400 so an early client cannot select a mode that does not exist yet. Bit 06 replaces that 400 with the data response and updates this test in the same commit.

### `server/lifecycle/logger.test.ts`

| test | case | result |
| --- | --- | --- |
| `dev warn` | dev, `warn` and `log` | both print. The level in dev is `warn` |
| `prod error` | production, `warn` and `error` | only `error` prints. The digest, the boundary log, and the missing-store warning use `error` |
| `format` | a tag, a message, and data | the line is `[flare:<tag>]`, the message, and the data. Data is omitted when absent. The functions are `error`, `warn`, and `log`. No other file calls `console` |

### `server/render/escape.test.ts`

The corpus file feeds the test.

| test | case | result |
| --- | --- | --- |
| `script close` | `</script>` | escaped, the HTML parser does not close the script |
| `dollar brace` | `` $` `` | escaped, no interpolation if the script were evaluated as a template |
| `line separator` | U+2028 and U+2029 | escaped |
| `attr quote` | `"` and newlines inside an attribute | escaped |

### `server/render/state.test.ts`

| test | case | result |
| --- | --- | --- |
| `one script` | a page with loader data `{ n: 1 }` | one `self.flare` assignment, `matches[0].data.n === 1`. The match keys are `id`, `params`, `search`, `data`, `preloader`, `head`, and `error` |
| `insertion` | shell with `</body>` | the script is inside the body |

### `server/render/shape.test.ts`

| test | case | result |
| --- | --- | --- |
| `prod document-less` | root render returns `<div>` and `NODE_ENV` is production | 500, generic body |
| `dev document-less` | the same in dev | the `<div>` is served |

### `server/render/document.test.ts`

| test | case | result |
| --- | --- | --- |
| `calls renderToStream` | a one-node render | the HTML contains the node |
| `signal is the request signal` | abort the request | the option passed is that signal |
| `loader data reaches the component` | loader returns `{ message: "hi" }` | the HTML contains `hi` |
| `router context` | the root layout reads the router context | it is the object passed to `createServer`. There is no module-level router |

### `adapters/node/request.test.ts`

| test | case | result |
| --- | --- | --- |
| `scheme-relative` | target `//evil/` | 400, the router is not called |
| `backslash` | target `/\evil` | 400 |
| `absolute-form` | target `http://evil/` | 400 |
| `control` | a byte below 0x20 in the target | 400 |
| `trustProxy default` | `X-Forwarded-Proto: https` and hop count 0 | `secure` is false |
| `trustProxy one` | the same header and hop count 1 | `secure` is true |
| `forwarded for` | `trustProxy` 2 and `X-Forwarded-For` has three addresses | `clientIp` is the entry at `length - 2`. Fewer entries than the hop count uses the socket. Hop count 0 ignores the header |
| `no forwarded host` | `X-Forwarded-Host` is set | `resolvedOrigin` uses the `Host` header. The pipeline request URL uses that origin |

### `adapters/node/listener.test.ts`

| test | case | result |
| --- | --- | --- |
| `flush` | a body of two chunks | the first chunk is written before the second is produced |
| `backpressure` | the socket pauses | the second write waits |
| `no options` | a second argument | throw |
| `wait until` | a handler calls `background` | `server.fetch` is called as `fetch(request, undefined, { waitUntil })`. The promise is retained. The response is not delayed for it |
| `set-cookie` | two `getSetCookie()` values | each is its own `Set-Cookie`. The listener does not rebuild the header with `headers.forEach` |
| `disconnect mid-stream` | `node:http` serving a real `createServer` whose root sits under `QueryClientProvider client={getQueryClient()}` and whose page holds a pending `"stream"` defer. The client socket is destroyed after the headers, five times, and once before them | the process keeps serving: the next GET answers 200, and no uncaught exception or unhandled rejection is raised (BUGS.md B28) |
| `node request` | `node:http`'s `createServer(createNodeListener(server))`, a POST with a body and a repeated header, then a bare request object | the listener type-checks as the request handler. The body is read through the `IncomingMessage` itself, whose `on` and `resume` need their receiver, and the handler sees it. A listed header is joined with `, `, an absent one is dropped, and no method or url is `GET /` |

### `vite/codegen/escape.test.ts`

| test | case | result |
| --- | --- | --- |
| `quote in a path` | a route file named `say-"hi".tsx` | the generated source parses |
| `backslash` | a segment with a backslash | escaped, not a backspace |

### `vite/codegen/routes.test.ts`

| test | case | result |
| --- | --- | --- |
| `one route` | the minimal home page | `routes.gen.ts` has no static route import. Each tree node's and layout's `module` is `() => import("../routes/<file>").then((loaded) => loaded.route)`: the import is relative from `src/_gen`, where the file is written, as `types.gen.d.ts`'s are. It exports `routeTree`, `layouts`, and `chunks`, which maps each id to `/<routesDir>/<file>` (`src/routes` by default). Bit 06 made modules lazy |
| `missing route export` | a page file with no `route` export | build error naming the file |
| `filename` | `home.page.tsx` directly in `_root_`, beside `root.root-layout.tsx` | the page id is `_root_/` and the root layout id is `_root_`. URL `/`. Under `[locale]/_root_` the home page id is `[locale]/_root_/` |
| `layout beside page` | `blog.layout.tsx` and `blog.page.tsx` in one non-root folder | build error naming both files |
| `about` | `_root_/about/about.page.tsx` | id `_root_/about`, URL `/about` |
| `group` | layout `_root_/(blog)` and page `_root_/(blog)/post` | the page URL is `/post` |
| `param` | `_root_/users/[id]` | URL `/users/[id]`, param `id: string` |
| `catch-all` | `_root_/files/[...path]` | URL `/files/[...path]`, param `path: string[]` |
| `optional` | `_root_/optional-locale/[[locale]]` | URLs `/optional-locale` and `/optional-locale/<tag>`, param `locale: string \| undefined` |
| `optional catch-all` | `[[...rest]]` | the rest may be absent, param `string[] \| undefined` |
| `admin root` | `_admin_/dashboard` | URL `/dashboard` |
| `locale root` | `[locale]/_root_/about` | URL `/[locale]/about` |
| `literal brackets` | folder `[_]id]` | the URL segment is the static text `[id]` |
| `ignored` | `_parts/widget.tsx` | no route |
| `duplicate url` | `_root_/dashboard` and `_admin_/dashboard` | build error, both files named |
| `shadow` | a catch-all beside a static sibling | build error |
| `two pages` | two `*.page.tsx` files in one folder | build error |

### `vite/codegen/scan.test.ts`

One `oxc-parser` walk (B75). Babel is not imported.

| test | case | result |
| --- | --- | --- |
| `parse error` | the file does not parse | the build fails and names the file. The file is not dropped |
| `comment` | a comment contains `.authenticate(` | auth mode is unset |
| `string` | a string contains `.authenticate(` | auth mode is unset |
| `regex` | a regex literal contains `.authenticate(` | auth mode is unset |
| `call` | `.authenticate()` and `.authenticateOptional()` | the mode is `true` or `"optional"` from the call name |
| `intercept literals` | `.intercept({ from: ["_root_/gallery"], render: "preview" })` | those literals, and the route-id span |
| `computed from` | `from` is an identifier | the build fails and names the file and `intercept` |
| `query import` | an import of `@lovrozagar/flare/query` | the flag is set. A comment that names the package does not set it |

### `client/boot/hydrate.test.ts` and `create-client.test.ts`

| test | case | result |
| --- | --- | --- |
| `reads the script` | HTML with the state script | the router match equals that state |
| `adopts history` | `history.state` already has an index | no new history entry |
| `router context` | a component under hydrate reads the router context | it is the same object `createClient` received |
| `prefetch build` | a document of build b1. An intent prefetch of /about is answered with `flare-build: b2`, then the app navigates to /about, also answered b2 | the navigation loads the document once (`assign("/about")`) and never paints the prefetched frames. One build value feeds the navigator, the prefetcher, and the server-function transport, so a mismatched prefetch is dropped (BUGS.md B30) |

### `tests/integration/skeleton.test.ts`

| test | case | result |
| --- | --- | --- |
| `GET /` | the minimal app through `createNodeListener` | 200, the page text, the state script |
| `GET /nope` | unknown path | 404 |
| `two concurrent renders` | two requests with different loader sentinels | each body contains only its own sentinel |

### `tests/e2e/playwright.config.ts`

Kind `config`. No sibling test. One export. `testDir` is this directory. `webServer` is absent. `fullyParallel` is false, so the tests in one file share the `beforeAll` server. `workers` is unset. `retries` is 0. `projects` is exactly `node-dev-chromium`, `node-dev-firefox`, and `node-dev-webkit`. Each sets `browserName` to that engine and leaves the viewport at Playwright's default. There is no `devices` entry. With no `--project`, Linux runs the two non-webkit projects and macOS runs `node-dev-webkit`. Selecting a webkit project on Linux fails and the message names macOS. `darwin` is the only OS that launches `webkit`. Playwright's WebKit is the Safari engine. The config does not target Safari.app. The root `package.json` script `test:e2e` runs Playwright with this config. `bun run test` does not invoke it.

`.github/workflows/ci.yml` has two required jobs. `e2e-linux` uses `ubuntu-latest`, installs Playwright chromium and firefox, and runs `bun run test:e2e`. `e2e-mac` uses `macos-latest`, installs Playwright webkit, and runs `bun run test:e2e`. Neither job passes `--project`. The v0 Deno e2e entry is not a job.

`packages/core/.oxlintrc.json` keeps the limit rules on `tests/e2e/**` and does not run the vitest plugin there. Those files import `@playwright/test`.

### `tests/e2e/boot.test.ts`

`boot` takes one argument, `{ app, runtime, mode }`. Bit 01 accepts only `{ app: "minimal", runtime: "node", mode: "dev" }`.

| test | case | result |
| --- | --- | --- |
| `serves` | `{ app: "minimal", runtime: "node", mode: "dev" }` | `origin` answers GET `/` with 200. After `close`, the origin refuses connections |
| `port` | two calls overlap | two origins, two ports |
| `unknown app` | `app: "product"` | throw, and the message names `product` |
| `deno` | `runtime: "deno"` | throw |
| `browser is not a runtime` | `runtime: "firefox"` | throw |
| `preview` | `mode: "preview"` | throw |
| `prod` | `mode: "prod"` | throw. Bit 12 lifts this |
| `workers` | `runtime: "workers"` | throw. Bit 12 lifts this for `mode: "prod"` only |
| `bun` | `runtime: "bun"` | throw. Bit 03 lifts this for `mode: "dev"` |
| `basepath` | `app: "basepath"` | throw. Bit 02 lifts this |
| `no copy` | during `serves` | the app directory is `packages/core/tests/e2e/apps/minimal`. No second copy exists |
| `temp` | during `serves` | the Vite `cacheDir` is outside that app directory and is gone after `close` |

### `tests/e2e/minimal.test.ts`

The file calls `boot` (B70). `beforeAll` reads the project name `<runtime>-<mode>-<browser>`, calls `boot({ app: "minimal", runtime, mode })`, and lets Playwright open that browser. `afterAll` calls `close`. The file does not read `TEST_MODE` and does not start Vite itself.

| test | case | result |
| --- | --- | --- |
| `hydrate` | open `/` in a browser | the page text is visible and `data-flare-hydrated` is set |

### `tests/size/size.test.ts`

| test | case | result |
| --- | --- | --- |
| `createPage alone` | a bundle that imports only `createPage` | the budget row is written in this commit, and the bundle does not contain `client/navigation`. The size is what ships: the bundle minified by the Vite the lockfile pins (its Rolldown build through Vite's `build` API in library mode with `rolldownOptions.output.minify: true`, the full Oxc minifier an app's production build applies, so the text has no whitespace, no comments, and no path), then gzipped by `fflate` at level 9 with `mtime: 0`, an exact devDependency, because each runtime's `node:zlib` deflates the same text to a different size (the 2611-byte `createPage` text is 1076 under Node 24's and 1079 under Bun 1.4.3's; `fflate` gives 1092 under both). A checkout path, an identifier name, the measuring runtime, or a tool on the machine's PATH cannot move it. No binary outside the lockfile takes part in the measurement (revised 2026-10-13, BUGS.md B35: `bun build` from PATH measured 1096 under Bun 1.4.3 and 1137 under CI's 1.3.11 for the same tree). Changing the measuring tool re-baselines the row to the new measurement rounded up to the next multiple of 10, with `breakdown.ts` output showing the same module list; that is not a raise. A raise of a budget row comes with `tests/size/breakdown.ts` output (each module's and each step's marginal gzip) in the commit message |

### `server/render/head.test.ts`

The cases are the `test` cells in `dx/head.md`. The outcome of each case is that cell's outcome column. A head field that `dx/head.md` does not name is not emitted (`head.test.ts` `unknown field`).

### `vite/plugin/options.test.ts` and `flare.test.ts`

The cases are the `test` cells in `dx/plugin.md` that name these files. An option `dx/plugin.md` lists under "Does not exist" throws in `unknown`.

## Done

The minimal app's `dev` script serves `/`. `bun run test` is green at 100% for every source file this bit created. On Linux, `bun run test:e2e` is green on `node-dev-chromium` and `node-dev-firefox`. On macOS, the same command is green on `node-dev-webkit`. Both CI jobs are green.
