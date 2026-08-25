# Flare v2 — Question Bank

Every question answerable from the specs. Per-spec questions kept as-is (answers are direct spec reads). Complex cross-cutting questions have answers.

---

## Per-Spec Questions

> These are direct reads from individual specs — not answered here to keep the doc focused on the hard stuff. If you can't answer one, re-read the spec.

### Router Primitives (01)

- What data structure does `matchRoute` use, and what's its time complexity?
- What's the match priority order when multiple routes could match?
- How does case sensitivity work — static segments vs params?
- What's the `matchId` format, and why does it include `deps`?
- How does `deriveLayouts` determine which layouts wrap a page?
- What does `stripGroups` do and why is it needed?
- How are optional catch-all params (`[[...slug]]`) different from required (`[...slug]`)?
- What happens when an optional single param `[[locale]]` is missing — how is the URL cleaned?
- How does `buildLocation` differ from `buildUrl`?
- What's a `VirtualPath` vs a URL path?

### Errors (02)

- What error classes does Flare provide and how are they discriminated?
- Why use `readonly name = "..." as const` instead of `instanceof` alone?
- How does `RedirectResponse` distinguish internal vs external redirects (`to` vs `href`)?
- What's the boundary mapping — which error class maps to which boundary type?
- Why do helper functions (`notFound()`, `redirect()`) return `never`?
- How is `ServerFnValidationError` different from other errors?
- What's `NavigationError` for and when is it thrown?

### URL Utilities (03)

- In what order does `resolvePathParams` process the 4 param types, and why?
- What happens when an optional single param is removed mid-path vs start-of-path?
- How are search params serialized — sorting, null handling, boolean handling, empty string?
- Why is `encodeURIComponent` applied to all values?
- What error is thrown for a missing required param vs using an array for a single param?

### Route Builder (04)

- How does the immutable chain API enforce method ordering?
- How does generic narrowing work through the chain — what gets narrowed at each step?
- What's the runtime execution order of route handlers?
- How does `.authenticate()` resolve the `Auth` generic — called vs not called? What is `callerData`?
- How does preloader context accumulate across root → layout → page (intersection types)?
- What's the difference between `preloader` and `loader`?
- How do loaders run in parallel while preloaders run sequentially?
- What is `LoaderCause` and how is it used?
- How does `DeferFn` integrate with the defer system?
- What does `HeadConfig` look like and how does the head chain work?
- How do `ResponseHeaders` merge across the chain?

### Server Context (05)

- How does per-request context work using `AsyncLocalStorage`?
- Why is `node:async_hooks` compatible with Cloudflare Workers?
- How is the nonce generated and what's it used for?
- What happens when you call `getServerRequest()` outside a request context?
- How is the request context store typed — why `Map` instead of a typed object?
- How does concurrent request isolation work?

### Loader Pipeline (06)

- What are the 6 phases of `runPipeline` and their order?
- Why does input validation fail fast (before any other phase)?
- How does authentication run once per request even with multiple routes?
- How are preloader and authorize interleaved sequentially?
- How do loaders run in parallel, and what happens when one errors?
- How does error isolation work — does a sibling loader error abort others?
- When multiple loaders throw redirects, which wins?
- How do preloader snapshots work (frozen copy via spread)?
- What's in `PipelineMatch` — what fields does each match carry?

### Defer (07)

- What is a `Deferred` and how does it enable streaming?
- What are the two `Deferred` shapes — server-side vs client-side?
- How are deferred keys auto-generated (`d0`, `d1`, ...)?
- How does deduplication work — same key returns existing entry?
- When does the promise start — at `defer()` call or later?
- What's the lifecycle: server → serialization → streaming → client?
- How does `DeferContext` scope deferreds per route via `matchId`?
- Why does the server Deferred have `promise` but the serialized marker strips it?

### SSR (08)

- What's the component tree structure for SSR rendering?
- Why is `NoHydration` used for the doc shell but not the app content?
- How does `<SSRContextProvider>` wrap the SSR tree (Solid 2 has no `sharedConfig.context`)?
- What's the head merge strategy — child overrides scalar, merge keys object, concatenate array?
- In what order are scripts injected (flare state → entry → modules)?
- How does status derivation work — what's the priority order?
- What fields does `FlareState` contain, and why single-char keys?

### NDJSON Server (09)

- What message types exist and what are their single-char type keys?
- What's the difference between streaming and non-streaming NDJSON responses?
- When is each response type used (deferred exist vs not)?
- What's the message order for streaming: loaders → heads → ready → chunks → done?
- How are deferred values serialized in loader messages?
- What request headers trigger NDJSON mode?
- Why is there no `t:"q"` message?
- How does `Promise.allSettled` ensure `done` is always sent?
- What happens when `flare-stale` specifies specific matchIds?

### Boundaries (10)

- What are the 3 boundary types and which errors trigger each?
- How does the walk-up chain work?
- How does the `<Await>` state machine work?
- How does boundary reset work?
- How does `<Await>` handle pre-resolved data?

### State Parser (11)

- What does `parseFlareState` validate on `self.flare`?
- How does `hydrateLoaderData` convert deferred markers to real promises?
- What's a `DeferredResolver` and how is the resolver map keyed?
- How does `isDeferredMarker` differ from `isDeferred`?

### Caches (12)

- How is `matchCache` keyed and what does each entry store?
- How is `prefetchCache` keyed and what's the LRU strategy?
- How does staleness work?
- What are the default values for `gcTime`, `staleTime`, `prefetchStaleTime`?

### NDJSON Client (13)

- How does `fetchNDJSON` consume a streaming response?
- How does the buffer approach handle partial lines across chunks?
- When does `fetchNDJSON` return — on `t:"r"` or `t:"d"`?
- How does abort/cancellation work?
- How is the resolver map shared between loader and chunk processing?

### Hydration (14)

- What are the 6 steps of the hydration bootstrap?
- Why does `solidHydrate` need a `<Dummy>` wrapper?
- What does `data-flare-hydrated` on `<html>` signal?
- What does `waitForLazyPreloads` ensure before hydration?

### Navigation (15)

- What are the 14 steps of the `navigate` flow?
- How does abort previous navigation work?
- How does scroll restoration differ between forward nav and popstate?
- How do view transitions wrap state updates?
- How does `navigationVersion` prevent stale updates?
- How does prefetch work?

### Link (16)

