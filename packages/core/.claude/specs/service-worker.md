# Service Worker

## Required Approach

RED, CODE, GREEN — TDD — BOTH NEW vitest (unit) AND playwright (E2E) tests must be written and run always.

- vitest tests: `/home/ecomet/Development/monorepo/public/flare/tests`
- playwright tests: `/home/ecomet/Development/monorepo/public/flare-e2e`

NEVER BE LAZY.

MUST ALWAYS GREEN CONFIRM BOTH. Write new tests for ALL units and E2E. Then MUST run ALL available tests for both to ensure nothing broken. If this is not done — DO NOT report done, continue work. ABSOLUTE ZERO FALSE POSITIVE TOLERANCE.

```sh
# Unit tests (vitest)
bun run --cwd /home/ecomet/Development/monorepo/public/flare test

# Dev E2E (playwright)
bunx playwright test

# Prod E2E (playwright, specific files)
TEST_MODE=prod bunx playwright test
```

## Summary

Built-in service worker that ships with zero config. Precaches hashed static assets, enables navigation preload, provides deploy resilience, and optionally supports offline fallback.

## Goals

1. **Asset precaching** — cache-first for all content-hashed Vite chunks (JS/CSS/images). Eliminates network roundtrips on repeat visits.
2. **Deploy resilience** — old chunks survive deploys in SW cache. Prevents chunk load errors entirely (no more auto-reload hack). Old assets cleaned up on next SW activation.
3. **Navigation preload** — `NavigationPreloadManager` starts HTML fetch while SW boots. Zero startup tax on cold navigations.
4. **Offline shell** (opt-in) — network-first for documents with offline fallback page. App loads from cache even offline.

## Non-goals

- Don't cache NDJSON/route data — Flare's client cache already handles this
- Don't cache API responses or server function calls
- No background sync for mutations
- No stale-while-revalidate for HTML — conflicts with ISR/CDN strategies

## User API

### Minimal (default)

```ts
/* vite.config.ts */
flare({
	serviceWorker: true,
});
```

Enables asset precaching + navigation preload + deploy resilience. No offline support.

### With offline fallback

```ts
flare({
	serviceWorker: {
		offlineFallback: "/offline",
	},
});
```

When network fails for a document request and no cached HTML exists, serves the `/offline` route (must be a real route in the app — prerendered at build time and cached by the SW).

### Full config

```ts
flare({
	serviceWorker: {
		offlineFallback: "/offline",
		scope: "/", // SW scope, default "/"
		skipWaiting: true, // auto-activate new SW, default true
	},
});
```

### Disable (default)

```ts
flare({
	serviceWorker: false, // or omit entirely
});
```

No SW generated, no registration code emitted.

## Config Type

```ts
export interface ServiceWorkerConfig {
	offlineFallback?: string; // route path for offline page
	runtimeCacheMax?: number; // max cached HTML pages, default 32
	scope?: string; // SW scope, default "/"
	skipWaiting?: boolean; // auto-activate, default true
}
```

On `FlarePluginConfig`:

```ts
export interface FlarePluginConfig {
	// ... existing fields
	serviceWorker?: ServiceWorkerConfig | boolean;
}
```

`true` → `{}` (defaults). `false` / `undefined` → disabled. Object → merge with defaults.

## Architecture

### Build-time (Vite plugin)

New plugin: `createServiceWorkerPlugin(config)` in `src/plugins/service-worker.ts`.

#### `closeBundle` hook (prod build only)

1. Read `dist/client/.vite/manifest.json`
2. Extract all `file` values → these are the hashed asset URLs to precache
3. If `offlineFallback` configured, add the offline page HTML path to precache list
4. Generate `dist/client/sw.js` from template with:
   - `PRECACHE_MANIFEST`: array of URL strings (`["/assets/client-CzQ7yCba.js", "/assets/BH3asdLD.js", ...]`)
   - `SW_CONFIG`: serialized config (skipWaiting, scope, offlineFallback path, runtimeCacheMax)
   - `BUILD_ID`: hash of sorted manifest `file` values — unique per deploy

