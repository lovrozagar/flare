# Outlet & FlareProvider

Layer 5. Depends on router-primitives (Location, buildLocation), caches (MatchCache, PrefetchCache), errors (NotFoundError), boundaries (ErrorRenderProps, NotFoundRenderProps, GlobalBoundaries).

Rendering layer. FlareProvider holds reactive state, `<Outlet>` renders the matched route chain, layout persistence via Solid's fine-grained reactivity.

## Types

### ClientMatch

```ts
interface ClientMatch {
	_type: "layout" | "render" | "root-layout";
	errorRender?: (props: ErrorRenderProps) => JSX.Element;
	loaderData: unknown;
	notFoundRender?: (props: NotFoundRenderProps) => JSX.Element;
	preloaderContext?: Record<string, unknown>;
	render: (props: RenderProps) => JSX.Element;
	unauthorizedRender?: (props: UnauthorizedRenderProps) => JSX.Element;
	virtualPath: string;
}
```

Client-side representation of a matched route. Combined from loaded module (render, errorRender, notFoundRender) and cached data (loaderData, preloaderContext).

### FlareProviderContext

```ts
interface FlareProviderContext {
	/* Reactive state (Solid signals) */
	hydrated: Accessor<boolean>;
	isNavigating: Accessor<boolean>;
	location: Accessor<Location>;
	matches: Accessor<ClientMatch[]>;
	notFound: Accessor<boolean>;
	params: Accessor<Record<string, string | string[]>>;
	search: Accessor<Record<string, string>>;

	/* State setters (called by navigation / hydration) */
	setHydrated: (v: boolean) => void;
	setIsNavigating: (v: boolean) => void;
	setMatches: (matches: ClientMatch[]) => void;
	setNotFound: (notFound: boolean) => void;
	setParams: (params: Record<string, string | string[]>) => void;
	setSearch: (search: Record<string, string>) => void;

	/* Caches */
	matchCache: MatchCache;
	prefetchCache: PrefetchCache;

	/* Router actions (set by setupNavigation) */
	navigate: (options: NavigateOptions) => Promise<void>;
	prefetch: (options: PrefetchOptions) => Promise<void>;

	/* Boundaries (from FlareProviderProps) */
	boundaries?: GlobalBoundaries;

	/* Invalidation */
	invalidate: (options?: InvalidateOptions) => void;

	/* Infrastructure */
	layouts: Record<string, () => Promise<{ default: unknown }>>;
	resolvers: Map<string, DeferredResolver>;
	routeTree: TreeNode;
}
```

### FlareRouter (public API)

```ts
interface FlareRouter {
	/* Reactive signals */
	hydrated: Accessor<boolean>;
	isNavigating: Accessor<boolean>;
	location: Accessor<Location>;
	matches: Accessor<ClientMatch[]>;
	params: Accessor<Record<string, string | string[]>>;
	search: Accessor<Record<string, string>>;

	/* Actions */
	buildLocation: <TPath extends RegisteredRoutes>(options: BuildLocationOptions<TPath>) => Location;
	buildUrl: <TPath extends RegisteredRoutes>(options: BuildUrlOptions<TPath>) => string;
	clearCache: () => void;
	invalidate: (options?: InvalidateOptions) => void;
	navigate: <TPath extends RegisteredRoutes>(options: NavigateOptions<TPath>) => Promise<void>;
	prefetch: <TPath extends RegisteredRoutes>(options: PrefetchOptions<TPath>) => Promise<void>;
	refetch: () => Promise<void>;

	/* Data hooks */
	useBlocker: (when: () => boolean) => BlockerState;
	useLoaderData: <TPath extends RegisteredLoaderPaths>(options: UseLoaderDataOptions<TPath>) => Accessor<unknown>;
	useMatch: <TPath extends string>(options: { from: TPath }) => Accessor<ClientMatch | undefined>;
	usePreloaderContext: <TPath extends RegisteredPreloaderPaths>(
		options: UsePreloaderContextOptions<TPath>,
	) => Accessor<unknown>;
}
```

