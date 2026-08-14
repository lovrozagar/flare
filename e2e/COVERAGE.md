# e2e coverage

Living checklist. Scouted `e2e-archive` (**164** Playwright files, 222 routes), `real-world/e2e` (~90 i18n cases), and all `consumer/*` (no local tests; same 23-route template). UI kit is out of scope.

Default proof: `bun run test:e2e` → `@flare/e2e-node` → `e2e/app`.

Legend: `[x]` in the new suite · `[ ]` still to write · `[!]` skip (stale API, product gap, UI, or other-runtime).

Sources: `e2e-archive/e2e/<file>`, `consumer/flare-node/src/routes/<file>`, `real-world/e2e/i18n.test.ts`.

---

## 0. Already in the new suite

- [x] SSR HTML 200 + content-type
- [x] `html lang=en`
- [x] hydrate `data-hydrated` + `FlareState` shape
- [x] loader data on `/` and `/about`
- [x] route headers `x-powered-by` + middleware `x-middleware-ran`
- [x] `Link` renders `<a href>`
- [x] SPA click (no full reload)
- [x] nested dashboard layout SSR + SPA
- [x] layout header `x-dashboard-layout`
- [x] SSR 404 + `notFoundRender`
- [x] NDJSON `x-d` content-type
- [x] NDJSON loader `t:l` + head `t:h`
- [x] `serverContext` UUID + forwarded `x-request-id`
- [x] default redirect **303** SSR + CSR
- [x] dev `X-Content-Type-Options: nosniff`
- [x] dev CSP `unsafe-inline`, no nonce
- [x] `class=` Tailwind static + conditional

---

## 1. Consumer template surfaces (`consumer/flare-node`)

Archive: `consumer-deploy.test.ts`. Consumers themselves have **no** tests.

- [x] Set-Cookie on `/` + cookie round-trip on `/about`
- [x] Multi Set-Cookie `/multi-cookie`
- [x] `defer` + `<Await>` `/deferred`
- [x] Search params `/search?q=&page=`
- [x] Dynamic `[id]` `/users/:id` + SPA param change
- [x] Catch-all `[...path]` `/files/*`
- [x] Encoded `[slug]` `/decode/hello%20world`
- [x] `.errorRender` + loader 500 `/error-test?fail=true`
- [x] `.preloader` → loader `/preloaded`
- [x] Full SEO head (canonical, OG, twitter) `/seo`
- [x] Header chain `parentHeaders` on dashboard
- [x] Path middleware `x-matched-path` / `x-has-query`
- [x] `server-timing` (`flare.pipeline.*`)
- [x] Request echo `/echo` + `x-custom-test`
- [x] SHA-256 `/hash`
- [x] Encoding round-trip `/encoding`
- [x] JSON edge (emoji, null, MAX_SAFE) `/json-edge`
- [x] Intl / Date `/time`
- [x] ReadableStream + `Response` in loader `/streams`

## 2. Routing / navigation

Archive: `navigation.test.ts`, `link.test.ts`, `deep-link-*.test.ts`, `deep-navigate-api.test.ts`, `concurrent.test.ts`, `scroll.test.ts`, `url-normalization.test.ts`, `deep-shallow-*.test.ts`, `popstate-cache.test.ts`, `navigation-phase.test.ts`, `deep-view-transition.test.ts`, `deep-prefetch*.test.ts`, `deep-download-links.test.ts`, `deep-session34.test.ts`.

- [x] back / forward SPA
- [x] URL trailing-slash / case normalization
- [x] `Link` activeClass / aria-current
- [x] `Link` replace (history length)
- [x] `Link` disabled → span + no nav
- [x] `Link` hash
- [x] `Link` external / `javascript:` stripped
- [x] `Link` target=_blank rel
- [x] programmatic `__flareNavigate`
- [x] navigation blocker (dirty form) — `useBlocker`
- [x] reactive disabled Link toggle
- [x] `useRouter().navigate()` push/replace/search + `invalidate()`
- [x] shallow nav same-route search
- [x] shallow + validated search
- [x] prefetch `x-p` does not commit
- [x] prefetch + defer: no `t:c` on prefetch
- [x] download links not intercepted
- [x] scroll restore + hash `scrollIntoView`
- [x] view transitions (chromium)
- [x] popstate uses cache (zero NDJSON)
- [x] navigation phase signals
- [x] rapid / concurrent nav cancels previous

## 3. Layouts / params / optional

Archive: `deep-layout*.test.ts`, `deep-catch-all.test.ts`, `deep-optional-params.test.ts`, `optional-single-param.test.ts`, `path-segment.test.ts`, `dynamic-extension-routes.test.ts`.

- [x] layout groups `(dashboard)` persist across children
- [x] layout loader data visible to page (blog-style)
- [x] optional `[[param]]` + optional single `[[lang]]`
- [x] path-segment API (layoutless params)
- [x] file-extension routes if still current
- [x] empty / null loader pages render

## 4. Redirects / rewrite / 404

Archive: `redirects.test.ts`, `deep-redirects.test.ts`, `deep-external-redirect.test.ts`, `rewrite.test.ts`, `deep-rewrite.test.ts`, `deep-not-found-mode.test.ts`.