#### `configureServer` hook (dev mode)

Serve a no-op SW at `/sw.js` that immediately `skipWaiting()` + `clients.claim()`. This prevents stale dev SWs from interfering. No caching in dev.

### SW template (`src/service-worker/template.ts`)

The generated `sw.js` contains:

```js
/* Injected at build time */
const PRECACHE_MANIFEST = ["/assets/client-CzQ7yCba.js", "/assets/BH3asdLD.js", ...]
const SW_CONFIG = { skipWaiting: true, offlineFallback: null, runtimeCacheMax: 32 }
const BUILD_ID = "a1b2c3d4"
const CACHE_NAME = `flare-assets-${BUILD_ID}`
const RUNTIME_CACHE = "flare-runtime-v1"
```

`CACHE_NAME` is build-hash-based — each deploy gets a unique asset cache. Since all assets are content-hashed (or cached under a per-build key for unhashed files like entry CSS), no revision tracking is needed. On activate, all `flare-assets-*` caches not matching current `BUILD_ID` are deleted.

`RUNTIME_CACHE` is version-stable (not per-build) so cached HTML pages persist across deploys. Eviction uses LRU with `runtimeCacheMax` (default 32) — oldest entries deleted when limit exceeded.

#### `install` event

```
- Open CACHE_NAME cache
- cache.addAll(PRECACHE_MANIFEST)
- If offlineFallback configured, fetch + cache the offline page HTML in RUNTIME_CACHE
- If skipWaiting: self.skipWaiting()
- If addAll fails (network error), install fails — SW does not activate (browser default)
```

#### `activate` event

```
- Enable NavigationPreloadManager if supported:
    self.registration.navigationPreload.enable()
- Delete all caches matching /^flare-assets-/ that aren't current CACHE_NAME
- clients.claim()
```

#### `message` event

```
- If event.data.type === "SKIP_WAITING": self.skipWaiting()
  (Used by useServiceWorker() hook when skipWaiting: false)
```

#### `fetch` event — routing strategy

Only intercepts same-origin requests (`new URL(event.request.url).origin === self.location.origin`). Cross-origin requests always pass through.

```
request.destination or URL pattern → strategy:

1. Hashed assets (JS/CSS/fonts/images under /assets/):
   → Cache-first. Match in CACHE_NAME, fallback to network + cache.

2. Document requests (mode: "navigate"):
   → Use event.preloadResponse if available (NavigationPreloadManager).
   → Fallback to fetch(event.request).
   → On success: clone response, cache in RUNTIME_CACHE (with LRU eviction), return original.
   → On network failure: serve cached HTML from RUNTIME_CACHE if exists.
   → On cache miss + network failure: serve offlineFallback from RUNTIME_CACHE (if configured).

3. NDJSON requests (request has `x-d` header — set by fetchNDJSON):
   → Passthrough. Never cache.

4. Server function requests (/_fn/*):
   → Passthrough. Never cache.

5. Keepalive pings (/_flare/keepalive):
   → Passthrough.

6. Everything else:
   → Passthrough.
```

### Client registration (`src/hydrate/index.tsx`)

After hydration completes (after `document.documentElement.setAttribute("data-hydrated", "")`), registration is deferred until the browser is idle OR the user interacts — whichever comes first. This ensures zero Lighthouse impact (LCP, FID, TTI, TBT all unaffected):

```ts
function onceIdle(fn: () => void): void {
	let fired = false;
	const run = () => {
		if (fired) return;
		fired = true;
		cleanup();
		fn();
	};
	const events = ["mousemove", "touchstart", "scroll", "keydown"] as const;
	const cleanup = () => {
		for (const e of events) removeEventListener(e, run, { capture: true });
	};
	for (const e of events) addEventListener(e, run, { once: true, capture: true, passive: true });
	if ("requestIdleCallback" in window) {
		requestIdleCallback(run);
	}
}

if ("serviceWorker" in navigator) {
	onceIdle(() =>
		navigator.serviceWorker.register("/sw.js", {
			scope: "/",
			updateViaCache: "none", // always network-check SW file, never HTTP cache
		}),
	);
}
```

