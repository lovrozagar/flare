# Flare Phase 2: Platform Layer

Phase 1 = routing, SSR, navigation, caching, boundaries, server fns, head management.
Phase 2 = cache architecture, streaming, client DX, type safety, CF integration.

Core stays platform-agnostic. CF-specific features in `flare-cf` adapter.

---

## Workstreams

### WS1: Client Entry Cleanup ✅

**Priority**: Highest (biggest DX win, no architectural risk)

**Done**. `hydrate(router, options?)` exported from `flare/client`.

- [x] Export `hydrate(router, options?)` from `flare/client`
- [x] Internalize: state parsing, module loading, cache creation, match building, boundary extraction, provider wiring, context ready pattern, navigation setup, scroll restoration, hydration attribute
- [x] Escape hatches via options: `onContextReady`, `devOverlay`
- [x] Extract helpers: `extractRootBoundaries()`, `buildInitialMatches()`
- [x] 3-file consumer convention: `router.ts` (isomorphic) + `client.tsx` + `server.ts`
- [x] Both e2e + benchmark updated, 655 e2e + 2479 unit tests pass

**Consumer pattern**:

```
src/router.ts      → createRouter({ layouts, routeTree }) — shared
src/client.tsx     → hydrate(router, { devOverlay, onContextReady })
src/server.ts      → createServerHandler({ router, ... })
```

**API supports**: direct value, sync callback, async callback:

```ts
hydrate(router);
hydrate(() => router);
hydrate(async () => {
	await setup();
	return router;
});
```

**Files**: `src/hydrate/index.tsx`, `src/hydration/index.ts`, `src/client.ts`

---

### WS2: Cache Architecture — Namespaced Multi-Layer

**Priority**: High (foundation for WS3 + WS5)

#### Design: Namespaced cache config

All cache layers namespaced under `.cache({})` — clear which layer you're configuring.

**Router-level defaults** (inherited by all routes):

```ts
createRouter({
	cache: {
		client: { staleTime: 30_000, gcTime: 300_000, prefetch: "hover" },
		kv: { staleTime: 60_000 },
		cdn: { maxAge: 60, swr: 3600 },
	},
});
```

**Per-route overrides** — pages get all 3 keys:

```ts
createPage("_root_/posts/[id]")
	.cache({
		client: { staleTime: 0, prefetch: "viewport" },
		kv: false,
		cdn: { maxAge: 3600, tags: (ctx) => [`post-${ctx.params.id}`] },
	})
	.render(fn);
```

