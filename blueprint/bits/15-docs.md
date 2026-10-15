# Bit 15 — The docs app

Creates every `P15` row (B94). `packages/core/tests/e2e/apps/docs` is a short Flare documentation site. Each page is one screen about one feature area and runs that feature, so a person checks it by eye (`bun run docs:dev`) and the specs below check the same pages. The app uses only what the source exports. It replaces the `i18n` app: bit 13's seven `i18n.test.ts` cases are in `docs-features.test.ts` under the same names.

Defects the app finds in `packages/core/src` go to the root `BUGS.md`, one phase per bug, in plan format. The app is not changed to hide a defect. A spec case that a listed bug breaks stays red until that bug is fixed.

## Route map

| file under `src/routes` | URL | what it runs |
| --- | --- | --- |
| `[[locale]]/_root_/locale.root-layout.tsx` | document | locale, theme, and direction scripts and providers, `FontCSS` (registry Inter and a `createFont` mono), `ViewTransitionCSS`, `Stylesheet`, a `nonce()` script, the full `.head()`, root preloader and loader, `errorRender`, `notFoundRender`, `InterceptOutlet`, the progress bar, the lifecycle panel |
| `[[locale]]/_root_/home.page.tsx` | `/`, `/hr`, `/ar` | SSG per locale, `cdn`, `useLoaderT`, `Image` fill priority blur, viewport and off prefetch |
| `(guide)/guide.layout.tsx` | group, no segment | sidebar `Link` active and inactive props, data-intent prefetch, `useMatch`, `ViewTransitionBoundary` |
| `(guide)/docs/docs.layout.tsx` | layout for `/docs/*` | preloader override, the deduped upstream read, `notFoundRender` for fuzzy not-found |
| `(guide)/docs/[slug]/doc.page.tsx` | `/docs/<slug>` | SSG over slugs and locales, `.input({ params })`, preloader, `.head()` merge, hash links, a disabled link, `viewTransition={false}`, fixed `Image`, CSS module and client-only copy, the feedback query and mutation, every data hook |
| `(guide)/api/api.segment.ts`, `api/[...path]/api.page.tsx` | `/api/<a>/<b>` | segment `cdn` default, shared `ssr` with `tags` |
| `(guide)/examples/[[...rest]]/examples.page.tsx` | `/examples[/…]` | optional catch-all, search input, `effects`, `cache.client`, shallow, revalidate, `navigate({ replace, state })`, the client `rewrite` alias |
| `search/search.page.tsx` | `/search?q=` | `.intercept()`, a loader prefetch through `ctx.queryClient`, `useSuspenseQuery`, a GET server function with `cache`, plural |
| `changelog/changelog.page.tsx` | `/changelog` | ISR with `defer: "stream"`, four defers (one `prerender: "resolve"`, one rejecting under `<Errored>`), `cacheDeferred` |
| `playground/playground.page.tsx` | `/playground` | a live defer, POST with a validator, safe and unsafe errors, a stream with stop, `useBlocker` |
| `login/login.page.tsx` | `/login` | `authenticateOptional`, login and logout server functions returning a `Response` |
| `error/error.page.tsx` | `/error` | a loader throw, page `errorRender` with `reset()` |
| `[_]flare]/raw.page.tsx` | `/[flare]` | the literal segment |
| `legacy/legacy.page.tsx` | `/legacy` | a `.response()` permanent redirect |
| `llms.txt/llms.page.tsx` | `/llms.txt` | a `.response()` text route |
| `_admin_/admin.root-layout.tsx`, `admin/admin.page.tsx` | `/admin` | a second root, `.headers()`, `.security()`, `authenticate("admin")`, `authorize`, `unauthenticatedRender`, `unauthorizedRender`, a tag purge |

The server has `serverContext`, `authenticate`, `i18n()`, middleware (`next`, `respond`, `bypass`, `exact`, `prefix`, `kind`, `indexNow.file`), a mount at `/healthz`, `security`, `sameSite`, `bodyLimit`, a store per runtime (filesystem on Node and Bun, Cache API on Workers), and the SSG seeds. `vite.config.ts` sets `image`, `css.reset`, `fonts.dir`, `broadcast`, and `prerender` with `concurrency`, `env`, and `sitemap`.