`onceIdle` lives in a shared util (`src/internal/once-idle.ts`) — reusable for any deferred non-critical work.

The registration path and scope come from a virtual module (`virtual:flare-sw-config`) that the Vite plugin resolves:

- Prod: `{ enabled: true, scope: "/", path: "/sw.js" }`
- Dev: `{ enabled: true, scope: "/", path: "/sw.js" }` (no-op SW)
- Disabled: `{ enabled: false }`

Registration is fire-and-forget — never blocks hydration or affects performance metrics. The `onceIdle` pattern guarantees the SW registers before meaningful user navigation (any interaction triggers it) while staying invisible to synthetic benchmarks.

### SW update flow

1. Browser checks for SW updates on navigation (standard behavior)
2. New SW installs in background, precaches new assets
3. `skipWaiting: true` (default) → new SW activates immediately
4. `activate` handler purges old asset cache (deletes `flare-assets-*` caches not matching current `BUILD_ID`)
5. Old tabs continue working — old chunk URLs are still content-hashed and distinct from new ones. When they navigate, they get the new SW.

This is safe because:

- All assets are content-hashed. New SW serves new URLs, old tabs request old URLs.
- Old cache entries persist through install, only purged on activate of the NEXT version.
- No runtime code depends on SW version matching page version.

### `skipWaiting: false` — manual update prompt

When `skipWaiting` is disabled, the new SW waits in `installed` state. Flare exposes a reactive hook:

```tsx
import { useServiceWorker } from "@lovrozagar/flare/use-service-worker";

function UpdateBanner() {
	const sw = useServiceWorker();
	return (
		<Show when={sw.updateAvailable()}>
			<button onClick={sw.update}>New version available — reload</button>
		</Show>
	);
}
```

Implementation: hydration code listens for `statechange` on the installing worker. When it reaches `installed`, a signal flips. `sw.update()` calls `registration.waiting.postMessage({ type: "SKIP_WAITING" })`, the SW handles it with `self.skipWaiting()`, and `controllerchange` triggers `window.location.reload()`.

### Unregister when disabled

If `virtual:flare-sw-config` says `{ enabled: false }`, hydration runs:

```ts
if ("serviceWorker" in navigator) {
	navigator.serviceWorker.getRegistrations().then((regs) => {
		for (const reg of regs) reg.unregister();
	});
}
```

This cleans up stale SWs from previous deploys that had SW enabled. Runs on idle via `onceIdle` — same pattern as registration.

### Offline fallback page

When `offlineFallback: "/offline"` is set:

1. **Build time**: the Vite prerender plugin (or a dedicated step) fetches `/offline` and saves the HTML
2. **SW install**: the offline page HTML is precached
3. **Runtime**: when a document request fails (network error) AND no cached HTML exists, the SW serves the offline page HTML

The offline page is a normal Flare route:

```tsx
/* src/routes/offline.tsx */
export const route = createPage("_root_/offline")
	.cache({ ssr: false, client: false })
	.loader(() => ({ offline: true }))
	.component((props) => (
		<div>
			<h1>You're offline</h1>
			<p>Check your connection and try again.</p>
		</div>
	));
```

It's prerendered to static HTML at build time so it works without network. The cached JS hydrates normally (precached by SW), so client-side interactivity works.

#### Build-time validation

When the plugin prerenders the offline page, it inspects the route config and warns about network-dependent features:

```
⚠ offlineFallback route "/offline" uses .authenticate() — this won't work offline
⚠ offlineFallback route "/offline" has useSuspenseQuery — network queries won't resolve offline
```

Checked: `.authenticate()`, `useSuspenseQuery` imports, server function imports. Warning only — doesn't block the build.

## Files

### New files