### Navigation Types

```ts
interface NavigateOptions<TPath extends RegisteredRoutes = RegisteredRoutes> {
  hash?: string
  replace?: boolean
  scroll?: boolean                   /* default: true — set false to preserve scroll */
  shallow?: boolean                  /* update URL without fetching data */
  revalidate?: boolean
  state?: unknown
  to: TPath
  viewTransition?: ViewTransitionConfig
} & (HasRequiredParams<TPath> extends true
  ? { params: RouteParams<TPath> }
  : { params?: RouteParams<TPath> })
  & { search?: RouteSearch<TPath> }

interface PrefetchOptions<TPath extends RegisteredRoutes = RegisteredRoutes> {
  to: TPath
} & (HasRequiredParams<TPath> extends true
  ? { params: RouteParams<TPath> }
  : { params?: RouteParams<TPath> })

interface BuildLocationOptions<TPath extends RegisteredRoutes = RegisteredRoutes> {
  hash?: string
  to: TPath
  search?: RouteSearch<TPath>
} & (HasRequiredParams<TPath> extends true
  ? { params: RouteParams<TPath> }
  : { params?: RouteParams<TPath> })

interface BuildUrlOptions<TPath extends RegisteredRoutes = RegisteredRoutes> {
  hash?: string
  to: TPath
  search?: RouteSearch<TPath>
} & (HasRequiredParams<TPath> extends true
  ? { params: RouteParams<TPath> }
  : { params?: RouteParams<TPath> })
```

`params` required when route has required params (e.g. `/products/[id]`), optional when route has only optional params (e.g. `/[[locale]]/compare`), absent when route has no params. Enforced at compile time via `HasRequiredParams<TPath>`.

### View Transition Types

```ts
type ViewTransitionConfig = boolean | ViewTransitionOptions;

interface ViewTransitionOptions {
	types: string[] | ((info: LocationChangeInfo) => string[] | false);
}

interface LocationChangeInfo {
	direction: ViewTransitionDirection;
	fromLocation: { hash: string; pathname: string; search: string } | null;
	pathChanged: boolean;
	toLocation: { hash: string; pathname: string; search: string };
}

type ViewTransitionDirection = "back" | "forward" | "none";
```

- `true` → enable with direction-based types (`forward`/`back`/`none`)
- `false` → disabled
- `{ types: ["fade", "slide-left"] }` → static types
- `{ types: ({ direction }) => [\`slide-${direction}\`] }` → dynamic types
- `{ types: ({ pathChanged }) => pathChanged ? ["fade"] : false }` → conditional skip

### Data Hook Types

```ts
interface UseLoaderDataOptions<TPath extends RegisteredLoaderPaths> {
	from: TPath;
	select?: (data: ResolvedLoaderData<TPath>) => unknown;
}

interface UsePreloaderContextOptions<TPath extends RegisteredPreloaderPaths> {
	from: TPath;
	select?: (ctx: ResolvedPreloaderContext<TPath>) => unknown;
}

interface BlockerState {
	blocked: Accessor<boolean>;
	proceed: () => void;
	reset: () => void;
}
```

### Type Registration

Type safety for `from`, `to`, `params`, `search` powered by `FlareRegister` module augmentation (generated by spec 19):

```ts
type RegisteredRoutes = FlareRegister extends { routes: infer T }
  ? T extends Record<string, unknown> ? keyof T & string : string
  : string

type RegisteredLoaderPaths = FlareRegister extends { loaderData: infer T }
  ? T extends Record<string, unknown> ? keyof T & string : string
  : string

type RegisteredPreloaderPaths = FlareRegister extends { preloaderContext: infer T }
  ? T extends Record<string, unknown> ? keyof T & string : string
  : string

type RouteParams<TPath> = /* extracted from FlareRegister.routes[TPath].params */
type RouteSearch<TPath> = /* extracted from FlareRegister.routes[TPath].search */
type HasRequiredParams<TPath> = /* true if any param key is non-optional */
type ResolvedLoaderData<TPath> = /* FlareRegister.loaderData[TPath] */
type ResolvedPreloaderContext<TPath> = /* FlareRegister.preloaderContext[TPath] */
```

