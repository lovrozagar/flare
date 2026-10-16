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
| `segment chain` | a page under a segment | the loaded chain is the root, then the segment with kind `"segment"`, then the page. The boundary walk skips the segment, the client match cache treats it as a layout, and its `l` frame carries `d: null` (BUGS.md B22) |
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
| `head sequence` | a written shell with a title, Solid's markers, and a meta; then a shell with no head | the state's `head` is `title`, `!$`, `meta`, `!/`, then the capture `script` and `!xs` Flare adds; then `[]` (B120) |

### `server/render/head-sequence.test.ts` (B120)

| test | case | result |
| --- | --- | --- |
| `kinds` | a shell's head: the charset, Solid's markers around a script, a hydrated style, the title | `meta+dh`, `!$`, `script`, `!/`, `style+hk`, `title+dh`; the body is not read |
| `raw text` | a `<` in a script, `</p>` in a style, `<head>` in a title, a link in a noscript, a template | one node each |
| `attributes` | a quoted `>`, upper-case names, `data-dhf`, a bare `_hk`, `<link/ >` | the quoted `>` stays in its value; names match whole and in any case |
| `text and ends` | whitespace between tags, a stray end tag, an empty comment, a meta after `</head>` | `#` per text run, no node for the end tag, `!` for the comment, and nothing after `</head>` |
| `unclosed` | no head, a `<header>`, and an unclosed comment, script, start tag, end tag, style, and text | an empty sequence for the first two; the rest read to the end |
| `stray less-than` | `a < b`, a lone `<`, a stray `=` in a tag | text is one node through a `<` that opens nothing, and the walk never stalls (red: the first form looped forever) |

### `client/boot/head-guard.test.ts` (B120)

| test | case | result |
| --- | --- | --- |
| `kinds` | the server's head plus a newline and a link | each live node's kind, as the server encodes it |
| `nothing to move` | no sequence, then a head that is exactly the sequence | no node moves |
| `out and back` | a foreign style and comment at the start and a meta between two markers | guarded, the head is the server's shape; restored, every node is where it was |
| `mimic` | a foreign `<meta>` before the server's `<meta>` | the guarded head has the server's shape, and the restore keeps the order |
| `server node gone` | the server's script removed before boot | only that node is missing; every later node still matches |
| `anchor moved` | the hydrate moves one anchor to the end and removes another | a node goes after its moved anchor, and one whose anchor left goes to the end |
| `aligned` | a changed middle, a foreign node at either end, a swap, and empty sides | one longest common subsequence |

### `server/render/shape.test.ts`

| test | case | result |
| --- | --- | --- |
| `document` | `isDocument` over a whole document, a `<div>`, `<html>` with no `</body>`, and `</body>` with no `<html>` | true, then false three times |
| `prod document-less` | the real `createServer`, production stubbed (`DEV` false, `PROD` true), a root that renders a `<div>` over an `ssr` page with a memory store, fetched twice | each answer is 500 with an empty body, no `flare-cache`, and production COOP; one log line, `[flare:render] root layout "_bare_" rendered no <html> or </body> (B37)` (revised by BUGS.md 117: B37 was unwired, and the old case drove an unused helper) |
| `dev document-less` | the same root in dev, fetched twice | 200 each time, and the `<div>` is served as written (D22); one `console.warn`, `[flare:render] root layout "_bare_" rendered no <html> or </body>; production answers 500 (B37)`. Red before: no warning |