- How does `<Link>` decide between `<a>` vs `<span>`?
- How does click interception work?
- What prefetch strategies exist?
- How does `HasRequiredParams` conditionally require `params`?

### Outlet & FlareProvider (17)

- How does `Outlet` depth tracking work via `DepthContext`?
- How does layout persistence work?
- How are error boundaries created per-depth?
- How does `useBlocker` intercept navigation?
- What's the `{ from }` pattern for type-safe route data access?

### Registry (18)

- How does server-side Proxy tracking work via `AsyncLocalStorage`?
- How does `FlareState.dk` enable client preloading of dynamic chunks?

### Generators (19)

- How does file scanning find route definitions?
- What does the generated manifest contain?
- How does `FlareRegister` augmentation provide type-safe route references?

### Plugins (20)

- What 5 plugins does `flare(config)` return?
- How does the server function plugin inject deterministic IDs?

### Config (21)

- What are all the defaults?
- What security headers and CSP defaults does Flare apply?

### Middleware (22)

- What are the 3 middleware result types?
- Why do response handlers apply for `next` and `respond` but NOT `bypass`?
- How does the recursive execution chain work?

### Server Functions (23)

- How does the immutable chain work?
- What's the URL pattern?
- What error status codes map to which error types?

### Server Handler (24)

- What are the 17 steps of the request handling flow?
- How does URL normalization work?
- How is navigation format determined?
- How do response handlers from middleware apply after rendering?

### Router Config (25)

- What are all `FlareState` single-char keys?
- How does `createRouter` config flow from server to client?
- What fields are serializable vs non-serializable in `RouterConfig`?
- How does `hydrate(router)` use the router config?
- What's the relationship between `RouterConfig` options and per-route `.options()` overrides?

### History (26)

- How is `HistoryState` structured?
- How does the scroll store work?
- Why double rAF for scroll save/restore?
- How does `historyIndex` enable view transition direction detection?

### Head Client (27)

- How does two-level tracking work?
- What's the 3-phase `applyPerRouteHeads` process?
- Why are scripts additive only?

### Theme (28)

- How does the flash prevention script work?
- How does transition disabling work when theme changes?

### Direction (29)

- How does `getDirFromLocale` work?
- How does direction integrate with i18n middleware?

### Styles (30)

- How does CSS scoping work?
- How does SSR → client hydration work for scoped styles?

### Preload (31)

- How does retry work — single retry, 1s delay, max 2 attempts?
- What happens after exhausted attempts?

### Dedupe (32)

- How does fetch deduplication work — only GET/HEAD?
- Why exclude trace headers from the dedup key?

### Query Client (33)

- How does `deferStream: true` wrap queries in Deferred markers?
- How does `getTrackedQueries()` collect states for `FlareState.q`?

### Lazy (34)

- How does `lazy` differ from `clientLazy`?
- How does `waitForLazyPreloads` gate hydration?

### Testing (35)

- How does hydration detection work?
- How does CSR navigation detection work?

### Middleware Builtins (36)

- How does `htmlCache` implement SWR with nonce extraction?
- How does `i18n` detect locale?
- Which builtins return `bypass` vs `respond` vs `next`, and why?

### Components (37)

- How does `<Await>` handle the full state machine including SSR pre-resolution?
- How does `devErrorStore` deduplicate errors via hash?

---

## Complex Cross-Cutting Questions & Answers

### Route Structure & Layouts

**Q: Can you have multiple root layouts? How does the tree support `_root_`, `_docs_`, `_admin_` simultaneously?**

A: Yes. Multiple root layouts are supported. `insertRoute` (spec 01) inserts by **variablePath** (the URL path), not virtualPath. But the route tree is a single tree. Different root layouts (`_root_`, `_docs_`) only differ in their virtualPath prefix — their URL paths can overlap or be separate. The `routeTree` in `ServerHandlerConfig` is one tree. `deriveLayouts` uses the virtualPath to determine which root layout + nested layouts wrap a page. So `_root_/about` and `_docs_/getting-started` coexist in the same tree, each with their own root layout component.

**Q: What is the maximum depth of layout nesting? Is there a limit?**

A: No explicit limit. `deriveLayouts` (spec 01) walks virtualPath segments and builds cumulative layout keys. `_root_/(a)/(b)/(c)/(d)/(e)/page` produces 6 layouts: `_root_`, `_root_/(a)`, `_root_/(a)/(b)`, etc. Outlet (spec 17) uses `DepthContext` which is just an incrementing integer. The only practical limit is rendering performance.

**Q: If `_root_/(auth)/(dashboard)/settings` has group layouts `(auth)` and `(dashboard)` — does the page get 3 layout wrappers?**

A: Yes. `deriveLayouts("_root_/(auth)/(dashboard)/settings")` → `["_root_", "_root_/(auth)", "_root_/(auth)/(dashboard)"]`. Three layout components wrap the page, at depths 0, 1, 2. The page renders at depth 3.

**Q: How does `deriveLayouts` decide what's a layout segment vs a URL segment? Given `_root_/(auth)/products/(detail)/[id]` — how many layouts, and what are their keys?**

A: Layout segments are `_root_` (root layout pattern), `(group)` segments, and `[param]` segments used in layout positions. `deriveLayouts` keeps virtual segments (`_root_`, `(groups)`, `[params]`) and skips URL segments (plain strings like `products`). For `_root_/(auth)/products/(detail)/[id]`: layouts are `["_root_", "_root_/(auth)", "_root_/(auth)/(detail)/[id]"]` — 3 layouts. `products` is a URL segment (skipped), `(detail)` and `[id]` are virtual segments kept.

**Q: Can a layout exist without any pages under it?**

A: The route tree only has terminal nodes (routes with `r: RouteData`). A layout without pages would never match — `matchRoute` returns null. The layout module would exist in the layouts map but never get loaded.

**Q: Can two pages share the same layout but have different root layouts?**

A: No. The root layout is the first segment of the virtualPath. `_root_/(auth)/page` and `_admin_/(auth)/page` have different roots. Even if both have `(auth)`, these are different layout keys: `_root_/(auth)` vs `_admin_/(auth)`. The root scopes everything below.

---

### Streaming vs Buffering Through the Chain

**Q: When SSR uses `renderToStream`, at what point does the stream start flushing to the client — before or after all loaders complete?**