Subset of `FlareProviderContext` exposed to application code. Data hooks use `{ from }` pattern for type-safe route-specific access (types narrowed via generated `FlareRegister` augmentation).

## Exports

```ts
/* Provider */
FlareProvider: (props: FlareProviderProps) => JSX.Element

/* Hooks */
useRouter(): FlareRouter
useRouterContext(): FlareProviderContext  /* internal — for Link, Outlet, navigation */

/* Components */
Outlet: (props?: { fallback?: JSX.Element }) => JSX.Element
```

## FlareProvider

### Props

```ts
interface FlareProviderProps {
	boundaries?: GlobalBoundaries;
	children: JSX.Element;
	layouts: Record<string, () => Promise<{ default: unknown }>>;
	matchCache: MatchCache;
	matches: ClientMatch[];
	onContextReady?: (ctx: FlareProviderContext) => void;
	params: Record<string, string | string[]>;
	prefetchCache: PrefetchCache;
	resolvers: Map<string, DeferredResolver>;
	routeTree: TreeNode;
}
```

### Behavior

Creates reactive state from initial props:

```ts
const [hydrated, setHydrated] = createSignal(false);
const [isNavigating, setIsNavigating] = createSignal(false);
const [matches, setMatches] = createSignal(props.matches);
const [notFound, setNotFound] = createSignal(false);
const [params, setParams] = createSignal(props.params);
const [search, setSearch] = createSignal(Object.fromEntries(new URL(window.location.href).searchParams));

const location = createMemo(() => {
	const allMatches = matches();
	const lastMatch = allMatches[allMatches.length - 1];
	const firstMatch = allMatches[0];
	if (!lastMatch || !firstMatch) return buildLocation(new URL(window.location.href), params(), "", "");

	return buildLocation(
		new URL(window.location.href),
		params(),
		lastMatch.virtualPath,
		/* variablePath derived from virtualPath */
	);
});
```

`location` is a computed signal — recomputes when params or matches change.

### onContextReady

Called during initial render (not deferred). Passes full `FlareProviderContext` to caller. Used by hydration to wire up navigation:

```ts
createEffect(() => {
	if (props.onContextReady) {
		props.onContextReady(ctx);
	}
});
```

Called once. `setupNavigation(ctx)` binds navigate/prefetch functions to context.

### invalidate

Convenience wrapper exposed to application code:

```ts
function invalidate(options?: InvalidateOptions): void {
	ctx.matchCache.invalidate(options);
	/* Trigger re-fetch for current route's stale matches */
	navigate({ revalidate: true, to: window.location.href, replace: true });
}
```

Invalidates cache entries, then re-navigates to current URL with `revalidate` to force refetch.

## `useRouter`

```ts
function useRouter(): FlareRouter {
	const ctx = useContext(RouterContext);
	if (!ctx) throw new Error("useRouter() called outside FlareProvider");
	return {
		/* Signals */
		hydrated: ctx.hydrated,
		isNavigating: ctx.isNavigating,
		location: ctx.location,
		matches: ctx.matches,
		params: ctx.params,
		search: ctx.search,

		/* Actions */
		buildLocation: (options) => {
			const url = new URL(buildUrl(options), window.location.href);
			const match = matchRoute(ctx.routeTree, url.pathname);
			return buildLocationPrimitive(
				url,
				options.params ?? match?.params ?? {},
				match?.route.x ?? "",
				match?.route.v ?? "",
				options.search,
				options.hash,
			);
		},
		buildUrl: (options) => buildUrl(options),
		clearCache: () => ctx.matchCache.clear(),
		invalidate: ctx.invalidate,
		navigate: ctx.navigate,
		prefetch: ctx.prefetch,
		refetch: () => ctx.navigate({ revalidate: true, to: window.location.href, replace: true }),

		/* Data hooks */
		useBlocker: (when) => createBlocker(ctx, when),
		useLoaderData: (options) => createLoaderDataAccessor(ctx, options),
		useMatch: (options) => createMatchAccessor(ctx, options),
		usePreloaderContext: (options) => createPreloaderContextAccessor(ctx, options),
	};
}
```

