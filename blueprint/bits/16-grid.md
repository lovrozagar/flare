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
| `container` | Docker present and no endpoint | the pinned image's run-server on `127.0.0.1:3333`, started or reused: `docker run -d --rm --init --ipc=host --network host --name flare-browsers --ulimit core=0`, the lockfile's `playwright-core` mounted read-only, the image by tag and digest. `--ipc=host` gives Chromium the host's shared memory instead of Docker's 64 MB `/dev/shm` (leaf 4.6). `--ulimit core=0` keeps the WPE web process's teardown crashes from dumping cores for the host to collect (BUGS.md 103.6). A `flare-browsers` whose `docker inspect` shows that image, `host` IPC, and core 0/0 is reused |
| `container stale` | a `flare-browsers` running the pinned image without host IPC, another image, or the pinned image with core dumps (no ulimits, `[]` or `null`) | it is removed (`docker rm -f`) and the pinned one started: only this script creates that name |
| `container fails` | `docker run` refused, then a name already in use whose run-server never answers | `the browser container did not start` with Docker's message; `the browser run-server did not answer on ws://127.0.0.1:3333/` |
| `local engines` | no Docker, every engine installed | Playwright's local engines |
| `docker unreachable` | the Docker binary present, its daemon refusing the shell (`docker version` fails), every engine installed | Playwright's local engines: Docker counts only when `docker version --format {{.Server.Version}}` exits 0 |
| `none` | no endpoint, no Docker, an engine missing | one error that names all three options |

The hydrate harness (`bits/15-docs.md`) and the e2e global setup both take their browsers from this script.

## `tests/structure/browser-floor.test.ts` (decision B123, BUGS.md 123.4)

The scanner (`browser-floor.ts`) reads `src/client`, `src/shared`, and each feature's `client` and `shared` with oxc, and looks each browser API up in `@mdn/browser-compat-data` (exact devDependency) at Chrome and Edge 111, Firefox 114, and Safari 16.4. A use is a finding when it throws in a floor browser that lacks the API: a global read by name, a member of a global or of a well-known instance (`navigator`, `document`) that is called or read through, any other member called or read through whose every standard owner among the interfaces all floor browsers have is above the floor (matched by name, since oxc has no types), `[Symbol.asyncIterator]` read, `for await` over anything but an async generator's call, and a listener for an event no floor browser fires. `typeof` and `in` are checks, and `?.` reads nothing through.

| test | case | result |
| --- | --- | --- |
| `floor` | every client-reachable source | no finding outside the allowlist, each allowlist entry still matches a finding, and its proving line is still in its file. Red at 8ae9ec28: `for await over body` at frames.ts:88 and server-fn/stream.ts:50, `Promise.withResolvers` at store.ts:70 and frames.ts:146, `URL.canParse` at prefetch.ts:127, and `.toSorted` at rank.ts:19 and create-router.ts:234 |
| `planted URL.parse` | `browser-floor.fixture.ts`, outside src | exactly one finding, `URL.parse` on its line |
| `each rule` | one line per rule | `for await` over a stream, `[Symbol.asyncIterator]`, `.union`, a `scrollend` listener, `navigator.connection.saveData`, `requestIdleCallback()`, `.toArray()`, `Promise.withResolvers()`, `document.startViewTransition()`, `.toSorted()`, and `globalThis.navigation.navigate()` are found; an async generator's `for await`, `navigator.connection?.saveData`, `typeof requestIdleCallback`, `Map#values()`, a declared `fetch`, and a plain object's `.navigation` are not |

## `tests/e2e/floor.ts`, the `node-prod-floor` project (decision B123)

