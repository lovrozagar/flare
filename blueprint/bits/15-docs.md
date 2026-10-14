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
| `dev log clean` | every page in the route map, each in a fresh tab, on the `*-dev-*` projects | the dev server's captured log has no `Unable to parse` and no uncaught error, and its `[flare:` error lines are exactly the ones the page entries declare they log on purpose (`/changelog` declares "The stats service is down"): an extra line or a missing declared one fails (BUGS.md B8) |
| `public files` | GET `/favicon.ico`, `/icon.svg`, `/apple-touch-icon.png`, `/manifest.webmanifest`, and `/fonts/mono.woff2` | each answers 200 with a non-empty body and its content type, on every project (BUGS.md B11) |
| `fill holds nothing` | a load of `/changelog`, kept open 1.5 s after hydrate while the fill settles its holes | the console holds nothing, no Solid `SILENT_HOLD` among it (BUGS.md 89) |
| `preloads settle` | a `*-prod-*` load of `/changelog`, left open 5 s past network idle | the console holds nothing: no JS preload warning (BUGS.md 79) and, since the stylesheet link consumes the preload, no stylesheet preload notice either (BUGS.md 81, 87). Red on local WebKit before 87 |
| `rapid links` | from `/docs/routing`, the main-nav Changelog link, then, once Changelog has landed with its 900 ms stats value still loading (a stream, or a fill once the page is stored), API, Examples, Playground, and Docs clicked 30 ms apart from the page | the stats value was still loading at the second click, the page ends on Routing, and no `pageerror` fires: each superseded navigation resolves, including one aborted mid-stream (B105, BUGS.md B58) |
| `dev first paint` | a `*-dev-*` hard load of `/docs/routing` with every script blocked, Vite's client and the app's entry included | at DOMContentLoaded the body's margin is 0 (flare's reset), `h1` is weight 600, and `#nav` is sticky: the server's dev styles alone styled the first paint. Red at HEAD before B104 (margin 8px) (BUGS.md B59) |
| `dev styles adopted` | a `*-dev-*` load of `/docs/routing`, then a rule with a name of its own appended to `src/styles.css`, and afterwards exactly that rule removed from what the file holds then, since every dev project edits the one file (BUGS.md 99) | after hydration one `style[data-vite-dev-id]` per id, the Tailwind entry compiled (a `.mx-auto` rule, no `@import`); after the edit the new rule applies and `styles.css` still has one style (B104) |
| `every page hydrates` | one case per page of the route map | the document status is the listed one, the page hydrates, and the console holds no error or warning besides that status |
| `click through` | home → a feature card → a sidebar link → back → back | no document request, and the header node is the same node |

## `tests/e2e/docs-routing.test.ts`