Public hook. Returns signals, actions, and data hooks. No setters, no caches, no internal state.

### `router.useLoaderData`

Type-safe loader data access by virtualPath:

```ts
const router = useRouter();
const product = router.useLoaderData({ from: "_root_/(shop)/products/[id]" });
/* product() → typed loader data for that route */

/* With select — derive a subset */
const title = router.useLoaderData({
	from: "_root_/(shop)/products/[id]",
	select: (data) => data.product.title,
});
```

Implementation:

```ts
function createLoaderDataAccessor(ctx, options): Accessor<unknown> {
	return createMemo(() => {
		const match = ctx.matches().find((m) => m.virtualPath === options.from);
		if (!match) return undefined;
		if (options.select) return options.select(match.loaderData);
		return match.loaderData;
	});
}
```

- Reactive: re-computes when matches change (navigation)
- `from` must be a virtualPath in the current match chain
- No match found → returns `undefined`
- `select` enables derived/transformed access without re-rendering on unrelated data changes

### `router.usePreloaderContext`

Same pattern as `useLoaderData` but for preloader context:

```ts
const router = useRouter();
const theme = router.usePreloaderContext({
	from: "_root_",
	select: (ctx) => ctx.theme,
});
```

Implementation:

```ts
function createPreloaderContextAccessor(ctx, options): Accessor<unknown> {
	return createMemo(() => {
		const match = ctx.matches().find((m) => m.virtualPath === options.from);
		if (!match) return undefined;
		if (options.select) return options.select(match.preloaderContext);
		return match.preloaderContext;
	});
}
```

### `router.useMatch`

Access a specific match by virtualPath:

```ts
const router = useRouter();
const shopLayout = router.useMatch({ from: "_root_/(shop)" });
/* shopLayout() → ClientMatch | undefined */
```

Implementation:

```ts
function createMatchAccessor(ctx, options): Accessor<ClientMatch | undefined> {
	return createMemo(() => ctx.matches().find((m) => m.virtualPath === options.from));
}
```

### `router.useBlocker`

Blocks navigation when `when()` returns `true`. For unsaved changes, form dirty state, etc.

```ts
const router = useRouter()
const blocker = router.useBlocker(() => formIsDirty())

/* In UI: */
<Show when={blocker.blocked()}>
  <dialog>
    <p>Unsaved changes. Leave?</p>
    <button onClick={blocker.proceed}>Leave</button>
    <button onClick={blocker.reset}>Stay</button>
  </dialog>
</Show>
```

Implementation:

```ts
function createBlocker(ctx, when): BlockerState {
	const [blocked, setBlocked] = createSignal(false);
	let pendingNavigation: NavigateOptions | null = null;

	/* Intercept navigate() */
	const originalNavigate = ctx.navigate;
	ctx.navigate = async (options) => {
		if (when()) {
			pendingNavigation = options;
			setBlocked(true);
			return;
		}
		return originalNavigate(options);
	};

	/* Intercept beforeunload (browser close/refresh) */
	const handleBeforeUnload = (e: BeforeUnloadEvent) => {
		if (when()) {
			e.preventDefault();
			e.returnValue = "";
		}
	};
	window.addEventListener("beforeunload", handleBeforeUnload);

	onCleanup(() => {
		ctx.navigate = originalNavigate;
		window.removeEventListener("beforeunload", handleBeforeUnload);
	});

	return {
		blocked,
		proceed: () => {
			setBlocked(false);
			if (pendingNavigation) {
				const nav = pendingNavigation;
				pendingNavigation = null;
				originalNavigate(nav);
			}
		},
		reset: () => {
			setBlocked(false);
			pendingNavigation = null;
		},
	};
}
```