A: After all loaders complete. The pipeline (spec 06) runs ALL 6 phases before returning `PipelineResult`. SSR (spec 08) then calls Solid's `renderToStream()` with the complete data. The stream starts flushing during Solid's rendering — Suspense boundaries inside the component tree control what streams. But all loader data (non-deferred) is available before rendering starts.

**Q: If a page has 3 deferred values and SSR is streaming — does the HTML stream contain the pending fallbacks, and then NDJSON chunks resolve them after the page loads?**

A: Deferred values during SSR are rendered as Suspense pending fallbacks in the HTML stream. The `promise` field on the server `Deferred` is active — Solid's `renderToStream` handles this via its built-in streaming Suspense: if a deferred promise resolves while the HTML stream is still open, Solid inlines the resolved content as a `<script>` chunk appended to the stream (same mechanism as SolidStart). The HTML stream stays open until all Suspense boundaries resolve. NDJSON is a separate concern — only for CSR navigation (`flare-data: "1"`). Flare does not need its own SSR delivery mechanism — Solid's streaming handles it entirely.

**Q: In NDJSON mode, can the server decide mid-response to switch from non-streaming to streaming? What if a deferred promise resolves before the ready message?**

A: No mid-switch. The handler (spec 24 step 14) checks for deferred contexts ONCE after pipeline completes — `has deferred → createStreamingNDJSONResponse()`, `no deferred → createNDJSONResponse()`. The decision is made before any messages are sent. If a deferred resolves before the ready message, the chunk is still sent AFTER ready (spec 09 message order: loaders → heads → ready → chunks → done). The ready message signals "loaders complete, safe to render" — chunks always come after.

**Q: How does `createStreamingNDJSONResponse` handle backpressure?**

A: Spec 09 uses `ReadableStream` with `controller.enqueue()`. Non-issue — NDJSON messages are small (hundreds of bytes each), default `ReadableStream` backpressure is sufficient. Cloudflare Workers uses fixed internal buffering. No custom queuing strategy needed.

**Q: Can a single request have BOTH streaming HTML (SSR) AND NDJSON chunks?**

A: No. Strictly separate. Spec 24 step 9: no `flare-data` → SSR (HTML), `flare-data: "1"` → NDJSON. One or the other. SSR deferred resolution uses Solid's built-in streaming Suspense mechanism within the HTML stream, not NDJSON.

**Q: If `htmlCache` middleware caches an SSR response with streaming Suspense — does the cache capture the complete stream?**

A: `htmlCache` (spec 36) uses the Cache API which stores complete responses. The stream must be fully consumed before caching. On subsequent requests, the cached response is complete static HTML — no streaming. On cache hit, `htmlCache` extracts the nonce from the first 4KB of the cached HTML and sets the CSP header to match THAT nonce (not the per-request nonce). So the CSP header and the HTML `<script nonce="...">` tags agree on the same (original) nonce. The per-request nonce is discarded for cached responses. This works because the nonce's purpose is to prevent injection, and the cached HTML is server-generated (trusted).

---

### Error Boundary Hierarchy — Deep Scenarios

**Q: Root layout has `errorRender`, nested layout `(auth)` has no error/notFound renders, page throws `NotFoundError`. Walk the exact resolution path.**

A: `NotFoundError` is caught by `notFoundRender`, NOT `errorRender`. Walk-up (spec 10): page `notFoundRender` (none) → `(auth)` layout `notFoundRender` (none) → root layout `notFoundRender` (none — root only has `errorRender`) → global `notFound` boundary → minimal 404 fallback. The root's `errorRender` does NOT catch it — wrong boundary type.

**Q: If an `errorRender` boundary itself throws during rendering — what happens? Infinite loop protection?**

A: Spec 10 test cases: "Error in boundary render → escalates to parent boundary (infinite loop guard)". The error escalates to the parent level boundary. If root's boundary throws, it hits the global boundary. If global throws, minimal fallback renders. The "infinite loop guard" prevents re-entering the same boundary.

**Q: `unauthorizedRender` is NOT on the route builder chain. What's the actual walk-up for a 401?**

A: `unauthorizedRender` IS on the route builder chain — all three boundary types (`errorRender`, `notFoundRender`, `unauthorizedRender`) are available after `.render()`. Walk-up for `UnauthenticatedError`/`UnauthorizedError`: page `unauthorizedRender` → layout `unauthorizedRender` → root `unauthorizedRender` → global `unauthorized` boundary → minimal 401/403 fallback. SSR: pipeline catches error, handler finds appropriate boundary via walk-up, renders server-side. CSR: `ErrorBoundaryWrapper` (spec 17) checks error type → dispatches to correct boundary chain.

**Q: Root layout's loader AND page's loader both error in parallel. Which boundary renders?**

A: Both get `status: "error"` in `PipelineMatch` (spec 06 — error isolation, loaders don't abort siblings). During SSR, the handler finds the first error by route order and renders that boundary. The root is at depth 0, page at depth N. Root's error boundary wraps everything below — so the root error takes precedence. You'd see the root's `errorRender` (or walk-up from root). The page error is effectively hidden because the root layout error prevents the page from rendering at all.

On CSR: `ErrorBoundaryWrapper` at depth 0 catches the root error → renders root's errorRender. Since the root error prevents `<Outlet>` from rendering children, the page never mounts, so its error never surfaces.

**Q: Page loader throws `RedirectResponse` and layout loader throws `NotFoundError` in the same parallel batch. Which wins?**

A: Spec 06: "Redirect priority: first one in route order wins (when multiple loaders throw redirects)." But this is redirect vs non-redirect. Spec 24: handler checks for redirect in pipeline results FIRST (step 13), before rendering. So: `RedirectResponse` is checked first. If any match has a `RedirectResponse`, it becomes a redirect. The layout's `NotFoundError` is stored in its match but never rendered because the redirect takes precedence. Answer: **redirect wins**.

**Q: A layout's `notFoundRender` catches `NotFoundError` from child routes. But what if the layout's OWN loader throws `NotFoundError`?**

A: Spec 10: "notFoundRender on a route catches NotFoundError from **child** routes." The layout's OWN loader error is NOT caught by its own `notFoundRender` — it walks UP. So the layout's `NotFoundError` walks to the parent layout's `notFoundRender`, then root's `notFoundRender`, then global notFound boundary.

**Q: How does boundary resolution work during SSR vs CSR?**

A: SSR: pipeline (spec 06) catches errors per-loader, stores in `PipelineMatch.error`. SSR layer (spec 08) finds appropriate boundary via walk-up using route index, renders boundary component server-side. CSR: Solid's `<Errored>` in `ErrorBoundaryWrapper` (spec 17) catches at each depth level and walks up via `resolveErrorBoundary`. The walk-up rules are identical in intent — page → layout → root → global. Implementation differs: SSR is index-based imperative, CSR is component-tree-based.

**Q: `<Await>` rejects with no `error` prop — re-throws to nearest error boundary. That boundary is per-depth. Does a deferred error in a layout's loader data get caught by the layout's own errorRender?**

A: Yes. `<Await>` without `error` prop re-throws (spec 10). The re-thrown error propagates through Solid's error boundary tree. The `ErrorBoundaryWrapper` at that depth (the layout's depth) catches it. Walk-up: if layout has `errorRender`, it renders. If not, escalates to parent.

