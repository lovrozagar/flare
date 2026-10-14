# Bit 16 — The 18-project grid and Workers dev

Creates every `P16` row. The e2e grid is `{node,bun,workers}-{dev,prod}-{chromium,firefox,webkit}` (B70): Bun dev runs `vite dev` under the Bun runtime, Workers dev runs it in workerd through the app's own `@cloudflare/vite-plugin` beside `flare()` (B109), and every engine comes from the pinned Playwright image locally (B97). Every dev runtime renders the dev document itself (B95 (b)), so the Node and Bun dev handler no longer buffers HTML.

## `vite/plugin/cloudflare.test.ts` (B109)

| test | case | result |
| --- | --- | --- |
| `cloudflare composed` | the plugins option with Cloudflare's plugins nested as `cloudflare()` returns them, before or after flare's, then without them | found by name in either order; not found without them |
| `cloudflare checked` | the resolved ssr conditions and the Wrangler `main` | passes with `workerd` and `@lovrozagar/flare/worker`; otherwise throws `The Cloudflare plugin must run in the ssr environment: cloudflare({ viteEnvironment: { name: "ssr" } })`, or `The Wrangler config's main must be "@lovrozagar/flare/worker"` naming what it is |
| `plugin present` | flare's hooks with the plugin in the config's plugins | the server hook, which runs first, returns no post hook and installs no Node listener, so workerd answers through the plugin's middleware (BUGS.md 76); its one middleware is `targetGuard` (BUGS.md 118); the resolved config is checked, a config with no ssr environment throws as one off ssr, and a plugin the config hook did not see throws |
| `worker entry` | the Wrangler main's specifier, before and after the config hook saw the plugin, with an assets binding in the Wrangler config | not resolved without the plugin; with it, the entry is the app's `server` behind `createWorkersHandler(server, { assets: "ASSETS" })` |
| `workers output` | a real run with `cloudflare({ viteEnvironment: { name: "ssr" } })` and `flare({ prerender: true })` | client, ssr, and `flare_prerender` write in that order; the deploy config is `<outDir>/server/wrangler.json` and its `main` is the Workers bundle beside it; no `worker` output; `prerender/` is deleted once the seeds are written. Skipped without `registerHooks` (the Bun run) |

## `vite/plugin/worker-main.test.ts` (B109)

| test | case | result |
| --- | --- | --- |
| `outside vite` | the Wrangler main's own module, imported with no Vite | throws `@lovrozagar/flare/worker is the Wrangler main for the Cloudflare plugin: it runs only inside Vite with flare()` |

## `vite/dev/css-update.test.ts` (BUGS.md 99)

| test | case | result |
| --- | --- | --- |
| `css only` | the hook, `order: "pre"`, in a server environment for a plain `.css` and a `.scss` edit, a `.module.css` edit, a stylesheet also imported with `?inline`, and a `.tsx` edit; then the client environment | `[]` for the two plain stylesheets, so Vite sends no update; Vite's own update for every other case and for the client |
| `server kept` | a real dev server with Solid's plugin before the hook, as `flare()` lists them, whose ssr module imports a stylesheet and a shared module, then an edit to the stylesheet | no `full-reload` reaches the ssr environment, and the shared module is the same instance on the next import. Red without the hook, and red with it running after Solid's: Solid's own hook sends the reload |

## `vite/dev/dev-head.test.ts`

| test | case | result |
| --- | --- | --- |
| `empty document` | a dev server with a plugin whose `transformIndexHtml` adds a tag | `devHead` is exactly what `transformIndexHtml` adds to an empty document: Vite's client and that tag, in Vite's order |
| `no app scripts` | the app's inline scripts | never pass through `transformIndexHtml`, so none is rewritten into an `html-proxy` module and none needs peeling |
| `restart recomputes` | a second dev server after a config change adds a plugin | its `devHead` holds the new tag. A URL-dependent `transformIndexHtml` is not supported, and `dx/plugin.md` says so (B95 (b)) |

## `server/render/dev-document.test.ts`

| test | case | result |
| --- | --- | --- |
| `dev tags` | a dev document with a nonce policy and a request without a tab token | `devHead` is the last thing in `<head>`, then the `csp-nonce` meta carrying the request's own nonce, then the `flare-dev-tab` meta with a minted token |
| `chunks` | `</head>` split across chunks, and a multibyte character split across the chunk that holds it | the tags go in before `</head>` and the character arrives whole: every chunk goes through one decoder (BUGS.md B8) |
| `request token` | a dev request that names a tab token | the meta carries that token, so the tab keeps its routing (B42) |
| `no nonce` | a dev document with no nonce policy | no `csp-nonce` meta |
| `production` | a production render | none of the three is written |
| `dev styles` | a dev document for a route whose chain imports `app.css` (root) and a CSS module (page), with nonce `n` | `head` holds one `<style data-vite-dev-id>` per module, root first, each with the module's served CSS and nonce `n`, in `<Stylesheet />`'s place. A route that imports no CSS module gets only the root's. On a browser load the first paint is styled, and after the client runs there is still one style per module id (B104, BUGS.md B59) |