**Layouts** — same type, `cdn` ignored (layouts don't own URLs):

```ts
createLayout("_root_/(auth)")
	.cache({ client: { staleTime: 60_000 }, kv: { staleTime: 120_000 } })
	.render(fn);
```

**Inheritance**: router defaults → layout overrides → page overrides. `false` disables a layer.

**Prefetch** lives inside `client` as flat fields — it's client behavior, not a separate cache layer:

- `prefetch: "hover" | "viewport" | false` — trigger strategy
- `prefetchStaleTime: number` — how long before re-prefetching (default 30s)
- `prefetchGcTime: number` — prefetch cache GC time

When `<Link>` is hovered/visible:

1. Client fetches NDJSON → **CDN** serves cached if valid
2. Server receives → **KV** serves cached if valid, else runs loader + stores
3. Response arrives → **Client** stores in matchCache

#### Types

```ts
interface ClientCacheConfig {
	cacheDeferred?: boolean; /* opt-in: update matchCache when deferreds resolve */
	gcTime?: number; /* ms, default 300_000 */
	prefetch?: PrefetchStrategy; /* trigger: "hover" | "viewport" | false */
	prefetchGcTime?: number; /* ms, prefetch cache GC */
	prefetchStaleTime?: number; /* ms, how long before re-prefetch (default 30s) */
	staleTime?: number; /* ms, default 0 */
}

interface KvCacheConfig {
	key?: (ctx: CacheKeyContext) => string; /* default: matchId */
	staleTime?: number; /* ms */
}

interface CdnCacheConfig {
	maxAge?: number; /* seconds */
	private?: boolean;
	swr?: number; /* stale-while-revalidate, seconds */
	tags?: string[] | ((ctx: CacheTagContext) => string[]);
}

type PrefetchStrategy = false | "hover" | "viewport";

interface CacheConfig {
	cdn?: CdnCacheConfig | false;
	client?: ClientCacheConfig | false;
	kv?: KvCacheConfig | false;
}
```

#### Phase A: Rename `options` → `cache` ✅

- [x] `CacheOptions` → `CacheConfig`, `RouteOptions` → `PageCacheConfig` → unified `CacheConfig`
- [x] `.options()` builder method → `.cache()` on page, layout, root-layout
- [x] `result.options` → `result.cache` on all result/state types
- [x] `ExtractedRouteOptions` → `ExtractedCacheConfig`
- [x] `extractOptionsFromChain` → `extractCacheFromChain` with brace-counting parser
- [x] Update generator for nested `.cache({ client: { ... }, prefetch })` format
- [x] Update all tests (2477 unit), e2e routes (655 e2e), TypeScript clean

#### Phase A.5: Restructure to namespaced `{ client, kv?, cdn?, prefetch? }` ✅

- [x] Restructure flat config → namespaced `CacheConfig { client?, kv?, cdn?, prefetch? }`
- [x] `staleTime`/`gcTime` under `client: { staleTime, gcTime }`
- [x] `prefetch` top-level: shorthand `"hover"` or detailed `{ trigger, staleTime, gcTime }`
- [x] New types: `ClientCacheConfig`, `KvCacheConfig`, `CdnCacheConfig`, `PrefetchConfig`
- [x] Generator brace-counting parser for nested config extraction
- [x] Navigation reads `mod.cache?.client?.staleTime` with truthiness narrowing
- [x] All tests, e2e routes updated
- [x] Router-level `cache` defaults in `createRouter()` — nested `cache: { client: ClientCacheConfig }`
- [x] Router-level defaults wired at runtime — `routerCacheDefaults` on FlareProviderContext
- [x] Navigation `staleTime` falls back to `ctx.routerCacheDefaults?.staleTime` (was hardcoded 0)
- [x] Prefetch `staleTime` falls back to `ctx.routerCacheDefaults?.prefetchStaleTime` (was hardcoded 30_000)
- [x] Link prefetch strategy falls back to `ctx.routerCacheDefaults?.prefetch` (was hardcoded false)
- [x] `client: false` on a route disables inheritance (staleTime forced to 0)
- [x] `hydrate()` passes `router.cache?.client` to FlareProvider as `routerCacheDefaults`
- [x] 2537 unit + 655 e2e tests pass, TypeScript clean

#### Phase B: CDN cache shorthand ✅

- [x] Auto-generate `Cache-Control` + `Surrogate-Key` headers from `cdn` config
- [x] Skip `Cache-Control` if route already defines `.headers()` with it (no double-set)
- [x] CDN auto-headers from deeper routes override parent CDN headers
- [x] `cdn.tags` supports static array or function with params context
- [x] `cdn: false` disables CDN headers for a route
- [x] Works on any platform — just HTTP headers
- [x] 2529 unit + 655 e2e tests pass, TypeScript clean

**Generated headers**:

- `Cache-Control: public, max-age={maxAge}[, stale-while-revalidate={swr}]` (or `private` if `cdn.private: true`)
- `Surrogate-Key: tag1 tag2` (from `cdn.tags`)

**Files**: `src/loader-pipeline/index.ts` (`buildCdnCacheHeaders` + Phase 6 wiring)

#### Phase B.5: Auth type inheritance ✅

Parent layout `.authenticate()` flows to child routes at the type level.

- [x] Generator emits `authModes` map (virtualPath → `true | "optional"`) in `FlareRegister`
- [x] Type chain: `ParentAuthResolution` → `AuthChain` → `StrictestAuth` → `RouteAuthMode`
- [x] `true` wins over `"optional"` wins over `false` in parent chain
- [x] 7 type-level tests for `RouteAuthMode` + `ParentAuthResolution`
- [x] E2E type-check file: `_checks/auth-inheritance.check.ts` (8 compile-time assertions)
- [x] Auth type auto-derived: `createServerHandler` captures `TAuth` via phantom `__auth` property, generator emits `auth: NonNullable<typeof _FlareHandler["__auth"]>` — no manual `FlareRegister.auth` declaration needed
- [x] Virtual module types auto-generated into `_gen/virtual.gen.d.ts` — no manual `env.d.ts` needed
- [x] `serverFile` option on `RunGenerateOptions` + `FlarePluginConfig` for custom server entry path
- [x] E2E `env.d.ts` deleted — all type declarations now auto-generated
- [x] 2784 unit tests pass, 655 e2e tests pass, TypeScript clean

**Files**: `src/route-builder/register.ts`, `src/generators/index.ts`, `src/server-handler/index.ts`, `src/plugins/index.ts`, `tests/unit/route-builder/register-types.test.ts`

#### Phase C: KV cache layer ✅

**Done**. Platform-agnostic `CacheStore` interface on `ServerHandlerConfig` — no `flare-cf` adapter needed.

- [x] `CacheStore` + `CacheEntry` interfaces in `src/route-builder/types.ts`
- [x] `cacheStore` on `ServerHandlerConfig` — direct object or `(env: TEnv) => CacheStore` factory
- [x] Loader pipeline Phase 4 KV intercept — check cache before loader, write-back after
- [x] KV key: custom `key()` function or default `flare:${virtualPath}:${JSON.stringify(params)}`
- [x] `staleTime` freshness check via `storedAt` timestamp, `ttl` GC hint passed to store
- [x] Error resilience: get failure → treat as miss, set failure → non-fatal
- [x] `CacheConfig<TPath>` generic — conditional `static` field (boolean for static paths, callback for dynamic)
- [x] `HasDynamicSegments<T>` + `StaticConfig<TPath>` conditional types
- [x] Generator detects `static: true` and `static: () => [...]` in `.cache()` config
- [x] `CacheStore`, `CacheEntry` exported from `flare/server`
- [x] 34 new unit tests (KV intercept, cache-store config, type tests, generator detection)
- [x] 11 new e2e tests (SSR hit, SPA navigation, parameterized routes, static config, console cleanliness)
- [x] 2912 unit + 692 e2e tests pass, TypeScript clean

**Files**: `src/route-builder/types.ts`, `src/route-builder/create-page.ts`, `src/loader-pipeline/index.ts`, `src/server-handler/index.ts`, `src/generators/index.ts`, `src/server.ts`

---

### WS3: Deferred Cache ✅

**Priority**: Medium (perf win, low complexity)

**Done**. `cacheDeferred: true` on `ClientCacheConfig` enables deferred cache resolution.

- [x] `DeferredTracker` in `src/caches/index.ts` — tracks pending deferreds per matchId
- [x] `replaceDeferredMarkers()` — walks data tree, replaces `{ __deferred, __key }` with resolved values
- [x] `collectDeferredPromises()` — walks hydrated data, collects Promise references
- [x] When all deferreds resolve: `hasDeferred = false`, data markers replaced, `updatedAt` reset
- [x] If any deferred rejects, keeps `hasDeferred = true` (conservative)
- [x] `cacheDeferred: true` on `ClientCacheConfig` — opt-in per route
- [x] Generator extracts `cacheDeferred: true` from source, emits in route tree metadata
- [x] NDJSON client sets `hasDeferredMarkers` on non-prefetch matches
- [x] Navigation Step 9 sets `hasDeferred` on matchCache, wires DeferredTracker for `cacheDeferred` routes
- [x] 2520 unit + 655 e2e tests pass, TypeScript clean

**Files**: `src/caches/index.ts`, `src/ndjson-client/index.ts`, `src/navigation/index.ts`, `src/generators/index.ts`

---

### WS4: Server Function Streaming

**Priority**: Medium (new capability, independent of cache work)

#### Phase A: Stream handler ✅

**Done**. `.stream()` terminal method on serverFn builder with NDJSON transport.

- [x] New terminal method `.stream()` on serverFn builder
- [x] `StreamContext<TAuth, TInput, TEnv>` — like `HandlerContext` but with `signal: AbortSignal`, no `piggyback`
- [x] `StreamFn<_TInput, TChunk>` — callable returns `AsyncIterable<TChunk>` with `_registration`
- [x] `ServerFnRegistration.stream?: boolean` flag distinguishes stream from handler fns
- [x] Transport: `text/x-ndjson` — `{ c: value }` chunks, `{ e: { message } }` errors, `{ d: true }` done
- [x] Server-side direct invocation: validates input, returns async iterable wrapping generator
- [x] Client receives async iterator: `for await (const chunk of serverFn(input))`
- [x] Abort support via AbortController + `ctx.signal` on `StreamContext`
- [x] Auth/authorize still run before stream starts — failures return normal JSON (401/400/403)
- [x] Error during stream → `{ e: { message } }` chunk + stream close
- [x] Plugin stripping: `stripHandlerBodies` handles both `.handler(` and `.stream(`
- [x] `HANDLER_RE` updated to `/\.(handler|stream)\s*\(/`
- [x] `StreamContext`, `StreamFn` exported from `flare/server`
- [x] 2878 unit + E2E streaming tests pass, TypeScript clean

**Consumer pattern**:

```ts
createServerFn({ name: "chat" })
	.input(z.object({ prompt: z.string() }))
	.stream(async function* (ctx) {
		for await (const chunk of ai.stream(ctx.input.prompt)) {
			yield chunk;
		}
	});
```

**NDJSON protocol**:

```
{"c":"Hello"}
{"c":" world"}
{"c":"!"}
{"d":true}
```

**Files**: `src/server-fn/index.ts`, `src/server.ts`, `src/plugins/index.ts`

#### Phase B: Mutation invalidation streaming

- [ ] After mutation serverFn completes, optionally stream back fresh data for invalidated routes
- [ ] Extends piggyback concept: instead of just query cache, stream route loader data
- [ ] Client receives invalidation instructions + fresh data in one response
- [ ] Eliminates second round-trip after mutation

**Files**: `src/server-fn/index.ts`, `src/server-handler/index.ts`, new client-side stream consumer

---

### WS5: Unified Cache Invalidation (CF adapter)

**Priority**: Medium (depends on WS2-C)

Single `invalidate()` call clears all cache layers.

- [ ] `ctx.invalidate({ routes, params })` in serverFn handler context
- [ ] Client layer: piggyback invalidation instruction in response -> client marks matchCache entries stale
- [ ] CDN layer: CF Cache API purge by surrogate key
- [ ] KV layer: prefix-scanned delete
- [ ] Batch operation: all three layers in parallel

```ts
/* In serverFn after mutation */
createServerFn({ name: "updatePost" }).handler(async (ctx) => {
	await db.updatePost(ctx.input);
	ctx.invalidate({
		routes: ["/posts", "/posts/[id]"],
		params: { id: ctx.input.id },
	});
	return { ok: true };
});
```

**Files**: `packages/flare-cf/src/invalidation.ts`, `src/server-fn/index.ts` (handler context)

---

### WS5.5: Server Function Client Safety ✅

**Priority**: High (security — convention-safe today, enforcement needed)

**Done**. Handler stripping implemented in `flare:server-fn` plugin (WS7).

- [x] Vite plugin detects `.handler(fn)` in client builds via paren-depth tracking
- [x] Replaces handler body with no-op stub: `() => { throw new Error("Server function called on client") }`
- [x] Handler implementation stripped from client bundle — enforced, not convention
- [x] `_registration` preserved (client needs `id`, `name`, `method` for RPC)
- [x] Server build keeps full implementation (SSR env skips transform)
- [x] Works with HMR — stubs in dev mode too (client env always stripped)
- [x] Unit tests: simple arrow, async arrow, block body, nested parens, multiple handlers

**Files**: `src/plugins/index.ts` (`stripHandlerBodies`, client-only transform in `flare:server-fn`)

---

### WS5.6: NotFound Mode — URL Miss vs Programmatic Throw ✅

**Priority**: Low (niche but correct — TanStack parity)

**Done**. `notFoundMode` config (`"fuzzy"` default, `"root"` option) distinguishes URL misses from programmatic `throw notFound()`.

- [x] `matchRoute()` null → check `router.notFoundMode`
- [x] `"root"`: set global notFound flag, clear matches — root notFound boundary renders
- [x] `"fuzzy"`: `matchRoutePartial()` finds deepest matching URL prefix, loads layout chain, synthetic notFound page at leaf — layout shell renders with notFound boundary in child area
- [x] SSR: same fuzzy/root logic in server-handler — returns 404 status with layout shell
- [x] Programmatic `throw notFound()`: unchanged — always nearest boundary walk-up
- [x] Outlet fix: `OutletContent` fallback renders notFound boundary when `notFound=true` + no matches (was blank screen)
- [x] 2854 unit + 674 e2e tests pass, TypeScript clean

**Files**: `src/router-primitives/tree.ts` (`matchRoutePartial`), `src/router-config/index.ts`, `src/outlet/index.tsx`, `src/navigation/index.ts`, `src/hydrate/index.tsx`, `src/server-handler/index.ts`

---

### WS7: Vite Plugin Convention Layer ✅

**Priority**: High (eliminates boilerplate, enables WS5.5 + auto-discovery)

**Done**. All standalone plugins merged into `createFlarePlugins()`. Server fn auto-discovery, handler stripping, config defaults.

- [x] `createFlarePlugins()` returns 8 plugins (was 5): server-fn + CSS plugins included by default
- [x] Config flags: `serverFn: false` / `css: false` to opt out
- [x] Auto-scan `src/` for `createServerFn` calls → `virtual:flare-server-fn-map` (SSR-only)
- [x] HMR: file watcher re-scans, invalidates virtual module in dev server module graph
- [x] Strip `.handler(fn)` from client bundles (WS5.5) — paren-depth tracking
- [x] `virtual:flare-is-dev` — boolean from Vite mode (development vs production)
- [x] `entryScript` defaults to `"/src/client.tsx"`, `isDev` defaults to `false`
- [x] `virtual.d.ts` — TypeScript declarations for all virtual modules (kept as reference, but generator now emits `virtual.gen.d.ts` automatically)
- [x] E2e app updated: exports server fns, uses virtual modules, no manual wiring
- [x] Server fn map keyed by `name` (not hash `id`) — backward-compatible URLs `/_fn/{name}/{name}`
- [x] `serverFnQueryOptions`/`serverFnMutationOptions` URL uses name for both segments
- [x] Link `hash` prop passed through to `navigate()` (was missing — hash only in `<a>` href)
- [x] 2805 unit + 655 e2e tests pass, TypeScript clean

**Consumer pattern (after)**:

```ts
/* vite.config.ts — unchanged, single call */
plugins: [solid({ ssr: true }), ...createFlarePlugins({})]

/* server-fns.ts — export fns, no buildServerFnMap */
export const echoFn = createServerFn({ name: "echo" }).handler(...)

/* server.ts — virtual module, no manual config */
import serverFns from "virtual:flare-server-fn-map"
import isDev from "virtual:flare-is-dev"
createServerHandler({ router, serverFns, isDev })

/* client.tsx — devOverlay via virtual module */
import isDev from "virtual:flare-is-dev"
hydrate(router, { devOverlay: isDev })
```

**Files**: `src/plugins/index.ts`, `src/plugins/virtual.d.ts`, `src/plugins.ts`, `src/server-handler/index.ts`, `src/hydrate/index.tsx`

---

### WS8: Theme & Direction Context Refactor ✅

**Priority**: Medium (DX — removes manual `initTheme()` / `initDirection()` from consumer)

**Done**. Module-level singletons replaced with Solid context providers. Config on router, auto-initialized by `hydrate()`.

- [x] `ThemeProvider` + `useTheme()` — reactive signals from Solid context
- [x] `DirectionProvider` + `useDirection()` — reactive signals from Solid context
- [x] `theme?: ThemeConfig` and `direction?: DirectionConfig` on `RouterConfig`
- [x] SSR: providers SSR-safe (`sharedConfig.context` passthrough), `<ThemeScript>`/`<DirectionScript>` read from SSR context
- [x] Client: `hydrate()` wraps FlareProvider with providers using `r.theme`/`r.direction`
- [x] Hydration alignment: SSR `Hydration > Theme > Direction > FlareProvider` matches client `Dummy > Theme > Direction > FlareProvider`
- [x] Media query listener in `onMount`/`onCleanup` — proper lifecycle, no leaks
- [x] `localStorage` persistence via `createEffect(on(..., { defer: true }))`
- [x] Transition-disable on theme change (configurable)
- [x] No backward compat needed — old `initTheme()`/`initDirection()` deleted
- [x] 2784 unit + 655 e2e tests pass, TypeScript clean

**Consumer pattern (after)**:

```ts
/* router.ts */
createRouter({ theme: { defaultTheme: "system" }, direction: { defaultDir: "ltr" }, ... })

/* client.tsx — no init calls */
hydrate(router)

/* Any component */
const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()
const { direction, setDirection, toggleDirection } = useDirection()
```

**Files**: `src/theme/index.tsx`, `src/direction/index.tsx`, `src/hydrate/index.tsx`, `src/ssr/index.tsx`, `src/router-config/index.ts`, `src/client.ts`

---

### WS6: Type-Safe Routes

**Priority**: High (table-stakes for modern routing)

#### Phase A: Route type registry ✅

- [x] Generator emits `FlareRegister` declaration merging in `routes.gen.ts`
- [x] `FlareRegister` changed from `type` to `interface` (enables declaration merging)
- [x] `extractParamsFromPattern()` extracts param names + types from URL patterns
- [x] `generateRouteRegistry()` builds `declare module "@lovrozagar/flare"` block
- [x] Single param `[id]` → `string`, catch-all `[...slug]` → `string[]`, optional `[[...locale]]` → `string[] | undefined`
- [x] Params sorted alphabetically within each route type
- [x] Routes sorted by URL path, layouts + response routes excluded
- [x] Registry auto-appended to generated `routes.gen.ts` output
- [x] 2554 unit + 655 e2e tests pass, TypeScript clean
- [x] Infer param types from `.input()` validators via `routeParams` + `InferParams` (same pattern as `routeSearchParams`)

#### Phase B: Type-safe Link + navigate ✅

- [x] `LinkProps.to` → `RoutePaths | (string & {})` (autocomplete + accepts any string)
- [x] `NavigateOptions.to` → same type
- [x] `useLoaderData<TPath>` → `Accessor<RouteLoaderData<TPath>>`
- [x] `usePreloaderContext<TPath>` → `Accessor<RoutePreloaderContext<TPath>>` with parent chain inheritance
- [x] Generator emits `routeModules` (typeof imports) + `routeParents` (layout chain tuples)
- [x] `computeParentLayouts()` builds parent chain via prefix matching
- [x] `PreloaderChain<TPaths>` recursive intersection type for inherited preloader context
- [x] `RouteLoaderData<T>` / `RoutePreloaderContext<T>` with `unknown` fallback for unregistered paths
- [x] 51 type-level tests (InferLoaderData, InferPreloaderContext, intersection safety, deep inheritance, RouteAuthMode, ParentAuthResolution)
- [x] 2785 unit + 655 e2e tests pass, TypeScript clean
- [x] Conditional `params` prop: required when route has `[param]` segments
- [x] `buildUrl` typed — params/search passed through Link + navigate
- [x] Generic `Link<TPath>` with `RouteParamsProps<TPath>` intersection
- [x] `NavigateOptions<TPath>` generic, `InternalNavigateOptions` hides `_popstate`/`_restoreScroll`
- [x] `PrefetchOptions` accepts params/search
- [x] Fixed pre-existing `RoutePaths` conditional bug: `"routes" extends keyof FlareRegister` (was broken when any non-routes augmentation present)
- [x] Excluded `src/_gen/` from tsconfig (generated stubs poisoned type compilation)

#### Phase B.5: Full anchor props + external `href` + safe defaults ✅

- [x] `FlareAnchorProps` base type — `Omit<JSX.AnchorHTMLAttributes, "children" | "href">` gives autocomplete for all native `<a>` attrs
- [x] Discriminated union: `InternalLinkProps` (`to`) + `ExternalLinkProps` (`href`) — no `to`/`href` conflict
- [x] External `href` renders plain `<a>`, no SPA nav/prefetch/active state, protocol sanitization preserved
- [x] Auto `rel="noopener noreferrer"` for `target="_blank"` (both internal + external), explicit `rel` always wins
- [x] `activeProps`/`inactiveProps` — `FlareAnchorProps` objects merged on active state (class concatenated, style merged, other attrs spread)
- [x] Native attrs (`title`, `download`, `id`, `aria-*`, `data-*`) flow through `...rest` to `<a>` and disabled `<span>`
- [x] `FlareAnchorProps` + `ExternalLinkProps` exported from `flare/client`
- [x] Fixed pre-existing test bug: `Object.defineProperty(window, "location")` polluting subsequent tests
- [x] 2839 unit + 16 new e2e + 17 existing link e2e tests pass, TypeScript clean

**Files**: `src/link/index.tsx`, `src/client.ts`, `tests/unit/link/link.test.tsx`, e2e `link-features.tsx` + `deep-link-features.test.ts`

#### Phase C: Search params typing ✅

- [x] Generator extracts search param types from `.input()` validators → emits `routeSearchParams` in `FlareRegister`
- [x] `RouteSearchType<TPath>` resolves typed search per route, loose `Record<string, unknown>` otherwise
- [x] `RouteSearchProps<TPath>` makes `Link search` prop typed per-route
- [x] `useRouter().location().search` already typed via provider context

**Files**: `src/generators/index.ts`, `src/link/index.tsx`, `src/route-builder/register.ts`

---

## Dependency Graph

```
WS1 (client entry)          -- ✅ DONE
WS2-A (rename + namespace)  -- ✅ DONE
WS2-B (cdn shorthand)       -- ✅ DONE
WS2-B.5 (auth inheritance)  -- ✅ DONE
WS2-C (kv layer)            -- ✅ DONE (CacheStore on ServerHandlerConfig, no adapter)
WS3 (defer cache)           -- ✅ DONE
WS4-A (stream serverFn)     -- ✅ DONE
WS4-B (mutation streaming)  -- READY (independent of WS5)
WS5 (unified invalidation)  -- READY (WS2-C done)
WS5.5 (serverFn safety)     -- ✅ DONE (implemented in WS7)
WS5.6 (notFound mode)       -- ✅ DONE
WS6-A (route registry)      -- ✅ DONE
WS6-B (typed link/navigate) -- ✅ DONE
WS6-B.5 (anchor props/href) -- ✅ DONE
WS6-C (typed search)        -- ✅ DONE
WS7 (vite plugin)           -- ✅ DONE
WS8 (theme/direction ctx)   -- ✅ DONE
```

**Next up** (no blockers):

1. **WS5** (unified invalidation) — medium, unblocked by WS2-C
2. **WS4-B** (mutation streaming) — blocked by WS5

---

## Architecture: Core vs CF Adapter

```
flare          (core, platform-agnostic)
  src/
    cache/             staleTime, gcTime, client memory cache
    hydrate/           client entry bootstrap
    server-fn/         stream() handler, piggyback
    generators/        route registry types
    link/              type-safe Link<TRoute>
    route-builder/     CacheStore + CacheEntry interfaces
    loader-pipeline/   KV cache intercept (Phase 4)
    server-handler/    cacheStore on ServerHandlerConfig

flare-cf       (CF Workers adapter, optional — future)
  src/
    cdn-cache.ts       Cache API + surrogate key management
    invalidation.ts    unified purge (client + cdn + kv)
    env.ts             typed Env bindings
    do-coordinator.ts  (future) DO-based cache coordination
```

Core uses standard Web APIs only: `Request`, `Response`, `ReadableStream`, `URL`.
CF adapter imports `@cloudflare/workers-types` and wraps core with CF primitives.

---

## Appendix: Data Transport Comparison (Flare vs Next RSC vs TanStack)

> **Caveat**: These are NOT equivalent pages. Different sites, different complexity. Included for architectural analysis of wire format, not payload size benchmarks. A fair comparison requires building the same page on all three.

### Flare — NDJSON

**Source**: Flare e2e test app, `empty-loader` page (minimal: root layout + one page, no real data).

```
{"m":"_root_:{}:[]","t":"l"}
{"d":{},"m":"_root_/empty-loader:{}:[]","t":"l"}
{"d":{"meta":{"charset":"utf-8","viewport":"..."},"title":"Flare E2E"},"m":"_root_:{}:[]","t":"h"}
{"d":{"meta":{"charset":"utf-8","viewport":"..."},"title":"Flare E2E"},"m":"_root_/empty-loader:{}:[]","t":"h"}
{"t":"r"}
{"t":"d"}
```

**Format**: Newline-delimited JSON. One object per line. Standard `application/x-ndjson`.

**Message types**:

- `t:"l"` — loader data. `m` = matchId (route+params+search+deps), `d` = data payload
- `t:"h"` — head config per route. Streamed as structured data (title, meta, OG, etc.)
- `t:"r"` — ready signal. All initial loader data sent. Client can render.
- `t:"d"` — done signal. All deferred data resolved. Stream closes.
- (deferred chunks arrive between `"r"` and `"d"`)

**What it sends**: Only loader data + head config + control signals.
**What it doesn't send**: No component tree. No JS chunk refs. No CSS/font hints. Client already has components from SSR hydration.
**Head tags**: First-class. Streamed per-route as structured data, cached by matchId. Client `head-client` module applies them to `<head>` on SPA navigation.
**Debuggability**: High. Every line is valid JSON. matchId tells you exactly which route. Copy-paste into `JSON.parse()`.

### Next.js RSC — Flight protocol

**Source**: Production Next.js site (webcomet.eu), `/services` page. Full production app with i18n, many chunks.

```
9:I[36673,[],"MetadataBoundary"]
b:I[36673,[],"ViewportBoundary"]
:HL["/_next/static/media/...woff2","font",{...}]
:HL["/_next/static/css/...css","style"]
0:{"P":null,"b":"PGBpZTF5...","c":["","en-US","services"],"f":[[["",{"children":[["(route)",...
f:I[69949,["8821","static/chunks/8821-8fff7607...","4226","static/chunks/4226-d10c1b33...
...24 more chunk loading lines...
11:["$","$L1d",null,{"children":["$","$L1e",null,...
```

**Format**: Custom "flight" protocol. Mix of:

- `I[moduleId, [chunkIds...], exportName]` — module/component references
- `:HL[url, type, options]` — resource hints (fonts, CSS)
- `{"P":...,"f":...}` — serialized route tree with nested component structure
- `["$","$Lref",null,{props}]` — virtual DOM nodes referencing loaded modules

**What it sends**: EVERYTHING. Serialized component tree + all JS chunk references (24+ lines of chunk IDs) + font/CSS preloads + metadata boundaries + virtual DOM structure.
**Head tags**: `MetadataBoundary` and `ViewportBoundary` markers. Metadata embedded in the serialized component tree — not separate from UI.
**Problem**: Data and UI are coupled. Can't cache "just the data" — the entire component tree is the response. Every SPA navigation re-sends the full tree for the route.
**Debuggability**: Low. Custom protocol with base64 encoded segments, `$L` component refs, chunk ID arrays. Need RSC-specific tooling to inspect.

### TanStack Start — SSE

**Source**: Production TanStack Start site (ecomet.eu), solutions page. Uses serverFns for all data loading.

```
{t: 10, i: 0, p: {k: ["result", "error", "context"], ...}, o: 0}
{t: 10, i: 1, p: {k: ["data", "queries", "translations"], v: [...], s: 3}, o: 0}
{t: 2, s: 1}
{t: 10, i: 7, p: {k: [], v: [], s: 0}, o: 0}
```

**Format**: Server-Sent Events. Streams dehydrated router/query state.

**Architecture**: In TanStack Start, ALL data loading goes through serverFns. There's no separate "loader" concept — route loaders call serverFns internally. This means:

- Every data request is a serverFn call
- The SSE endpoint streams the combined dehydrated state (router + query cache)
- `k: ["data", "queries", "translations"]` is a query cache key from a user serverFn, not framework internals

**Network tab DX**: Routes show as hashed IDs (`717c60d20d299d003fcf...`, `f5ff751e73b1d952af49...`) — not human-readable paths like `/about`. You can't tell which request maps to which page without cross-referencing source code.

**Head tags**: Not visible in the data stream. Handled separately — likely via client-side head management (react-helmet or similar), not streamed as data. This means head/meta updates on SPA navigation happen independently from the data flow.

**Debuggability**: Low-medium. The structured objects (`t`, `i`, `p`, `k`, `v`, `s`, `o`) are not self-documenting. Without TanStack internals knowledge, you can't tell what `t: 10` means or why `s: 3` matters. Routes are hashed in the network tab.

### What We Can Compare (Architecture, Not Payload Size)

| Aspect                       | Flare                              | Next RSC                           | TanStack Start                   |
| ---------------------------- | ---------------------------------- | ---------------------------------- | -------------------------------- |
| **Transport**                | NDJSON (chunked)                   | RSC flight (chunked)               | SSE                              |
| **Content type**             | `application/x-ndjson`             | Custom RSC protocol                | `text/event-stream`              |
| **Data model**               | Loader data per route              | Full component tree                | Dehydrated query cache           |
| **Sends component tree**     | No                                 | Yes                                | No                               |
| **Sends JS chunk refs**      | No                                 | Yes                                | No                               |
| **Head/meta in stream**      | Yes (first-class `t:"h"`)          | Yes (embedded in vDOM)             | No (separate mechanism)          |
| **Cache key design**         | matchId (route+params+search+deps) | None (tree is the response)        | Query key arrays                 |
| **Client-side data caching** | Yes (data decoupled from UI)       | Hard (data inside vDOM)            | Yes (query cache)                |
| **Route IDs in network tab** | matchId with virtual path          | Route path visible                 | Hashed, opaque                   |
| **Debuggability**            | High (JSON lines, human-readable)  | Low (custom binary-like)           | Low (opaque SSE + hashed routes) |
| **Data loading model**       | Route loaders (server-side)        | Server components (render = fetch) | serverFns (all data is RPC)      |
| **Deferred/streaming data**  | Native (chunks between ready/done) | Suspense boundaries                | Via query cache hydration        |

### Architectural Observations

**Flare sends head as data, others don't (or bury it).**
Flare treats head config as first-class streamed data — each route's `t:"h"` chunk contains structured title/meta/OG config, cached per matchId. On SPA navigation, the client applies new head tags from cache without touching the server if data is fresh. Next embeds metadata inside the component tree (you get it, but it's inseparable from UI). TanStack doesn't appear to stream head at all — it's handled out-of-band.