**Q: Can `reset()` trigger a loader that throws a DIFFERENT error type?**

A: Yes. `reset()` clears the error boundary and re-triggers the loader (spec 10). If the new loader throws `NotFoundError` instead of the original generic Error, the error boundary catches the new error. `ErrorBoundaryWrapper` (spec 17) checks the error type: `instanceof NotFoundError` → walks `notFoundRender` chain, otherwise → walks `errorRender` chain. So the boundary type effectively switches.

---

### Pipeline Execution — Edge Cases

**Q: If authenticate throws `RedirectResponse` — does preloader/authorize run? Loaders?**

A: No. Spec 06 error table: Authentication `RedirectResponse` → "Pipeline throws, handler redirects." The pipeline throws immediately. Phases 3-6 never execute.

**Q: Phase 3 — layout's authorize returns false. Does the page's preloader/authorize still run?**

A: No. Spec 06: "Short-circuit: if authorize throws or returns false, pipeline stops. No further routes processed." `UnauthorizedError` thrown, pipeline exits phase 3.

**Q: Layout preloader is slow (2s). Do loaders wait for ALL preloaders to finish?**

A: Yes. Phase 3 (preloader/authorize) is sequential and runs to completion before Phase 4 (loaders) starts. The 6 phases are strictly ordered. Loaders wait for all preloaders+authorizes.

**Q: Loader calls `ctx.defer()` with same key as another route's loader. Collision?**

A: No collision. Spec 07: "Keys are unique within a single route's loader (scoped by matchId)." Each route gets its own `DeferContext` with `matchId`. NDJSON resolver key is `${matchId}:${key}`. Same key string "reviews" in route A and route B → different resolver keys.

**Q: Can a preloader throw `NotFoundError`?**

A: Yes — it's an Error subclass. Spec 06 error table: Preloader "Other error" → "Pipeline throws, handler renders error boundary." `NotFoundError` IS an error, but the pipeline treats ALL preloader errors the same way — it throws, pipeline stops. The handler's top-level catch (spec 24) maps `NotFoundError` → 404 boundary. So it DOES get 404 treatment, just not via the "loader error → per-match error" path.

**Q: `response` routes skip head/headers. But do they go through phases 1-4?**

A: Yes. Spec 06: "Routes with `_type: "response"`: Pipeline runs phases 1-4 normally. Phases 5-6 skipped."

**Q: AbortController if client disconnects mid-SSR stream?**

A: Spec 24: AbortController aborted when client disconnects. On Cloudflare Workers, the response stream's writable side closes on disconnect. Solid's `renderToStream` may continue producing HTML that is discarded. Deferred promise callbacks should check `signal.aborted` to short-circuit expensive work and save CPU. The stream itself doesn't need explicit cancellation — the runtime handles cleanup.

**Q: Head callback throws `RedirectResponse` — is it swallowed?**

A: Spec 06: "Head/Headers: Any error → Caught per-route, silently ignored (non-critical)." ALL errors are caught, including `RedirectResponse`. So yes, a redirect thrown from a head callback would be swallowed. Head callbacks should not throw redirects.

---

### Deferred Data — Tricky Scenarios

**Q: Loader returns deferred. During SSR, `fetchSlow()` resolves before SSR finishes streaming. Does the resolved value get inlined in HTML?**

A: Yes. The server-side `Deferred` has an active `promise` field. `<Await>` tracks that promise and renders pending/success/error itself. If the promise resolves before `renderToStream` finishes, `<Await>` commits the resolved branch into the HTML. Flare does not rely on Solid `<Loading>` for deferred slots.

**Q: Deferred promise rejects during SSR (not NDJSON). How does the error reach the client?**

A: During SSR, `<Await>` tracks the deferred promise. If it rejects before the stream closes, `<Await>` renders its error callback (or re-throws to `<Errored>`) — the error state is inlined as HTML. The client hydrates that committed state.

**Q: At what exact point does the Deferred shape transform from server to client?**

A: Two transforms: (1) `serializeLoaderData` (spec 09) strips `promise`, keeps `{ __deferred: true, key }` for serialization into `FlareState`. (2) `hydrateLoaderData` (spec 11) converts markers to client `Deferred` objects with new promises and registers resolvers in the resolver map keyed by `${matchId}:${key}`.

**Q: Can you nest deferreds?**

A: Not supported. Deferred callbacks must return final resolved values, not another `ctx.defer()`. NDJSON chunk data is delivered as-is to the client resolver — it is not re-processed through `hydrateLoaderData`. An inner deferred marker in chunk data would be a dead object on the client. Spec 07 explicitly bans this pattern.

**Q: NDJSON chunk arrives for a deferred the client hasn't rendered yet. What happens?**

A: Spec 07 notes: "`__resolved` / `__error` set when chunk arrives before component renders — enables immediate render without flash." The resolver resolves the promise AND sets `__resolved` on the `Deferred` object. When `<Await>` (spec 37) eventually mounts, it checks `__resolved` first → renders success immediately, no pending state.

**Q: User navigates away before all chunks arrive. `<Await>` shows error callback or already unmounted?**

A: Navigation aborts the fetch (spec 15 step 3). `fetchNDJSON` (spec 13): abort rejects all pending resolvers with "Navigation cancelled". But navigation also updates `ctx.matches` signal → Solid reactivity unmounts the old component tree. The old `<Await>` components are already unmounted by the time the rejection fires. The rejected promises are orphaned — no error UI shown to user. New navigation renders its own components.