## `vite/dev/dev-styles.test.ts` (B104)

| test | case | result |
| --- | --- | --- |
| `chain styles` | a `flare:styles` request for the docs chain over a fake module graph, then the ssr environment's for an unknown route | the client entry's own CSS imports first (flare's reset), then the chain's CSS modules in import order, root first and once each, each read with `?direct` (`&direct` after a query); the entry's other imports are not walked |
| `cache` | the same chain twice, then a watched file change, then again | one walk and one read per module until the change; then they run again |
| `bad request` | a malformed request, then a read that rejects, then one that answers nothing | no answer; no styles and no cache entry; empty CSS |
| `edit mid compile` | a real Vite dev server whose `styles.css` transform is held open; `directStyle` asks for it, the file is edited and the change emitted, then the transform is released | the served CSS arrives and the client environment sends no `full-reload`. Red: a module `transformRequest` enters is not self-accepting until its transform ends, so the edit met a dead end (BUGS.md 111) |

## `server/render/dev-styles.test.ts` (B104)

| test | case | result |
| --- | --- | --- |
| `round trip` | two requests, then replies out of order, a reply for no request, and a non-reply | each request gets its own reply's styles, numbered from 0; a malformed style is dropped |
| `bounded wait` | no reply within 2 s | the document gets no styles and the dev server logs one warning; a late reply changes nothing |
| `reload` | a request, then a second client on a new hot context with the same `data`, as Vite's full reload makes, and the replies heard only by the new listener | the first request gets its styles, not the bound; the two clients number their requests 0 and 1, never both 0 (BUGS.md 86) |

## `shared/protocol/dev-styles.test.ts`

| test | case | result |
| --- | --- | --- |
| `shapes` | well-formed and malformed requests and replies | only the well-formed parts are read |

## `shared/protocol/dev-tab.test.ts`

| test | case | result |
| --- | --- | --- |
| `token` | a minted token, a token-shaped header, a header with markup | a fresh UUID each time; a header outside the token shape is not a token and is never written into a page; the meta is `<meta name="flare-dev-tab" content>` (B42) |

## `vite/dev/handler.test.ts` (B95 (b), (c))

| test | case | result |
| --- | --- | --- |
| `document passes through` | an HTML response from the app, streamed in chunks | the client gets the app's bytes unchanged: no buffering through `</head>`, no `transformIndexHtml` call, no peeled scripts |

The dev error page for a server module that failed to load and the tab hub keep their rows in `bits/12-vite.md`.

## `vite/plugin/preload.test.ts` (BUGS.md 79)

| test | case | result |
| --- | --- | --- |
| `entry closure not preloaded` | a client build whose entry imports two modules statically and lazily imports two routes that import them and a module only the routes share | no lazy import's preload list names a chunk of the entry's static closure, and the lists still name the routes' own chunks |
| `entry closure` | a bundle where the entry and a lazy route's chunk are both marked as entries, with an import cycle and a CSS asset | the closure starts at the chunk whose facade is the client entry, holds each chunk once, and skips the asset |

## `tests/e2e/boot.test.ts`

| test | case | result |
| --- | --- | --- |
| `bun dev` | `minimal` booted as `vite dev` under the Bun runtime | GET `/` answers 200, the document's `flare-build` is `dev`, and its `x-runtime` is `Bun/…` |
| `workers dev` | `minimal` booted with its Workers config's `cloudflare()` | GET `/` answers 200 from workerd: its `x-runtime` is `Cloudflare-Workers`, and after the server closes the app's `.wrangler/` holds nothing but the plugin's deploy pointer `.wrangler/deploy/config.json`, if a build left it: dev writes no worker state and no cached `cf` (BUGS.md 85, B70's exception, B109). Skipped without `registerHooks` (the Bun run), and the skip names B109 |
| `workers dev twice` | two `minimal` Workers dev boots started together | both answer GET `/` with 200: each worker's inspector takes a port the OS assigns, and its state stays in memory. Before BUGS.md 85 one of them failed `listen EADDRINUSE 127.0.0.1:9229` (2 of 3 runs) or, in a fresh worktree, workerd's SQLite `database is locked`. The e2e apps' `cloudflare()` passes `inspectorPort: 0` and `persistState: false` (B109). Skipped like `workers dev` without `registerHooks` |
| `workers dev log` | `docs` in Workers dev, then the changelog's fill, which runs its failing `broken` hole | the `[flare:render]` line reaches the boot's captured log within 10 s: workerd's console goes through Miniflare's structured logs to Vite's logger, after the response (BUGS.md 93) |
| `workers prod` | `minimal` built with the Cloudflare plugin, then booted | Miniflare runs what `wrangler deploy` would ship: `<outDir>/server/wrangler.json` read by wrangler's `unstable_getMiniflareWorkerOptions`, every module of the unbundled output, and only `FLARE_E2E` and the log capture added; GET `/` answers 200 with `x-runtime: Cloudflare-Workers` (B109). Afterwards the app's `.wrangler/` holds exactly `deploy/config.json`, the plugin's deploy pointer, which B70 excepts. Skipped on the Bun run, as every Workers case |