The production docs app in Chromium, with every API newer than the floor that the client could touch deleted before the page runs: stream async iteration and `ReadableStream.from`, `URL.parse` and `URL.canParse`, iterator helpers and `Iterator`, idle callbacks, view transitions and their types, `scrollend`, the Navigation API, `Promise.withResolvers` and `Promise.try`, `AbortSignal.any`, Set methods, `Object.groupBy` and `Map.groupBy`, `Array.fromAsync`, change-array-by-copy, well-formed strings, `checkVisibility`, popovers, and `Intl.Segmenter`. It runs docs-smoke, docs-navigation, and docs-data. Red before the fixes: 70 failed, 4 passed, every page stuck before hydrate on `e.flatMap(...).toSorted is not a function` (route ranking at boot). Each fix reverted alone is red again: the store's `Promise.withResolvers` fails `i18n page` and `hash link`, frames.ts's fails `defer two skeletons` and `defer rejects`, and prefetch's `URL.canParse` fails `prefetch data intent` and `prefetch viewport`. After: 73 passed, 5 skipped (the 4 dev-only cases, and `view transition document`, which measures the API the floor deletes; `back keeps scroll` checks only the restored position there).

## `shared/promise/resolvers.test.ts` (decision B123)

| test | case | result |
| --- | --- | --- |
| `settles` | `Promise.withResolvers` deleted, then one promise resolved and one rejected | `1`, and the rejection's error |

## `scripts/verify.test.ts` (AGENTS.md, Every gate passes before moving on)

| test | case | result |
| --- | --- | --- |
| `gate order` | `GATES` | fmt:check, lint, typecheck, test, test:bun, check-tree, test:e2e |
| `all pass` | every gate exits 0 on a clean tree | exit 0, and one stamp at `<common git dir>/flare-verified/<sha>` naming the gates |
| `failing gate` | typecheck exits 2 | exit 2, test and the rest never run, and no stamp |
| `dirty tree` | `git status --porcelain` is not empty | exit 1, no gate runs, and no stamp |

## `scripts/verify-safari.test.ts`, and `bun run verify:safari` in real Safari

`verify:safari` tunnels to the Mac's safaridriver over ssh (`FLARE_SAFARI_SSH`, default `mac`; `FLARE_SAFARI_DRIVER_PORT`, default 4799; the person at the Mac runs `safaridriver -p 4799` in a Terminal, since macOS refuses one started over ssh), boots the production docs app, exposes it on every interface at `FLARE_SAFARI_HOST` (default the first `tailscale ip -4` address), and runs five flows: a sidebar link from the bottom of a page, Back restoring 900, Back restoring the position at the click, the playground stream, and the stream gate (each line arrives while the server holds the next). Each navigation also checks a window mark, so the document-load fallback is not a pass. Red at 8ae9ec28 in Safari 17.6: 0 of 5, exit 1. Green at 26882ee6: 5 of 5, exit 0.

| test | case | result |
| --- | --- | --- |
| `config defaults` | no env, then every variable set | `mac`, 4799, the first Tailscale address; then the set values |
| `no address fails` | no `FLARE_SAFARI_HOST` and no Tailscale address | throws, naming `FLARE_SAFARI_HOST` |
| `unreachable fails` | an ssh destination that does not resolve | rejects with ``Run `safaridriver -p 4799` in a Terminal on the Mac``: it never skips |
| `failed flow fails` | three flows: one passes, one answers a problem, one throws | exit 1, a PASS line, two FAIL lines with their problems, and the `1 of 3` summary; one passing flow alone exits 0 |
| `back reload fails` | the /hr flow with a session whose window mark is gone after Back, the path and the click position restored | `Back loaded a document`: the browser restores the scroll on a document load itself. Red before the mark check: the flow passed |
| `forward reload fails` | the /hr flow with a session whose mark is gone after the forward click and back after Back, as Safari's back-forward cache restores it | `the media link loaded as a document`. Red before the forward check: the flow passed. In Safari 17.6 with `chunksOf` reverted to stream iteration, the flow passed on the bfcache, found by flare-77 |
| `lock held fails` | the Mac's lock held by `other-host:4242`, then verify:safari with an ssh destination that does not resolve | rejects within a second with `Safari is in use by other-host:4242, since <time>`, before any tunnel. Red before the lock: it reached the tunnel and failed on ssh. For real: a second run 5 s into a first failed in 602 ms naming `pc:<pid>`, the first passed 5 of 5, and the lock was gone after |
| `limit closes` | a drive that never settles under a 50 ms limit | rejects `verify:safari ran past its limit of 50 ms`, the drive's tunnel, docs server, and proxy are closed through its abort signal, and the lock is freed; the main entry exits with the code once the run settles. Red before: the run hung past the test's 5 s |
| safari-lock `held lock fails` | a second owner while the first holds the lock | throws naming the first owner and its start; the first's `owner` file is unchanged |
| safari-lock `release frees` | a release by another owner, then by the holder | the other's leaves the lock; the holder's frees it for the next run |
| safari-lock `stale taken` | a lock older than its stale age | the next run takes it over |
| safari-lock `no answer fails` | the lock command exits 255, as a failed ssh does | throws; the run never skips the lock |
| safari-lock `quote` | `a b'c` | one word on the remote shell |
| safari-driver `command value` | a value answer, then an error answer | the value; then a throw with the error and its message |
| safari-driver `session commands` | open, go, click, a wait that holds on its third poll, close | the WebDriver commands in order: session, a 1280×800 window, url, element, its click, three scripts, delete |
| safari-driver `wait times out` | a script that never holds | false at the timeout |
| safari-driver `session refused` | a driver refusing every session | ten tries, then a throw naming its error |