| File                                              | Purpose                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/plugins/service-worker.ts`                   | Vite plugin: generates SW, serves dev no-op, resolves `virtual:flare-sw-config` |
| `src/service-worker/template.ts`                  | SW source template with placeholder injection                                   |
| `src/internal/once-idle.ts`                       | `onceIdle(fn)` — idle OR first interaction, whichever first                     |
| `src/service-worker-hook/index.ts`                | `useServiceWorker()` — reactive hook for update prompt                          |
| `tests/unit/service-worker/sw-generation.test.ts` | Unit tests for manifest extraction + SW generation                              |

### Modified files

| File                    | Change                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `src/plugins/index.ts`  | Add `serviceWorker` to `FlarePluginConfig`, include `createServiceWorkerPlugin` in `flare()` output |
| `src/hydrate/index.tsx` | Register/unregister SW on idle after hydration using `virtual:flare-sw-config` + `onceIdle`         |

## Implementation order

### Phase 1: Core infra

1. `src/internal/once-idle.ts` — `onceIdle(fn)` helper
2. `src/service-worker/template.ts` — SW source as string template with `PRECACHE_MANIFEST`, `SW_CONFIG`, `BUILD_ID` placeholders
3. `src/plugins/service-worker.ts` — plugin: reads manifest.json, computes build hash, generates `sw.js`, serves dev no-op, resolves `virtual:flare-sw-config`
4. `src/plugins/index.ts` — wire `serviceWorker` into `FlarePluginConfig` and `flare()` output

### Phase 2: Client registration + unregister

5. `src/hydrate/index.tsx` — register SW on idle post-hydration (enabled) or unregister stale SWs (disabled), using `virtual:flare-sw-config` + `onceIdle`

### Phase 3: Offline fallback

6. Extend SW template with offline page precaching + network-first-with-fallback logic
7. Extend plugin to prerender offline page + include in precache manifest

### Phase 4: Update hook

8. `src/service-worker-hook/index.ts` — `useServiceWorker()` reactive hook for `skipWaiting: false` manual update prompt

### Phase 5: Tests

9. Unit tests for manifest parsing, SW generation, build hash derivation, LRU eviction
10. E2E: verify SW registers, assets cached, offline fallback works, unregister cleans up

## Storage

Cache API uses **disk storage**, not RAM — no memory pressure. Browser quota is generous (~half of available disk per origin, typically hundreds of MB minimum). Even a 200-route app with heavy vendor deps is ~10-15MB of hashed chunks — negligible for disk cache.

The SW + CDN complement each other: CDN saves the origin from serving static files, SW saves the browser from even hitting the CDN. Both treat hashed assets as immutable.

## Edge cases

- **No manifest.json** (dev mode): serve no-op SW, no precaching
- **basePath configured**: prepend basePath to all precache URLs and SW scope
- **Multiple tabs**: `skipWaiting` + `clients.claim` means all tabs get new SW. Safe because content-hashed assets.
- **CDN in front**: SW only intercepts same-origin requests. CDN-served assets from different origin pass through.
- **SSG/prerendered pages**: HTML is static and cacheable — SW caches them in RUNTIME_CACHE like any other document response.
- **ISR pages**: network-first ensures fresh content. Cached version only used as offline fallback.
- **Unhashed CSS/assets**: Vite may emit unhashed files (e.g. entry CSS). No special handling — `CACHE_NAME` is per-build, so every deploy gets a fresh asset cache. Unhashed files are simply re-cached with each build.
- **Static file serving (CF Workers)**: `sw.js` is emitted to `dist/client/` — Flare's server handler already serves static files from this directory. No special handling needed.
- **SW removed from config**: old SW persists in browsers. Hydration detects `{ enabled: false }` from virtual module and unregisters all existing SWs on idle.
- **RUNTIME_CACHE overflow**: LRU eviction at `runtimeCacheMax` (default 32). On each HTML cache write, if entries exceed max, oldest by insertion order is deleted.
- **Package export**: `flare/use-service-worker` must be added to `package.json` exports map pointing to `src/service-worker-hook/index.ts`.
- **SW file itself**: excluded from fetch handler — browser's SW update mechanism loads it directly, not via fetch.