- [x] default 303 internal
- [x] explicit 302
- [x] explicit 307 / 308
- [x] external `href` redirect
- [x] redirect with params / search preserved
- [x] rewrite input vanity URL
- [x] rewrite output on Link href
- [x] rewrite preserves search
- [x] `notFound()` helper
- [!] CSR unknown-path not-found — product gap (archive skipped)

## 5. Head / headers / middleware

Archive: `head.test.ts`, `deep-head*.test.ts`, `deep-headers.test.ts`, `deep-middleware.test.ts`, `middleware-scoping.test.ts`, `server-timing.test.ts`.

- [x] custom headers SSR + NDJSON
- [x] layout + page header merge / override
- [x] title / description / meta in HTML
- [x] middleware chain order / `x-request-id` + `x-timing`
- [x] path-scoped middleware
- [x] `virtualPath` scoped middleware
- [x] `onPage` on page + NDJSON, not on mount
- [x] `server-timing` header (`flare.pipeline.*`)
- [x] 3-level head + auto-merge / replace
- [x] OG / Twitter / JSON-LD / hreflang / favicon resolution
- [x] head XSS escape + stale meta cleanup
- [x] COOP / Set-Cookie / CDN Cache-Control integrity

## 6. NDJSON / FlareState / hydration

Archive: `deep-ndjson-protocol.test.ts`, `hydration.test.ts`, `deep-ssr-hydration-match.test.ts`, `deep-loader-data.test.ts`, `deep-builder-props.test.ts`.

- [x] basic loader + head messages
- [x] all message types (`t:l|h|r|d|e|x|c|q`)
- [x] stale match `x-m`
- [x] prefetch cause `x-p`
- [x] NDJSON redirect `t:x` / external `xl`
- [x] stream abort cleanup
- [x] SSR HTML matches hydrated DOM
- [x] render props: cause, prefetch, location, preloader order
- [x] multi-defer: fast before slow, error + reset

## 7. Auth / errors / boundaries

Archive: `error-handling.test.ts`, `error-boundary-retry.test.ts`, `deep-error-*.test.ts`, `deep-authorize.test.ts`, `deep-error-auth.test.ts`.

- [x] loader throw → page `errorRender` + 500
- [x] layout catches child error
- [x] `unauthenticated()` + boundary
- [x] `unauthorized()` + boundary
- [x] `.authenticate()` gate (401 default page)
- [x] `.authorize()` pass / fail
- [x] auth inherit vs override
- [x] error retry

## 8. Server functions / forms / revalidation

Archive: `deep-server-fn*.test.ts`, `server-fn-revalidate.test.ts`, `deep-form-*.test.ts`, `deep-revalidation*.test.ts`.

- [x] `createServerFn` POST `/_fn/…`
- [x] GET server-fn
- [x] CSRF origin reject
- [x] input validation errors (form + FieldError)
- [x] authenticate on server-fn
- [x] `<Form>` submit + FieldError
- [x] form reset / pending
- [x] upload
- [x] revalidate after mutation
- [x] piggyback queries

## 9. Cache / ISR / prerender / store

Archive: `deep-cache-*.test.ts`, `deep-isr-*.test.ts`, `deep-kv-cache.test.ts`, `deep-duration-cache.test.ts`, `deep-purge.test.ts`, `deep-prerender.test.ts`, `dev-prerender.test.ts`, `dev-store.test.ts`, `flare-cache-headers.test.ts`, `ssg-param-validation.test.ts`, `vary-etag.test.ts`.

- [x] client staleTime cache hit / miss
- [x] `.cache()` SSR / KV + param isolation
- [x] duration cache
- [x] ISR blocking miss + populate + SPA
- [x] ISR + defer / layout child / `dynamicParams:false`
- [x] prerender / SSG artifacts + param allowlist
- [x] SSG params allowlist `/ssg-dynamic/:slug` + unlisted 404
- [x] ISR `dynamicParams:false` unlisted slug 404
- [x] `POST /_flare/revalidate` tags; GET 405
- [x] Vary: `x-d` + weak ETag 304
- [x] `Flare-Cache` / `Flare-Render` diagnostics

## 10. i18n / locale

Archive: `i18n.test.ts`, `deep-i18n-*.test.ts`. Real-world: `real-world/e2e/i18n.test.ts` (~90 cases).

- [x] hard nav sets `flare.locale` + `html lang`
- [x] cookie-respect redirect (302 to prefixed)
- [x] explicit URL wins over cookie
- [x] default locale strip `/en` → `/`
- [x] case normalize `/HR` → `/hr`
- [x] unsupported locale stripped
- [x] skip static file paths
- [x] prefetch `x-p` does not Set-Cookie
- [x] NDJSON does not cookie-redirect
- [x] SPA locale switcher + cookie
- [x] ICU interpolation + plural
- [x] query preserved across locale redirect
- [x] bot / default locale
- [x] locale-prefixed tree `/hr` + `/hr/about`

## 11. Query / broadcast / theme / direction