## `tests/e2e/copy-boot.test.ts` (BUGS.md 111)

| test | case | result |
| --- | --- | --- |
| `private copy` | `bootCopy({ app: "docs", runtime: "node" })`, GET `/hr`, then a rule appended to the copy's `src/styles.css`, then close | the copy is under the OS temp dir and answers 200 with `Bok`; the shared app's `styles.css` is unchanged; after close the copy is gone and the repo's dependencies, which the copy linked, remain |

## `tests/structure/coverage.test.ts` (B96)

The gate that every documented feature has its cases. `coverage.ts` holds the reader; this file holds the cases. The whole-repo case, `coverage`, over every dx file and `blueprint/coverage.tsv`, lands at plan 14 9.7, when it passes.

| test | case | result |
| --- | --- | --- |
| `keys` | a dx file with a prop table, a `##` section with a second table, and a `Planned` table and section | `router.md#createRouter#prop:basePath`, `prop:rewrite`, `router.md#rewrite#`, and `router.md#rewrite#failure:anything else`; nothing under `Planned` |
| `parse` | a comment, a row with two cases and an e2e `n/a`, a row with an e2e case, a one-column line, and an integration `n/a` | the two rows and the third with no integration case; errors for the one-column line and the integration `n/a` |
| `strict cells` | an empty e2e column, `n/a: `, `n/a:`, a bare `n/a`, `n/a` beside an e2e case, `n/a` after an integration case, an integration `n/a: x`, and a part with no `::` | an error for each, naming its line and the part; nothing is dropped quietly (flare-77's probes, B96) |
| `case lookup` | `it`, `test.skip`, and `it.runIf(x)` titles, a commented call, and a title in a plain string | the three calls and the commented one are cases; a prefix is not, and a plain string is not |
| `check` | a complete map, then one with a duplicate dx key, a missing case and file, a key mapped twice, a stale key, a row with no integration case, and an unmapped key | no error, then exactly those seven |
| `repo keys` | a root with the dx index, `observability.md`, and a dx file; then the real repo | only the dx file's keys; the real dx files have more than 700 keys and none twice |

## `scripts/browser-server.test.ts` (B97)

| test | case | result |
| --- | --- | --- |
| `endpoint env` | `FLARE_BROWSER_WS` set | that endpoint, and no container is started |
| `container` | Docker present and no endpoint | the pinned image's run-server on `127.0.0.1:3333`, started or reused: `docker run -d --rm --init --ipc=host --network host --name flare-browsers`, the lockfile's `playwright-core` mounted read-only, the image by tag and digest. `--ipc=host` gives Chromium the host's shared memory instead of Docker's 64 MB `/dev/shm` (leaf 4.6). A `flare-browsers` whose `docker inspect` shows that image and `host` IPC is reused |
| `container stale` | a `flare-browsers` running the pinned image without host IPC, or another image | it is removed (`docker rm -f`) and the pinned one started: only this script creates that name |
| `container fails` | `docker run` refused, then a name already in use whose run-server never answers | `the browser container did not start` with Docker's message; `the browser run-server did not answer on ws://127.0.0.1:3333/` |
| `local engines` | no Docker, every engine installed | Playwright's local engines |
| `docker unreachable` | the Docker binary present, its daemon refusing the shell (`docker version` fails), every engine installed | Playwright's local engines: Docker counts only when `docker version --format {{.Server.Version}}` exits 0 |
| `none` | no endpoint, no Docker, an engine missing | one error that names all three options |

The hydrate harness (`bits/15-docs.md`) and the e2e global setup both take their browsers from this script.

## `tests/structure/grid.test.ts`

| test | case | result |
| --- | --- | --- |
| `grid projects` | `playwright.config.ts` with no `--project` | all 18 projects on any machine, Linux or macOS (B70: the browsers come from the pinned image, so the OS does not choose them). CI's `e2e-mac` job names the 6 webkit projects with `--project`, as the Safari-engine check |
| `navigation log` | a fake context's page: a main-frame navigation, a child frame's, a script request, then a page opened later with a document request, on a fixed clock | `12 framenavigated http://host/` and `50 document http://host/b` only; a failed case writes it to its output directory (BUGS.md 34.6) |
| `crash fails` | `crashWatch` (`tests/e2e/crash.ts`) over a context with a page, then a page it opens | a `crash` event on either fails the check, naming every crashed URL. Every e2e spec's `test`, the docs fixture's included, runs the watch around each case on its context, so a crash fails the case that owned the page even when the case never touched it again (plan 14 leaf 4.6); a Chromium page sent to `chrome://crash` failed its case with `A page crashed` |