- `blocked()` → reactive boolean, true when navigation was intercepted
- `proceed()` → unblocks and executes the pending navigation
- `reset()` → unblocks and discards the pending navigation
- `beforeunload` → browser's native "leave page?" dialog for tab close/refresh
- Cleaned up on component unmount (`onCleanup`)

### `router.hydrated`

Signal that tracks hydration state:

```ts
const router = useRouter();

/* SSR: */ router.hydrated() === false;
/* After hydrate(): */ router.hydrated() === true;
```

Set to `true` after `solidHydrate` completes + `data-hydrated` attribute set. Useful for client-only UI (e.g. showing interactive elements only after hydration).

## `useRouterContext`

```ts
function useRouterContext(): FlareProviderContext {
	const ctx = useContext(RouterContext);
	if (!ctx) throw new Error("useRouterContext() called outside FlareProvider");
	return ctx;
}
```

Internal hook. Used by `<Outlet>`, `<Link>`, and navigation module. Full context access.

## `<Outlet>`

### Props

```ts
interface OutletProps {
	fallback?: JSX.Element;
}
```

Optional `fallback` rendered during Suspense (deferred data loading).

### Depth Tracking

Each Outlet renders one level of the match chain. Depth tracked via Solid context:

```ts
const DepthContext = createContext<number>(0);

function useDepth(): number {
	return useContext(DepthContext) ?? 0;
}
```

Root `<Outlet>` (inside FlareProvider) is depth 0. Each layout's `children` contains another `<Outlet>` at depth + 1.

### Rendering

```ts
function Outlet(props?: OutletProps): JSX.Element {
  const depth = useDepth()
  const ctx = useRouterContext()

  return (
    <Show when={!ctx.notFound() || depth === 0}>
      <DepthContext.Provider value={depth + 1}>
        <OutletContent depth={depth} fallback={props?.fallback} />
      </DepthContext.Provider>
    </Show>
  )
}
```

### OutletContent

Renders the match at the current depth:

```ts
function OutletContent(props: { depth: number; fallback?: JSX.Element }): JSX.Element {
  const ctx = useRouterContext()
  const match = createMemo(() => ctx.matches()[props.depth])

  return (
    <Show when={match()}>
      {(m) => {
        const isPage = () => m()._type === "render"

        return (
          <ErrorBoundaryWrapper match={m()} depth={props.depth}>
            <Suspense fallback={props.fallback ?? null}>
              <Dynamic
                component={m().render}
                loaderData={m().loaderData}
                location={ctx.location()}
                preloaderContext={m().preloaderContext}
                {...(isPage() ? {} : { children: <Outlet fallback={props.fallback} /> })}
              />
            </Suspense>
          </ErrorBoundaryWrapper>
        )
      }}
    </Show>
  )
}
```

- `<Dynamic>` renders the match's component
- Layouts receive `children` (next Outlet). Pages do not.
- `<Suspense>` wraps for deferred data (Await/streaming)
- `<ErrorBoundaryWrapper>` wraps for error catching

### Error Boundary Wrapping

Each match level wrapped in error boundary that resolves via walk-up:

```ts
function ErrorBoundaryWrapper(props: {
  children: JSX.Element
  depth: number
  match: ClientMatch
}): JSX.Element {
  const ctx = useRouterContext()

  return (
    <ErrorBoundary
      fallback={(error, reset) => {
        /* NotFoundError → walk up notFoundRender chain */
        if (error instanceof NotFoundError) {
          return resolveNotFoundBoundary(ctx, props.depth, error)
        }
        /* UnauthenticatedError / UnauthorizedError → walk up unauthorizedRender chain */
        if (error instanceof UnauthenticatedError || error instanceof UnauthorizedError) {
          return resolveUnauthorizedBoundary(ctx, props.depth, error)
        }
        /* Other errors → walk up errorRender chain */
        return resolveErrorBoundary(ctx, props.depth, error, reset)
      }}
    >
      {props.children}
    </ErrorBoundary>
  )
}
```

**Error boundary resolution** (walk-up):