Archive: `deep-query-*.test.ts`, `deep-broadcast.test.ts`, `deep-theme-direction.test.ts`.

- [x] query client hydrate from FlareState
- [x] invalidation
- [x] deferred query
- [x] cross-tab signal
- [x] broadcast navigate / invalidate
- [x] theme script + class
- [x] direction script + dir

## 12. Fonts / image / lazy / styles

Archive: `deep-fonts.test.ts`, `deep-image.test.ts`, `static-image.test.ts`, `lazy.test.ts`, `deep-styling-*.test.ts`.

- [x] `FontCSS` subset + preload
- [x] fallback metrics / size-adjust
- [x] `Image` / static image
- [x] Image loader srcset + static blur / `placeholder=none`
- [x] `lazy()` island
- [x] `class=` Tailwind compile
- [x] sx variants / dynamic class
- [!] `tw=` — dropped
- [!] `css=` native — not in current sx pipeline
- [!] `styles()` tw — not in current pipeline
- [!] Base UI sx — UI parked
- [!] visual PNG snapshots — not porting

## 13. Security / sitemap / mount / keepalive / SW

Archive: `security.test.ts`, `deep-security-*.test.ts`, `deep-http-integrity.test.ts`, `deep-sitemap-submit.test.ts`, `mount.test.ts`, `keepalive.test.ts`, `deep-service-worker.test.ts`.

- [x] nosniff
- [x] dev CSP unsafe-inline
- [x] XSS: script text not executed, FlareState safe
- [x] malformed URL / header
- [x] sitemap.xml `.response()`
- [x] sitemap submit GET 405; POST without secret rejected
- [x] `mount("/api")` health / echo / extensions
- [x] keepalive 204
- [x] service worker + offline fallback
- [x] SW registers `sw.js` + caches `/offline` (dev)
- [x] prod nonce / HSTS / hashed assets / no HMR — `bun run test:e2e:prod`

## 14. Misc product

Archive: `deep-hooks.test.ts`, `deep-logging.test.ts`, `server-logs.test.ts`, `deep-env-fn.test.ts`, `deep-dev-error-overlay.test.ts`, `deep-chunk-retry.test.ts`, `deep-input-*.test.ts`, `deep-intercept-*.test.ts`, `deep-preloader.test.ts`, `preloader-error-recovery.test.ts`, `router-config-defaults.test.ts`, `deep-a11y*.test.ts`, `deep-perf-*.test.ts`, `deep-mobile-viewport.test.ts`.

- [x] hooks (`useLocation`, params, search, `useNavigate`)
- [x] input validators — zod first; valibot/arktype/yup/typebox/effect optional
- [x] intercept overlay (`/products/[id]`)
- [x] preloader throw / redirect recovery
- [x] callerData on authorize
- [x] server logs forwarded in dev
- [x] a11y: landmarks, skip link, 404 accessible, form labels
- [x] env-fn SSR (server-only + isomorphic server impl)
- [x] env-fn client hydrate (`_$template` import kept across Solid emit)
- [x] `useTheme` SSR inside provider
- [x] blocker `proceed()` continues navigation
- [x] error-boundary retry button on 500
- [x] error-boundary retry recovers after hydrate
- [x] JS-off progressive enhancement forms
- [x] server-fn stream chunks
- [x] axe WCAG 2.1 AA (serious/critical) on key routes
- [x] markdown negotiation `Accept: text/markdown`
- [x] `cdnProxy` + `apiProxy`
- [x] nested cache layouts `/deep-cache`
- [x] mobile viewport smoke
- [!] `deep-styling-tw-static` — entire file skipped
- [!] perf heap / 1000-row stress — later
- [!] Base UI dialog axe — UI parked
- [x] bun harness — `3.a.3` (`bun run test:e2e:bun`)
- [!] workers harness scaffolded (`e2e/workers` + `vite.workers.config.ts`) — Vite starts; `/` still 404s, not default proof
- [!] `route-smoke` 153-case giant matrix — do not port wholesale; cover via groups above
- [!] CSR unknown-path — tested; product must keep not-found visible
- [!] chunk-retry / CLI generate smoke — CLI stays in `packages/cli` unit tests

---

## 15. Archive file map (do not delete)

164 files. Largest: `route-smoke` 153, `deep-input-validation` 58, `deep-form-actions` 47, `deep-prerender` 45, `deep-head-resolution` 42, `deep-image` 38, `server-timing` 38.

**Fully skipped in archive today:** `deep-env-fn`, `deep-styling-tw-static`.

**Partially stale:** `css=` native, `styles()` media, mix isolation, CSR unknown-path, Base UI one case, visual snapshots, 302-as-default in `deep-redirects`.

---

## How to use this file

1. Pick the next `[ ]` group.
2. Add the smallest route(s) under `e2e/app/src/routes`.
3. `bun run --filter @flare/e2e-app generate`
4. Write tests in `e2e/app/e2e`. Copy assertion style from `e2e-archive/e2e` — do not copy stale APIs.
5. `bun run test:e2e`
6. Flip `[ ]` → `[x]` only when the new suite proves it.
