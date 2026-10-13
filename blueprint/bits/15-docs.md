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
| `every page hydrates` | one case per page of the route map | the document status is the listed one, the page hydrates, and the console holds no error or warning besides that status |
| `click through` | home → a feature card → a sidebar link → back → back | no document request, and the header node is the same node |

## `tests/e2e/docs-routing.test.ts`

`slug params`, `ssg unknown slug` (404), `catch-all` (known and unknown entry), `optional catch-all`, `literal brackets`, `group no segment`, `fuzzy not found` (docs layout's not-found inside the guide chrome), `root not found`, `response redirect` (301 with and without a locale), `client rewrite` (an anchor to `/guide/routing` is a client navigation), `second root full load`, `static beats locale`, `error boundary reset` (500, then `reset()` with no history entry), `segment cdn` (`/hr/api/…` public with `Cache-Tag`), `locale prefix routes`.

## `tests/e2e/docs-navigation.test.ts`

`active link`, `disabled link`, `hash link` (no data request), `prefetch data intent`, `prefetch viewport`, `prefetch off`, `view transition scoped` (one transition, type `forward`, on `#article` where element-scoped transitions exist), `view transition off`, `progress bar` (a delayed data request), `blocker` (dismiss stays, accept leaves), `scroll restoration`, `search intercept` (modal over home, dismiss returns, reload renders the page), `navigate state replace`, `shallow search` (no request, no loader run), `revalidate`, `hooks`, `preloader levels` (root, guide, page, child override), `lifecycle` (ready, hydrated, idle, interaction), `locale switch`.

## `tests/e2e/docs-data.test.ts`

`defer two skeletons`, `defer rejects` (the `<Errored>` fallback, the generic message in production, no dev overlay), `stream fill` (one `?_flare=fill`), `defer resolve stored` (production), `query prefetched` (no call on hydrate), `query suspense`, `mutation sets data` (no refetch), `server fn get cached`, `server fn post validates` (the field message), `safe error`, `unsafe error` (masked in production), `stream`, `stream abort`, `server context`, `fetch dedupe` (one upstream call), `env fns`, `t plural`.

## `tests/e2e/docs-cache.test.ts`

Production cases skip the `*-dev-*` projects: `ssg seed`, `ssg public cdn`, `isr stored`, `shared ssr`, `revalidate tag` (the admin republish purges the `api` tag). Every deep server: `client cache stale`, `cache deferred`, `store per runtime`.

## `tests/e2e/docs-server.test.ts`

`unauthenticated` (401 boundary, hydrates), `unauthorized` (403), `login cookie`, `authenticate optional`, `csrf`, `body limit` (413), `middleware next`, `middleware respond`, `middleware bypass`, `middleware prefix`, `mount`, `response route` (keeps its own Cache-Control), `route headers`, `route security` (the root's `X-Frame-Options`, one nonce), `security defaults`, `indexnow key file`.

## `tests/e2e/docs-features.test.ts`

Bit 13's `prefix`, `shared cookie`, `unknown locale`, `theme no flash`, `rtl client`, `tabs sync`, `set locale persists`, then `theme system` (Firefox skips: its emulation ignores `colorScheme`), `theme transition`, `rtl layout`, `format message` (the provider's tag formats digits), `image responsive`, `image fixed`, `fonts`, `head full`, `sitemap`, `robots`, `tailwind critical`, `css module`, `reset`.

## `tests/e2e/docs-resilience.test.ts`

`build mismatch reload` (a data answer from a newer deploy is one document load under the `flare_chunk_reload` guard), `missing chunk reload` (production), `network failure` (screen and history unchanged), `abort keeps latest`, `overlay history` (back clears the overlay without a fetch, forward reopens it), `concurrent misses render once` (production), `accept language`, `bad locale cookie` (a wrong-case cookie is no cookie), `bot stays put`, `csrf headers` (`Sec-Fetch-Site` cross-site and same-site off the list, a foreign `Referer`), `phone layout` (no horizontal overflow, the sidebar hides, a tap navigates).

## `tests/integration/docs.test.ts`

| test | case | result |
| --- | --- | --- |
| `create test server` | `createTestServer(router)` over the docs router | `/llms.txt` answers 200, and a data request for `/[flare]` answers NDJSON |

## Harness

`docs.fixture.ts` boots the app once per project per worker. Every docs spec runs on every project of the B70 grid; `deepOnly()` and the `FLARE_E2E_PROJECTS_CHOSEN` hand-off are removed (B70 revision, plan 14). A production-only case skips the `*-dev-*` projects by name. Node projects run under genuine Node 22.18 or later (B3), never under `bunx --bun`.

## `tests/integration/hydrate.test.tsx`

The SSR→hydrate harness (plan 14 leaf 9.4, pulled forward for phase 6). `hydrate.harness.ts` renders a tree with Solid's server build and hydrates the same tree with its client build in a real browser, inside `bun run test`. jsdom is not used: under jsdom Solid's client `hydrate()` neither claimed the server nodes nor reported a deliberate mismatch, so a jsdom check passed vacuously. Each case runs in chromium, firefox, and webkit from the B70 pinned image, reached through `FLARE_BROWSER_WS` or the run-server the global setup starts. The suite includes `harness bites`: a server tree and a client tree that differ must fail the check in every engine. A case fails on any console message that names `Hydration`, a key miss, unclaimed server nodes, or `STRICT_READ_UNTRACKED`. The harness writes nothing into the repo and removes its temp directory.

| test | case | result |
| --- | --- | --- |
| `navigation progress beside a sibling` | a root whose body renders `useNavigationProgress` output before a sibling element | no hydration warning or key miss, and the sibling is the server's node (BUGS.md B2) |
| `root boundaries idle` | a root with `errorRender` and `notFoundRender`, no failure, and a `useNavigationProgress` sibling | no key miss, and neither boundary function is called on the client (BUGS.md B3, closed as a consequence of B2) |