## `scripts/pre-push.test.ts`, the pre-push hook

`.githooks/pre-push` refuses a push while any commit it would send has no stamp in `<common git dir>/flare-verified/`; a branch deletion sends none. The tests run a copy of the hook in a throwaway repo with a bare remote. Red with the hook's refusal turned into `exit 0`: 3 of 3. The hook is tracked executable, so the repo's `core.hooksPath` runs it on every push.

| test | case | result |
| --- | --- | --- |
| `unstamped refused` | one unstamped commit, then its stamp | refused naming it; then pushed |
| `each commit` | a stamped commit pushed, then two more with only the tip stamped | refused naming the middle one, not the tip; pushed once it has a stamp |
| `verified in a worktree` | `verify` passes in a linked worktree outside the checkout, then an unverified commit | the push from the main checkout goes through; the unverified commit is refused |
| `hook executable` | the index's mode of `.githooks/commit-msg` and `.githooks/pre-push` | `100755` for both; git skips a hook that is not executable. Red at the inert `100644` |

## `tests/structure/grid.test.ts`

| test | case | result |
| --- | --- | --- |
| `grid projects` | `playwright.config.ts` with no `--project` | all 18 projects on any machine, Linux or macOS (B70: the browsers come from the pinned image, so the OS does not choose them), then `node-prod-floor`: Chromium with `floor: true`, on docs-smoke, docs-navigation, and docs-data only (decision B123, `tests/e2e/floor.ts`). CI's `e2e-mac` job names the 6 webkit projects with `--project`, as the Safari-engine check |
| `navigation log` | a fake context's page: a main-frame navigation, a child frame's, a script request, a failed request with and without failure text, responses of 399 and 404, then a page opened later with a document request, on a fixed clock | `12 framenavigated http://host/`, `20 requestfailed http://host/a.js net::ERR_ABORTED`, `20 requestfailed http://host/a.js `, `20 response 404 http://host/gone`, and `50 document http://host/b` only; a failed case writes it to its output directory (BUGS.md 34.6, 121) |
| `boot close guarded` | every e2e spec's afterAll hooks | none calls `.close()` on a boot without `?.`, so a failed beforeAll reports only its own error (BUGS.md 119.17). Red listing five |
| `http client only` | every e2e spec's case and hook arguments | none takes Playwright's `request`; specs call `http` (`tests/e2e/http.ts`, crash.ts's per-case client, a connection per call), so no keep-alive socket crosses cases (BUGS.md 125). Red listing seven docs specs |
| `crash fails` | `crashWatch` (`tests/e2e/crash.ts`) over a context with a page, then a page it opens | a `crash` event on either fails the check, naming every crashed URL. Every e2e spec's `test`, the docs fixture's included, runs the watch around each case on its context, so a crash fails the case that owned the page even when the case never touched it again (plan 14 leaf 4.6); a Chromium page sent to `chrome://crash` failed its case with `A page crashed` |