---

### Navigation — Concurrent & Race Conditions

**Q: User clicks Link A, then Link B before A completes. Link A's NDJSON was partially consumed. Is partial data thrown away?**

A: Yes. Spec 15 step 3: `currentController.abort()`. This cancels Link A's `fetchNDJSON` reader, rejects pending deferred resolvers. Any partial data in matchCache from Link A's partially-consumed loader messages is already written (step 9 writes as matches arrive). But the matches signal is NOT updated until step 11 (after fetch completes). Since the abort happens before step 11, Link A's partial data sits in matchCache but the UI never reflects it. Link B starts fresh, may reuse cached entries from Link A if they're still fresh.

**Q: Give a concrete scenario where `navigationVersion` saves the day beyond AbortController.**

A: Race condition in signal updates. Navigate to A (version=1), abort fires, Navigate to B (version=2). B's fetch returns and starts updating signals. But a microtask from A's fetch (e.g., a `.then()` on the fetch promise) was already queued before abort — it fires after B starts. Without version check, A's stale `.then()` would overwrite B's state. With version check: `if (myVersion !== navigationVersion) return` — A's callback (version=1) sees version is now 2, bails.

**Q: Navigate `/products/1` → `/products/2`. Same layout. Does layout's loader re-run?**

A: Depends on matchId. The layout's matchId is `${routeId}:${params}:${deps}`. If the layout's `loaderDeps` doesn't depend on the page's params, the matchId is identical → cache check: if `staleTime: 0` (default), it IS stale → re-fetches. With `staleTime: 30000`, cache is fresh → skips. The `flare-stale` header sends only stale matchIds — if layout is fresh, server skips its loader.

**Q: `navigate()` called during `navigate()` execution — re-entrancy protection?**

A: Spec 15 step 3: `if (currentController) currentController.abort()`. The second `navigate()` aborts the first. The first navigate checks `controller.signal.aborted` after each async step and returns silently. No explicit re-entrancy guard beyond abort — it's abort-based cancellation.

**Q: `flare-stale` header staleness gap — client thinks layout is fresh, but server data changed.**

A: Correct — this is an inherent race. The `flare-stale` header is a client-side optimization to avoid redundant work. If the layout data changed server-side but the client cache says fresh, the client uses stale cached data. This is the expected stale-while-revalidate behavior. The next navigation (when cache expires) would fetch fresh data. `invalidate()` or `refetch()` force immediate refresh.

**Q: SSR redirect loop limit?**

A: Max 5 internal redirects per request (spec 24). If middleware or auth produces more than 5 redirects within a single request processing cycle, the handler throws `Error("Redirect loop detected")` → 500 response. This prevents the Next.js-style infinite redirect exploit. The browser's own limit (~20) guards against cross-request redirect chains.

**Q: `shouldRefetch` returns true, matchId unchanged — skip cache?**

A: Spec 15 step 7: `if (options.revalidate || refetch || ctx.matchCache.isStale(matchId, staleTime))` — `refetch` is the result of `shouldRefetch`. If true, the matchId is added to `staleMatchIds` regardless of cache state. So yes, it always fetches.

**Q: View transitions + slow NDJSON response — does the transition timeout?**

A: `document.startViewTransition` captures old state, runs callback, then animates. The callback contains the state update (step 11). The NDJSON fetch (step 8) completes BEFORE `startViewTransition` is called — the view transition wraps the state UPDATE, not the fetch. By the time `startViewTransition` runs, data is already available. Solid's signal updates inside the callback are synchronous — no async gap. The transition API captures before/after snapshots around the synchronous Solid reactivity batch.

---

### Head Management — Cross-Layer Complexity

**Q: Root sets `title: "My App"`, layout sets `title: "Products"`, page sets nothing. Final title?**

A: "Products". Head merge (spec 08) is sequential: root → layouts → page. `mergeHeadConfigs` uses "child overrides" for scalar fields like `title`. Layout overrides root. Page sets nothing → layout's title persists. Final: "Products".

**Q: Root sets `meta: { viewport }`, page sets `meta: { author }`. Both present in result?**

A: Yes. `meta` uses "merge keys" strategy (spec 08). `{ viewport: "..." } + { author: "John" }` → `{ viewport: "...", author: "John" }`. Both keys preserved.

**Q: Root/layout/page each set `jsonLd`. Final result?**

A: `[thing1, thing2, thing3]`. `jsonLd` uses "concatenate" strategy (spec 08).

**Q: CSR nav from `/products` to `/about`, shared root, different layouts. Which meta tags removed?**

A: `applyPerRouteHeads` (spec 27) does 3-phase cleanup: (1) determine which routes are removed (products layout gone), (2) clean up meta tags owned by removed routes (via `headByRoute` Map), (3) apply new routes' head configs. Root's tags persist (root still in hierarchy). Products layout's tags removed. About layout's tags added.

**Q: Route's loader errors, its head skipped. Final page has partial head?**

A: Yes. Spec 06 phase 5: "Skipped for errored routes." Root + layout heads run, page head skipped. The page renders an error boundary. Head is partial — root + layout only.

**Q: Scripts in head are additive only. User navigates to page without jsonLd — old scripts still in DOM?**

A: Spec 27: "Script handling: additive only (removing doesn't undo JS effects)." Old `<script type="application/ld+json">` tags remain. The rule applies broadly to all scripts. For jsonLd specifically the tags are declarative (no execution) so removing them would be safe in theory, but the spec keeps the rule uniform for simplicity. If stale jsonLd is a problem, the route's head callback can explicitly clear it.

**Q: SSR head has `<link rel="canonical">`, CSR nav page doesn't set canonical. Old canonical removed?**

A: Per spec 27, `applyPerRouteHeads` tracks per-route ownership. If the old canonical was owned by a route that's no longer in the hierarchy, it gets cleaned up in phase 2. If it was set by the root layout (still present), it persists. Depends on which route set it.

---

### Middleware — Ordering & Interaction

**Q: `htmlCache` returns `respond`. Response handlers from earlier middlewares still run?**

A: Yes. Spec 22: "`respond` → Response handlers registered by middlewares that already ran DO apply." Handlers from middlewares that executed before `htmlCache` run. `htmlCache` short-circuits remaining middlewares, but collected handlers still apply.

**Q: `i18n` returns `bypass` for redirect. Does `staticAssets` execute?**