A root whose own loader failed never renders, so its bare failure is not checked (`server/lifecycle/create.test.ts` `unknown failure`). Production tests whose roots rendered no document now render one (`whole` or `documentOf`): create `root children`, `unknown render`, `unknown failure`; projector's root; apply `server security`; `tests/integration/ingress.test.ts`; `tests/integration/stream.test.ts`.

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
| `trust proxy` | a production server behind the listener, GET `/` with `Host: site.test` and `X-Forwarded-Proto: https`, with `{ trustProxy: 1 }` and then without; then hop counts `5`, `-1`, `1.5`, `6`, and a `bodyLimit` key | the server sees `https://site.test/` and answers `Strict-Transport-Security`, then `http://site.test/` without it; `5` is accepted, the others throw (BUGS.md 109) |
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
| `one route` | the minimal home page | `routes.gen.ts` has no static route import. Each tree node's and layout's `module` is `() => import("../routes/<file>")`, which resolves to the module's namespace (the router reads its `route`, BUGS.md 73): the import is relative from `src/_gen`, where the file is written, as `types.gen.d.ts`'s are. It exports `routeTree`, `layouts`, and `chunks`, which maps each id to `/<routesDir>/<file>` (`src/routes` by default). Bit 06 made modules lazy |
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
| `ignored` | `_parts/widget.tsx`, and a page, a layout, and a nested page under `_root_/_parts` | no route and no layout. A folder that starts with `_` and is not a root holds none (BUGS.md 131) |
| `id mismatch` | `createPage("_root_/abut")` in `_root_/about/about.page.tsx`, then `createRootLayout("_admin_")` in `_root_/root.root-layout.tsx` | build error naming the file, the string, and the id (BUGS.md 130) |
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
| `builder ids` | `createPage`, `createLayout`, `createRootLayout`, `createPathSegment` with a string literal, a module-level const, a `let`, a template, no argument, another identifier | the literal's and the const's string. The others are not read (BUGS.md 130) |
| `builder id spans` | the call's literal after a non-ASCII comment, single quotes, a const, an exported const, a template | each resolved id's literal span, quotes included, in string positions; none for the template |

### `client/boot/hydrate.test.ts` and `create-client.test.ts`

| test | case | result |
| --- | --- | --- |
| `dev tab` | dev, a document carrying the `flare-dev-tab` meta the dev handler injects | the client announces it with `flare:tab` and adds `flare-dev-tab` to its data, fill, prefetch, and server-function requests; in production neither happens (BUGS.md B42) |
| `reads the script` | HTML with the state script | the router match equals that state |
| `adopts history` | `history.state` already has an index | no new history entry |
| `head guarded` | a state `head` of one meta, and a live head with a foreign style before it and a link after | the mount sees only the meta; after the boot, and after a boot whose mount throws, the head is as it was (B120) |
| `hydrate failure logged` | a production boot of `/broken`, whose page render throws | `root[Something went wrong]`, and one `console.error("[flare] a route failed to hydrate", error)`; `dev report`'s throw after hydrate logs nothing (B120) |
| `router context` | a component under hydrate reads the router context | it is the same object `createClient` received |
| `prefetch build` | a document of build b1. An intent prefetch of /about is answered with `flare-build: b2`, then the app navigates to /about, also answered b2 | the navigation loads the document once (`assign("/about")`) and never paints the prefetched frames. One build value feeds the navigator, the prefetcher, and the server-function transport, so a mismatched prefetch is dropped (BUGS.md B30) |
| `query hydrated` | a registered query getter with a `hydrated` spy, then a boot | the spy runs once, after `data-flare-hydrated` is set and the `onHydrated` callbacks have run. With no getter registered, or one without `hydrated`, the boot completes (B102) |

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
| `logs captured` | a dev boot whose server writes to stdout and stderr | `session.logs()` returns those lines in order; a prod boot captures its child the same way. Nothing is written to disk |
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
| `exit cleans a writer` | a child that ignores SIGTERM, prints an origin, then rewrites its cache dir every millisecond; the test process's `exit` is emitted | the cache dir is gone at once and 100 ms later: the exit path kills the child with SIGKILL, removes the dirs, waits 50 ms for a write already in flight, and removes them again; a removal a racing write interrupts retries. Red on SIGTERM then one removal: the dir stays (BUGS.md 116) |
| `close after a kill` | the exit path kills an idle child, and `close()` is called after its exit event fired | `close()` resolves within 2 s: a child a signal ended has a signal code and no exit code. Red on the old `exited()`: it waited for an event already gone (BUGS.md 116) |

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


