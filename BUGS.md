---
serial: 1
name: flare-v1-bugs
status: ready
created: 2026-10-13T13:21:15Z
source: "bugs the docs e2e app found in packages/core; testers append, engineers fix"
---

# flare-v1-bugs

## Goal

Every bug the docs e2e app (`packages/core/tests/e2e/apps/docs`) found in `packages/core/src` is fixed with a failing test written first, and the docs app runs on every project with no console error or warning. Each phase below is one bug: its repro, what was expected, what happened, and the evidence. An engineer agent takes one phase at a time.

## Context

- The tester writes the app and the specs. Engineers change `packages/core/src` only. The app is not changed to hide a bug.
- Run the app in dev: `bun run --bun --cwd packages/core/tests/e2e/apps/docs dev`. Node 22.12 cannot load the raw-TS plugin, so dev needs `--bun`.
- Genuine Node runs need a Node with type stripping on PATH, for example `PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH bunx playwright test …`. Under `bunx --bun`, the spawned `node` is Bun (B24).
- The Playwright specs are `packages/core/tests/e2e/docs-*.test.ts`. One project: `bun run test:e2e -- --project node-dev-chromium`.
- The contract is the exported source. A dx row that the source does not export is out of v1, not a bug.
- The rules are `blueprint/00-rules.md`: TDD, a colocated unit test, 100% per-file coverage, and file limits.

## Constraints

- A fix lands with its unit or integration test, seen failing first. The named docs spec case turns green.
- Do not edit the docs app to work around a bug. If the app is wrong, the tester fixes the app and moves the phase to Notes in the tester log.
- A phase is closed when its Verify leaf passes.

## Watch-outs

- Hydration bugs cascade: one key miss detaches every later sibling, so fix 3 and 2 before judging the rest of a page.
- Several symptoms only show under `bun`. Run the dev repro under `--bun`, and the prod repro on the `bun-prod` project.

## Steps

1 [x] B1 Bun: a middleware that re-wraps the response crashes the server
1.1 [x] Repro: a middleware `async (ctx) => { const r = await ctx.next(); return new Response(r.body, r); }` under Bun dev, then GET any page. The process exits: `TypeError: Cannot cancel a locked ReadableStream` at `packages/core/src/server/middleware/run.ts:70` (`discard`). Two nested re-wraps reproduce it on the first request.
1.2 [x] Expected: the re-wrap is the pattern the comment at `run.ts:68` endorses, and the response streams. Actual: under Bun, `new Response(res.body, res).body` is a different stream object, so `routed.body !== kept.body` and `discard` cancels the locked original. The rejection is unhandled and kills the process.
1.3 [x] Write a failing `server/middleware/run.test.ts` case for a re-wrapped body whose `body` identity differs from the router's (simulate Bun). Then fix `discard` so it never cancels a stream that was handed on, and never throws or rejects unhandled.
1.4 [x] Verify: the docs app's `x-docs-time` middleware written as a re-wrap serves `/` under `bun run --bun ... dev`, and `docs-server` `middleware next` is green on `bun-prod-*`.

2 [x] B2 `useNavigationProgress` breaks hydration of every later sibling
2.1 [x] Repro: in the docs root layout, `<ProgressBar />` (which calls `useNavigationProgress`) sits before `<Header />`. Load `/` in dev and look at the console.
2.2 [x] Expected: no hydration warning. Actual: `Hydration tag mismatch for key …020401: expected <div>`, then `Hydration key miss` for the header, `#app`, the page, and the footer, then `Hydration completed with 67 unclaimed server-rendered node(s)`. `packages/core/src/client/navigation/progress.ts:27` returns `{ pending: false, value: null }` on the server before `useNavigation()`, `createSignal`, and `createEffect`, so the client allocates owners that the server did not, and every later hydration id shifts.
2.3 [x] Write a failing hydration test (SSR the hook beside a sibling element, hydrate, and assert no key miss). Then make the server path create the same owners as the client, or none on either side.
2.4 [x] Verify: `docs-smoke` `every page hydrates` reports no `Hydration` warning on `node-dev-chromium`.