A: No. Spec 22: "`bypass` → Remaining middlewares in the chain do NOT execute." `i18n` bypasses → `staticAssets` never called. Middleware chain short-circuits.

**Q: `i18n` locale prefix conflicts with `apiProxy` path prefix. Who wins?**

A: Middleware execution order matters (array order in config). If `i18n` runs first and redirects (bypass), `apiProxy` never sees the request. If `apiProxy` runs first and matches its prefix (bypass), `i18n` never sees it. The user controls ordering via the `middlewares` array in `ServerHandlerConfig`.

**Q: Middleware A registers `onResponse` handler, then middleware B returns `bypass`. Does A's handler run?**

A: No. Spec 22: "Response handlers do NOT apply (even ones registered by earlier middlewares)" for bypass. The `bypass` result tells the server handler to skip all response handlers.

**Q: Can middleware modify the request URL before route matching?**

A: No URL rewriting mechanism exists or is needed. `i18n` middleware (spec 36) handles locale via redirects: default locale stripped (`/en-us/about` → 302 to `/about`), non-default locales matched via `[[locale]]` optional route param in the route tree (e.g., `_root_/[[locale]]/products`). Middleware sets locale on `serverRequestContext` for downstream access but does not modify the URL for route matching.

**Q: `htmlCache` caches HTML with old nonce. How does nonce extraction fix this?**

A: Spec 36: `htmlCache` extracts the nonce from the first 4KB of cached HTML. On cache hit, it sets the CSP header to match THAT extracted nonce (not the per-request nonce). The CSP header and HTML `<script nonce="...">` tags agree on the same (original) nonce. The per-request nonce is discarded. The 4KB window is sufficient because SSR head content (with nonced scripts) appears early in the HTML stream.

---

### Server Functions — Integration Edge Cases

**Q: `/_flare/server-fn/` path goes through middleware?**

A: Yes. Spec 24 flow: step 6 (middleware) runs before step 7 (server fn check). Server function requests go through the full middleware chain first.

**Q: Middleware returns `bypass` for `/_flare/server-fn/` path — server function never executes?**

A: Correct. Bypass short-circuits everything. The server function handler (step 7) never reached. This is intentional — middleware has full control over all requests.

**Q: Server function response gets CSP headers?**

A: Yes. Spec 24: "Server function responses still go through response handlers and security headers (not bypass)." CSP headers applied to JSON responses. Browsers ignore CSP on non-HTML responses — the headers are harmless overhead. Consistent application simplifies the handler (no content-type branching for security headers).

**Q: Server function called server-side during SSR — does auth run twice?**

A: Server-side direct calls bypass the HTTP layer entirely. The server function's `fn` is called directly — no HTTP request, no `handleServerFnRequest()`. Auth does NOT run twice. The client-side caller uses `fetch()` which goes through the handler, where auth runs for the server fn. But during SSR, if a loader calls a server function directly (importing the module), it's just a function call.

**Q: Server function client-side fetch go through deduped fetch?**

A: If `dedupeFetch: true` (default), `globalThis.fetch` is patched. Server function callers use `fetch()` — so yes, they go through the deduped fetch. But dedupe only applies to GET/HEAD (spec 32). Server functions using POST method (common for mutations) are NOT deduped. GET server functions would be deduped.

---

### Hydration — Timing & Ordering

**Q: `waitForLazyPreloads` — what if one never loads?**

A: Spec 14: `waitForLazyPreloads` uses `Promise.all(promises)`. If one promise never resolves, hydration hangs. Spec 31 (preload) has retry with max 2 attempts — after exhaustion, `throws: true` → rejects, `throws: false` → resolves undefined. So the preload promise DOES settle eventually (resolve or reject). If it rejects, `Promise.all` rejects, and `hydrate` throws. On failure, the SSR HTML remains visible but non-interactive — the page degrades to static HTML. No framework-level error UI. Apps can wrap `hydrate()` in try/catch to show a reload prompt.

**Q: JavaScript fails to load entirely — testing framework hangs on `data-flare-hydrated`?**

A: Yes. `data-flare-hydrated` is set by JavaScript after `solidHydrate` completes (spec 14). If JS fails to load, the attribute is never set. The testing framework (spec 35) would poll forever. This is by design — if JS doesn't load, the app isn't interactive.

**Q: `FlareState.dk` chunk fails to load?**

A: The preload mechanism (spec 31) has retry logic — single retry, 1s delay, max 2 attempts. If both fail with `throws: false`, the lazy component resolves to undefined — rendering would show nothing or error. With `throws: true`, the error propagates through `waitForLazyPreloads` → `hydrate` throws → page degrades to static HTML (spec 14).

**Q: `loadRouteModules` fails for one module — does hydration proceed?**

A: Spec 14: `loadRouteModules` uses `Promise.all` for all modules. If one fails, the entire Promise.all rejects. `hydrate` throws. Hydration does NOT proceed with partial data.

**Q: SSR and client component trees don't match — hydration mismatch?**

A: Solid's `hydrate()` requires identical tree structure. Spec 14 notes: "Dummy component depth MUST match SSR's `<Hydration>` wrapper depth — off by one breaks hydration key alignment." Mismatches produce hydration errors — testing framework (spec 35) detects these by scanning for "hydration", "mismatch", "Unable to find DOM nodes" patterns.

---

### Caching — Staleness & Invalidation

**Q: `staleTime: 0` (default) — every navigation re-fetches?**

A: Yes. `Date.now() - updatedAt > 0` is always true (unless `updatedAt === Date.now()`, which is essentially impossible). Every matchId check returns stale. Every navigation sends all matchIds in `flare-stale`. The layout stays mounted (layout persistence, spec 17), but its data re-fetches. UI doesn't unmount/remount — signal updates with new data.

**Q: `invalidate()` on a currently mounted match — stale data while re-fetching or loading state?**

A: Spec 17: `invalidate()` calls `navigate({ revalidate: true, to: currentURL, replace: true })`. This triggers a full navigation to the current URL. During navigation, `isNavigating` signal is true. The existing component stays mounted with old data (layout persistence via spec 17). When new data arrives, signals update. The old data stays visible during re-fetch — this is fetch-then-show behavior (spec 12/15). Components can check `isNavigating` to show a loading indicator if desired.