## `tests/e2e/docs-smoke.test.ts` (every project)

| test | case | result |
| --- | --- | --- |
| `dev log clean` | every page in the route map, each in a fresh tab, on the `*-dev-*` projects | the dev server's captured log has no `Unable to parse` and no uncaught error, and its `[flare:` error lines are exactly the ones the page entries declare they log on purpose (`/changelog` declares "The stats service is down"): an extra line or a missing declared one fails (BUGS.md B8). A page that logs on purpose names the element proving it rendered that value (`#broken-error` for `/changelog`), and the case waits for it before closing the tab: network idle can come before the post-hydrate fill starts (BUGS.md 93) |
| `public files` | GET `/favicon.ico`, `/icon.svg`, `/apple-touch-icon.png`, `/manifest.webmanifest`, and `/fonts/mono.woff2` | each answers 200 with a non-empty body and its content type, on every project (BUGS.md B11) |
| `fill holds nothing` | a load of `/changelog`, kept open 1.5 s after hydrate while the fill settles its holes | the console holds nothing, no Solid `SILENT_HOLD` among it (BUGS.md 89) |
| `never hydrated` | every script request aborted, then `loadHydrated` on `/docs/routing` with a 3 s deadline | it throws `The page never hydrated` and the server's page is on screen. Red with the old single `waitForSelector`: 2 of 2 hang to the 30 s case timeout (BUGS.md 107) |
| `preloads settle` | a `*-prod-*` load of `/changelog` served with one more `<link rel=preload>` nothing uses (a sentinel), until the engine's unused-preload warning about the sentinel and then a line the page logs after it | the console holds only the sentinel's warning: no JS preload warning (BUGS.md 79) and, since the stylesheet link consumes the preload, no stylesheet preload notice either (BUGS.md 81, 87). Chromium and WebKit warn about 3 s after the load event; Playwright's Firefox has no such check, so the case skips there. Red: a second unused preload fails 2 of 2 (node-prod chromium and webkit); before the console flush it passed. Red on local WebKit before 87. It waits on the sentinel's warning, not 5 s (BUGS.md 107) |
| `rapid links` | from `/docs/routing`, the main-nav Changelog link, then, once Changelog has landed with its 900 ms stats value still loading (a stream, or a fill once the page is stored), API, Examples, Playground, and Docs clicked 30 ms apart from the page | the stats value was still loading at the second click, the page ends on Routing, and no `pageerror` fires: each superseded navigation resolves, including one aborted mid-stream (B105, BUGS.md B58) |
| `dev first paint` | a `*-dev-*` hard load of `/docs/routing` with every script blocked, Vite's client and the app's entry included | at DOMContentLoaded the body's margin is 0 (flare's reset), `h1` is weight 600, and `#nav` is sticky: the server's dev styles alone styled the first paint. Red at HEAD before B104 (margin 8px) (BUGS.md B59) |
| `dev styles adopted` | a `*-dev-*` load of `/docs/routing` | after hydration one `style[data-vite-dev-id]` per id, the Tailwind entry compiled (a `.mx-auto` rule, no `@import`) (B104) |
| `dev styles hmr` | a `*-dev-*` load of `/docs/routing` on a private copy of the docs app under its own dev server (`copy-boot.ts`), a window marker, then a rule appended to the copy's `src/styles.css`. The shared app is never written (B70); the case once edited it, and another server's first load met the edit (BUGS.md 111) | the new rule applies, the marker survives, `styles.css` still has one style, the copy's server logs an `hmr update` for `src/styles.css` and no `page reload`, and the page logs no problem |
| `every page hydrates` | one case per page of the route map | the document status is the listed one, the page hydrates, and the console holds no error or warning besides that status |
| `click through` | home → a feature card → a sidebar link → back → back | no document request, and the header node is the same node |
| `foreign head node` | `/docs/routing` served with a node put into its `<head>`: a meta, a style, a script, a comment, or a newline first, or a meta between two of Solid's markers; then the header's API link | `#api-name` reads `createServer`, and the node is where it was put. Red before B120: 24 of 24 on node-prod chromium, firefox, and webkit and node-dev chromium, `#api-name` not found (BUGS.md 120) |
| `foreign head extension` | with the page's CSP bypassed, as an extension's own nodes are: `same task` (a served meta, a mutation observer, and a frame loop), `fights back` (an init script keeping a `<style data-ext>` first in `<head>` and putting it back whenever it moves), `runs once` (a served script counting its runs) | the guard's removal and return land in one mutation batch, and no frame lacks the meta; one `style[data-ext]`, and every frame's body background is its color; the script ran once and is still first. Each then renders the API page. Red with the guard off: 9 of 9; with the restore in the next frame: `same task` 3 of 3 (BUGS.md 120) |