**TanStack's serverFn-for-everything model makes the network tab opaque.** When all data flows through serverFns with hashed IDs, you lose the ability to quickly inspect "what data did `/about` load?" in DevTools. Flare's matchIds include the virtual path — `_root_/empty-loader:{}:[]` tells you exactly what route and params. Next at least shows the route path in the RSC request URL.

**Data/UI coupling is the fundamental split.** Next sends UI+data fused together (RSC). Flare and TanStack send data-only. This is why Flare and TanStack can cache route data client-side effectively — the data is separable. Next can't because the component tree IS the response.

### TODO: Fair Benchmark

For a proper comparison, build the same page on all three:

- [x] Simple blog post: one layout (nav) + one page (post content)
- [x] Loader data: `{ title, body, author, publishedAt }`
- [x] Head config: title, description, OG image, canonical URL
- [x] Measure: SPA navigation response size, line count, time-to-interactive
- [x] Compare: what's in each response, what's cached, what's re-sent on revisit
- [x] Deep analysis: wire protocol annotation, data/UI coupling, overhead measurement

---

## Appendix C: Architectural Scorecard (Flare vs Next.js vs TanStack Start)

Deep 20-dimension comparison. Scored 1-10 per dimension.

### Core Runtime

| Dimension               | Flare | Next | TanStack | Notes                                                                                                             |
| ----------------------- | ----- | ---- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| Bundle size             | 10    | 4    | 6        | 76KB vs 756KB (Next) vs 316KB (TanStack) in prod                                                                  |
| SSR streaming           | 9     | 8    | 7        | NDJSON chunk-level control vs RSC Flight vs basic Suspense                                                        |
| SPA nav wire efficiency | 9     | 5    | 7        | matchId staleness skips fresh loaders. Next re-sends UI+data fused                                                |
| Deferred / real-time    | 9     | 6    | 7        | NDJSON deferred streaming, cached on resolve. Next: Suspense. TanStack: Await                                     |
| Server Components       | 1     | 10   | 3        | Next: zero-JS RSC. Different paradigm — Flare compensates with 10x smaller bundle + fine-grained Solid reactivity |