**Q: `prefetchCache` URL-keyed vs `matchCache` matchId-keyed. Invalidating one matchId — mismatch?**

A: `prefetchCache` and `matchCache` are independent. Navigation (spec 15) checks `matchCache` staleness per matchId. `prefetchCache` is checked for URL-level dedup (avoid refetching a URL that was recently prefetched). If you invalidate one matchId in `matchCache`, the next navigation checks each matchId independently. The invalidated one is stale → included in `flare-stale`. The fresh ones are not. `prefetchCache` isn't consulted for regular navigation — only for prefetch dedup.

**Q: `staleTime` vs `gcTime` — user experience difference between stale and GC'd data?**

A: Both result in a re-fetch before showing — the behavior is fetch-then-show (spec 12/15), not stale-while-revalidate. Stale (within gcTime): data exists in cache, marked stale, re-fetched on next navigation. GC'd (past gcTime): data removed entirely, fetched fresh. User experience: identical — both wait for new data. The difference is internal: stale data consumes memory, GC'd doesn't. `staleTime` controls how often loaders re-run. `gcTime` controls when old entries are cleaned up to free memory.

**Q: `shouldRefetch` — can you skip pipeline phases 1-3 for a re-run?**

A: No. `shouldRefetch` causes the matchId to be added to `staleMatchIds` in navigation (spec 15 step 7). This triggers `fetchNDJSON` with those matchIds. The server runs the full pipeline (spec 24 → spec 06) — all 6 phases. There's no mechanism to skip validation/auth/preloader for a "data-only" re-fetch.

---

### Multi-Root & Complex Route Structures

**Q: CSR navigation between different root layouts (`_root_` → `_docs_`) — NDJSON or full page load?**

A: Full page reload. Cross-root navigation (e.g., `_root_` → `_docs_`) triggers `window.location.href = url` — a hard navigate with fresh SSR. Different roots are effectively different apps. The navigation flow (spec 15) detects cross-root by comparing current root layout virtualPath prefix with the new match's root prefix; if different, hard navigate instead of CSR. Clean teardown and fresh SSR is simpler and safer than attempting a full component tree swap via CSR.

**Q: Two root layouts — one tree or two?**

A: One tree. `ServerHandlerConfig.routeTree` is a single `TreeNode`. Routes from different roots have different URL paths and are inserted into the same tree. `matchRoute` returns whichever route matches the URL — it doesn't know about roots. The root layout is determined by `deriveLayouts` on the matched route's virtualPath.

**Q: Layout persistence across layout group boundaries within same root?**

A: Correct. Navigating `_root_/(auth)/dashboard` → `_root_/(auth)/settings`: `(auth)` layout persists (same `render` fn at depth 1). Navigating `_root_/(auth)/dashboard` → `_root_/(public)/about`: root persists (depth 0), `(auth)` unmounts (depth 1), `(public)` mounts (depth 1). Solid's `<Dynamic>` detects different component at depth 1 → remount.

---

### View Transitions

**Q: Chunks resolving after state update — trigger additional view transitions?**

A: No. View transitions wrap the initial state update only (spec 15 step 11). Chunks resolving in background update deferred promises → `<Await>` re-renders inside Suspense. These are normal signal updates, not wrapped in view transitions. Only the navigation state update (matches, params, search signals) is transitioned.

**Q: `startViewTransition` callback is async — does transition hold old frame?**

A: `document.startViewTransition(callback)` — the callback runs synchronously to update the DOM. Spec 15: the state update (setting signals) is synchronous. Solid's reactivity batches updates synchronously. The transition API captures the old frame, runs callback, captures new frame, animates between them. The fetch/NDJSON waiting happens BEFORE `startViewTransition` is called (step 8 completes, then step 11 wraps state update in transition).

**Q: First CSR nav after hydration — no previous historyIndex. What's the direction?**

A: Spec 26: `historyIndex` starts at 0 (module-level counter). Hydration calls `replaceHistoryState` with `historyIndex: 0` — this establishes the baseline. First CSR nav calls `incrementHistoryIndex()` → `historyIndex: 1`. Direction: 1 > 0 → forward. Back button restores history state with `historyIndex: 0` → direction: 0 < 1 → backward.

**Q: `router.viewTransitions` — inherited by routes without override?**

A: Yes. Spec 25: "Per-route override merge: route `.options()` overrides router config per field." If a route doesn't set `viewTransitions` in `.options()`, it uses `router.viewTransitions`. Navigation (spec 15) resolves the effective view transition config per-navigate.

**Q: `types` function returns `false` — navigation proceeds without animation?**

A: Yes. `false` means skip the view transition entirely (spec 17). The state update happens directly, not wrapped in `document.startViewTransition`. Navigation proceeds normally — all 14 steps still run, just step 11's state update isn't wrapped.

---

### Security — CSP & Nonce

**Q: `htmlCache` old nonce in HTML vs new nonce in CSP header?**

A: Spec 36: `htmlCache` extracts the nonce from cached HTML and uses THAT nonce for the CSP header. So the CSP header matches the HTML's nonces. The per-request new nonce is discarded when serving from cache. Security trade-off: cached responses reuse the original nonce, but this is acceptable because the nonce's purpose is to prevent injection, and the cached HTML is server-generated (trusted).

**Q: `'strict-dynamic'` covers dynamic `import()`?**

A: Yes. `'strict-dynamic'` in CSP propagates trust to scripts loaded by trusted scripts. `import()` from a nonced `<script type="module">` inherits trust. This is how Vite's code-split chunks work — the entry module (nonced) dynamically imports chunks.

**Q: Third-party inline scripts in production with `'strict-dynamic'`?**

A: `'strict-dynamic'` does NOT trust inline scripts that weren't loaded by a trusted parent. A third-party injecting `<script>alert(1)</script>` into the DOM is blocked unless it was loaded via `import()` from a trusted script. The nonce is required for the initial trust chain.

**Q: SSR response cache control — configurable?**

A: Yes. Spec 08: response headers include `...resolvedRouteHeaders` from pipeline phase 6. Routes can set `Cache-Control` via `.headers()`. The framework doesn't set a default cache control for SSR. `htmlCache` middleware (spec 36) adds `Cache-Control` headers for cache hits.

**Q: `bypass` responses have no security headers — intentional?**

A: Yes. Spec 22/24: bypass = raw response, no modification. Intentional for `apiProxy` (proxied response has its own headers), `staticAssets` (platform handles headers), health checks (minimal overhead). Spec 22 notes: "Overusing bypass defeats security headers."