## `tests/e2e/docs-routing.test.ts`

`slug params`, `ssg unknown slug` (404), `catch-all` (known entry; an unknown one is a 404 the page's loader throws with `notFound()`, painted by its own not-found), `optional catch-all`, `literal brackets`, `group no segment`, `fuzzy not found` (docs layout's not-found inside the guide chrome), `root not found`, `response redirect` (301 with and without a locale; `/legacy` throws a typed `redirect()` from its `.response()`), `client rewrite` (an anchor to `/guide/routing` is a client navigation), `second root full load`, `static beats locale`, `error boundary reset` (500, then `reset()` with no history entry), `segment cdn` (`/hr/api/…` public with `Cache-Tag`), `locale prefix routes`.

## `tests/e2e/docs-navigation.test.ts`

`active link`, `back keeps scroll` (home scrolled to the cards, a card, the doc page scrolled, then Back: in the transition's first frame and after it, scrollY is the saved home position, and on the forward step it is 0 in the first frame; B108), `pending read` (from /hr/docs/styling, a sidebar link to a doc page whose feedback query is held pending by the test: the new page shows its feedback skeleton at once, the URL and the one active link are the new page's in the same frame; then a click on a second link while the read is pending: the second page commits, one active link, no pageerror; B106, BUGS.md 62), `i18n page` (/hr/docs/i18n renders its title and its feedback tally, no `Something broke`; BUGS.md 64), `disabled link`, `hash link` (no data request), `prefetch data intent`, `prefetch viewport`, `prefetch off`, `view transition document` (a sidebar click from the top of a doc page, one from a doc page scrolled to its bottom, and Back to a scrolled doc page from the API page: all four transitions on the document, the default scope; red under the old `"auto"` default: `["article" ×4]` on node prod and node dev chromium; B119 (5), BUGS.md 119.2, 119.3), `view transition off`, `progress bar` (the Auth data request, the hover's prefetch included, held until the bar has been seen pending, then released; BUGS.md 101), `blocker` (dismiss stays, accept leaves), `scroll restoration`, `search intercept` (modal over home, dismiss returns, reload renders the page), `navigate state replace`, `shallow search` (no request, no loader run), `revalidate`, `hooks`, `preloader levels` (root, guide, page, child override), `lifecycle` (ready, hydrated, idle, interaction), `locale switch`.

## `tests/e2e/docs-data.test.ts`

`defer two skeletons` (the held `stats` polls its gate on its own timer, as `buildLog` does; with the release call removed it fails 3 of 3 at `#stats`, node-prod-chromium, workers-prod-chromium, workers-dev-firefox), `defer rejects` (the `<Errored>` fallback, the generic message in production, no dev overlay), `stream fill` (one `?_flare=fill`; `#latest` still shows `1.0.0` once it has committed), `defer resolve stored` (production; the stored state carries `latest` inline, and a fill sends it as `kept` with no frame of its own and runs the holes), `query prefetched` (no call on hydrate, with the search page's query on TanStack's default `staleTime`, B102), `query hydrates once` (a document load of a doc page sends no `/_flare/fn/` request from the load through 1 s after `data-flare-hydrated`: the refetch B102 removes went out during the hydration mount, before the attribute), `query suspense`, `mutation sets data` (no refetch), `vote holds still` (the vote held by the test: both buttons keep opacity 1 while it is pending, and a second click sends nothing; BUGS.md 119.1), `server fn get cached`, `server fn post validates` (the field message), `safe error`, `unsafe error` (masked in production), `stream` (no clock decides it, BUGS.md 100: the test gates a fresh run with `holdBuild` before the click and opens `/playground?run=<id>`; the server sends line 1, then each later line only after `releaseBuild`; for each line the case waits until that line is on screen, then releases the next, so every line shows while the server still holds the next; then all six lines in order and `done`. A gated run checks its release count on its own 10 ms timer, because workerd cancels a request's continuation when another request resolves its promise. Red: the server yielding every line at the end, and the client reading the whole body before handing any value on, each fails on line 1, `toHaveCount` expected 1, received 0, on node prod chromium, firefox, and webkit, node dev chromium, and workers and bun prod webkit; without a gate the playground keeps its 150 ms pacing), `stream abort` (the run is held after its second line until the stop arrives, `?hold`, B55; the card sets the status after its read loop ends, so once it reads `aborted` the log holds exactly the two lines sent, with no wait), `server context`, `fetch dedupe` (one upstream call), `env fns`, `t plural`.


## `tests/e2e/docs-cache.test.ts`

Production cases skip the `*-dev-*` projects: `ssg seed`, `ssg public cdn`, `isr stored` (the changelog shows its render's request id; a repeat is a `hit` or a `miss` joined to the first render, the same id either way, and a later request is a `hit` from it; BUGS.md 88), `shared ssr`, `revalidate tag` (the admin republish purges the `api` tag). Every deep server: `client cache stale`, `cache deferred`, `store per runtime`.

## `tests/e2e/docs-server.test.ts`

`unauthenticated` (401 boundary, hydrates), `unauthorized` (403), `auth throws` (`/admin/audit` reads an optional session and its loader throws `unauthenticated()` for a guest and `unauthorized()` for a reader, which paint the admin root's 401 and 403; an admin gets the page; BUGS.md 105), `login cookie`, `authenticate optional`, `csrf`, `body limit` (a small body answers 200; an 8 MiB body sent with `Expect: 100-continue` answers 413, so nothing is left unread for workerd to reset, and no loopback buffer absorbs a cut; BUGS.md 104, 114), `middleware next`, `middleware respond`, `middleware bypass`, `middleware prefix`, `mount`, `response route` (keeps its own Cache-Control), `route headers`, `route security` (the root's `X-Frame-Options`, one nonce), `security defaults`, `indexnow key file`.

## `tests/e2e/docs-features.test.ts`

Bit 13's `prefix`, `shared cookie`, `unknown locale`, `theme no flash`, `rtl client`, `tabs sync`, `set locale persists`, then `theme system` (Firefox skips: its emulation ignores `colorScheme`), `theme transition`, `rtl layout`, `format message` (an omitted locale inside `LocaleProvider` is the provider's tag, shown by the plural category: `/ar` prints `14 releases (many)` and `/` prints `14 releases`, stable across CLDR versions; BUGS.md B29), `image responsive`, `image fixed`, `fonts`, `head full`, `sitemap`, `robots`, `tailwind critical`, `stylesheet after critical` (production: `/changelog`'s `#flare-critical` precedes the preload link and the noscript link; in dark and light contexts, once the stylesheet has loaded, the shell's header background and a streamed release card's border differ between the two themes; red before B103, when the critical copy of the light rules won the tie; BUGS.md B57), `css module`, `reset`.

## `tests/e2e/docs-resilience.test.ts`

`build mismatch reload` (a data answer from a newer deploy is one document load under the `flare_chunk_reload` guard), `missing chunk reload` (production), `superseded chunk failure` (API then Examples clicked 30 ms apart, every script asked for after hydrate failing 300 ms late, so API's fails once Examples has taken over: the only document load is `/examples`; red before BUGS.md 121: 15 of 15 also loaded `/api/server/create-server`, on node-dev-webkit, node-prod chromium and firefox, bun-dev-chromium, workers-prod-webkit), `network failure` (screen and history unchanged), `abort keeps latest` (Auth's every data request held 800 ms, its hover prefetch included, so the Styling click aborts it; BUGS.md 98), `overlay history` (back clears the overlay without a fetch, forward reopens it), `concurrent misses render once` (production), `accept language`, `bad locale cookie` (a wrong-case cookie is no cookie), `bot stays put`, `csrf headers` (`Sec-Fetch-Site` cross-site and same-site off the list, a foreign `Referer`; the rejected POSTs carry no body, since local Miniflare resets a kept-alive connection after a 403 that left the body unread, BUGS.md B56), `phone layout` (no horizontal overflow, the sidebar hides, a tap navigates).

## `tests/integration/docs.test.ts`

| test | case | result |
| --- | --- | --- |
| `create test server` | `createTestServer(router)` over the docs router | `/llms.txt` answers 200, and a data request for `/[flare]` answers NDJSON |
| `stats gate refused` | the changelog's e2e gate check, without and with `FLARE_E2E=1` in the fetch env or the process env | it holds only under the flag, which the e2e boot sets for every runtime (a Miniflare binding for workerd), so a deployed docs app refuses `holdStats` (BUGS.md 69) |

## Harness

`docs.fixture.ts` boots the app once per project per worker. A failing case writes the server lines logged while it ran to `server-log.txt`, and the whole boot's to `server-session-log.txt`, in its output directory and attaches them, beside the trace. The first case of each boot requests `/maintenance` and fails, with both logs, unless the docs server's first-request line `[docs:probe] server up` reaches the boot's log within 2 s, so a capture that misses the server's console fails as itself (BUGS.md 93). Every docs spec runs on every project of the B70 grid; `deepOnly()` and the `FLARE_E2E_PROJECTS_CHOSEN` hand-off are removed (B70 revision, plan 14). A production-only case skips the `*-dev-*` projects by name. Node projects run under genuine Node 22.18 or later (B3), never under `bunx --bun`.

## `tests/integration/hydrate.test.tsx`

The SSR→hydrate harness (plan 14 leaf 9.4, pulled forward for phase 6). `hydrate.harness.ts` renders a tree with Solid's server build and hydrates the same tree with its client build in a real browser, inside `bun run test`. jsdom is not used: under jsdom Solid's client `hydrate()` neither claimed the server nodes nor reported a deliberate mismatch, so a jsdom check passed vacuously. Each case runs in chromium, firefox, and webkit from the B70 pinned image, reached through `FLARE_BROWSER_WS` or the run-server the global setup starts. The suite includes `harness bites`: a server tree and a client tree that differ must fail the check in every engine. Browsers come from `FLARE_BROWSER_WS` when set, else the pinned container when Docker is present, else Playwright's locally installed engines (the macOS CI job installs chromium, firefox, and webkit for the unit run). With none of the three, the harness fails with one message naming all three options, never a raw spawn error. A case fails on any console message that names `Hydration`, a key miss, unclaimed server nodes, or `STRICT_READ_UNTRACKED`. The harness writes nothing into the repo and removes its temp directory.

| test | case | result |
| --- | --- | --- |
| `navigation progress beside a sibling` | a root whose body renders `useNavigationProgress` output before a sibling element | no hydration warning or key miss, and the sibling is the server's node (BUGS.md B2) |
| `root boundaries idle` | a root with `errorRender` and `notFoundRender`, no failure, and a `useNavigationProgress` sibling | no key miss, and neither boundary function is called on the client (BUGS.md B3, closed as a consequence of B2) |
| `data hooks read untracked` | a root and a page on screen. The page's component calls `useParams({ from })`, `useSearch({ from })`, `useLoaderData({ from })`, `usePreloaderContext({ from })`, and `useMatch({ from })` in its body and renders their values | no `STRICT_READ_UNTRACKED` and no hydration warning in chromium, firefox, and webkit, and the rendered values match the server's (BUGS.md B4) |
| `foreign hmr port` | another process holds Vite's default HMR port 24678 from before the harness starts, for the whole file, with a server that accepts and closes each connection (or another process already owns it), and the harness hydrates the `navigation progress beside a sibling`, `root boundaries idle`, and `data hooks read untracked` trees in chromium | no problem is reported: the harness's Vite serves its HMR socket on the harness's own HTTP server (`hmr: { server }`, `watch: null`), so the page's Vite client never dials 24678 (BUGS.md B53). The holder is a child process: one inside the test's own event loop, or started after the harness, never closes a socket in time to fail the old harness |

## `tests/integration/client.test.ts` (B96)

The harness's app mode (`hydrate.app.ts`, plan 14 9.6): a case gives its app (the router, compiled into both sides from its source) and its client callbacks. The harness serves the document the real `createServer(...).fetch` answers from Solid's server build in Vite's SSR runner, adds a client entry, since without `flare()` the document has none, that calls the real `createClient(router)` with the callbacks, and reads back the record they wrote. It answers the dev server's `flare:styles` request with no styles, as flare() would for an app with no stylesheet. One harness boot serves the file, and every case runs in Chromium, Firefox, and WebKit. App mode does not exercise the document's own client script tag: without `flare()`, build-info has no `clientEntry`, so the harness adds its entry; the e2e grid, which runs `flare()`, covers the tag (flare-77).

| test | case | result |
| --- | --- | --- |
| `ready then hydrated` | `/?q=1#top`, two `onReady` callbacks and one `onHydrated` | the first `onReady` gets exactly `{ navigate, location }`, `location` is `{ pathname: "/", search: "?q=1", hash: "#top" }`, and `<html>` is not yet marked; the second runs next; `onHydrated` runs after with `data-flare-hydrated` set; no hydration problem |
| `idle after hydrated` | `onIdle` registered before `onHydrated` | `hydrated` then `idle`: idle waits for hydrate whatever the registration order |
| `interaction once` | a programmatic `navigate`, then a click, a key, and a click | nothing before the input, then exactly one `interaction`. Bite: removing the one-shot listener cleanup records three |
| `late registration` | `onReady` registered in a timer after the hydrate microtask | it throws |

## `tests/integration/flare-page.test.ts` (B96)

| test | case | result |
| --- | --- | --- |
| `helper on a real page` | the app mode's page, whose client waits 300 ms before `createClient` (`hydrateAfter`), so hydration lands after the load event, and logs `planted error` after hydrate; then `flarePage(tab)` loads it again and reads it | `load` resolves only with `data-flare-hydrated` set, `consoleErrors()` holds `planted error`, and `state()` is `{ build: "dev", nonce, matches, queries: null }` with the root's and the page's matches and the page's loader data, and its nonce is 32 hex characters the document's CSP header carries as `'nonce-…'`. Bites (flare-77): a helper that does not listen to the console, a `load` that waits for `html` alone, and a `state` whose nonce is empty each fail on all three engines |

docs-features `page state` (e2e): `flarePage(page).load` of `/docs/routing`, then `state()`: the last match is `[[locale]]/_root_/(guide)/docs/[slug]` with `{ slug: "routing" }`, the build is set, and the page logged no error.

## `tests/integration/adapters.test.ts` (B96)

| test | case | result |
| --- | --- | --- |
| `node listener` | the real `createServer` behind `createNodeListener` on `node:http`: a page, a stream whose second chunk waits for the test, two cookies, a POST echo, a raw `//evil/` target, an unread 100 KB page POST, then a GET | the page; the stream's first chunk before its second exists; two `Set-Cookie` headers (bite: joining them fails); the echoed body; `400 Bad Request`; 405, then 200 |
| `node trust proxy` | production stubbed (`DEV` false, `PROD` true), `X-Forwarded-Proto: https`, with `{ trustProxy: 1 }` and then without | `https:` and production HSTS, then `http:` and none (bite: a listener that ignores the option fails) |
| `bun serve` | under the Bun runtime only: a real `Bun.serve` over `createBunFetch(server, { trustProxy: 1 })` | the 128 MiB ceiling, the page, a trusted hop's `https:`, and the echoed body |

## `tests/integration/defer.test.ts` (B96)

The real `createServer` with a full-document root (B46), and one browser case through the harness's app mode.

| test | case | result |
| --- | --- | --- |
| `not stored` | a live page deferring `reviews` (keyed, 40 ms) and an unkeyed value, read through `useDeferred` in `<Loading>`: its data response, then its document | `l` frames with `{ __deferred, key }` placeholders (`reviews`, then `d0`), `r`, one `c` per value in settle order, `d`; the document's first chunk has the placeholder and not the value, and a later chunk has it |
| `key and prefetch` | two calls with one key: a prefetch, then a data request | the prefetch called neither and sent no `c` frame; the data request called only the first and sent one `c` (bite: the dedupe or the prefetch skip removed) |
| `document buffer` | `documentResponseDefer: "buffer"` | the document's first chunk already holds the value and `</html>` |
| `stored modes` | production stubbed, an `isr` route with `defer: "stream"`, one call left to the route and one with `prerender: "resolve"`, a memory store | COOP on the miss; the stored `l` frame holds the hole with `hole: true` and the resolved value inline, and no `c` frame; the fill sends the hole's `c` and the resolved one as `kept` |
| `component reads` | in every engine: a page reading a 200 ms deferred value with `useDeferred` inside `<Loading>`, hydrated by the real `createClient` | no problems; the document has the fallback before the value; after hydrate the value shows and the fallback is gone (bite: `useDeferred` with `ssrSource: "client"` fails this and the document cases). A document-less root fails the streamed swap in hydrate, so the root writes the whole document |

## `tests/workerd/server.test.ts` (B96)

The real `createServer` with a full-document root and the Cache API store, behind `createWorkersHandler`, bundled by `bun build` with the `worker` condition (Solid's server build) and run by Miniflare with an assets binding.

| test | case | result |
| --- | --- | --- |
| `worker server` | `/`, then `/stored` (`ssr`) until the store answers | the page in production (Cross-Origin-Opener-Policy, which dev drops; not HSTS, since under the Bun runtime Miniflare hands workerd the request as http); a miss, then a hit; behind a ctx wrapper that counts each promise handed to `waitUntil` by path, work for `/stored` only (bite: a handler that drops the promise, `void promise`, counts none; workerd finishes a local Cache API write without it, so the hit alone did not bite) |
| `worker assets` | `/a/static.txt` by GET and HEAD, `/nope`, and a POST | the file untouched, 200 for HEAD, the app's 404 with its security headers, and 405 for the POST (bite: a handler that never forwards fails) |

docs-server `forwarded proto untrusted` (e2e): a client's own `X-Forwarded-Proto: https` gets no HSTS from a server that declares no hop, on every runtime (bite: a Node listener trusting one hop by default fails on node-prod).

docs-server `canonical ingress` (e2e): `//x` is 400, `/docs//routing` is 301 to `/docs/routing`, and `/CHANGELOG` is 301 to `/changelog`, on every runtime., all 18 projects. On workers-dev, @cloudflare/vite-plugin's dev server would resolve `//x` to host `x` before the worker runs (BUGS.md 118, upstream), so flare()'s target guard refuses it first (red without the guard: workers-dev 200) (red: workers-prod answered `/docs//routing` 200, BUGS.md 117.2). The paths are routes, since a file is the platform's: the harness's static layer and Cloudflare's assets answer it before Flare (`/icons//icon-96.png` is 200 on node-prod and bun-prod, 307 on workers-prod).

## `shared/dev/warn.test.ts`

| test | case | result |
| --- | --- | --- |
| `dev warns` | `devWarn("server-fn", "m")` with `import.meta.env.DEV` true | one `console.warn` with `[flare:server-fn]` and the message |
| `prod silent` | the same with `DEV` false | no console call, and a production client bundle that imports it contains no `console.warn` |

## `vite/dev/tabs.test.ts`

The dev tab hub (BUGS.md B42), independent of the Node and Bun handler so the Workers dev seam (B95) and the dev log bridge (plan 15) reuse it.

| test | case | result |
| --- | --- | --- |
| `hub` | announce, deliver to an announced token, deliver to an unknown token, the 30 s expiry, the 21st held payload, a disconnect | delivered to that client only; held then flushed on announce; dropped after 30 s; the oldest dropped first; a disconnected token is forgotten |
| `message` | a well-formed `{ token, payload }`, a missing token, a non-object | accepted; rejected; rejected |

## `client/dev/tab.test.ts`

| test | case | result |
| --- | --- | --- |
| `tabbed fetch` | a document with the `flare-dev-tab` meta and a hot channel; no hot channel; no meta | the token is announced once and set on every request, the request's own headers kept; `fetch` is returned unchanged in the other two |

## `tests/workerd/disconnect.test.ts`

| test | case | result |
| --- | --- | --- |
| `miniflare drops disconnect` | a worker that streams a line every 100 ms and records its `request.signal` abort and its body's `cancel()`; the client reads one chunk and aborts, then reads the recorded status after 500 ms; with and without `enable_request_signal` | the status is still `running` in all four runs. A Miniflare that reports the disconnect fails this case, which is the cue to re-enable `stream abort` on `workers-*` (BUGS.md B45) |
| `miniflare resets unread body` | a worker that answers 403 without reading the request body; two POSTs on one kept-alive socket (`maxSockets: 1`) | the first answers 403 and the second fails with `ECONNRESET`. A Miniflare that keeps the connection fails this case, which is the cue to give the rejected POSTs in `csrf headers` their body back (BUGS.md B56) |

## `tests/structure/ci.test.ts`

| test | case | result |
| --- | --- | --- |
| `ci bun version` | every workflow's `BUN_VERSION`, its setup-bun steps, and the root `package.json` `packageManager` | the same Bun version, and every setup-bun step reads `BUN_VERSION`: CI and the release run the Bun this repo was verified on (BUGS.md 115) |
| `release node` | release.yml's jobs that set up Bun | each sets Node 24 right after checkout, as every CI job does (BUGS.md 115) |
| `ci node` | `.github/workflows/ci.yml` parsed | every job has `actions/setup-node` with `node-version: 24` after its checkout (B3, BUGS.md B24) |
| `ci unit on both oses` | the same file | the Linux check job and `e2e-mac` both run `bun run test`, so the unit suite runs on Linux and macOS (B3, BUGS.md B27) |
| `ci unit on bun` | the same file | the check job also runs `bun run test:bun` (the root script, which is `bun --bun run --filter @lovrozagar/flare test:bun`, and that is `vitest run` without coverage), so every unit test runs under the Bun runtime too. Coverage stays a Node gate: the per-file 100% is measured on Node's V8 data, and Bun's coverage of the same passing tests disagrees on 6 files (plan 14 leaf 8.20) |
| `ci failure artifacts` | the same file | the last step of `e2e-linux` uploads `packages/core/test-results` on `failure()`, and of `e2e-mac` on `failure()` too, as `<job>-<shard>`, kept 7 days: each failing case's trace and server logs (BUGS.md 93). A pass uploads nothing: `stream` no longer times anything (BUGS.md 100.23). The grid's own step is found by its `bun run test:e2e` command |
| `ci mac shards` | the same file | `e2e-mac` runs the 6 webkit projects in 3 shards, its unit run in the first only: with 2, the first ran the unit suite (3m51s) and half the grid (15m38s) and hit its 20-minute timeout, which GitHub reports as a cancelled step (CI 38611307306, BUGS.md 100.13) |
| `ci shards independent` | the same file | `e2e-linux` and `e2e-mac` both set `fail-fast: false`, so one shard's failure never cancels another's evidence (bite: dropping it from `e2e-mac` fails) |

## `vite/plugin/real-path.test.ts`

| test | case | result |
| --- | --- | --- |
| `real path` | an existing path behind a symlink, an existing plain path, and a path that does not exist | the symlink's target, the path itself, and the input unchanged |