```ts
function resolveErrorBoundary(ctx, depth, error, reset): JSX.Element {
  /* Walk from current depth toward root */
  const matches = ctx.matches()
  for (let i = depth; i >= 0; i--) {
    if (matches[i]?.errorRender) {
      return matches[i].errorRender({
        error,
        location: ctx.location(),
        reset,
      })
    }
  }
  /* Global boundary */
  if (ctx.boundaries?.error) {
    return ctx.boundaries.error({ error, location: ctx.location(), reset })
  }
  /* Minimal fallback */
  return <div>Something went wrong</div>
}
```

Same walk-up for notFound and unauthorized: page → layouts → root → global → minimal fallback.

**Unauthorized boundary resolution** (walk-up):

```ts
function resolveUnauthorizedBoundary(ctx, depth, error): JSX.Element {
  const matches = ctx.matches()
  for (let i = depth; i >= 0; i--) {
    if (matches[i]?.unauthorizedRender) {
      return matches[i].unauthorizedRender({
        error,
        location: ctx.location(),
      })
    }
  }
  if (ctx.boundaries?.unauthorized) {
    return ctx.boundaries.unauthorized({ error, location: ctx.location() })
  }
  return <div>{error.name === "UnauthenticatedError" ? "Please log in" : "Access denied"}</div>
}
```

### NotFound Rendering

When `ctx.notFound()` is `true`:

```ts
<Show when={ctx.notFound()}>
  {ctx.boundaries?.notFound
    ? ctx.boundaries.notFound({ location: ctx.location() })
    : <div>Page not found</div>
  }
</Show>
```

Rendered at root Outlet level (depth 0). Replaces entire match chain.

### Layout Persistence

Layouts persist across navigations that share the same layout chain. This is a natural consequence of Solid's reactivity model:

**Signal-based rendering**: `ctx.matches()` is a signal. When it changes:

- Matches at same depth with same `render` function reference → component stays mounted, only props update
- Matches at same depth with different `render` function → component remounts

**Example**:

```
Navigate /products/1 → /products/2 (same layout structure):
  Root Layout [depth 0]: stays mounted (same render fn)
  Product Layout [depth 1]: stays mounted (same render fn)
  Product Page [depth 2]: props update (loaderData changes)

Navigate /products/1 → /settings (different layout):
  Root Layout [depth 0]: stays mounted
  Product Layout [depth 1]: unmounts
  Settings Layout [depth 1]: mounts
  Settings Page [depth 2]: mounts
```

Layout state (scroll position, form inputs, local signals) preserved when layout persists. No special mechanism needed — Solid's fine-grained reactivity handles it.

**Key requirement**: route modules export stable function references. Same module = same `render` function identity across navigations. Guaranteed because modules are loaded once and cached.

## Test Cases

