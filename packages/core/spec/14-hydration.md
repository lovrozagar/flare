# Hydration

Layer 4. Depends on router-primitives (matchRoute, deriveLayouts, TreeNode), router-config (MarkedRouterConfig), state-parser (parseFlareState, hydrateFlareState), caches (createMatchCache, createPrefetchCache), ndjson-client (fetchNDJSON).

Client bootstrap. Reads SSR state, loads route modules, hydrates Solid app.

## Types

```ts
type HydrateConfig = MarkedRouterConfig; /* from createRouter() (spec 25) */

interface RouteComponent {
	_type: "render" | "layout" | "root-layout";
	render: (props: unknown) => JSX.Element;
	virtualPath: string;
	/* plus other route result fields */
}

interface LoadedModules {
	layouts: RouteComponent[];
	page: RouteComponent;
	params: Record<string, string | string[]>;
}
```

## Exports

```ts
hydrate(router: MarkedRouterConfig): Promise<void>
loadRouteModules(pathname: string, routeTree: TreeNode, layouts: Record<string, () => Promise<unknown>>): Promise<LoadedModules | null>
```

## Behavior

### `hydrate`

Full client bootstrap sequence:

```
1. Parse SSR state
2. Create caches (with router config defaults)
3. Populate matchCache from SSR state
4. Load route modules (JS chunks)
5. Hydrate Solid app (full document)
```

#### Step 1: Parse SSR State

```ts
const raw = (self as { flare?: unknown }).flare;
const state = parseFlareState(raw);
if (!state) throw new Error("No valid flare state found");

const { matches, params, pathname, resolvers, search } = hydrateFlareState(state);
```

`resolvers` map holds deferred promise resolve/reject functions — passed to NDJSON streaming chunks arriving after initial HTML.

#### Step 2: Create Caches

```ts
const matchCache = createMatchCache({
	gcTime: router.gcTime ?? 300_000,
	maxEntries: router.routeCacheMaxEntries ?? 200,
});
const prefetchCache = createPrefetchCache({
	gcTime: router.prefetchGcTime ?? 300_000,
});
```

#### Step 3: Populate matchCache

```ts
const now = Date.now();
for (const match of matches) {
	matchCache.set({
		data: match.loaderData,
		invalid: false,
		matchId: match.matchId,
		preloaderContext: match.preloaderContext,
		updatedAt: now,
	});
}
```

SSR data is fresh — `invalid: false`, `updatedAt: now`.

#### Step 4: Load Route Modules

```ts
const modules = await loadRouteModules(pathname, router.routeTree, router.layouts);
```

Loads page and layout JS chunks in parallel. See `loadRouteModules` below.

#### Step 5: Hydrate Solid App

Full-document hydrate (`solidHydrate(..., document)`). Lazy route islands render `pending` until `onSettled` (matches SSR). `waitForLazyPreloads` is a test helper on `@lovrozagar/flare/lazy`, not part of hydrate.

```ts
solidHydrate(
  () => (
    <Dummy>
      <FlareProvider
        matchCache={matchCache}
        prefetchCache={prefetchCache}
        matches={matches}
        params={params}
        resolvers={resolvers}
        router={router}
        onContextReady={(ctx) => {
          buildMatches(ctx, modules)
          setupNavigation(ctx, router)
        }}
      >
        <Outlet />
      </FlareProvider>
    </Dummy>
  ),
  document,
)
```

**Dummy component**: matches SSR's `<Hydration>` component depth. Solid hydration requires identical tree depth between SSR and client for key alignment.

```ts
function Dummy(props: { children: JSX.Element }): JSX.Element {
	return props.children;
}
```

After hydration completes:

1. `document.documentElement.dataset.flareHydrated = ""` — CSS-targetable (`[data-flare-hydrated]`)
2. `ctx.setHydrated(true)` — reactive signal for components via `router.hydrated()`

If `state.q` exists and `router.queryClientGetter` is provided, hydrate query cache before rendering:

```ts
const queryClient = router.queryClientGetter?.();
if (state.q && queryClient) {
	for (const entry of state.q) {
		queryClient.setQueryData(entry.key, entry.data, { updatedAt: Date.now() });
		if (entry.staleTime !== undefined) {
			queryClient.setQueryDefaults(entry.key, { staleTime: entry.staleTime });
		}
	}
}
```

If `state.e` exists (dev errors from SSR — only populated in dev mode by server handler), register them in `devErrorStore`:

```ts
if (state.e) {
	for (const err of state.e) {
		devErrorStore.register(err);
	}
}
```

No client-side `isDev` check needed — `state.e` is only present when the server ran in dev mode (spec 24). Production builds never serialize `state.e`.

If `state.ph` exists (per-route heads from SSR), initialize head tracking:

```ts
if (state.ph) {
	initRouteHierarchy(state.ph.map((h) => h.matchId));
	applyPerRouteHeads(state.ph);
}
```

### `loadRouteModules`

Loads page + layout JS chunks in parallel.

1. Match pathname against route tree: `matchRoute(routeTree, pathname)`
2. If no match → return `null`
3. Derive layout keys: `deriveLayouts(route.x)` (virtualPath → layout chain)
4. Load all in parallel:

```ts
const [pageModule, ...layoutModules] = await Promise.all([
	route.p() /* page lazy loader */,
	...layoutKeys.map((key) => {
		const loader = layouts[key];
		return loader ? loader() : null;
	}),
]);
```

5. Extract `.default` from each module
6. Return `{ layouts, page, params }`

### `buildMatches`

Combines loaded modules (components) with cached data (loaderData):

```ts
function buildMatches(ctx: FlareProviderContext, modules: LoadedModules): void {
	const search = Object.fromEntries(new URL(window.location.href).searchParams);
	const allModules = [...modules.layouts, modules.page];

	const matches = allModules.map((mod) => {
		const deps = mod.effectsConfig?.loaderDeps?.({ search }) ?? [];
		const matchId = computeMatchId({
			loaderDeps: () => deps,
			params: modules.params,
			routeId: mod.virtualPath,
			search,
		});
		const cached = matchCache.get(matchId);

		return {
			_type: mod._type,
			loaderData: cached?.data,
			preloaderContext: cached?.preloaderContext,
			render: mod.render,
			virtualPath: mod.virtualPath,
		};
	});

	ctx.setMatches(matches);
	ctx.setParams(modules.params);
}
```

### Navigation Setup

After hydration, `setupNavigation(ctx, routerConfig)` wires up:

- `navigate()` function with router defaults (staleTime, viewTransitions, etc.)
- `popstate` handler for browser back/forward
- Scroll restoration (using `routerConfig.scrollRestoration*` and `getScrollRestorationKey`)
- `basePath` and `trailingSlash` for URL generation

This is the handoff from hydration to the navigation layer.

## Test Cases

```
hydrate:
  Reads self.flare and parses FlareState
  Missing self.flare → throws error
  Invalid self.flare → throws error
  Creates caches with router gcTime and maxEntries
  Populates matchCache with SSR matches
  All SSR matches fresh (invalid: false, updatedAt: now)
  router passed to FlareProvider and setupNavigation
  routeTree and layouts read from router for module loading
  queryClientGetter called for QueryClient hydration if provided

loadRouteModules:
  Matches pathname against tree → loads page module
  Derives layouts from virtualPath → loads layout modules
  All loaded in parallel (Promise.all)
  No match → returns null
  Page module returns .default as RouteComponent
  Layout module returns .default as RouteComponent
  Missing layout loader → null (skipped)

buildMatches:
  Combines module render functions with cached loaderData
  Layouts ordered by nesting depth
  Page is last match
  Missing cache entry → loaderData undefined

Dummy component:
  Renders children unchanged
  Adds one tree depth level (matches SSR Hydration wrapper)

Hydration flow:
  solidHydrate called with document
  FlareProvider receives matchCache and prefetchCache
  onContextReady called during hydration
  data-flare-hydrated attribute set on html element after hydration
  hydrated signal set to true after hydration
  Deferred resolvers available for incoming NDJSON chunks
  Query client hydrated from state.q when router.queryClientGetter provided
  Dev errors from state.e registered in devErrorStore
  Per-route heads from state.ph initialize head tracking

SSR deferred resolution:
  Deferred markers in SSR state → promises created during hydration
  NDJSON chunks after HTML → resolve those promises
  <Await> updates when chunks arrive
```

## Notes

- `router` from `createRouter()` (spec 25) is the single source of truth — contains routeTree, layouts, queryClientGetter, and all runtime defaults
- Client entry: `hydrate(router)` — single arg, same `router` object imported by server
- `solidHydrate` is Solid's `hydrate()` from `@solidjs/web` — attaches reactivity to SSR HTML without re-rendering
- Dummy component depth MUST match SSR's `<Hydration>` wrapper depth — off by one breaks hydration key alignment
- `#app` element expected in SSR HTML body — root layout renders it as part of `<body>`
- Route modules loaded in parallel with `Promise.all` — page + all layouts simultaneously
- `clientLazy` preloads are global side effects — any lazy component imported registers a preload
- `buildMatches` uses `computeMatchId()` (not `virtualPath`) to look up cache entries — matchCache is keyed by matchId which includes params, search, and loaderDeps. Using virtualPath would miss parameterized cache entries.
- Navigation setup deferred to `onContextReady` — not called until Solid hydration is in progress
- TanStack Query hydration: `state.q` entries restored via `router.queryClientGetter?.().setQueryData()` before render (spec 33)
- Dev error hydration: `state.e` entries registered in `devErrorStore` for overlay (spec 37)
- Per-route head hydration: `state.ph` entries init head tracking via `initRouteHierarchy` + `applyPerRouteHeads` (spec 27)
- `data-flare-hydrated` attribute on `<html>` enables CSS targeting of post-hydration state (e.g. `[data-flare-hydrated] .skeleton { display: none }`)
- `resolvers` map bridges SSR deferred markers to NDJSON chunk resolution
- If hydration fails (preload error, module load error), the SSR HTML remains visible but non-interactive. No framework-level error UI — the page degrades to static HTML. Apps can wrap `hydrate()` in try/catch to show a reload prompt.