3 [x] B3 A layout's boundary renders are created on the client at hydrate
3.1 [x] Repro: the docs root layout declares `.errorRender(...)` and `.notFoundRender(...)`. Load any page in dev.
3.2 [x] Expected: a boundary render runs only when its failure happens. Actual: `Hydration key miss for "000000000000000010010": no server-rendered element carries this key (template: <main …><h1 id=root-error>`. Every node after it then detaches: the footer never hydrates (the isomorphic badge stays "server" and the boot log stays empty), and the changelog's `"stream"` defers never fill. Removing both boundary renders from the root makes all three work. The same key miss appears for a non-root layout: on every doc page, the docs layout's `notFoundRender` template (`<div id=docs-not-found>`) is created at hydrate, which detaches the article that follows. This was verified by deleting them and probing `/` and `/changelog`. The boundary code is `packages/core/src/shared/components/boundary.ts`. The root slot is under `<Errored>` (`renderSlot.slot › <SlotContext> › <Errored>` in the warning's owner path).
3.3 [x] Write a failing `shared/components/outlet.test.tsx` (or boundary) case: SSR plus hydrate a root with `errorRender` and no failure, and assert no key miss and no fallback template created. Then fix it so the fallback is created lazily.
3.4 [x] Verify: `docs-data` `defer two skeletons` is green on node-dev-chromium, and `docs-smoke` `every page hydrates` shows no Hydration warning on any page; its remaining failures are B4, B5, and B7. Originally: `docs-smoke` `every page hydrates` and `docs-data` `defer two skeletons` are green with the root boundaries in place.
3.5 [x] Cause found: B2's cascade, not a boundary bug. The boundary renders were never eager. During hydrate, the key shift that starts at `<ProgressBar />` makes the root's subtree throw (`Hydration Mismatch. Unable to find DOM nodes for hydration key: …A1c10000k060` at depth 1, then a null `nextSibling` in `Controls`). The slot's `<Errored>` in `outlet.tsx` `guard` catches that throw and paints the root's `errorRender` on the client, so its template is the key miss. With `<ProgressBar />` removed from the docs root (a local experiment, reverted), `/`, `/docs/routing`, and `/changelog` hydrate with no Hydration warning, the footer reads "rendered on client", and the boot log fills. No `outlet.tsx` change: the B2 fix closes it, and `tests/integration/hydrate.test.tsx` `root boundaries idle` (chromium, firefox, webkit) is its regression case.

4 [x] B4 Data hooks warn `STRICT_READ_UNTRACKED` wherever they are called
4.1 [x] Repro: call `useParams({ from })`, `useSearch`, `useLoaderData`, `usePreloaderContext`, or `useMatch` in a component body (docs `Header` via `useLocaleParam`, `HooksPanel`, `Results`). Load the page in dev.
4.2 [x] Expected: hooks are called in a component body, so the call is silent. Actual: `[STRICT_READ_UNTRACKED] Reactive value "createRouterStore.snapshot" read directly in <Header> will not update`. `packages/core/src/shared/components/outlet-nodes.ts:119` (`matchOf`) calls `read()` once at the hook call, which reads `state()` untracked, and `live()` (`:126`) reads it again.
4.3 [x] Write a failing case that mounts a component calling each hook under Solid dev and asserts no `STRICT_READ_UNTRACKED`. Then check that the route is on screen without an untracked reactive read (for example `untrack`, or a check inside the proxy's first access).
4.4 [x] Verify: `docs-smoke` `every page hydrates` has no `STRICT_READ_UNTRACKED` warning.
4.5 [x] The five hooks are fixed: `matchOf`'s on-screen check and `live`'s first value read untracked (`tests/integration/hydrate.test.tsx` `data hooks read untracked`, chromium, firefox, webkit). On node-dev-chromium, `docs-smoke` `every page hydrates` now shows one STRICT_READ_UNTRACKED, on `/search?q=route` only, and it is the app's: the search page's render runs `createSignal(props.search.q)`, a one-time read of a reactive prop in the component body, so the draft would not follow a later `q`. The tester fixes the app (Constraints), then 4.4 can pass.

5 [ ] B5 `.head({ meta: { charset } })` warns on the client
5.1 [ ] Repro: the docs root `.head()` sets `meta.charset: "utf-8"`, a documented head field. Load any page in dev.
5.2 [ ] Expected: no warning. Actual: `useHead: <meta> (charset) is shell-only and ignored on the client`, from the client head apply passing charset to `useHead`.
5.3 [ ] Write a failing `client/head/apply.test.ts` case (charset in the merge, no `useHead` call for it on the client). Then emit charset in the server shell only.
5.4 [ ] Verify: no `useHead` warning in `docs-smoke`.

6 [ ] B6 The dev overlay opens for a deferred rejection that `<Errored>` caught
6.1 [ ] Repro: `/changelog`'s `broken` defer rejects with `The stats service is down` under `<Errored>`. Load it in dev after B3 is fixed, or with the root boundaries removed.
6.2 [ ] Expected (`dx/defer.md`, `dx/navigate.md`): a slot inside `<Errored>` does not send Vite's overlay payload. Actual: Vite's overlay opens with that error and its stack, while the `<Errored>` fallback also renders.
6.3 [ ] Write a failing case in `client/navigation/navigate-slots.test.ts` or the document fill path for a caught rejection that must not call the dev sink. Then send the payload only when the rejection reaches `errorRender`.
6.4 [ ] Verify: `docs-data` `defer rejects` sees no `vite-error-overlay` element on `node-dev-chromium`.

7 [ ] B7 `flare({ fonts: { dir } })` 404s every font in dev
7.1 [ ] Repro: the docs config sets `fonts: { dir: "assets/fonts" }` and the root renders `<FontCSS font={inter} />`. Load `/` in dev.
7.2 [ ] Expected: the font files the build emits are also served in dev, at the same registry URL. Actual: `Failed to load resource: 404` for `/fonts/inter/latin.woff2`, the preload, on every page. `packages/core/src/vite/plugin/fonts.ts:23` applies to the client build only (`generateBundle`). It has no dev middleware.
7.3 [ ] Write a failing `vite/plugin/fonts.test.ts` case: a dev server with `fonts.dir` answers the registry URL with the woff2 bytes. Then add the dev serve.
7.4 [ ] Verify: `docs-features` `fonts` is green on `node-dev-chromium`, and `docs-smoke` has no 404.

8 [ ] B8 Dev HTML transform gets a partial document
8.1 [ ] Repro: in dev, load `/api/server/create-server`, a shared `ssr` page under a segment with `cdn`, after one prior load.
8.2 [ ] Expected: the dev handler buffers through `</head>` and transforms a well-formed head (`dx/plugin.md`). Actual: the terminal prints `Unable to parse HTML; parse5 error code eof-in-tag at …/apps/docs/api/server/create-server:1:9916`, pointing mid-attribute inside `<body>` (`…dark:hover:text-white opacity-`). The page still answers 200.
8.3 [ ] Write a failing `vite/dev/handler.test.ts` case with a stored hit body that arrives as one chunk, or a chunk that splits a tag. Then split at `</head>` exactly.
8.4 [ ] Verify: no parse5 error in the dev log while `docs-cache` runs on `node-dev`.

9 [ ] B9 Route builder types do not enforce method order
9.1 [ ] Repro: `createRootLayout("_admin_").headers(...).security(...).head(...)` type-checks under the app tsconfig, then throws `order: head` from `packages/core/src/shared/route-builder/chain.ts:38` on the first request (a 500 on `/admin`).
9.2 [ ] Expected (`dx/builder.md`): a method called after a later one is absent from the type. Actual: `head` stays on the type after `headers` and `security`. The same holds for `createPage("_admin_/admin").authenticate().preloader(...).authorize(...)`: it type-checks, then throws `order: authorize`. Because prerender imports every route module, that one wrong order fails the whole production build, even for a page that is never prerendered.
9.3 [ ] Write a failing `tests/types/propagation.test.ts` case (`method order`: `head` after `headers` is `@ts-expect-error`). Then remove earlier methods from `RouteBuilder` as each step is called (`shared/route-builder/route-types.ts:158`).
9.4 [ ] Verify: `bun run typecheck` passes with the new negative case.

10 [ ] B10 The sitemap drops every non-SSG page under an optional locale root
10.1 [ ] Repro: the docs app's main root is `[[locale]]/_root_`. Build with `prerender.sitemap` and read `client/sitemap.xml`.
10.2 [ ] Expected: a public page whose only param is the absent optional locale (`/search`, `/changelog`, `/playground`, `/examples`, `/[flare]`) is one entry, as a URL with no param segment is (`dx/seo.md`). Actual: 40 entries, all SSG docs and home pages plus `additionalEntries`. Every page that is not built at prerender is missing, so an i18n app's sitemap is SSG-only.
10.3 [ ] Decide in `blueprint/01-decisions.md` whether an absent optional param counts as resolved. Then write a failing `features/seo/vite/sitemap.test.ts` case (`optional absent`) and implement it.
10.4 [ ] Verify: `docs-features` `sitemap` lists `/search` and excludes `/admin`.

11 [ ] B11 `public/` is copied into the server and worker outputs
11.1 [ ] Repro: build the docs app and list the output.
11.2 [ ] Expected: public files ship once, with the client. Actual: `server/` and `worker/` each also hold `favicon.ico`, `icon.svg`, `apple-touch-icon.png`, `icons/*`, `manifest.webmanifest`, and `fonts/mono.woff2`. The worker bundle uploads them as script assets for nothing.
11.3 [ ] Write a failing `vite/plugin/environments.test.ts` case (`ssr` and `worker` set `copyPublicDir: false`). Then set it.
11.4 [ ] Verify: the build output has public files under `client/` only.

12 [x] B12 A route `.security()` makes the CSP nonce differ from the document's, and the page never hydrates
12.1 [x] Repro: the docs `_admin_` root layout has `.security({ "X-Frame-Options": "DENY" })`. On a production build (`node-prod`), GET `/admin` as a guest (401), as `docs.session=bob.reader` (403), and as `docs.session=ada.admin` (200).
12.2 [x] Expected: one nonce per document (`dx/server.md` One nonce). Actual, every time: the header has `script-src 'self' 'nonce-741e…'` while the body's six inline tags carry `nonce="3347…"`. Chromium blocks every inline script and style (`Executing inline script violates … script-src`), and `html[data-flare-hydrated]` never appears. Main-root pages, which have no route `.security()`, match. `packages/core/src/server/security/apply.ts:20` calls `buildCsp` per apply, and `buildCsp` makes a fresh nonce. A route config re-applies after render with a new one.
12.3 [x] Write a failing `tests/integration/nonce.test.ts` case (`route security keeps nonce`): a root with `.security({ "X-Frame-Options": "DENY" })` has a CSP header nonce equal to every body nonce. Then reuse the request's nonce when applying the route config.
12.4 [x] Verify: `docs-server` `route security` and `unauthenticated` are green on `node-prod-chromium`, and `/admin` hydrates.

13 [x] B13 A root layout's `.security()` header override is not applied
13.1 [x] Repro: same as 12.1. The server sets `security: { "X-Frame-Options": "SAMEORIGIN" }`, and the `_admin_` root sets `"DENY"`.
13.2 [x] Expected (`dx/builder.md` `security`): the merge is outside-in, server then layouts then page, and a set key replaces. Actual: `/admin` answers `x-frame-options: SAMEORIGIN` on 200, 401, and 403. The root's `.headers()` (`x-docs-area: admin`) is applied on the same responses.
13.3 [x] Write a failing `server/security/apply.test.ts` or integration case where a root layout's `.security()` key beats the server's. Then collect the root and layout configs into the route config.
13.4 [x] Verify: `docs-server` `route security` sees `x-frame-options: DENY` on `/admin`.

14 [ ] B14 Streaming server functions do not stream on the client
14.1 [ ] Repro: `/playground`, then "Run build". `buildLog` is `createServerFn().input(…).stream(async function* …)`.
14.2 [ ] Expected (`dx/server-fn.md`): the client function returns an async iterator of the yielded values. Actual: `pageerror: _(...)[Symbol.asyncIterator] is not a function`, then an unhandled `HTTP 200`. The log stays empty and the server keeps "running". The boundary transform strips the generator from the client chunk, so `record.stream` is `undefined` there, and `packages/core/src/client/boot/create-client.ts:145` routes the call to `callServerFn` (a JSON POST) instead of `streamServerFn`.
14.3 [ ] Write a failing case (a client-graph stream function whose body was stripped is still called through `streamServerFn`). The kind must survive the strip, for example a `__stream: true` field the transform writes.
14.4 [ ] Verify: `docs-data` `stream` and `stream abort` are green on `node-prod-chromium`.

15 [ ] B15 `useSuspenseQuery` on a prerendered page stays on its fallback forever
15.1 [ ] Repro: an SSG doc page (`/docs/auth`, prod) renders `<Feedback>`, which is `useSuspenseQuery(serverFnQueryOptions(feedbackCount, …))` under `<Loading>`.
15.2 [ ] Expected: the stored shell holds the fallback, and the client runs the query after hydrate, or the prerender resolves it. Actual: `#feedback-loading` stays. No request to `feedbackCount` is ever sent, and no error is logged. This was seen with hydration otherwise working (B2 and B3 sidestepped).
15.3 [ ] Write a failing integration case: a stored render with a pending query under `<Loading>`, hydrated, runs `queryFn` once. Then fix the hand-off.
15.4 [ ] Verify: `docs-data` `mutation sets data` is green.

16 [ ] B16 `InterceptOutlet` renders nothing on an intercepting navigation
16.1 [ ] Repro: on `/`, type "route" in the header search and press Enter. Search is `.intercept({ from: ["[[locale]]/_root_/", …], render: "search-modal" })`, and the root renders `<InterceptOutlet>`.
16.2 [ ] Expected (`dx/navigate.md` InterceptOutlet): the overlay opens over the mounted home page. Actual: `GET /search?q=route&_flare=data` succeeds, the URL becomes `/search?q=route`, and the home page stays, but the outlet child is never called: no `#search-modal`, no error. The generated record does carry `intercept: {"from":[…],"render":"search-modal"}`.
16.3 [ ] Write a failing `shared/components/intercept-outlet.test.tsx` or e2e-level case where the `from` id is a root home page (`[[locale]]/_root_/`). Then fix the overlay open.
16.4 [ ] Verify: `docs-navigation` `search intercept` is green.

17 [ ] B17 A client `rewrite` is not applied to anchor clicks
17.1 [ ] Repro: the router has `rewrite(location)` mapping `/guide/*` to `/docs/*`. On `/examples`, click `<a href="/guide/routing">`.
17.2 [ ] Expected (`dx/router.md` rewrite): the rewrite runs on the client before match, so the click is a client navigation to the routing doc. Actual: a full document load of `/guide/routing`, which the server answers 404. The anchor delegation checks for a route before it applies the rewrite. Leaving the page also logs `pageerror: Transition was skipped`, an unhandled view-transition rejection.
17.3 [ ] Write a failing `client/navigation` case: a same-origin anchor whose href matches only after `rewrite` follows the client router. Separately, handle the skipped-transition rejection.
17.4 [ ] Verify: `docs-routing` `client rewrite` is green with no page error.

18 [ ] B18 A `shallow` link runs the loader
18.1 [ ] Repro: on `/examples?tab=cache`, click the `shallow` link that adds `note=shallow`.
18.2 [ ] Expected (`dx/link.md`): `shallow` changes the URL and does not run loaders. Actual: `GET /examples?note=shallow&tab=cache&_flare=data` is sent and `#examples-request` changes (a new loader run).
18.3 [ ] Write a failing `client/navigation/navigate.test.ts` case (`shallow` sends no request). Then fix it.
18.4 [ ] Verify: `docs-navigation` `shallow search` is green.

19 [ ] B19 The route `cache.client.staleTime` is ignored
19.1 [ ] Repro: examples has `.cache({ client: { staleTime: "30s" } })`, and codegen writes `client: {"staleTime":"30s",…}` on the record. Go `/` → Examples (client nav) → Routing → Examples, within a few seconds.
19.2 [ ] Expected (`dx/cache.md` client): a cached match younger than `staleTime` is reused with no data request. Actual: the second visit sends `GET /examples?_flare=data` again. The route's durations are strings, and the router's own default is a number (`shared/router/create-router.ts:116`), so check the parse.
19.3 [ ] Write a failing `client/router/match-cache.test.ts` case with a route `staleTime: "30s"` string. Then parse durations.
19.4 [ ] Verify: `docs-cache` `client cache stale` and `cache deferred` are green.

20 [ ] B20 The Image blur placeholder never clears when the image loads before hydrate
20.1 [ ] Repro: the home hero is `<Image fill priority placeholder="blur" blurDataURL={…}>`. Load `/` in prod.
20.2 [ ] Expected (`dx/features.md` Image): the blur is the background until load, then it is removed. Actual: `img.complete` is true, and the inline `background-image:url("data:image/svg+xml…")` stays forever. A priority image usually loads before hydration attaches `onLoad`, so the event is missed.
20.3 [ ] Write a failing `features/image/shared/image.test.tsx` case (an already-complete image at hydrate clears the placeholder). Then check `complete` after mount.
20.4 [ ] Verify: `docs-features` `image responsive` is green.

21 [ ] B21 `withFetchDedupe` does not dedupe across loaders of one request
21.1 [ ] Repro: the docs layout loader and the doc page loader both call `withFetchDedupe(serverCtx().upstream)("https://upstream.flare.test/stats")` (`apps/docs/src/stats.ts`). The upstream counts calls per request, and the page prints it.
21.2 [ ] Expected (`dx/server.md` withFetchDedupe): the second identical GET in one request reuses the first, so `#fetch-calls` is `1`. Actual: `2`. Each loader runs under a child event (`server/loaders/scope.ts:26`, `Object.create(parent)`), and the first dedupe call inside a loader writes its store onto that child (`server/context/fetch-dedupe.ts` `reset` → `Reflect.set(event, STORE_KEY, …)`), so siblings never share it.
21.3 [ ] Write a failing `server/context/fetch-dedupe.test.ts` case: two calls under two loader-scope children of one request event make one upstream call. Then keep the store on the root request event.
21.4 [ ] Verify: `docs-data` `fetch dedupe` is green.

22 [ ] B22 A segment's `cdn` default is not applied
22.1 [ ] Repro: `(guide)/api/api.segment.ts` is `createPathSegment(…).cache({ cdn: { maxAge: "1m", swr: "10m", tags: ["api-reference"] } })`. Its page `api/[...path]` sets `cache: { ssr: { ttl: "10m", tags: ["api"] } }`. GET `/hr/api/server/create-server` twice (a tag in the URL, so no locale negotiation applies).
22.2 [ ] Expected (`dx/cache.md` How the decision is made): `cdn` on a segment is a default for the pages under it, so the shared public hit sends `public, max-age=0, s-maxage=60, stale-while-revalidate=600` and `Cache-Tag: api-reference`. Actual: `flare-cache: hit` with `cache-control: private, no-store` and no `Cache-Tag`. A page's own `cdn` (home on `/hr`) does send the public header.
22.3 [ ] Write a failing `server/cacheability/decide.test.ts` case (`segment cdn` through the real chain, not a hand-built one). Then merge segment `cdn` into the chain.
22.4 [ ] Verify: `docs-routing` `segment cdn` is green.

23 [ ] B23 Locale negotiation overwrites a `.response()` page's Cache-Control
23.1 [ ] Repro: `/llms.txt` is a `.response()` page under the `[[locale]]` root that returns `cache-control: public, max-age=300`.
23.2 [ ] Expected (`dx/cache.md`): a `.response()` page is outside the page decision and keeps its own `Cache-Control` unless the chain reads auth. Actual: `/llms.txt` answers `private, no-store`, while `/hr/llms.txt` answers `public, max-age=300`. The "negotiated private" rule for documents with no tag (`dx/features.md` i18n) is being applied to a response route.
23.3 [ ] Write a failing `features/i18n/server/middleware.test.ts` or integration case: a `.response()` route with no path tag keeps its Cache-Control. Then scope the rule to rendered documents.
23.4 [ ] Verify: `docs-server` `response route` is green.

24 [ ] B24 The e2e `node-dev` projects need a Node with type stripping
24.1 [ ] Repro: with Node 22.12, the documented floor (`blueprint/01-decisions.md` runtimes), run `bunx playwright test -c packages/core/tests/e2e/playwright.config.ts --project=node-dev-chromium`.
24.2 [ ] Expected: the dev boot works on the supported Node. Actual: every boot fails with `failed to load config from …/vite.config.ts … ERR_UNKNOWN_FILE_EXTENSION ".ts" for packages/core/src/exports/vite.ts`. The workspace exports raw TS, and Node 22.12 has no default type stripping (22.18+ does). `bunx --bun playwright test` works, because the child `node` is then Bun. CI does not pin Node in `.github/workflows/ci.yml`.
24.3 [ ] Decide: pin Node ≥ 22.18 (or 24) for the e2e jobs and in the documented floor for working in the repo, or have `boot.ts` start vite with `--configLoader native` under Bun. Record it in B70.
24.4 [ ] Verify: `bun run test:e2e -- --project=node-dev-chromium` boots on the pinned runtime.

25 [ ] B25 `createTestServer` is unusable once the app declares `serverContext`
25.1 [ ] Repro: the docs app's `FlareRegister` declares `serverContext`, and `tests/integration/docs.test.ts` calls `createTestServer(router)`. Run `bun run typecheck`, whose last step compiles `packages/core/tests/e2e/apps/docs/tsconfig.json`.
25.2 [ ] Expected (`dx/testing.md`): the helper boots any app's router for its tests. Actual: `packages/core/src/testing/harness.ts(17,30): error TS2345: Argument of type '{ router: Router; }' is not assignable to parameter of type 'ServerOptions<FlareRegister>'`. `ServerOptions` requires `serverContext` once the register declares it (`server/lifecycle/options.ts` `ContextOption`). At runtime, any loader that calls `serverCtx()` would throw, because the helper has no way to pass one.
25.3 [ ] Decide in `dx/testing.md`: either `createTestServer(router, { serverContext? })` (a revision, since the doc says there is no second argument), or a documented and typed refusal. Then make `harness.ts` type-check under any register.
25.4 [ ] Verify: `bun run typecheck` exits 0, and `tests/integration/docs.test.ts` passes.

26 [ ] B26 `dirOf` says `ltr` for Urdu and Kashmiri on Bun
26.1 [ ] Repro: `bun -e 'console.log(new Intl.Locale("ur").maximize().script)'` prints `Aran`. Node prints `Arab`. Under `bun --bun run --filter @lovrozagar/flare test`, `features/direction/shared/script-of.test.ts` `no text info` fails: `ur` maps to `ltr`. `ks` maximizes to `Aran` too.
26.2 [ ] Expected (`dx/features.md` Direction): the server and every browser compute the same dir from `maximize().script`. Actual: Bun's ICU gives the Nastaliq script `Aran`, which is right-to-left but missing from the RTL set in `packages/core/src/features/direction/shared/script-of.ts`. A Bun server renders `dir="ltr"` for an Urdu page that Chromium resolves `rtl`, so direction is wrong and hydration disagrees.
26.3 [ ] Add a failing `script-of.test.ts` case (`aran`: a maximized `Aran` script is `rtl`). Then add `Aran` to the set.
26.4 [ ] Verify: `script-of.test.ts` passes under both `bun run test` and `bun --bun run --filter @lovrozagar/flare test`.

27 [ ] B27 The unit suite is red on macOS at `HEAD` before any docs change
27.1 [ ] Repro: a detached worktree of `746b8d1`, `bun install --frozen-lockfile`, then `bun run test` (Node 22.12) and `bun --bun run --filter @lovrozagar/flare test` (Bun 1.4.2). The docs work changes neither failing set: the Bun runs on `HEAD` and on this tree list the same 21 failures.
27.2 [ ] Under Node 22.12, every test that spawns vite from the workspace fails with `ERR_UNKNOWN_FILE_EXTENSION ".ts"` (B24), and `tests/structure/*` and `golden.test.ts` fail with `Failed to import module "unrun"`, which is not installed.
27.3 [ ] Under Bun, these fail: `boot.test.ts` (`serves`, `node prod`, `bun prod`, `workers prod`, `basepath`, `failed boot`: `spawn /bin/false ENOENT`); `tripwire.test.ts` (6 cases: the fixture build in the OS temp dir fails its own boundary check); `environments.test.ts` (`order`, `urls agree`, `chunk urls`: "The client entry src/client.tsx is not in the Vite manifest"); `flare.test.ts` `hmr keeps split`; `inject.test.ts` `reset on`; `adapters/stores/fs/store.test.ts` `dir` (`ENOENT … .flare/cache`; under Bun the default relative dir resolves against the package cwd, so a run leaves `packages/core/.flare/cache/*.json` in the repo and `check-tree` then fails); `exports.test.ts` `font subpath`, `font barrel` (`ERR_MODULE_NOT_FOUND` instead of `ERR_PACKAGE_PATH_NOT_EXPORTED`); and `script-of.test.ts` `no text info` (B26). Several are fixtures built outside the repo, where Bun auto-installs a different Solid. The docs scratch build hit the same thing (`Export named 'sourceOwners' not found in … ~/.bun/install/cache/@solidjs/signals@2.0.0-36ada47…`).
27.4 [ ] Pin the supported runtimes for the suite (B24), add `unrun` to devDependencies if the structure tests need it, and build test fixtures under the repo's `node_modules/.flare-e2e`, as `boot.ts` does. Then split each remaining Bun-only failure into its own phase here.
27.5 [ ] Linux, 2026-10-13 (Bun 1.4.3, Node 24.21): `bun run test` under Node 24 exits 0. `bun --bun run --filter @lovrozagar/flare test` exits 1 with 3 failures, all on the macOS list above: `store.test.ts` `dir` (it also leaves `packages/core/.flare/cache` in the repo) and `exports.test.ts` `font subpath` and `font barrel` ("The URL must be of scheme file"). Vitest also reports 12 unhandled errors under Bun, one per "dev throw" case in the `view-transition-boundary`, `image`, `link`, and i18n provider tests: each asserted throw also escapes as an uncaught exception. They go to 8.12 as Bun-only work. The other macOS Bun failures pass on Linux, and Linux Bun maximizes `ur` and `ks` to `Arab` (B26 still adds `Aran`).
27.6 [ ] Verify: `bun run test` exits 0 on macOS and Linux.

28 [x] B28 CRITICAL: a client that disconnects mid-response kills the Node and Bun server
28.1 [x] Repro: build the docs app. Serve it with `createNodeListener(server)` under Node 24.21, or `createBunFetch(server)` under Bun 1.4.2. Open a raw HTTP request to `/playground` (a live defer) and destroy the socket after the headers, or on Node 24 even before them. Then GET `/healthz`. The scratch repro is `disconnect.mjs`: five requests per case, then a health check.
28.2 [x] Expected: a closed tab ends that response only. Actual: the process exits. `/healthz` and every later request get `ECONNREFUSED`. The log shows Solid's `RequestEvent is missing … non-managed async scope` twice, then the uncaught `Error: the query client getter runs inside a request on the server` (`features/query/client/getter.ts`). The render keeps running after the abort, outside the request scope, and the root's `getQueryClient()` throws with nothing to catch it. Workers survives, because an isolate error does not end the process. In the Playwright grid this is the `ERR_CONNECTION_REFUSED` that `docs-resilience` `network failure` hits on node-prod and bun-prod, right after `missing chunk reload` closes a page while its reload document is still streaming.
28.3 [x] Write a failing `adapters/node/listener.test.ts` and `adapters/bun/serve.test.ts` case: a streaming document whose client aborts after the headers leaves the server answering. Stop the render when the request aborts, and never let a render-phase throw after an abort escape as an uncaught exception.
28.4 [x] Verify: `disconnect.mjs` reports 200 after every case on Node and Bun, and `docs-resilience` `network failure` is green on node-prod and bun-prod.
28.5 [x] Residual, filed upstream: an app `onCleanup` that throws during disconnect disposal still escapes Solid's abort listener (dx/server.md "Client disconnect"). Solid issue: https://github.com/solidjs/solid/issues/4029

29 [ ] B29 Workers formats numbers differently from Node, Bun, and the browser
29.1 [ ] Repro: `/ar/search?q=r` on workers-prod. The footer is `formatMessage("{n, plural, one {# release} other {# releases}}", { n: 14 })` inside `LocaleProvider` (`ar`).
29.2 [ ] Expected: the server and the client render the same text for the same tag (`dx/features.md` i18n formatMessage). Actual: the digits depend on the runtime's ICU. workerd and genuine Node 24.21 (ICU 78.3, CLDR 48.0: `new Intl.NumberFormat("ar").format(14)` is `14`) render `14 releases`. Bun 1.4.2 renders `١٤ releases` (Arabic-Indic digits), as the browsers do. A page's numbers change with the server runtime and can disagree with a client re-render.
29.3 [ ] Decide whether `formatMessage` pins a numbering system (for example `nu` from the tag, or `Intl.NumberFormat(tag, { numberingSystem })`) so every runtime agrees. Then write a failing `features/i18n/shared/format.test.ts` case that runs the same message under each runtime's expectations.
29.4 [ ] Verify: `docs-features` `format message` is green on workers-prod.

30 [ ] B30 A data answer from a newer deploy does not reload the document
30.1 [ ] Repro: on `/docs/routing`, let every `?_flare=data` response carry `flare-build: a-newer-deploy` (Playwright `route.fulfill` with the real body), then click a sidebar link. This was seen on bun-prod, workers-prod, and node-dev Firefox and WebKit, with hydration working (B2 and B3 sidestepped).
30.2 [ ] Expected (`dx/navigate.md`): a navigation whose response `flare-build` differs from `self.flare.build` document-loads once under the `flare_chunk_reload` guard, and does not apply frames. Actual: no document request. The client applies the frames from the other build. With the real app, the case falsely passes, because dead clicks (B2, B3) fall through to a native page load.
30.3 [ ] Write a failing `client/navigation/navigate.test.ts` case (`build mismatch`) through the real fetch path. Then compare the header on every data response.
30.4 [ ] Verify: `docs-resilience` `build mismatch reload` is green with hydration working.

31 [ ] B31 Concurrent misses of one shared key render once each
31.1 [ ] Repro: on a production build, send 8 parallel GETs to a never-requested shared SSR URL, `/hr/api/routes/create-page`, and read `#api-rendered-by` from each body.
31.2 [ ] Expected: one render fills the store and the others wait for it (a single-flight miss). `dx/cache.md` names an in-flight slot only for the stale refresh, so decide whether misses join it. Actual: 8 distinct request ids, so 8 renders, on node-prod (Node adapter on Bun) and bun-prod. One scratch run on node-prod rendered once, so the result depends on timing. Without coalescing, a cold popular page makes every concurrent visitor pay for a render.
31.3 [ ] Decide in `blueprint/01-decisions.md` whether a miss takes the in-flight slot. If yes, write a failing `server/cache/read.test.ts` case (`concurrent miss`).
31.4 [ ] Verify: `docs-resilience` `concurrent misses render once` is green, or the case is removed with the decision.

32 [ ] B32 Open: dev clicks time out in Firefox and WebKit
32.1 [ ] Repro: the B2/B3-sidestepped run on node-dev-firefox and node-dev-webkit. `docs-navigation` `scroll restoration` and `docs-routing` `error boundary reset` fail with `click: Test timeout … element is visible, enabled and stable`, retried. Something keeps intercepting the pointer. The error page opens Vite's overlay by design, and the test now presses Escape. `scroll restoration` has no thrown error.
32.2 [ ] Expected: the same cases pass on node-dev-chromium. This is not attributed yet: re-run after B2, B3, B6, and B7 are fixed, and split it into a real phase if it remains.

33 [ ] B33 Open: a stored write lands after the response, so an immediate repeat misses
33.1 [ ] Repro: genuine Node 24, node-prod. GET `/changelog` (ISR), then GET it again at once. Or GET `/api/routes/create-page` twice (shared SSR). Sometimes the second answer is `flare-cache: miss` (seen once on the webkit project, once on firefox; these are API requests, so the browser does not matter).
33.2 [ ] The write is scheduled with `waitUntil` after the body. A fast follow-up request reaches the store first, renders again, and writes again. Decide whether that is the contract: `dx/cache.md` says "stored on the first request". If it is, document the window. If not, make the miss await the in-flight write (see B31). The specs now poll for the hit.

34 [ ] B34 Playwright's Firefox driver never reports a page's main-world context, so a wait on it stalls
34.1 [ ] Repro: the retired `i18n.test.ts` `theme no flash` on node-prod-firefox at `746b8d1`, genuine Node 24.21. With tracing off, 0 of 120 runs failed locally, and CI run 38362077182 failed once (1 failed, 157 passed). With `--trace retain-on-failure`, 1 to 2 runs in 100 fail (1/40, 2/40, 2/100, 4/500). The failing step is `flarePage(page).load` on the second page of a context that has `context.addInitScript`: `waitForSelector("html[data-flare-hydrated]")` runs out the 30s timeout.
34.2 [ ] The framework is right, and Juggler (Playwright's Firefox driver) is at fault. During the stall, a screenshot of that page shows `#theme` as `dark`, which only the hydrated client writes (the server renders `system`). A live Gecko profile shows the page's content process idle in its event loop. The first page still answers `evaluate`, and a fresh third page in the same context hydrates. The `pw:protocol` log of 400 sessions has one outlier. After the second page's navigation destroys its contexts, Juggler emits `Runtime.executionContextCreated` for `__playwright_utility_world__` only, never the main world, then `navigationCommitted`, `load`, and `sameDocumentNavigation`. Playwright waits for a main-world context that never comes, so it never sends the evaluate. Closing the first page before opening the second does not change the rate (4/500).
34.3 [ ] Separate spec race found on the way: `tabs sync` started `nextStorageEvent(first)` without awaiting its listener before `second` wrote `localStorage`, so the event could fire first (31 of 80 runs with tracing on, 2 of 20 off). With the listener registered and awaited first, 40 of 40 passed. The docs spec now registers it first.
34.4 [ ] After phase 6 (hydration), compare 500 traced runs of the case seeding storage with `context.addInitScript` against 500 seeding it with a `storageState` context. If `addInitScript` is the trigger, the spec seeds through `storageState`, and a Playwright issue is filed with the protocol excerpt.
34.5 [ ] Verify: `docs-features` `theme no flash` on node-prod-firefox at `--repeat-each 50` has 0 failures.

35 [ ] B35 The `createPage` size budget depends on the machine's Bun
35.1 [ ] Repro: CI run 38362077182's lint job fails `tests/size/size.test.ts` `createPage alone` with 1137 against the 1100 budget, while this machine measures 1096.
35.2 [ ] Cause: `tests/size/breakdown.ts` spawns `bun build --minify` from `PATH`, so the number is that Bun's minifier output. On one tree, with Node 24.21 measuring, Bun 1.3.11 (CI's `BUN_VERSION` and `packageManager`) gives 1137 and Bun 1.4.3 gives 1096. Plain gzip is 1429 under both, so zlib and Node are not the variable.
35.3 [ ] Fix (`bits/01` `createPage alone`): measure through the lockfile's Vite 8.1.4 `build` API in library mode (Rolldown with the Oxc minifier), gzip level 9, with no `PATH` tool. Failing test first: `size.test.ts` measures with an empty `PATH`. Re-baseline `budget.json` to the new number rounded up to the next multiple of 10, with the breakdown output in the commit.
35.4 [ ] Verify: the measurement is the same under Node 24 and under `bun --bun`, and CI's lint job passes.

36 [ ] Coverage and failure map
36.1 [ ] Grid run on 2026-10-13, macOS, real app. Smoke on all 12 projects: dev fails every page (B2–B5, B7); production fails only `/admin` (B12) and `click through` (B2/B3 cascade) on node, bun, and workers × chromium, firefox, and webkit. Deep plus resilience on all 12 projects: 654 passed, 581 failed. The B2/B3-sidestepped pass on bun-prod and workers-prod × 3 engines, plus node-dev firefox and webkit: 619 passed, 204 failed. Earlier node-prod × 3 engines: 224 of 285 passed.
36.2 [ ] Under `bunx --bun`, the `node` the harness spawns is Bun, so "node-dev" and "node-prod" above exercised the Node adapter on Bun. A genuine Node 24.21 grid (PATH set to Node 24, no `--bun`; node-dev and node-prod × 3 engines, smoke plus deep plus resilience) gave 353 passed, 350 failed, 35 skipped. It fails the same cases, plus `format message` (B29: Node ICU), and once each `isr stored` and `shared ssr` (B33). It confirms B28 on real Node.
36.3 [ ] Every failing case, mapped: `docs-smoke` → B2 B3 B4 B5 B7 B12. `docs-routing`: `client rewrite` B17, `segment cdn` B22, `error boundary reset` B2/B3 (B32 in dev). `docs-navigation`: `search intercept` B16, `shallow search` B18, `view transition scoped` / `view transition off` / `prefetch *` / `blocker` / `hooks` / `lifecycle` / `locale switch` / `navigate state replace` / `revalidate` / `scroll restoration` B2/B3, `progress bar` B2. `docs-data`: `stream`, `stream abort` B14; `mutation sets data` B15; `fetch dedupe` B21; `defer rejects` B6 (dev); `defer two skeletons`, `stream fill`, `env fns`, `query suspense`, `server fn post validates`, `safe error`, `unsafe error` B2/B3. `docs-cache`: `client cache stale`, `cache deferred` B19; `revalidate tag` B12; `isr stored`, `shared ssr` B33 (Node 24, once each). `docs-server`: `unauthenticated`, `login cookie` B12; `route security` B12 B13; `response route` B23. `docs-features`: `sitemap` B10; `image responsive` B20; `fonts` B7 (dev); `format message` B29 (workers, Node 24); `theme *`, `rtl *`, `tabs sync`, `set locale persists` B2/B3. `docs-resilience`: `network failure` B28; `build mismatch reload` B30; `concurrent misses render once` B31; `overlay history` B16; `abort keeps latest` B2/B3. The one-off `bun-prod-firefox` `tabs sync` timeout in the sidestepped pass did not repeat.
36.4 [ ] Not covered, and why: dev HMR (a spec may not write into the app, per B70), `Secure` cookie flags and HSTS (the harness serves http only), `trustProxy` and `clientIp` (not exported in v1), the external IndexNow, Google, and Bing submitters (network), `basePath` (its own app), codegen build errors (they break the build), Deno and Windows (unsupported), ISR stale refresh timing (24 h TTL in this app), and the golden tarball over the docs app (it still packs `minimal`).

## Verify

37 [ ] Verify
37.1 [ ] `bun run test` exit 0 with 100% per-file coverage
37.2 [ ] `bun run test:e2e` exit 0: every `docs-*` spec green on the projects this OS owns
37.3 [ ] `bun run --bun --cwd packages/core/tests/e2e/apps/docs dev`: every page in the docs route map loads with an empty console
