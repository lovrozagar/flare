# Flare: Dynamic Component Streaming

> Server-decided component trees via lazy component registries. Server returns a component key in loader data, client looks up a `lazy()` registry. No new protocol messages, no build plugins, no manifests.

## Status

- [x] Research & architecture
- [ ] Spec finalized

**Approach**: Full rewrite. Current Flare → `flare-v0` (archive). New `flare/` from scratch, TDD, `renderToStream()` from day 1. No HTML nav mode. No incremental migration.

---

## Context: Flare's Rendering Model

Flare is **server-driven** for CSR navigation. The server streams data to the client via NDJSON during every navigation. This is architecturally different from TanStack Start, SolidStart, and Remix where the **client** drives navigation by executing loaders locally and calling server functions via RPC when needed.

**Initial load**: `renderToStream()` produces HTML. If no `defer()` calls, stream completes immediately — effectively buffered, CDN-cacheable. If `defer()` is used, Suspense fallbacks sent in shell, resolved content streamed after. Developer controls what streams via `defer()` + `<Suspense>` placement.

**CSR navigation**: Server runs loaders, streams results via NDJSON. Client already has components loaded. Solid's fine-grained reactivity updates specific DOM nodes. Layouts persist. `defer()` streams JSON chunks as promises resolve.

### Flare vs TanStack Start — Navigation Model

|                             | Flare                                 | TanStack Start (React & Solid)                  |
| --------------------------- | ------------------------------------- | ----------------------------------------------- |
| Who runs loaders on CSR nav | **Server**                            | **Client** (calls server fns via RPC for data)  |
| Navigation protocol         | NDJSON stream (server -> client)      | HTTP fetch per server function call             |
| Server function transport   | N/A (server executes everything)      | Binary framed protocol / NDJSON / JSON fallback |
| Component tree decisions    | Server (component key in data)        | Always client (static route mapping)            |
| State serialization         | `self.flare` (JSON)                   | `window.$_TSR` (seroval + custom types)         |
| Streaming SSR               | `renderToStream()` (defer-controlled) | `renderToStream()` (progressive)                |

Flare's server-driven model means the server is always involved in navigation — it knows what data to send and which component key to return. TanStack's client-driven model means the client orchestrates everything, only calling the server for data when server functions are involved.

### Positioning

Closer to "Solid Server Components" than to RSC, but simpler:

- RSC sends component tree descriptions (Flight protocol). Client reconstructs tree.
- Flare sends data + a component key string. Client resolves via `lazy()` registry.
- 90% of RSC's benefit with 10% of the complexity — dynamism constrained to route slots, not arbitrary tree nesting.

**No Solid equivalent exists** for server-decided component trees. SolidStart has no server components. TanStack Start Solid (v0 alpha) has streaming SSR via `renderToStream()`, layout persistence via match reuse, and server functions via compiled RPC — but components are always determined by static route tree, never server-decided. Flare fills this gap.

---

## Decision: No HTML Nav Mode

Full rewrite — NDJSON only. HTML nav mode was a v0 stopgap. Not carried forward.

---

## Problem

NDJSON mode cannot render server-decided component trees:

| Feature                | NDJSON                         | HTML                            |
| ---------------------- | ------------------------------ | ------------------------------- |
| Streaming              | Yes (defer + chunks)           | No (await all)                  |
| Layout persistence     | Yes                            | No (full re-render + rehydrate) |
| Dynamic component tree | No (static route-to-component) | Yes (server decides)            |
| Code splitting         | Yes (route-level)              | Yes (but rehydrate everything)  |
| CDN cacheable          | Yes                            | Yes                             |
| CSR perf               | Excellent (surgical updates)   | Poor (innerHTML swap)           |

No mode can render **server-decided component trees** with **streaming** + **layout persistence** + **on-demand code splitting**.

### Use Cases

1. **Multi-tenant SaaS**: `/[...route]` renders different component trees per tenant config
2. **CMS-driven pages**: Server resolves page layout + blocks from database, renders matching components
3. **A/B testing**: Server picks variant components, client loads only the winning variant's JS
4. **Plugin systems**: Third-party components loaded dynamically per installation

---

## Architecture: Lazy Component Registry

### Core Idea

No protocol changes. No build plugins. No manifests. Just:

1. **Define** a component registry — `Record<string, ReturnType<typeof lazy>>` using **Solid's native `lazy()`** (from `solid-js`, NOT Flare's custom `lazy()`)
2. **Return** a component key as a string in preloaderContext or loaderData (must NOT be deferred)
3. **Look up** the key in the registry at render time

Solid's `lazy()` handles all code splitting, chunk loading, and SSR resolution natively.

> **Two lazy patterns in the rewrite.** `clientLazy()` from Flare for route-level code splitting (renders pending on SSR, eagerly preloads on client). Solid's native `lazy()` (`import { lazy } from "solid-js"`) for component registries (resolves on SSR, suspends on client). No naming collision — `lazy` always means Solid's.

### Why This Works

- `lazy()` wraps `import()` — Vite automatically creates separate chunks per component
- Content-hashed filenames — immutable CDN caching for free
- SSR: `lazy()` resolves immediately on server (all code in server bundle via Vite SSR build)
- CSR: `lazy()` triggers `import()` on first render — chunk downloaded on demand, **suspends** until loaded
- Browser module cache: revisiting same component = instant (no re-download)
- Shared dependencies deduplicated by Vite's chunk splitting automatically

### Component Key Constraint