### Data & Caching

| Dimension               | Flare | Next | TanStack | Notes                                                                                               |
| ----------------------- | ----- | ---- | -------- | --------------------------------------------------------------------------------------------------- |
| Caching architecture    | 9     | 8    | 4        | 3-layer (client/KV-R2-S3-DB/CDN) vs Data Cache + ISR vs none                                        |
| Data loading patterns   | 8     | 8    | 9        | TanStack: loaderDeps, staleTime. Flare: parallel loaders + preloader chain. Next: RSC + fetch cache |
| Static generation / ISR | 2     | 10   | 4        | Next: mature SSG/ISR/PPR. TanStack: basic prerender. Flare: planned                                 |
| Head management         | 9     | 8    | 5        | Per-route streamed head, cached per matchId vs Metadata API vs out-of-band                          |

### DX & Type Safety

| Dimension                   | Flare | Next | TanStack | Notes                                                                                                                                         |
| --------------------------- | ----- | ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Type safety (routing)       | 8     | 5    | 8        | Both Flare and TanStack use Vite plugin codegen (`routes.gen` / `routeTree.gen`). Next: experimental typedRoutes                              |
| Type safety (search params) | 9     | 3    | 9        | TanStack: validated search state machine. Flare: `.input()` validators run client-side on shallow nav + server-side on full nav. Next: manual |
| Error boundaries            | 10    | 6    | 5        | 4-type (error/notFound/unauthenticated/unauthorized) vs error.tsx + not-found.tsx vs errorComponent                                           |
| Auth integration            | 9     | 5    | 6        | Pipeline-native `.authenticate()` with optional/required modes vs middleware + manual vs beforeLoad                                           |
| Testing story               | 9     | 5    | 6        | 2854 unit + 674 e2e, purpose-built harness vs manual setup vs basic vitest                                                                    |