### `tests/integration/router.test.ts` and `router-client.test.ts` (plan 14 9.6, B96)

dx/router.md through the real server and the real client. The server half calls `createServer(...).fetch`; the client half is the hydrate harness's app mode, a document that server serves hydrated by the real `createClient` in chromium, firefox, and webkit, navigated by clicking anchors from the page and by Back. Each app is one source both sides compile, built from the shared pages plus its router options. Each group's bite is the source mutation that turns it red.

| test | case | result |
| --- | --- | --- |
| `layouts and route tree` | `/` and `/docs/a` under the docs layout | each page under its layouts |
| `base path` | `basePath: "/app"` | `/app` is the index, `/app/about` serves, `/about` 404 (bite: the base not the index) |
| `case sensitive` | `/About`, default and `caseSensitive: true` | 301 to `/about`; 404 (bite: always folds) |
| `trailing slash` | preserve, never, always, GET and POST, `/`, an empty segment | both forms; 301 or 308 to the stripped form; 301 to the slashed and collapsed form; `/` untouched (bite: a POST 301) |
| `not found mode` | `/docs/zzz`, root and fuzzy | the root's not-found; the docs layout's (bite: fuzzy ignored) |
| `theme and direction` | `ThemeScript` and `DirectionScript locale="ar"` with no props | the router's storage key and `rtl` in the document |
| `locale` | `/x` with a locale cookie, `/hr/x`, and three bad tag lists | no redirect and no cookie read, the param `hr`, each list throws |
| `scroll restore` | `/a` scrolled to 600, to `/b`, Back | 600, with `history.scrollRestoration` manual |
| `scroll key and cap` | a key `k:<pathname>` and a cap of two, three navigations | the stored keys `k:/b`, `k:/c` (bite: the key ignored) |
| `scroll off` | `scrollRestoration: false` | nothing stored, the browser's `auto` kept |
| `client cache` | a 1 m client cache, then a cap of one, then `cache: { client: false }`, `/` → `/a` → `/b` → `/a` | no data request, then one for `/a`, then one (bite: no eviction) |
| `rewrite` | `/old` rewritten to `/b` | the `/b` page (bite: no client rewrite) |
| `router config` | no options, then `prefetch`, `viewTransitions`, `scrollRestorationBehavior` | the defaults, then the values set |

### `tests/integration/routes.test.ts` (plan 14 9.6, B96)

dx/routes.md through real apps. Each fixture is an app of route files under `src/routes`, built by `vite build` from a config file with `flare()` in a child process, as the CLI runs it, and answered by the built server's `fetch`. A build error is that build's failure and its message. The lazy route wait runs in `vite dev`'s SSR runner. Each group's bite is the source mutation that turns it red.

| test | case | result |
| --- | --- | --- |
| `root and home` | `/`, `/_root_` | the home page in the `_root_` document; the root has no URL (bite: the root marker kept) |
| `about` | `/about` | `_root_/about` |
| `group no segment` | `/post`, `/(blog)/post`, `/blog` | the post page inside the group's layout; 404, 404 (bite: a group is a segment) |
| `param` | `/users/42`, `/users` | `{ id: "42" }`; 404 (bite: the param value dropped) |
| `catch-all` | `/files/a/b`, `/files` | `{ path: ["a", "b"] }`; 404 (bite: a required catch-all may be empty) |
| `optional` | `/optional-locale`, `/optional-locale/hr` | `{}`; `{ locale: "hr" }` |
| `optional catch-all` | `/files`, `/files/a/b` in a second app | `{}`; `{ rest: ["a", "b"] }` (bite: an optional segment never empty) |
| `admin root` | `/dashboard`, `/admin/dashboard` | the page in the `_admin_` document; 404 |
| `locale root` | `/hr/about` | `{ locale: "hr" }` in the `[locale]/_root_` document (bite: a param before the root dropped, a duplicate-url build) |
| `literal brackets` | `/[id]`, `/42` | the `[_]id]` page; 404 (bite: the brackets dropped) |
| `ignored` | `/_parts/widget`, `/_parts` with a page file in `_parts` | 404, 404 (BUGS.md 131) |
| `more than one root` | `/`, `/dashboard`, `/hr/about` | three documents, one per root (bite: every layout in every chain) |
| `duplicate url`, `shadow`, `two pages`, `id mismatch`, `no root`, `bad brackets`, `repeated param` | one app each | the build fails with codegen's message naming the files (BUGS.md 130 for `id mismatch`); each bite is the check removed |
| `lazy route module` | a route module that imports the router and holds its evaluation open, two requests | both 200: the second import gets the namespace before `route` is set, and dev waits for it (bite: no dev wait) |