```
FlareProvider:
  Creates reactive signals from initial props
  location is computed from params + matches
  location updates when params change
  location updates when matches change
  onContextReady called with full context
  onContextReady called once during initial render

useRouter:
  Returns public API subset (no setters, no caches)
  Throws if called outside FlareProvider
  location is reactive (returns Accessor)
  matches is reactive
  params is reactive
  search is reactive
  hydrated is reactive
  isNavigating is reactive — true during navigation, false when idle
  navigate function available
  prefetch function available
  invalidate function available
  buildLocation returns Location object for type-safe path
  buildUrl returns URL string for type-safe path
  clearCache empties matchCache
  refetch re-navigates with revalidate
  useLoaderData, usePreloaderContext, useMatch, useBlocker available

useLoaderData:
  { from: virtualPath } → returns Accessor of that route's loaderData
  Route not in match chain → returns undefined
  With select → returns transformed value
  Reactive — updates on navigation
  select prevents re-render when unselected data changes

usePreloaderContext:
  { from: virtualPath } → returns Accessor of that route's preloaderContext
  Route not in match chain → returns undefined
  With select → returns transformed value
  Reactive — updates on navigation

useMatch:
  { from: virtualPath } → returns Accessor of ClientMatch | undefined
  Route in match chain → returns match
  Route not in match chain → returns undefined
  Reactive — updates on navigation

useBlocker:
  when() returns false → navigation proceeds normally
  when() returns true → navigation blocked, blocked() becomes true
  proceed() → unblocks + executes pending navigation
  reset() → unblocks + discards pending navigation
  beforeunload event → browser native dialog when when() is true
  Cleanup on component unmount → restores original navigate
  Multiple blockers → last one wins (override pattern)

hydrated:
  SSR → false
  After solidHydrate completes → true
  Reactive signal — components re-render when hydration completes

useRouterContext:
  Returns full context (setters, caches, etc.)
  Throws if called outside FlareProvider

invalidate:
  No options → all cache entries invalidated
  With matchId → specific entry invalidated
  With routeId → matching entries invalidated
  Triggers re-navigation to current URL with revalidate

Outlet depth:
  First Outlet → depth 0
  Outlet inside layout → depth 1
  Outlet inside nested layout → depth 2
  Three-level nesting: root(0) → layout(1) → page(2)

Outlet rendering:
  Renders match component at current depth
  Layout receives children (nested Outlet)
  Page does NOT receive children
  No match at depth → renders nothing
  Suspense wraps component for deferred data
  fallback prop passed to Suspense

Layout persistence:
  Same virtualPath across nav → component stays mounted
  Different virtualPath → component remounts
  Parent layout persists when child changes
  Root layout persists across all same-root navigations
  Layout local state preserved on persistence
  Props update without remount (loaderData, preloaderContext, location)

Error boundary:
  Error in page render → caught by page's errorRender
  No page errorRender → caught by parent layout's errorRender
  No layout errorRender → caught by root's errorRender
  No route errorRender → caught by global error boundary
  No global error boundary → minimal fallback rendered
  reset() re-renders component, re-fetches data
  NotFoundError → walks notFoundRender chain instead
  Error boundary per depth level (independent)

NotFound rendering:
  ctx.notFound() true → global notFound boundary rendered
  ctx.notFound() false → normal match rendering
  No global notFound boundary → minimal "Page not found" fallback
  NotFound replaces entire match chain

Unauthorized boundary:
  UnauthenticatedError → walks unauthorizedRender chain
  UnauthorizedError → walks unauthorizedRender chain
  No route unauthorizedRender → global unauthorized boundary
  No global unauthorized → minimal fallback
  Walk-up: page → layout → root → global

ClientMatch:
  _type discriminates: "render" (page), "layout", "root-layout"
  loaderData from matchCache
  preloaderContext from matchCache
  render from loaded module
  errorRender optional
  notFoundRender optional
  unauthorizedRender optional
  virtualPath identifies the route

Dynamic component rendering:
  <Dynamic> receives render function as component
  Props: loaderData, location, preloaderContext
  Layout also receives children
  Params accessible via location.params (not a separate prop)
  Props are reactive — update on signal change

Global boundaries:
  Configured via FlareProvider boundaries prop
  error, notFound, unauthorized — all optional
  Global is last resort after route boundary walk-up
  Missing global → framework minimal fallback
```

## Notes

- `FlareProvider` is mounted once at hydration — never re-mounted during the app lifecycle
- `useRouter()` is the public API. `useRouterContext()` is internal — not exported from the package's public entry point
- Layout persistence is free — no keyed lists, no explicit memoization. Solid's reactivity does it naturally because signal changes only re-run dependent computations
- `<Outlet>` uses Solid `<Dynamic>` for component rendering — swaps component when match changes at a depth
- Error boundaries are per-depth, not per-component — a single boundary wraps each Outlet level
- `invalidate()` is eager — immediately triggers re-fetch, not lazy
- `notFound` state is separate from `matches` — allows rendering notFound without any match chain
- `DepthContext` is a Solid context (not a global) — safe for concurrent rendering and multiple root layouts
- Root layout's `children` is everything below it — entire app tree renders through a single `<Outlet>` chain
- `<Suspense>` fallback is shared across all deferred data at a depth level — per-field fallbacks use `<Await>` component (spec 37)