**The component key string MUST be in non-deferred data** — either `preloaderContext` or synchronously-awaited `loaderData`. If the key is inside `defer()`, the render function receives a promise instead of a string, and the registry lookup fails (can't index a record with a promise).

```tsx
/* CORRECT — key in preloaderContext (always sync) */
.preloader(async ({ env }) => ({ componentId: "about" }))
.render(({ preloaderContext }) => {
  const Page = registry[preloaderContext.componentId]  /* string lookup — works */
})

/* CORRECT — key in awaited loaderData */
.loader(async ({ env }) => ({ componentId: "about", data: await fetchData(env) }))

/* WRONG — key inside defer() */
.loader(async ({ defer }) => ({
  componentId: defer(fetchComponentId())  /* returns Promise, not string! */
}))
```

Deferred data inside the dynamic component is fine — just the **key itself** must be synchronous.

### Prior Art

| Framework          | Approach                                                  | Relevance                                   |
| ------------------ | --------------------------------------------------------- | ------------------------------------------- |
| React RSC Flight   | Module references in stream + component manifest          | Overcomplicated for route-slot dynamism     |
| Qwik QRLs          | `./chunk.js#Symbol[0,1]` URLs in HTML                     | Handler-level splitting via framework magic |
| Marko              | Out-of-order HTML streaming                               | Pattern for initial load streaming          |
| Next.js PPR        | Static shell + streaming dynamic holes                    | Validates CDN + streaming hybrid            |
| **Solid `lazy()`** | `lazy(() => import("./X"))` — native code splitting + SSR | **Direct foundation**                       |

---

## Component Registry

### `createRegistry()` — access-tracking wrapper

```tsx
/* src/registries/tenant-components.ts */
import { lazy } from "solid-js";
import { createRegistry } from "@lovrozagar/flare";

const tenantComponents = createRegistry({
	about: lazy(() => import("./components/tenant-about")),
	"blog-post": lazy(() => import("./components/blog-post")),
	pricing: lazy(() => import("./components/pricing")),
	dashboard: lazy(() => import("./components/dashboard")),
});

export { tenantComponents };
```

Each `lazy()` call tells Vite to create a separate chunk. `createRegistry()` wraps the record in a Proxy that tracks which keys are accessed during SSR render. No manifest, no directory scanning.

### How `createRegistry` Works

Uses `AsyncLocalStorage` (supported on CF Workers with `nodejs_compat` flag) for per-request tracking. Solves two problems:

1. **Concurrent requests** — CF Workers can handle multiple requests on the same isolate. Module-level state would corrupt across requests.
2. **Streaming render** — Dynamic components inside `<Suspense>` with `defer()` render asynchronously during streaming. AsyncLocalStorage propagates through the async chain, capturing all accesses regardless of timing.

> **Prerequisite**: CF Workers requires the `nodejs_compat` compatibility flag for `node:async_hooks`. Flare already requires this — existing `src/server/context/request-context.ts` uses `AsyncLocalStorage` for request context. No new requirement.

**Isomorphic constraint**: `createRegistry()` is shared code — imported by server (SSR) and client (hydration + CSR nav). `node:async_hooks` only exists on server. The `isServer` guard lets Vite tree-shake the server branch from the client bundle.

```ts
/* src/registry.ts — shared (server + client) */
import { isServer } from "@solidjs/web";

/* Server-only: lazy-initialized to avoid top-level node:async_hooks import */
let registryContext: import("node:async_hooks").AsyncLocalStorage<Set<string>> | null = null;

function getRegistryContext() {
	if (!registryContext) {
		/* Dynamic import avoided — require is sync in CF Workers bundled build */
		const { AsyncLocalStorage } = require("node:async_hooks");
		registryContext = new AsyncLocalStorage<Set<string>>();
	}
	return registryContext;
}

function createRegistry<T extends Record<string, ReturnType<typeof lazy>>>(components: T): T {
	if (!isServer) return components; /* client: raw record, no tracking needed */

	return new Proxy(components, {
		get(target, key: string | symbol) {
			if (typeof key === "string" && key in target) {
				const store = getRegistryContext().getStore();
				if (store) store.add(key);
			}
			return Reflect.get(target, key);
		},
	});
}

/* SSR handler — wraps render in AsyncLocalStorage context (server-only) */
function withRegistryTracking<R>(fn: () => R): { result: R; dk: () => string[] } {
	const accessed = new Set<string>();
	const result = getRegistryContext().run(accessed, fn);
	return {
		result,
		dk: () => [...accessed] /* callable anytime — accumulates during streaming */,
	};
}
```

**SSR handler flow**:

```ts
const { result: stream, dk } = withRegistryTracking(() =>
  renderToStream(() => <App />)
)
/* dk() returns all keys accessed so far */
/* During streaming, more keys may be added as deferred components render */
/* Serialize dk at END of stream (after all components have rendered) */
```

**Why AsyncLocalStorage**:

- Each request gets its own `Set<string>` — no cross-request contamination
- Propagates through `renderToStream`'s async streaming phase
- Dynamic components inside `<Suspense>` with `defer()` still tracked correctly
- Zero manual clear/collect lifecycle
- On client side: no AsyncLocalStorage store exists, Proxy access is a no-op

This handles any render logic — direct lookups, computed keys, abstracted `renderComponentTree()` functions. The Proxy records access within the request's AsyncLocalStorage context. No guessing, no race conditions.

### Multiple Registries

Different use cases can have separate registries:

```tsx
const tenantPages = createRegistry({
	about: lazy(() => import("./tenant-pages/about")),
	pricing: lazy(() => import("./tenant-pages/pricing")),
});

const cmsBlocks = createRegistry({
	hero: lazy(() => import("./cms-blocks/hero")),
	testimonials: lazy(() => import("./cms-blocks/testimonials")),
	faq: lazy(() => import("./cms-blocks/faq")),
});
```

---

## Usage

### Basic: Server picks component via preloader

```tsx
import { tenantComponents } from "../registries/tenant-components";

createPage("_root_/[...route]")
	.preloader(async ({ env, location }) => {
		const tenant = await getTenantConfig(env, location);
		return { componentId: tenant.pageComponent, tenant };
	})
	.loader(async ({ env, preloaderContext }) => {
		return await loadPageData(env, preloaderContext.tenant);
	})
	.render(({ loaderData, preloaderContext }) => {
		const Page = tenantComponents[preloaderContext.componentId];
		if (!Page) return <NotFound />;
		return <Page data={loaderData} />;
	});
```

Component key flows through normal preloaderContext/loaderData. NDJSON sends it as a plain string. Client has the registry. Done.

### With Deferred Data

```tsx
createPage("_root_/[...route]")
	.preloader(async ({ env, location }) => {
		return { tenant: await getTenantConfig(env, location) };
	})
	.loader(async ({ defer, env, preloaderContext }) => {
		const mainData = await loadMainData(env, preloaderContext.tenant);
		const comments = defer(loadComments(env, preloaderContext.tenant));
		return { comments, componentId: preloaderContext.tenant.pageComponent, mainData };
	})
	.render(({ loaderData }) => {
		const Page = tenantComponents[loaderData.componentId];
		return (
			<Page data={loaderData.mainData}>
				<Suspense fallback={<Skeleton />}>
					<Comments data={loaderData.comments} />
				</Suspense>
			</Page>
		);
	});
```

`defer()` works unchanged. The dynamic component renders with main data immediately. Deferred data streams in via existing `t:"c"` chunks. `<Suspense>` resolves when data arrives.

### Multiple Dynamic Slots

```tsx
createPage("_root_/[...route]")
	.preloader(async ({ env, location }) => {
		const layout = await getCMSLayout(env, location);
		return { heroId: layout.hero, sidebarId: layout.sidebar };
	})
	.loader(async ({ defer, env, preloaderContext }) => {
		const heroData = await loadHeroData(env);
		const sidebarData = defer(loadSidebarData(env));
		return { heroData, sidebarData };
	})
	.render(({ loaderData, preloaderContext }) => {
		const Hero = cmsBlocks[preloaderContext.heroId];
		const Sidebar = cmsBlocks[preloaderContext.sidebarId];
		return (
			<div>
				<Hero data={loaderData.heroData} />
				<Suspense fallback={<SidebarSkeleton />}>
					<Sidebar data={loaderData.sidebarData} />
				</Suspense>
			</div>
		);
	});
```

Hero renders immediately (data awaited). Sidebar is inside `<Suspense>` with deferred data — Solid's `lazy()` won't even start loading the sidebar chunk until the `<Suspense>` boundary attempts to render it. If the data is deferred, the chunk download naturally waits until data arrives. Zero wasted bandwidth — no special `clientLazy` mechanism needed.

### Works with any chain combo

```tsx
createPage("_root_/[...route]")
	.authenticate("tenant-admin")
	.authorize(["manage-pages"])
	.input({ params: z.x.object({ route: z.x.string().array() }) })
	.preloader(async ({ env, location }) => {
		return { tenant: await getTenantConfig(env, location) };
	})
	.loader(async ({ env, preloaderContext }) => {
		return await loadPageData(env, preloaderContext.tenant);
	})
	.render(({ loaderData, preloaderContext }) => {
		const Page = tenantComponents[preloaderContext.tenant.componentId];
		return <Page data={loaderData} />;
	});
```

No `.dynamic()` chain method needed. The registry is just an import in the render function's file scope.

---

## Defer Behavior

`defer()` + `<Suspense>` control all streaming. No per-route SSR mode option needed.

|                                       | Initial SSR (`renderToStream`)                                           | CSR Navigation (NDJSON)                    |
| ------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| `await getData()` in loader           | In HTML (no suspension)                                                  | In `t:"l"` data message                    |
| `defer(getData())`                    | **Streamed** — Suspense fallback in shell, content swapped when resolved | **Streamed** — `t:"c"` chunk after `t:"r"` |
| `defer(getData(), { stream: false })` | **Awaited** — included in HTML                                           | **Awaited** — included before `t:"r"`      |
| No `defer()` calls at all             | Stream completes immediately → effectively buffered → CDN cacheable      | No `t:"c"` messages, all data in `t:"l"`   |

- Developer decides what to defer and where to place `<Suspense>` boundaries
- No defer = no suspension = complete HTML = CDN cacheable
- CDN caching: buffer the stream response into complete Response before `cache.put()`

### Dynamic Components + Defer

Dynamic components interact with defer naturally through `<Suspense>` placement:

- Component outside `<Suspense>` with awaited data: renders immediately, chunk loaded eagerly
- Component inside `<Suspense>` with deferred data: chunk download deferred until data arrives (Solid's `lazy()` only triggers `import()` when the component renders)
- No special `clientLazy` option needed — `<Suspense>` boundary placement controls everything

### CSR Nav: First-Time Chunk Loading

On CSR navigation, if a dynamic component's chunk hasn't been downloaded yet:

1. NDJSON data arrives -> client calls render function
2. `registry[key]` returns a `lazy()` component
3. Component renders -> triggers `import()` -> **suspends** (throws promise)
4. Nearest `<Suspense>` boundary catches it -> shows fallback
5. Chunk downloads -> component renders with data

**Developer must wrap dynamic components in `<Suspense>`**:

```tsx
.render(({ loaderData, preloaderContext }) => {
  const Page = tenantComponents[preloaderContext.componentId]
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Page data={loaderData} />
    </Suspense>
  )
})
```

This is the same pattern as deferred data — `<Suspense>` handles async resolution. Without a `<Suspense>` boundary, the suspension bubbles up to the nearest ancestor boundary (layout's `<Suspense>`, or ultimately `errorRender`).

**Second navigation to same component**: chunk in browser module cache -> instant, no suspension.

**Chunk preloading on CSR nav** — Critical for avoiding Suspense flash. Three strategies, from simplest to most robust:

**Strategy A: Auto-scan (default, Phase 2)**
After NDJSON `t:"r"` arrives and before `resolveLoadersReady()`, scan all string values in loaderData/preloaderContext against registered registries. If any string matches a registry key, call `.preload()`. Wait for preloads before resolving `loadersReady`.

```ts
/* In NDJSON handler, after all t:"l" messages, before resolving loadersReady */
const preloads: Promise<unknown>[] = [];
for (const match of matches) {
	scanStringsForPreload(match.loaderData, registeredRegistries, preloads);
	scanStringsForPreload(match.preloaderContext, registeredRegistries, preloads);
}
await Promise.allSettled(preloads);
resolveLoadersReady();
```

**How `scanStringsForPreload` works**: recursively walk the data object, for every string value check if `registry[value]` exists in any registered registry. If yes, call `registry[value].preload()`. O(n\*m) where n = string values in data, m = registry keys. Both are small. False positives (a string like `"about"` that happens to match a registry key but isn't used as one) cause harmless extra preloads. False negatives are impossible — if the key is in the data and the registry is registered, it's found.

**Strategy B: Prefetch (Phase 4)**
On hover/viewport prefetch, same scan runs on the prefetched NDJSON result. Chunk preloads fire alongside data prefetch. By navigation time, chunk is already cached → instant render, no suspension.

**Strategy C: Server-sent `dk` in NDJSON (not needed for v1)**
Server could send `{"t":"dk","d":["about","hero"]}` before `t:"r"`. But the server doesn't run render on CSR nav — it only runs loaders. The server doesn't know which data fields are component keys without explicit annotation. Auto-scan is simpler and requires no server changes.

### Reactivity & CSR Nav

On CSR navigation, matches are Solid signals (`const [matches, setMatches] = createSignal(...)`). When NDJSON data arrives, `setMatches(newMatches)` triggers reactive re-evaluation of render functions. Registry lookups happen inside this reactive computation — `registry[key]` returns the `lazy()` component, which either resolves instantly (cached) or suspends (first load). This is standard Solid reactivity — no special handling needed.

---

## SSR & Hydration

### SSR: `lazy()` Resolves Immediately

On the server, all code is in the server bundle. Solid's `lazy()` resolves immediately — the dynamic import completes synchronously (bundler has all modules available). The component renders as normal HTML. No partial renders, no fallbacks.

```
Server: lazy(() => import("./about")) -> resolves instantly -> renders <AboutPage />
```

**Requirement**: SSR must use a bundled build (Vite SSR mode). Raw ESM with actual async `import()` would not resolve synchronously. Vite's SSR build inlines all dynamic imports into the server bundle — this is the default behavior, no config needed.

During render, the `createRegistry()` Proxy records which keys were accessed. After render, Flare serializes these keys to `self.flare.dk`.

### SSR Access Tracking

Any render pattern works — the Proxy always captures the truth:

```tsx
/* Direct lookup */
.render(({ loaderData }) => {
  const Page = tenantComponents[loaderData.componentId]
  return <Page />
})

/* Computed key */
.render(({ loaderData }) => {
  const key = `${loaderData.tenant}-${loaderData.variant}`
  return <Dynamic component={tenantComponents[key]} />
})

/* Abstracted renderer */
.render(({ loaderData }) => {
  return renderComponentTree(loaderData.blocks, cmsBlocks)
})
```

All three patterns: Proxy records access, Flare serializes to `dk`. No key extraction logic needed.

### Flare State Extension

`dk` must include keys from ALL rendered components. Uses `renderToStream()` — two sub-cases:

**No `defer()` calls**: Stream completes immediately (no Suspense boundaries). `dk` known after stream flush. Serialize in `self.flare`:

```ts
self.flare = {
  dk: ["about", "hero"],
  r: { matches: [...], params: {...}, pathname: "/about" },
  ...
}
```

**With `defer()` + dynamic component in `<Suspense>`**: Some components render later during streaming. `dk` not complete at initial script time. Two options:

a) **Progressive `dk`** — initial `self.flare.dk = []`, then append via inline scripts as streamed components render:

```html
<script>
	self.flare.dk.push("sidebar");
</script>
```

Solid already injects scripts during streaming for Suspense resolution. Piggyback on this mechanism.

b) **End-of-stream `dk`** — omit `dk` from initial script, inject final `dk` array at end of stream (alongside Solid's stream-end signal). Hydration waits for stream completion anyway.

Option (b) is simpler — one script at end of stream, hydration waits for it.

**CSP nonce requirement**: End-of-stream `dk` script MUST include nonce: `<script nonce="${nonce}">self.flare.dk=[...]</script>`. Flare uses `'strict-dynamic'` CSP — inline `<script>` tags injected via HTML streaming are parsed by the HTML parser (not created by trusted JS), so they need the nonce attribute. The nonce is available in `SSRContext` throughout the render pipeline.

**Duplicate keys across registries**: If `tenantComponents` and `cmsBlocks` both have key `"hero"`, `dk: ["hero"]` triggers preload on both. Harmless — extra preload is wasted bandwidth but small. If this becomes a real issue, `dk` can be extended to `["tenantComponents:hero"]` namespaced pairs, but not worth the complexity for v1.

### Hydration: Automatic Preload from `dk`

On the client, `lazy()` returns a component wrapper that triggers `import()` on first render. To avoid hydration mismatch, the lazy component must be loaded **before** `hydrate()` is called.

Flare handles this automatically using the `dk` array. Uses `Promise.allSettled` (not `Promise.all`) so a single chunk 404 doesn't prevent hydration of the entire page:

```ts
/* Flare internal — runs before hydrate() */
const preloads: Promise<unknown>[] = []
for (const key of flareState.dk ?? []) {
  for (const registry of registeredRegistries) {
    if (registry[key]) {
      preloads.push(registry[key].preload())
    }
  }
}
await Promise.allSettled(preloads)

/* All available chunks loaded — safe to hydrate */
/* Failed preloads: lazy() will trigger error boundary on render */
hydrate(() => <App />, document.getElementById("app"))
```

### Hydration Insertion Point

Hydration flow:

```ts
loadRouteModules(flareState.r.pathname).then(async (initialModules) => {
  await waitForClientLazyPreloads()  /* route-level clientLazy() preloads */
  await preloadRegistryKeys(flareState.dk)  /* registry dk preloads */
  solidHydrate(...)
})
```

Both `clientLazy()` preloads and registry `dk` preloads must complete before `solidHydrate()`. Order: route chunks first (needed for render functions), then registry chunks (needed for dynamic components inside those render functions).

### Registry Registration

Developer registers their registries at app entry. Registration must happen **before hydration starts** — module-level side effects in the entry file guarantee this:

```ts
/* client entry (runs before hydrate) */
import { registerRegistry } from "@lovrozagar/flare";
import { tenantComponents } from "../registries/tenant-components";
import { cmsBlocks } from "../registries/cms-blocks";

registerRegistry(tenantComponents);
registerRegistry(cmsBlocks);
```

Registration adds to a module-level array (`registeredRegistries`). This is safe on the client — single-threaded, no concurrent request isolation needed (unlike the server's AsyncLocalStorage tracking). Flare reads this array during hydration to preload `dk` keys.

On the **server**, `registerRegistry` is a no-op. Registries auto-register themselves to the AsyncLocalStorage-backed tracking context via the Proxy getter (no explicit registration step needed server-side).

---

## Re-Navigation & Component Swap

### Same URL, different component

User visits `/page` -> server returns `componentId: "about"`. User navigates away, returns to `/page` -> server returns `componentId: "pricing"`.

1. New NDJSON stream arrives with different `componentId` in loaderData/preloaderContext
2. Render function reads new key, looks up registry -> gets `lazy(() => import("./pricing"))`
3. Solid's `lazy()` triggers `import()` if not cached, renders when loaded
4. If already loaded (browser module cache), renders instantly
5. Layouts above persist as normal

### Same URL, same component, different data

Same component key -> browser module cache returns module instantly (no re-download). Solid's reactivity updates DOM with new data. No remount.

### Stale prefetch cache

Prefetch cache stores NDJSON result including component key string. If server would now return a different component, the prefetch is stale.

No new mechanism needed — existing `staleTime` / `gcTime` from `.options()` controls this:

- Short `staleTime` -> server re-queried on navigation -> fresh component selection
- Long `staleTime` -> stale component possible but instant nav

---

## Error Handling

### Flare's Boundary System

Flare has 5 boundary types, at 2 levels:

**Boundary types:**

| Type           | Error class            | HTTP | When                                    |
| -------------- | ---------------------- | ---- | --------------------------------------- |
| `error`        | any `Error`            | 500  | Runtime errors in loaders/render        |
| `notFound`     | `NotFoundError`        | 404  | `notFound()` thrown in loader/preloader |
| `unauthorized` | `UnauthenticatedError` | 401  | `authenticateFn` fails                  |
| `forbidden`    | `ForbiddenError`       | 403  | `authorize()` returns false             |
| `streaming`    | N/A                    | N/A  | Suspense fallback during streaming SSR  |

**Two levels:**

1. **Per-route** — `.errorRender()`, `.notFoundRender()` chain methods on `createPage`/`createLayout`/`createRootLayout`. Closest-to-error boundary wins (Page → Layout → Root Layout).
2. **Global** — `GeneratedBoundary[]` from `globalBoundaries` in `flare.build.ts`. File-based, code-generated into `routes.gen.ts`. Catches errors that escape per-route boundaries.

### Dynamic Components & Boundaries

Dynamic components introduce errors at **render time** that existing boundaries handle:

| Error                                     | Phase     | Origin                          | Caught by                                                                                             |
| ----------------------------------------- | --------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Unknown key (`registry[key]` = undefined) | SSR + CSR | Render fn                       | Developer `if (!Page)` guard → throw `notFound()` or return fallback                                  |
| Chunk load failure (404/network)          | CSR nav   | Solid `lazy()` import() rejects | `<Suspense>` → error propagates → page `errorRender` → layout `errorRender` → global `error` boundary |
| Chunk load failure                        | Hydration | `Promise.allSettled` absorbs    | `lazy()` errors on render → `errorRender` chain                                                       |
| Dynamic component render error            | SSR + CSR | Component throws                | `errorRender` chain (same as static components)                                                       |
| Dynamic component throws `notFound()`     | SSR + CSR | Component calls `notFound()`    | `notFoundRender` chain → global `notFound` boundary                                                   |

**Key insight**: dynamic components don't need new boundary types. They error inside the existing render subtree, so Flare's per-route → global boundary chain catches everything.

### Recommended Pattern

```tsx
createPage("_root_/[...route]")
	.preloader(async ({ env, location }) => {
		const tenant = await getTenantConfig(env, location);
		if (!tenant) notFound("Tenant not found");
		return { componentId: tenant.pageComponent, tenant };
	})
	.loader(async ({ env, preloaderContext }) => {
		return await loadPageData(env, preloaderContext.tenant);
	})
	.render(({ loaderData, preloaderContext }) => {
		const Page = tenantComponents[preloaderContext.componentId];

		/* Unknown key → throw notFound (caught by notFoundRender or global notFound boundary) */
		if (!Page) notFound(`Unknown component: ${preloaderContext.componentId}`);

		return (
			<Suspense fallback={<PageSkeleton />}>
				<Page data={loaderData} />
			</Suspense>
		);
	})
	.notFoundRender(({ pathname }) => (
		/* Catches: unknown tenant, unknown component key */
		<TenantNotFound pathname={pathname} />
	))
	.errorRender(({ error }) => (
		/* Catches: chunk load failure, render errors from dynamic component */
		<ErrorPage error={error} />
	));
```

### Boundary Flow Diagram

```
Dynamic component error in render:

  lazy() import() rejects (chunk 404)
    ↓
  <Suspense> catches suspension → error propagates
    ↓
  Page .errorRender()  ← catches if defined
    ↓ (not defined or re-throws)
  Layout .errorRender()  ← catches if defined
    ↓
  Root Layout .errorRender()  ← catches if defined
    ↓
  Global error boundary  ← final fallback (from globalBoundaries config)

  notFound() thrown in render:

  registry[key] undefined → notFound("Unknown component")
    ↓
  Page .notFoundRender()  ← catches if defined
    ↓
  Layout .notFoundRender()  ← catches if defined
    ↓
  Root Layout .notFoundRender()  ← catches if defined
    ↓
  Global notFound boundary  ← final fallback
```

### Why `<Suspense>` Is Required

On CSR nav, even with auto-scan preloading, chunks may not be cached yet (first visit, preload raced with render). Solid's `lazy()` suspends — without `<Suspense>`, suspension bubbles up to the nearest ancestor. Explicit `<Suspense>` gives developer control over the loading UI and prevents the entire page from showing a fallback.

### Retry on Chunk Failure

Solid's `lazy()` has no built-in retry. If `import()` 404s, it's permanent for that session (browser caches the failed request). Typically a deploy issue (old chunk missing after new deploy).

**Mitigation**: content-hashed filenames + immutable cache headers. Old chunks remain on CDN until cache expires. If truly gone (CDN purge), page reload gets new HTML pointing to new chunks.

**Future (Phase 4)**: Optional `<RetryBoundary>` utility that catches chunk load errors and retries. Not needed for v1.

---

## CDN Caching

### Cache Headers

All response types are CDN-cacheable:

| Response           | Cache-Control                              | Notes                                   |
| ------------------ | ------------------------------------------ | --------------------------------------- |
| Initial HTML (SSR) | `s-maxage=60, stale-while-revalidate=3600` | Per-tenant via cache key                |
| NDJSON (CSR nav)   | `s-maxage=60, stale-while-revalidate=3600` | Per-tenant via cache key                |
| Component chunks   | `max-age=31536000, immutable`              | Content-hashed filenames (Vite default) |
| Static assets      | `max-age=31536000, immutable`              | Content-hashed filenames                |

### Tenant-Based Cache Keys

Using `Vary` header fragments the cache. Better: custom cache keys via Cloudflare Workers Cache API.

```ts
/* In middleware */
const tenantId = resolveTenant(request);
const cacheKey = new Request(`${request.url}?__tenant=${tenantId}`, request);
const cached = await caches.default.match(cacheKey);
if (cached) return cached;

const response = await origin(request);
ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
return response;
```

### Per-Route Cache Headers

Dynamic routes control their own caching via `.headers()`:

```tsx
createPage("_root_/[...route]").headers(({ preloaderContext }) => ({
	"Cache-Control": preloaderContext.tenant.cachePolicy ?? "public, s-maxage=60, stale-while-revalidate=3600",
	"CDN-Cache-Control": "max-age=60",
}));
```

---

## Preloading, Prefetching & Client Cache

### Client-Side `routeTree` — Why It Exists and Scaling

`routeTree` in `routes.gen.ts` is a `FlareTreeNode` radix tree that maps URL patterns → route data. Ships to the client. This exists today, not new.

**Why the client needs it**: On CSR nav, `hydrate.tsx` runs data fetch and chunk loading **in parallel**:

```ts
const [, modules] = await Promise.all([
	clientRouter.navigate(options) /* NDJSON fetch → server loaders */,
	loadRouteModules(resolvedUrl) /* matchRoute(routeTree, url) → import() page + layout chunks */,
]);
```

Without the tree, chunk loading waits for server response → serialized → 50-200ms extra latency per nav.

**Scaling**: Each `FlareRouteData` is ~80-120 bytes minified (`p: () => import(...)` is a function reference, not code). Tree nodes share prefixes. 200 routes ≈ 32KB minified → **~7KB gzipped**. Even 1000 routes ≈ 30KB gzipped. Every major framework ships equivalent data (Next.js `__BUILD_MANIFEST`, TanStack route tree, React Router manifest).

**But it can't predict dynamic components**: `routeTree` maps URL → page module (static, build-time). It can't tell you which dynamic component the server will pick — that's runtime data (tenant config, DB lookup, A/B test). The client MUST ask the server.

**Consequence**: for dynamic component routes, prefetch = server round-trip. Always. You can't preload a dynamic component's chunk without first getting the server's response. This is fundamentally different from static-route frameworks where the client knows URL → component at build time.

### What Flare Already Has (Client-Side)

| System               | What it stores                                      | Key                     | Lifetime                                    |
| -------------------- | --------------------------------------------------- | ----------------------- | ------------------------------------------- |
| `routeTree`          | URL pattern → route data (page loader, virtualPath) | URL segments            | Static (build-time)                         |
| `matchCache`         | Loader data + preloaderContext per route            | `matchId` (virtualPath) | `staleTime` (default from `routerDefaults`) |
| `prefetchCache`      | URL → timestamp (dedup)                             | URL string              | `prefetchStaleTime` (default 30s)           |
| Browser module cache | JS chunks (component code)                          | Chunk URL               | Immutable (content-hashed filenames)        |

**Cache config** — set per-app via `routerDefaults`:

```ts
routerDefaults: {
  staleTime: 30_000,        /* data considered fresh for 30s */
  gcTime: 300_000,          /* garbage collect after 5min */
  prefetchStaleTime: 30_000, /* don't re-prefetch within 30s */
  prefetchIntent: "intent",   /* default prefetch strategy */
}
```

Per-route override via `.options()`:

```ts
createPage("_root_/[...route]").options({
	staleTime: 10_000,
}); /* shorter stale time for dynamic routes */
```

### Three preloading contexts

| Context             | When              | Data source                 | Preload mechanism                                                            |
| ------------------- | ----------------- | --------------------------- | ---------------------------------------------------------------------------- |
| **SSR → Hydration** | Initial page load | `self.flare.dk` array       | Iterate `dk`, match against registries, `.preload()` before `solidHydrate()` |
| **CSR Navigation**  | User clicks link  | Auto-scan NDJSON data       | Scan string values in loaderData/preloaderContext against registries         |
| **Prefetch**        | Hover/viewport    | Auto-scan prefetched NDJSON | Same scan as CSR nav, runs on prefetch result                                |

### SSR → Hydration Preloading (Phase 2)

Server knows exactly which components were rendered (AsyncLocalStorage tracking → `dk`). Client reads `dk` from `self.flare`, calls `.preload()` on matching registry entries. Zero guessing.

### CSR Nav Preloading (Phase 2)

Server doesn't render on CSR nav — only runs loaders, sends data. **No `dk` available.** Client must figure out which chunks to load.

**Auto-scan approach**: After all `t:"l"` messages arrive and before resolving `loadersReady`, recursively scan all string values in loaderData and preloaderContext. Check each string against all registered registries. Match found → `.preload()`.

```ts
function scanStringsForPreload(
	data: unknown,
	registries: Array<Record<string, { preload: () => Promise<unknown> }>>,
	preloads: Promise<unknown>[],
): void {
	if (typeof data === "string") {
		for (const registry of registries) {
			if (data in registry) {
				preloads.push(registry[data].preload());
			}
		}
		return;
	}
	if (Array.isArray(data)) {
		for (const item of data) scanStringsForPreload(item, registries, preloads);
		return;
	}
	if (data && typeof data === "object") {
		for (const value of Object.values(data)) {
			scanStringsForPreload(value, registries, preloads);
		}
	}
}
```

**Integration point in `ndjson-nav.ts`**: After processing all `t:"l"` messages, before the `t:"r"` handler calls `resolveLoadersReady()`:

```ts
case "r": {
  /* Scan data for registry keys and preload chunks */
  const preloads: Promise<unknown>[] = []
  for (const match of matches) {
    scanStringsForPreload(match.loaderData, getRegisteredRegistries(), preloads)
    scanStringsForPreload(match.preloaderContext, getRegisteredRegistries(), preloads)
  }
  await Promise.allSettled(preloads)

  if (!loadersEmitted) {
    loadersEmitted = true
    resolveLoadersReady()
  }
  break
}
```

**Why this works**: Component keys are strings in the data. Registry keys are the same strings. The scan is exhaustive — every string value is checked. False positives (e.g. a user's name that happens to match `"about"`) trigger harmless extra preloads. False negatives are impossible if the key is in the data and the registry is registered.

**Performance**: Scanning is O(n \* m) where n = data values, m = total registry keys. Both are tiny (tens, not thousands). `Promise.allSettled` runs preloads in parallel. Chunk download is the bottleneck, not the scan.

**No manifest needed for correctness**: `key in registry` checks validity, `registry[key].preload()` triggers the download. No build-time manifest, no Vite plugin. The only thing a manifest would add is the chunk URL for `<link rel="modulepreload">` injection in SSR `<head>` — that's a Phase 4 optimization, not required for any preloading to work.

### Route Prefetch + Chunk Preloading (Phase 2)

Flare's existing `<Link>` prefetch system:

```
PrefetchStrategy = false | "intent" | "render" | "viewport"

<Link to="/page" />                    ← default: prefetch="intent"
<Link to="/page" prefetch="viewport" />← prefetch when link enters viewport
<Link to="/page" prefetch={false} />   ← no prefetch
```

**Existing flow** (data only):

```
Link mouseenter / viewport intersection
  ↓
router.prefetch({ to: "/page" })
  ↓
prefetchCache.shouldPrefetch(url, staleTime)?  ← dedup (30s default)
  ↓ yes
fetcher.fetch({ url, prefetch: true })  ← NDJSON to server
  ↓
Server runs loaders → NDJSON with data (componentId: "about" in loaderData)
  ↓
updateMatchCache(matchCache, result.state)  ← cache data for instant nav
```

**Gap**: prefetch caches DATA but not CHUNKS. User clicks → render hits `registry["about"]` → `lazy()` suspends → chunk downloads → Suspense flash.

**Fix**: add `scanStringsForPreload` after `updateMatchCache` in the prefetch handler:

```ts
/* In init.ts prefetch handler */
prefetch: async (options) => {
	/* ... existing prefetch logic ... */

	if (result.success && result.state) {
		updateMatchCache(matchCache, result.state);

		/* NEW: preload dynamic component chunks from prefetched data */
		const preloads: Promise<unknown>[] = [];
		for (const match of result.state.matches) {
			scanStringsForPreload(match.loaderData, getRegisteredRegistries(), preloads);
			scanStringsForPreload(match.preloaderContext, getRegisteredRegistries(), preloads);
		}
		void Promise.allSettled(preloads); /* fire-and-forget — don't block prefetch */
	}
};
```

**Result**: hover → data + chunk both prefetch. Click → data from cache + chunk from browser module cache → instant render, zero Suspense flash.

**Full prefetch timeline:**

```
hover          → router.prefetch() fires
  ├─ NDJSON fetch starts (data)
  └─ (awaiting response)
~50ms later    → NDJSON arrives
  ├─ updateMatchCache (data cached)
  ├─ scanStringsForPreload finds "about" in data
  └─ registry["about"].preload() fires (chunk download starts)
~100ms later   → chunk downloaded, in browser module cache
user clicks    → navigate()
  ├─ data: already in matchCache → instant
  └─ chunk: already in module cache → lazy() resolves sync → no Suspense
```

### Stale Prefetch & Component Key Drift

Prefetch caches data for `staleTime` duration. If the server would now return a DIFFERENT component key (tenant changed their page, A/B test flipped), the prefetched data is stale.

**What happens:**

1. User hovers → prefetch caches `{ componentId: "about" }` + preloads "about" chunk
2. 60s later, server would return `{ componentId: "pricing" }` instead
3. User clicks within `staleTime` → client uses cached data → renders "about" (stale)
4. User clicks after `staleTime` → client re-fetches → gets "pricing" → loads new chunk

**This is the same as any stale data** — existing `staleTime`/`gcTime` controls it. Dynamic components don't introduce new cache invalidation needs. Shorter `staleTime` = fresher component selection, longer = faster nav.

For routes where component selection changes frequently:

```ts
createPage("_root_/[...route]").options({
	staleTime: 5_000,
}); /* re-fetch after 5s — always fresh component */
```

### Chunk Cache (Browser Module Cache)

Component chunks are cached by the BROWSER independently from Flare's data cache:

- Content-hashed filenames → immutable → browser caches forever
- `.preload()` downloads once → all future `lazy()` calls resolve from cache
- Deploy with new chunks → new hashes → old cache entries irrelevant
- No Flare-side chunk cache management needed

### `<link rel="modulepreload">` for SSR (Phase 4 optimization)

After `dk` is computed during SSR, inject `<link rel="modulepreload" href="chunk-about-abc123.js">` into `<head>`. Browser starts downloading chunks in parallel with HTML parsing, before JS even executes. Requires mapping registry key → chunk URL at build time (chunk URLs are content-hashed). This IS a mini-manifest but only needed for this optimization — correctness doesn't depend on it.

---

## Implementation: Full Rewrite (TDD)

Current Flare → `public/flare-v0/` (archive). New `public/flare/` from scratch.

### Design Principles

- `renderToStream()` only renderer — no `renderToStringAsync`
- NDJSON only — no HTML nav mode
- `clientLazy()` for route-level splitting, Solid's `lazy()` for registries — no naming collision
- `defer()` + `<Suspense>` control all streaming behavior
- `createRegistry()` isomorphic from day 1

### SSR: `renderToStream()`

| What developer does                 | SSR behavior                                     | CDN cacheable?                               |
| ----------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| `await` everything in loader        | Stream completes immediately → complete HTML     | Yes                                          |
| `defer(promise)` + `<Suspense>`     | Shell sent with fallback, content streamed after | Only if stream buffered before `cache.put()` |
| `defer(promise, { stream: false })` | Awaited before shell sent                        | Yes                                          |

Deferred data streams via Solid's Suspense mechanism on initial load:

1. Shell HTML sent with Suspense fallbacks
2. As deferred promises resolve, Solid streams `<template>` + swap `<script>`
3. Browser replaces fallback content in-place

`defer(promise, { stream: false })` forces await — for data that must be in the initial HTML.

### CDN Caching

No `defer()` calls → stream completes instantly → CDN cacheable.

With `defer()` → streaming response. To CDN cache: middleware buffers full stream into Response before `cache.put()`. First visitor gets streaming, cached visitors get buffered.

### Bot Detection

```ts
if (isBot(request.headers.get("user-agent"))) {
	const html = await streamToString(stream);
	return new Response(html, { headers });
}
return new Response(stream, { headers });
```

---

## Non-Goals

- **Dynamic layouts**: Layouts are relatively static. If needed later, same mechanism applies but not in v1.
- **Nested dynamic components**: v1 supports dynamic components in render functions. Arbitrary nesting (dynamic component renders another dynamic component) deferred.
- **Resumability (Qwik-style)**: Solid's hydration model is fine. Not pursuing zero-JS-until-interaction.
- **Component-level caching**: Caching resolved component IDs in KV is an optimization, not required for correctness.
- **Full RSC-style tree serialization**: Constraining dynamism to route slots keeps complexity manageable. Flight protocol complexity not justified.
- **Per-route SSR mode toggle**: `defer()` + `<Suspense>` control all streaming. One renderer (`renderToStream`), behavior determined by data loading strategy.
- **Build-time manifests / Vite plugins**: Solid's `lazy()` + Vite's automatic code splitting handles everything. No custom build infrastructure needed.
- **New NDJSON message types**: Component keys are just strings in existing data messages. No `t:"k"` or similar protocol extensions.

---

## Complete Feature List

### Navigation & Rendering

- **Server-driven CSR navigation** — Server runs all loaders on every navigation, streams results via NDJSON. Client never executes loaders. Why: server has full context (auth, tenant, env), eliminates client-side data fetching complexity, enables server-decided rendering.
- **NDJSON streaming protocol** — Line-delimited JSON messages (`t:"l"`, `t:"h"`, `t:"c"`, etc.) streamed from server to client during CSR nav. Why: progressive data delivery, deferred chunks stream as they resolve.
- **Layout persistence** — Parent layouts stay mounted during child navigation. Only affected route segments re-render. Why: no blink/re-mount of shared UI (headers, sidebars), preserved scroll/form state.
- **`renderToStream()` SSR** — Only renderer. No `defer()` = stream completes immediately = effectively buffered = CDN cacheable. With `defer()` = Suspense fallbacks in shell, content streamed as data resolves. Why: one renderer, behavior controlled entirely by `defer()` + `<Suspense>`.
- **`defer()` controls streaming** — `defer(promise)` streams on both SSR and CSR nav. `defer(promise, { stream: false })` awaits everywhere. `await` in loader = no suspension. Why: developer decides per-promise what to stream.
- **Head resolution chain** — Per-route `head()` functions compose hierarchically (layout -> page), with `parentHead` access. Why: layouts set base meta, pages override title/description.
- **Headers resolution chain** — Per-route `headers()` functions for Cache-Control, CDN headers, custom headers. Why: fine-grained cache control per route.

### Dynamic Component Trees

- **`createRegistry()` with access tracking** — Wraps `Record<string, LazyComponent>` in a Proxy that records which keys are accessed during SSR render. Why: server knows exactly which components were used, serializes to `dk` for hydration preload. Works with any render pattern — direct lookups, computed keys, abstracted renderers.
- **Server-decided component rendering** — Server returns a component key string in loaderData or preloaderContext. Client looks up the registry and renders the matching lazy component. Why: multi-tenant SaaS, CMS-driven pages, A/B testing, plugin systems.
- **Automatic code splitting** — Each `lazy(() => import("./x"))` becomes a separate content-hashed chunk. Why: only download components the server decides to use. Vite handles deduplication of shared deps.
- **Natural deferred chunk loading** — Lazy component inside `<Suspense>` with deferred data: chunk download naturally waits until data arrives (component doesn't render until Suspense resolves). Why: zero wasted bandwidth without any special mechanism.
- **SSR works natively** — `lazy()` resolves immediately on server (all code in server bundle). Dynamic components render as normal HTML. Why: complete SSR, CDN cacheable, no partial renders.
- **Automatic hydration preload** — `dk` array in flare state lists accessed component keys. Client preloads all matching registry entries before `hydrate()`. Why: prevents hydration mismatch without manual key extraction.

### Code Splitting

- **Route-level splitting** — Each route is a separate chunk, loaded on navigation. Why: only download code for visited routes.
- **Component-level splitting (dynamic)** — Each `lazy()` entry is a separate Vite chunk. Why: don't bundle every possible component — only load what the server decides.
- **Route-level lazy (`clientLazy()`)** — Client lazily loads route page/layout components. Server renders pending fallback. Why: client-side route code splitting.

### Caching

- **CDN-cacheable initial HTML** — Complete SSR HTML with standard cache headers. Why: edge-cached, instant TTFB.
- **CDN-cacheable NDJSON responses** — CSR navigation responses cacheable with `s-maxage` + `stale-while-revalidate`. Why: subsequent navigations served from edge.
- **Immutable component chunks** — Content-hashed filenames, `max-age=31536000, immutable`. Why: browser + CDN cache forever, never re-download unchanged code.
- **Custom cache keys via CF Workers Cache API** — Tenant-based cache keys without `Vary` header fragmentation. Why: per-tenant caching without cache explosion.
- **Per-route cache headers** — Routes control own caching via `.headers()`. Why: different routes have different cache policies.

### Data Loading

- **Preloaders** — Run before loaders, accumulate shared context (auth, tenant). Why: avoid duplicating auth/tenant resolution in every loader.
- **Loaders** — Async data fetching per route, runs on server. Why: co-located data requirements, type-safe.
- **Input validation** — Zod-based param/search validation in loaders. Why: type-safe params, auto-coercion, error on invalid input.
- **Query client integration** — Tracked query client for server-side queries, hydrated to client. Why: TanStack Query integration, cache warm on initial load.

### Prefetching

- **Link prefetch on hover/viewport** — NDJSON response prefetched. Component key extracted, `.preload()` called. Why: instant navigation — data and component chunk ready before click.

### Error Handling

- **Error boundaries per route** — `errorRender()` for route-level error UI. Why: graceful degradation, errors don't crash entire app.
- **Redirect responses** — Thrown from loaders, sent as `t:"x"` in NDJSON. Why: server-controlled redirects during data loading.
- **Chunk load failure handling** — Failed `lazy()` import triggers Solid error boundary -> `errorRender`. Why: network failures handled gracefully.

### DX

- **Minimal API surface** — `createRegistry()` + `registerRegistry()`. No `.dynamic()` chain method, no manifests, no build plugins. Registry is mostly userland code.
- **Type-safe registries** — `createRegistry()` preserves key literal types. Registry keys as string literal union.
- **Dev mode lazy loading** — Vite serves source directly, `lazy()` works with HMR.
- **Descriptive errors** — Unknown registry key, chunk load failure, `dk` mismatch warnings. Caught by existing error boundaries.

---

## Deep Framework Comparison

### Flare vs Next.js App Router (RSC/PPR)

**Architecture**: Both are server-driven. Next.js RSC uses Flight protocol (line-delimited stream with `$` prefixed type markers, module references via `I` lines, chunk composition). Flare uses NDJSON (simpler JSON lines with type field `t`).

**Component trees**: Next.js RSC sends full component tree descriptions — arbitrary nesting of Server and Client Components. Server Components serialize to Flight payload, Client Components referenced by module ID + chunk URL. Flare constrains dynamism to route slots — server returns a component key string, client looks up a `lazy()` registry. 90% of RSC's benefit, 10% of complexity.

**SSR streaming**: Next.js uses `renderToReadableStream` with out-of-order Suspense streaming. Flare uses `renderToStream()` — same progressive model, controlled by `defer()` + `<Suspense>`. No defer = complete HTML (CDN cacheable). With defer = progressive streaming like Next.js. Bot detection awaits full stream for SEO.

**PPR**: Next.js 15 had experimental Partial Prerendering (static shell + dynamic Suspense holes). Removed in Next.js 16, replaced by "Cache Components". Never reached production stability. Flare's complete HTML + NDJSON nav is the simpler alternative — entire page CDN cached, not just shell.

**CDN**: Next.js uses ISR (`s-maxage` + `stale-while-revalidate`) with Vercel-optimized caching. Flare uses CF Workers Cache API with custom cache keys — more control, less platform lock-in.

**Code splitting**: Next.js uses build manifest mapping modules to chunks, per-component splitting via `"use client"` boundary. Flare does route-level + component-level splitting via `lazy()` (Vite automatic).

**Maturity**: Next.js is the industry standard, battle-tested at scale. Flare is in development. But Next.js is React — Flare is Solid, which means fine-grained reactivity, smaller runtime, no virtual DOM overhead.

### Flare vs SolidStart 1.0

**Same runtime (Solid), different architecture.**

**Navigation**: SolidStart is client-driven. Loaders are isomorphic — run on server during SSR, run on client during CSR nav (calling server functions via RPC when needed). Flare is server-driven — loaders always run on server, results stream via NDJSON.

**SSR**: SolidStart supports `renderToStream` (progressive), `renderToStringAsync`, and `renderToString` — configurable. Flare uses `renderToStream` — streaming controlled by `defer()`, not a global config.

**Server functions**: SolidStart has `'use server'` directive for RPC functions, serialized via Seroval. Flare has no server functions — the server handles everything, no RPC boundary needed.

**Streaming**: SolidStart streams via Suspense boundaries during SSR. No streaming protocol for CSR nav — client fetches data directly. Flare streams data via NDJSON on every CSR nav with `defer()` chunks.

**Dynamic components**: SolidStart has `<Dynamic>` for runtime component selection, but the server doesn't decide — it's client-side conditional rendering. Flare's registry pattern is server-decided with on-demand chunk loading via `lazy()`.

**Server components**: Neither has RSC-style server components. SolidStart has experimental islands (not stable in 1.0). Flare's registry pattern is the closest equivalent — server decides what to render per route slot.

**CDN**: SolidStart has no built-in CDN caching. Developers set HTTP headers manually. Flare has CDN caching designed in — complete HTML cacheable, NDJSON cacheable, custom cache keys.

**Deploy**: SolidStart deploys anywhere via Vinxi/Nitro presets. Flare targets CF Workers specifically — optimized for edge, not portable (by design).

### Flare vs TanStack Start (React & Solid)

**Verified from source code** at `/home/ecomet/Development/monorepo/.local/router-main`.

**Navigation**: Client-driven. Loaders run on client during CSR nav. Server functions compiled by Babel plugin — `'use server'` -> `createClientRpc(functionId)` on client, HTTP POST to `/server-fn/{id}`. Flare is server-driven — loaders run on server, stream via NDJSON.

**SSR**: TanStack Start Solid uses `renderToStream()` (Solid native streaming) wrapped in `renderRouterToStream()`. Stream transformed by `transformStreamWithRouter()` which injects `$_TSR` bootstrap script before `</body>`. Uses `isbot()` detection to await full render for crawlers.

**State**: `window.$_TSR` — complex bootstrap object with dehydrated router state, serialized via Seroval with custom type support. Includes `h()` (hydration complete signal), `e()` (stream end signal), `c()` (cleanup). Matches stored as `{ i: id, b: beforeLoadContext, l: loaderData, e: error, u: updatedAt, s: status }`.

**Server function transport**: Binary framed protocol (9-byte header: `[type:1][streamId:4][length:4]`) supporting JSON frames, binary chunks, end markers, error frames. Falls back to NDJSON and plain JSON. Supports multiplexed streams for large payloads.

**Layout persistence**: Yes — router intelligently reuses matches. Only changed routes get new loaders. Match state includes `staleTime` for SWR caching.

**Dynamic components**: No. Components always determined by static route tree. No server-decided component selection.

**Maturity**: React version is RC. Solid version is v0 alpha. Technically sophisticated but not production-ready for Solid.

### Flare vs Remix / React Router v7

**Navigation**: Client-driven by default. Loaders run on server via Single Fetch — one HTTP request per navigation, turbo-stream serialized response. Optional `clientLoader` to run on client instead. Flare is server-driven with NDJSON streaming.

**turbo-stream**: Serialization format supporting `BigInt`, `Date`, `Error`, `Map`, `Promise`, `RegExp`, `Set`, `Symbol`, `URL`. Promises render to WebStream (enabling `defer()`). Automatic deduplication across loaders.

**SSR**: `renderToPipeableStream` (Node) or `renderToReadableStream` (edge). Streaming mandatory in v7 (can't use `renderToString`). Flare also uses streaming (`renderToStream`) — both frameworks stream by default.

**Streaming**: `defer()` returns unresolved promises, client receives via turbo-stream + Suspense. Requires JavaScript — users with JS disabled can't access deferred content.

**Dynamic components**: No server-decided component trees. RSC support is preview/experimental, not GA. Use loader data + client-side conditional rendering.

**Code splitting**: Route-level + `route.lazy()` in v7.5+ for per-property splitting (component, loader, HydrateFallback as separate chunks). Framework mode auto-splits.

**CDN**: Manual `headers()` export per route. No built-in cache key strategy.

### Flare vs Qwik / QwikCity 2.0

**Fundamentally different paradigm.** Qwik eliminates hydration via resumability — pauses execution on server, resumes on client without replaying logic. O(1) initial JS regardless of app size.

**QRLs**: `./chunk.js#Symbol[0,1]` URLs serialized into HTML attributes. Handler-level code splitting — each `onClick$` is a separate lazy-load boundary. Flare does route-level + component-level splitting.

**Navigation**: Qwik downloads only chunks needed for interaction. Automatic fine-grained lazy loading. No explicit navigation protocol — the framework loads code on demand.

**Server functions**: `server$()` RPC mechanism, similar to SolidStart/TanStack. Serializable return values.

**CDN**: Built-in support via `request.cacheControl()` API + service worker prefetching. Content-hashed filenames.

**Dynamic components**: Server controls initial tree, Qwik does dynamic tree-shaking — components not reachable from user interactions are eliminated. Different from Flare's registry pattern — Qwik is implicit via resumability.

**Key difference**: Qwik optimizes for zero-JS initial load via resumability. Flare optimizes for server-controlled navigation via NDJSON streaming. Different tradeoffs — Qwik is better for static-heavy sites, Flare is better for data-heavy apps with complex server logic.

### Flare vs Marko

**Server-centric like Flare, but different approach.** Marko does out-of-order HTML streaming — sends HTML fragments as they're ready, with swap scripts to reposition in correct order. 15+ years of production use at eBay.

**Streaming**: `<await>` tags for async fragments. Placeholder HTML written, resolved content streams with inline script to swap. True progressive HTML delivery — Flare doesn't do this (complete HTML only).

**Partial hydration**: Automatic — compiler determines which components need client code. Static components never sent to browser. Flare hydrates everything (Solid's full hydration model).

**No client-side routing**: Marko is primarily server-rendered. No built-in SPA router. Navigation = full page load. Flare has full SPA navigation via NDJSON.

**Code splitting**: Component-level via bundler plugins. Automatic tree-shaking of server-only components.

**Key difference**: Marko excels at progressive server rendering with minimal JS. Flare excels at SPA navigation with server-driven data + component decisions. Marko is for content sites, Flare is for applications.

---

## Summary Matrix

| Capability            | Flare + registry             | Next.js RSC            | SolidStart   | TanStack Solid | Remix v7                | Qwik 2                  | Marko 6                |
| --------------------- | ---------------------------- | ---------------------- | ------------ | -------------- | ----------------------- | ----------------------- | ---------------------- |
| **Nav model**         | Server-driven                | Server (RSC)           | Client       | Client         | Client (server loaders) | Resumable               | Server (MPA)           |
| **SSR**               | Streaming (defer-controlled) | Streaming              | Configurable | Streaming      | Streaming (mandatory)   | Resumable               | Out-of-order streaming |
| **CSR nav streaming** | NDJSON                       | Flight                 | None         | None           | turbo-stream            | On-demand chunks        | None (MPA)             |
| **Dynamic trees**     | Route slots (registry)       | Arbitrary              | No           | No             | No (RSC preview)        | Implicit (tree-shaking) | Server-decided         |
| **Layout persist**    | Yes                          | Yes                    | Yes          | Yes            | Yes                     | Yes                     | N/A (MPA)              |
| **Code split level**  | Route + component (lazy)     | Component (manifest)   | Route        | Route          | Route + lazy()          | Handler (QRL)           | Component (auto)       |
| **CDN caching**       | Full HTML + NDJSON           | ISR / PPR shell        | Manual       | Manual         | Manual headers          | Built-in                | N/A                    |
| **Hydration**         | Full (Solid)                 | Selective (RSC)        | Full (Solid) | Full (Solid)   | Full (React)            | None (resumable)        | Partial (auto)         |
| **Runtime**           | Solid                        | React                  | Solid        | Solid          | React                   | Qwik                    | Marko                  |
| **Deploy target**     | CF Workers                   | Any (Vercel-optimized) | Any (Vinxi)  | Any            | Any                     | Any                     | Any (server)           |
| **Maturity**          | In development               | Stable                 | Stable 1.0   | v0 Alpha       | Stable                  | 2.0 (production)        | Stable (eBay)          |

**Flare's unique position**: Only framework combining server-driven navigation + NDJSON streaming + lazy component registries + Solid's fine-grained reactivity + CDN cacheability. Not trying to be everything — specifically optimized for data-heavy Cloudflare Workers applications where the server should control what renders.