### Platform & Deployment

| Dimension                    | Flare | Next | TanStack | Notes                                                                                                                         |
| ---------------------------- | ----- | ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Edge runtime                 | 10    | 6    | 7        | CF Workers first, adapter-agnostic core (`fetch(Request): Response`). Uses `cloudflare()` Vite plugin, not hardcoded          |
| Deployment breadth           | 6     | 9    | 8        | CF Workers first adapter. Core is platform-agnostic — any runtime wrapping `fetch()` works. Node/Bun adapters planned         |
| View transitions             | 9     | 3    | 7        | Native VT API + `<ViewTransitionCSS>` component for easy CSS transitions. TanStack: viewTransition option. Next: experimental |
| Middleware                   | 8     | 7    | 8        | Server + route-level preloaders vs edge middleware vs client + server middleware                                              |
| Intercepting/parallel routes | 8     | 9    | 2        | `.intercept({ from, render })` + `InterceptOutlet` render-prop. No parallel routes yet                                        |
| Image optimization           | 8     | 10   | 2        | `<Image>` component with loader interface, blur placeholder, srcset, priority hints. CF Image Resizing via custom loader      |

**Totals: Flare 161, Next.js 135, TanStack 113**

### `.input()` Validation Analysis ✅ FIXED

Behavior:

- **Server (loader pipeline Phase 1)**: `.input({ params, searchParams })` validators run via Zod or function — validates and transforms before loaders execute
- **Client full SPA nav**: request goes to server → validation runs server-side → safe
- **Client shallow nav**: Loads route module via `match.route.p()` (cached from same-route), reads `inputConfig`, runs validators with try/catch fallback to raw values

**TanStack parity achieved**: validators run client-side on shallow nav. Defaults, coercion, and transforms all apply. Invalid validators fall back gracefully to raw values with `[flare:nav]` warning.

**Implementation**: `navigation/index.ts` shallow handler, 5 unit tests, 5 E2E tests.

### Genuine Gaps (What Next.js/TanStack Do Better)

**Static Generation & ISR (Next: 10, Flare: 2)**
Next's `generateStaticParams()` + `revalidate` is proven for content sites. Flare's CacheStore + CDN headers approximate this but lack true build-time prerendering. Planned: `flare build --static` for WS5.

**Server Components (Next: 10, Flare: 1)**
RSC eliminates client JS for static UI. Different paradigm — not a gap to close. Flare compensates with 10x smaller bundle and fine-grained Solid reactivity (no VDOM diffing).

**Intercepting & Parallel Routes (Next: 9, Flare: 8)** ✅
`.intercept({ from, render })` on pages + `InterceptOutlet` render-prop component in layouts. SPA nav from matching `from` variablePaths renders target as overlay while background stays. Dismiss via `state.dismiss()` (history.back). Direct URL load renders full page (no overlay). 6 E2E tests.