---

### Full End-to-End Scenarios

**Q: Complete lifecycle: `/products/123` with i18n, root preloader, auth layout, product page with deferred reviews.**

A:

1. Request arrives at `createServerHandler.fetch()`
2. Generate nonce (32 hex chars)
3. Create AbortController
4. `normalizeUrl` — `/products/123` passes (no trailing slash, no extension)
5. `runWithServerContext({ nonce, request })`
6. Build MiddlewareContext, run middlewares: `i18n` detects locale from URL/cookie/Accept-Language, sets locale on `serverRequestContext`, returns `middlewareNext()`
7. Check `/_flare/server-fn/` prefix — no, continue
8. `matchRoute(routeTree, "/products/123")` → `{ route, params: { id: "123" } }`
9. No `flare-data` header → SSR mode, cause = "initial"
10. `loadRouteModules`: derive layouts from virtualPath → `["_root_", "_root_/(auth)"]`. Load root layout + auth layout + product page modules in parallel
11. Build `ResolvedRoute[]`: [root, authLayout, productPage]
12. `runPipeline`:
    - Phase 1: input validation (page validates `{ id: z.string().min(1) }`)
    - Phase 2: auth — auth layout has `.authenticate()` → calls `authenticateFn` → if auth null, throws `UnauthenticatedError`; otherwise continues
    - Phase 3: root preloader → `{ theme: "dark" }` → snapshot `{ theme: "dark" }`; root authorize (none); auth layout preloader → `{ permissions: [...] }` → snapshot `{ theme: "dark", permissions: [...] }`; auth layout authorize (none); page preloader (none) → snapshot inherited
    - Phase 4: parallel loaders — root (none, loaderData=undefined), auth layout (none), page loader → `{ product: await fetchProduct("123"), reviews: ctx.defer(() => fetchReviews("123")) }` → deferred registered in DeferContext
    - Phase 5: head chain — root: `{ title: "My App" }`, auth layout: none, page: `{ title: product.name }` → merged: `{ title: product.name }`
    - Phase 6: headers chain
13. No redirect in results
14. `renderToStream()`: build component tree (FlareContext.Provider > NoHydration > RootLayout > Hydration > AuthLayout > ProductPage), serialize FlareState (deferred marker for reviews, `promise` stripped), inject scripts at `</body>`
15. Return Response with streaming body, status 200, CSP headers with nonce

Client hydration:

1. Parse `self.flare` → FlareState with match data + deferred markers
2. Create matchCache + prefetchCache
3. Populate matchCache with SSR data
4. `loadRouteModules` (modules may already be loaded from SSR bundle)
5. `waitForLazyPreloads()`
6. `solidHydrate` — attaches reactivity, `<Await>` shows pending fallback for reviews
7. Set `data-flare-hydrated` attribute
8. `setupNavigation(ctx)` — popstate listener, GC interval

NDJSON chunk arrives (reviews resolved on server):

- Resolver map has `${matchId}:reviews` entry
- Chunk resolves the promise → `<Await>` renders ReviewList

First CSR nav to `/products/456`:

1. Click Link → `navigate({ to: "_root_/(auth)/products/[id]", params: { id: "456" } })`
2. Abort previous controller (none active)
3. Save scroll, push history state
4. `matchRoute` → same route, params: `{ id: "456" }`
5. Load modules — already cached (same page type)
6. Compute matchId — different (id changed) → stale
7. `fetchNDJSON({ url: "/products/456", matchIds: [pageMatchId] })` — layout matchIds fresh (same params), only page sent in `flare-stale`
8. Server runs pipeline for page only (flare-stale filter), streams NDJSON: loader message (product + deferred reviews marker) → head → ready → done (chunks stream after)
9. `fetchNDJSON` returns on ready
10. Update matchCache
11. Build matches, wrap state update in view transition
12. Update head via `applyPerRouteHeads`
13. Scroll to top
14. Deferred reviews chunk arrives → `<Await>` updates

**Q: Prefetch → click → back button race condition.**

A:

1. Hover on Link to `/products/2` → `prefetch({ to: ... })` starts: `fetchNDJSON` with `flare-prefetch: "1"`, stored in prefetchCache
2. User clicks the link → `navigate()` starts. Step 7 checks matchCache staleness. If prefetch completed, prefetchCache has data → matchCache populated from prefetch → no fetch needed → instant nav. If prefetch still in-flight, navigate's own fetch starts (prefetch abort depends on implementation — they use separate controllers)
3. Immediately clicks back → `popstate` fires → new `navigate()` to `/products/1`. Step 3 aborts the `/products/2` navigation. `/products/1` data is in matchCache (just navigated from there) → fresh → no fetch → instant nav from cache
4. Scroll restored from scroll store (spec 26) using the history key, double rAF timing

**Q: Auth token expires, user clicks Link to `/settings`. What does the client see?**

A: CSR nav → `fetchNDJSON({ url: "/settings", ... })` → server runs pipeline → Phase 2 auth: `authenticateFn` with expired token. If `authenticateFn` throws `UnauthenticatedError` → pipeline throws → handler catches → NDJSON mode: returns error JSON (spec 24: "Error during NDJSON → error JSON response"). Client's `fetchNDJSON` receives the error. If `authenticateFn` throws `RedirectResponse` (e.g., redirect to `/login`) → handler catches → `createRedirectNDJSONResponse()` → client receives `t:"x"` message → `fetchNDJSON` throws `RedirectResponse` → navigation catches it → recursive `navigate()` to `/login`.

**Q: Deferred + navigate away + navigate back — flash of pending fallback?**

A: First SSR renders pending fallback for deferred. Client hydrates with pending promise. Chunk resolves → `<Await>` shows resolved content. User navigates away → old component unmounts, old deferred resolvers rejected ("Navigation cancelled"). User navigates back → new `fetchNDJSON` to same URL → server re-runs loader → new deferred promise. If the response is fast, data arrives quickly. The `t:"r"` (ready) message arrives → `fetchNDJSON` returns → state update. If deferred resolves after ready but before component mounts, `__resolved` is set → `<Await>` renders immediately, no flash. If deferred is still pending when component mounts → yes, user sees pending fallback briefly until chunk arrives. Whether this feels like a "flash" depends on server response time.