`slug params`, `ssg unknown slug` (404), `catch-all` (known and unknown entry), `optional catch-all`, `literal brackets`, `group no segment`, `fuzzy not found` (docs layout's not-found inside the guide chrome), `root not found`, `response redirect` (301 with and without a locale), `client rewrite` (an anchor to `/guide/routing` is a client navigation), `second root full load`, `static beats locale`, `error boundary reset` (500, then `reset()` with no history entry), `segment cdn` (`/hr/api/…` public with `Cache-Tag`), `locale prefix routes`.

## `tests/e2e/docs-navigation.test.ts`

`active link`, `back keeps scroll` (home scrolled to the cards, a card, the doc page scrolled, then Back: in the transition's first frame and after it, scrollY is the saved home position, and on the forward step it is 0 in the first frame; B108), `pending read` (from /hr/docs/styling, a sidebar link to a doc page whose feedback query is held pending by the test: the new page shows its feedback skeleton at once, the URL and the one active link are the new page's in the same frame; then a click on a second link while the read is pending: the second page commits, one active link, no pageerror; B106, BUGS.md 62), `i18n page` (/hr/docs/i18n renders its title and its feedback tally, no `Something broke`; BUGS.md 64), `disabled link`, `hash link` (no data request), `prefetch data intent`, `prefetch viewport`, `prefetch off`, `view transition scoped` (one transition, type `forward`, on `#article` where element-scoped transitions exist), `view transition off`, `progress bar` (a delayed data request), `blocker` (dismiss stays, accept leaves), `scroll restoration`, `search intercept` (modal over home, dismiss returns, reload renders the page), `navigate state replace`, `shallow search` (no request, no loader run), `revalidate`, `hooks`, `preloader levels` (root, guide, page, child override), `lifecycle` (ready, hydrated, idle, interaction), `locale switch`.

## `tests/e2e/docs-data.test.ts`

`defer two skeletons`, `defer rejects` (the `<Errored>` fallback, the generic message in production, no dev overlay), `stream fill` (one `?_flare=fill`), `defer resolve stored` (production), `query prefetched` (no call on hydrate, with the search page's query on TanStack's default `staleTime`, B102), `query hydrates once` (a document load of a doc page sends no `/_flare/fn/` request from the load through 1 s after `data-flare-hydrated`: the refetch B102 removes went out during the hydration mount, before the attribute), `query suspense`, `mutation sets data` (no refetch), `server fn get cached`, `server fn post validates` (the field message), `safe error`, `unsafe error` (masked in production), `stream` (an observer installed before load records when each line count first shows: counts 1 to 6 in order, the last at least 600 ms after the first, so a buffered stream fails and no transient count is raced; BUGS.md 95), `stream abort` (the run is held after its second line until the stop arrives, `?hold`, B55), `server context`, `fetch dedupe` (one upstream call), `env fns`, `t plural`.

## `tests/e2e/docs-cache.test.ts`

Production cases skip the `*-dev-*` projects: `ssg seed`, `ssg public cdn`, `isr stored`, `shared ssr`, `revalidate tag` (the admin republish purges the `api` tag). Every deep server: `client cache stale`, `cache deferred`, `store per runtime`.

## `tests/e2e/docs-server.test.ts`

`unauthenticated` (401 boundary, hydrates), `unauthorized` (403), `login cookie`, `authenticate optional`, `csrf`, `body limit` (413), `middleware next`, `middleware respond`, `middleware bypass`, `middleware prefix`, `mount`, `response route` (keeps its own Cache-Control), `route headers`, `route security` (the root's `X-Frame-Options`, one nonce), `security defaults`, `indexnow key file`.

## `tests/e2e/docs-features.test.ts`

Bit 13's `prefix`, `shared cookie`, `unknown locale`, `theme no flash`, `rtl client`, `tabs sync`, `set locale persists`, then `theme system` (Firefox skips: its emulation ignores `colorScheme`), `theme transition`, `rtl layout`, `format message` (an omitted locale inside `LocaleProvider` is the provider's tag, shown by the plural category: `/ar` prints `14 releases (many)` and `/` prints `14 releases`, stable across CLDR versions; BUGS.md B29), `image responsive`, `image fixed`, `fonts`, `head full`, `sitemap`, `robots`, `tailwind critical`, `stylesheet after critical` (production: `/changelog`'s `#flare-critical` precedes the preload link and the noscript link; in dark and light contexts, once the stylesheet has loaded, the shell's header background and a streamed release card's border differ between the two themes; red before B103, when the critical copy of the light rules won the tie; BUGS.md B57), `named content still` (a home card's doc page: no element inside a `view-transition-name` element has an animation; BUGS.md B61), `named content still while loading` (the same while the feedback read is held pending, the skeleton on screen; BUGS.md 70), `css module`, `reset`.

## `tests/e2e/docs-resilience.test.ts`

`build mismatch reload` (a data answer from a newer deploy is one document load under the `flare_chunk_reload` guard), `missing chunk reload` (production), `network failure` (screen and history unchanged), `abort keeps latest` (Auth's every data request held 800 ms, its hover prefetch included, so the Styling click aborts it; BUGS.md 98), `overlay history` (back clears the overlay without a fetch, forward reopens it), `concurrent misses render once` (production), `accept language`, `bad locale cookie` (a wrong-case cookie is no cookie), `bot stays put`, `csrf headers` (`Sec-Fetch-Site` cross-site and same-site off the list, a foreign `Referer`; the rejected POSTs carry no body, since local Miniflare resets a kept-alive connection after a 403 that left the body unread, BUGS.md B56), `phone layout` (no horizontal overflow, the sidebar hides, a tap navigates).

## `tests/integration/docs.test.ts`

| test | case | result |
| --- | --- | --- |
| `create test server` | `createTestServer(router)` over the docs router | `/llms.txt` answers 200, and a data request for `/[flare]` answers NDJSON |
| `stats gate refused` | the changelog's e2e gate check, without and with `FLARE_E2E=1` in the fetch env or the process env | it holds only under the flag, which the e2e boot sets for every runtime (a Miniflare binding for workerd), so a deployed docs app refuses `holdStats` (BUGS.md 69) |

## Harness

`docs.fixture.ts` boots the app once per project per worker. A failing case writes the server lines logged while it ran to `server-log.txt` in its output directory and attaches it, beside the trace (BUGS.md 93). Every docs spec runs on every project of the B70 grid; `deepOnly()` and the `FLARE_E2E_PROJECTS_CHOSEN` hand-off are removed (B70 revision, plan 14). A production-only case skips the `*-dev-*` projects by name. Node projects run under genuine Node 22.18 or later (B3), never under `bunx --bun`.

## `tests/integration/hydrate.test.tsx`

The SSR→hydrate harness (plan 14 leaf 9.4, pulled forward for phase 6). `hydrate.harness.ts` renders a tree with Solid's server build and hydrates the same tree with its client build in a real browser, inside `bun run test`. jsdom is not used: under jsdom Solid's client `hydrate()` neither claimed the server nodes nor reported a deliberate mismatch, so a jsdom check passed vacuously. Each case runs in chromium, firefox, and webkit from the B70 pinned image, reached through `FLARE_BROWSER_WS` or the run-server the global setup starts. The suite includes `harness bites`: a server tree and a client tree that differ must fail the check in every engine. Browsers come from `FLARE_BROWSER_WS` when set, else the pinned container when Docker is present, else Playwright's locally installed engines (the macOS CI job installs chromium, firefox, and webkit for the unit run). With none of the three, the harness fails with one message naming all three options, never a raw spawn error. A case fails on any console message that names `Hydration`, a key miss, unclaimed server nodes, or `STRICT_READ_UNTRACKED`. The harness writes nothing into the repo and removes its temp directory.

| test | case | result |
| --- | --- | --- |
| `navigation progress beside a sibling` | a root whose body renders `useNavigationProgress` output before a sibling element | no hydration warning or key miss, and the sibling is the server's node (BUGS.md B2) |
| `root boundaries idle` | a root with `errorRender` and `notFoundRender`, no failure, and a `useNavigationProgress` sibling | no key miss, and neither boundary function is called on the client (BUGS.md B3, closed as a consequence of B2) |
| `data hooks read untracked` | a root and a page on screen. The page's component calls `useParams({ from })`, `useSearch({ from })`, `useLoaderData({ from })`, `usePreloaderContext({ from })`, and `useMatch({ from })` in its body and renders their values | no `STRICT_READ_UNTRACKED` and no hydration warning in chromium, firefox, and webkit, and the rendered values match the server's (BUGS.md B4) |
| `foreign hmr port` | another process holds Vite's default HMR port 24678 from before the harness starts, for the whole file, with a server that accepts and closes each connection (or another process already owns it), and the harness hydrates the `navigation progress beside a sibling`, `root boundaries idle`, and `data hooks read untracked` trees in chromium | no problem is reported: the harness's Vite serves its HMR socket on the harness's own HTTP server (`hmr: { server }`, `watch: null`), so the page's Vite client never dials 24678 (BUGS.md B53). The holder is a child process: one inside the test's own event loop, or started after the harness, never closes a socket in time to fail the old harness |

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
| `ci bun version` | ci.yml's `BUN_VERSION` and the root `package.json` `packageManager` | the same Bun version: CI runs the Bun this repo was verified on |
| `ci node` | `.github/workflows/ci.yml` parsed | every job has `actions/setup-node` with `node-version: 24` after its checkout (B3, BUGS.md B24) |
| `ci unit on both oses` | the same file | the Linux check job and `e2e-mac` both run `bun run test`, so the unit suite runs on Linux and macOS (B3, BUGS.md B27) |
| `ci unit on bun` | the same file | the check job also runs `bun run test:bun` (the root script, which is `bun --bun run --filter @lovrozagar/flare test:bun`, and that is `vitest run` without coverage), so every unit test runs under the Bun runtime too. Coverage stays a Node gate: the per-file 100% is measured on Node's V8 data, and Bun's coverage of the same passing tests disagrees on 6 files (plan 14 leaf 8.20) |
| `ci failure artifacts` | the same file | the last step of `e2e-linux` and of `e2e-mac` uploads `packages/core/test-results` on `failure()`, as `<job>-<shard>`, kept 7 days: each failing case's trace and server log (BUGS.md 93). The grid's own step is found by its `bun run test:e2e` command |

## `vite/plugin/real-path.test.ts`

| test | case | result |
| --- | --- | --- |
| `real path` | an existing path behind a symlink, an existing plain path, and a path that does not exist | the symlink's target, the path itself, and the input unchanged |