**Image Optimization (Next: 10, Flare: 8)** ✅
`<Image>` component built with srcset generation, lazy/eager loading, blur placeholder (`blurDataURL`), quality config, priority hints (`fetchpriority`), custom `ImageLoader` interface for CF Image Resizing or any CDN. Remaining gap: built-in format negotiation (avif/webp) and build-time placeholder generation.

**Search Param Validation on Client (TanStack: 9, Flare: 9)** ✅
TanStack validates search params on every client navigation. Flare now runs `.input()` validators client-side on shallow navigation — defaults, coercion, and transforms all apply. See `navigation/index.ts` shallow handler.

### Where Flare Wins Architecturally

- **Bundle size**: 76KB vs 756KB (Next) / 316KB (TanStack) — 10x smaller in prod
- **Edge-first, adapter-agnostic**: CF Workers first via `cloudflare()` plugin, core is standard `fetch(Request): Response`
- **Error boundaries**: 4-type model — granular auth error handling without catch-all
- **Wire efficiency**: NDJSON with matchId staleness — skip loaders for fresh data on SPA nav
- **Caching**: 3-layer pluggable (client staleTime + any storage backend + CDN auto-headers)
- **View transitions**: Native VT API + CSS transition component for easy adoption
- **Testing**: 3500+ tests, purpose-built harness
- **Head management**: Streamed per-route, cached per matchId
- **Auth pipeline**: `.authenticate()` with mode (required/optional) flows through route hierarchy
- **Env-bound functions**: `createServerOnlyFn`, `createClientOnlyFn`, `createIsomorphicFn` with Vite plugin DCE — server code stripped from client bundles, client code stripped from SSR bundles (TanStack Start parity)