### `tests/integration/plugin.test.ts`, `plugin-dev.test.ts`, and `plugin-workers.test.ts` (plan 14 9.6, B96)

dx/plugin.md through real apps. plugin.test builds an app with every `flare()` option set and one with the defaults by `vite build` from a config file (tests/integration/vite-app.ts), reads their client output, and asks their built servers; a rejected option is `flare()` or the real Vite config resolution throwing. plugin-dev runs `vite dev` on a port with a WebSocket client on Vite's hot channel announcing the document's tab token, as the client does, then the same app built. plugin-workers composes Cloudflare's plugin with a custom `assetsBase` and runs the build's deploy output in Miniflare; the Bun run skips it (no `registerHooks`). Each group's bite is the source mutation that turns it red (20).

| test | case | result |
| --- | --- | --- |
| `assets base` | `assetsBase: "/static"`, an imported asset, and the defaults | the client entry and every file under `/static`, the document's import there, the server-rendered asset URL a file the client build wrote (BUGS.md 132); `/assets` by default |
| `entries` | `entry: { client: "app/main.tsx", server: "app/server.ts" }` | the built server is app/server.ts, the client bundle holds app/main.tsx |
| `image` | widths 320 and 640, quality 40, an excluded file; `image: {}` | only those webp widths, smaller than quality 75's, the excluded file copied and served; the defaults up to the source's width |
| `css reset` | `reset: true`; the defaults | the preflight in the stylesheet and the critical block; neither |
| `broadcast off` | `broadcast: false` with a ThemeProvider; the defaults | no BroadcastChannel in the client bundle; one |
| `fonts` | `fonts: { dir }` with the Inter registry family imported; absent | every Inter file byte for byte at its registry url; none |
| `prerender` | concurrency 2, an env, an excluded ssg page; `prerender: true` | three seeds carrying the env value, two renders at once; four seeds, one at a time |
| `build failures` | an ssg route with prerender off, a font file `dir` lacks, a sitemap with no `site` | each build fails naming the cause, no sitemap written |
| `options checked` | a bad assetsBase, css key, broadcast, fonts dir, width, quality, every removed v0 key, an absolute or missing entry, a public host | each throws; `localhost`, `127.0.0.1`, `::1` resolve |
| `dev error overlay` | a loader throws in dev, from the announced tab, without a token, from another tab; `notFound()` | 500 with the message and the stack in the body, one overlay payload to the announced tab only; 404 and no payload |
| `production error` | the same throw built; `markSafeError` | a generic message and a digest, no message or stack; the safe message, no stack |
| `workers build` | Cloudflare's plugin, `assetsBase: "/static"`, `prerender: true`, an imported asset on a live and an ssg page | the worker, its deploy config and the `.wrangler/deploy` pointer; `_headers` `/static/*` immutable (B130); the page and the hashed entry from Miniflare; the asset URL in the worker's page and in prerender's seed the same `/static/` file, served immutable (BUGS.md 132) |
| `workers composition checked` | a Wrangler `main` other than the worker entry | the build fails naming `@lovrozagar/flare/worker` |

## Done

The minimal app's `dev` script serves `/`. `bun run test` is green at 100% for every source file this bit created. On Linux, `bun run test:e2e` is green on `node-dev-chromium` and `node-dev-firefox`. On macOS, the same command is green on `node-dev-webkit`. Both CI jobs are green.