### Strategic Implications for Phase 3

1. ~~**`<Image>` component**~~ ✅ — `flare/image` with loader interface, blur placeholder, priority hints, srcset generation, quality config
2. ~~**Client-side `.input()` validation**~~ ✅ — validators run on shallow nav via `match.route.p()` module load
3. ~~**Env-bound functions**~~ ✅ — `createServerOnlyFn`, `createClientOnlyFn`, `createIsomorphicFn` with Vite plugin DCE. 3 separate exports, 14 unit + 5 E2E tests
4. **Static prerendering** — `flare build --static` with route manifest
5. ~~**Intercepting routes**~~ ✅ — `.intercept({ from, render })` + `InterceptOutlet`. 6 E2E tests, variablePath fix landed
6. **Node.js / Bun adapter** — broaden deployment beyond CF Workers

---

## Non-Goals (Phase 2)

- ~~**isomorphicFn**~~ ✅ — implemented as `createIsomorphicFn`, `createServerOnlyFn`, `createClientOnlyFn`. Vite plugin extracts env-specific branch at build time (full DCE). Separate exports: `flare/create-server-only-fn`, `flare/create-client-only-fn`, `flare/create-isomorphic-fn`.
- **WebSocket support** — different paradigm, out of scope for router framework
- **Durable Objects coordination** — future phase, needs real multi-isolate use case first
- **File upload in serverFns** — FormData/multipart. Can add later without breaking changes.
- **Middleware** — server handler already has preloader chain. No express-style middleware needed.

---

## Success Criteria

- [x] Client entry: 4 lines (benchmark) / 15 lines (e2e with hooks), not 197
- [x] Route autocomplete in IDE (RoutePaths union type from FlareRegister)
- [x] Deferred data cached after resolution, respects staleTime
- [x] CDN cache headers auto-generated from `.cache({ cdn })` config
- [x] Parent `.authenticate()` type flows to child routes without own `.authenticate()`
- [x] All 2912 unit + 730 e2e tests pass, TypeScript clean
- [x] Type error on `<Link to="/nonexistent">` at compile time (strict RoutePaths, no escape hatch)
- [x] `<Link href="...">` for external URLs with full type safety (discriminated union, no `to` conflict)
- [x] `target="_blank"` auto-safe — `rel="noopener noreferrer"` injected by default
- [x] `activeProps`/`inactiveProps` — style/class/attr merging based on active state (TanStack parity)
- [x] serverFn handler code provably absent from client bundles (Vite plugin handler stripping)
- [x] Single `createFlarePlugins({})` call — no standalone plugin imports needed
- [x] Server fn auto-discovery — no manual `buildServerFnMap()` boilerplate
- [x] serverFn streams work with `for await`
- [x] KV cache layer reduces loader execution for cacheable routes (CacheStore + pipeline intercept)
- [x] Env-bound functions with Vite DCE — server code provably absent from client, client code absent from SSR
- [ ] Single `invalidate()` clears client + CDN + KV
- [ ] Static build step (`flare build --static`)
- [ ] global server context
- [ ] serverFn middlewares
