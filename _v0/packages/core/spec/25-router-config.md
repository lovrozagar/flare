# Router Config

Layer 3. Depends on caches (MatchCache, PrefetchCache), navigation (setupNavigation), outlet (FlareProviderContext).

Isomorphic router configuration. Created in `router.ts`, consumed by both server (`createServerHandler`) and client (`hydrate`). Flows through FlareState serialization for client hydration.

## Types

### RouterConfig

```ts
interface RouterConfig {
	/* Route tree (required — from generated routes.gen.ts) */
	layouts: Record<string, () => Promise<{ default: unknown }>>;
	routeTree: TreeNode;

	/* URL behavior */
	basePath?: string; /* default: "" */
	caseSensitive?: boolean; /* default: false */
	trailingSlash?: TrailingSlashMode; /* default: "never" */

	/* Cache timing defaults (milliseconds) */
	gcTime?: number; /* default: 300_000 (5 min) */
	prefetchGcTime?: number; /* default: 300_000 (5 min) */
	prefetchStaleTime?: number; /* default: 30_000 (30s) */
	staleTime?: number; /* default: 0 (always refetch) */

	/* Prefetch */
	prefetch?: PrefetchStrategy; /* default: false */

	/* View transitions */
	viewTransitions?: ViewTransitionDefaults; /* default: false */

	/* Scroll restoration */
	scrollRestoration?: boolean; /* default: true */
	scrollRestorationBehavior?: "auto" | "smooth"; /* default: "auto" */
	scrollRestorationMaxEntries?: number; /* default: 2000 */
	getScrollRestorationKey?: (location: Location) => string;

	/* Cache limits */
	routeCacheMaxEntries?: number; /* default: 200 */

	/* Not found boundary resolution */
	notFoundBoundary?: "nearest" | "root"; /* default: "nearest" */

	/* TanStack Query integration (optional, tree-shaken if not provided) */
	queryClientGetter?: () => QueryClient;
}

type TrailingSlashMode = "never" | "always" | "preserve";
type PrefetchStrategy = false | "intent" | "render" | "viewport";

/** Serializable subset — no functions (functions can't survive FlareState JSON) */
type ViewTransitionDefaults = boolean | { types: string[] };
```

### MarkedRouterConfig

```ts
interface MarkedRouterConfig extends RouterConfig {
	[Symbol.for("flare/router-config")]: true;
}
```

### SerializableRouterConfig

Subset of `RouterConfig` that survives JSON serialization (no functions). Embedded in FlareState for client hydration.

```ts
interface SerializableRouterConfig {
	basePath?: string;
	caseSensitive?: boolean;
	gcTime?: number;
	notFoundBoundary?: "nearest" | "root";
	prefetch?: PrefetchStrategy;
	prefetchGcTime?: number;
	prefetchStaleTime?: number;
	routeCacheMaxEntries?: number;
	scrollRestoration?: boolean;
	scrollRestorationBehavior?: "auto" | "smooth";
	scrollRestorationMaxEntries?: number;
	staleTime?: number;
	trailingSlash?: TrailingSlashMode;
	viewTransitions?: ViewTransitionDefaults;
}
```

`layouts`, `routeTree`, `queryClientGetter`, `getScrollRestorationKey` excluded — non-serializable (functions/code). Client re-accesses from the imported `router` object directly.

### FlareState

Serialized into `self.flare` for client hydration. Single-char keys for bundle size.

```ts
interface FlareState {
	c: ContextState; /* client context */
	dk?: string[]; /* dynamic registry keys (spec 18) */
	e?: DevError[]; /* dev-only SSR errors for client overlay */
	m: FlareMatchState[]; /* matched route data */
	p: string; /* pathname */
	ph?: PerRouteHead[]; /* per-route head configs for client init */
	q?: QueryState[]; /* query client hydration data */
	r: Record<string, string | string[]>; /* params */
	s: Record<string, string>; /* search */
}

interface FlareMatchState {
	d: unknown; /* loaderData (deferred markers preserved) */
	h?: HeadConfig; /* per-route head config */
	i: string; /* matchId */
	p?: Record<string, unknown>; /* preloaderContext */
	v: string; /* virtualPath */
}

interface ContextState {
	dir?: string; /* document direction ("ltr" | "rtl") */
	locale?: string; /* active locale */
	router?: SerializableRouterConfig; /* serialized router config */
	theme?: string; /* active theme ("light" | "dark") */
}
```

### Supporting Types

Defined in spec 08 (SSR). Repeated here for FlareState completeness:

```ts
interface DevError {
	message: string;
	name: string;
	source: string;
	stack?: string;
}

interface PerRouteHead {
	head: HeadConfig;
	matchId: string;
}

interface QueryState {
	data: unknown;
	key: unknown[];
	staleTime?: number;
}
```

## Exports

```ts
/* Isomorphic */
createRouter(config?: RouterConfig): MarkedRouterConfig
isRouterConfig(value: unknown): value is MarkedRouterConfig

/* Server-side (re-exported from spec 08 SSR — canonical owner) */
serializeFlareState(state: FlareState): string
buildFlareStateScript(state: FlareState, nonce: string): string

/* Own exports */
parseFlareState(raw: unknown): FlareState | null

/* Client-side */
getRouterConfig(state: FlareState): SerializableRouterConfig
```

## Behavior

### `createRouter`

Factory for isomorphic router config. Marks the config object with a symbol for runtime identification.

```ts
const MARKER = Symbol.for("flare/router-config");

function createRouter(config: RouterConfig): MarkedRouterConfig {
	return { ...config, [MARKER]: true };
}
```

Used in `router.ts`:

```ts
/* src/router.ts — isomorphic, imported by server.ts and client.ts */
import { createRouter } from "@lovrozagar/flare";
import { layouts, routeTree } from "./_gen/routes.gen";
import { getQueryClient } from "./query-client";

export const router = createRouter({
	layouts,
	routeTree,
	prefetch: "intent",
	queryClientGetter: getQueryClient,
	staleTime: 30_000,
	viewTransitions: true,
});
```

Minimal:

```ts
import { layouts, routeTree } from "./_gen/routes.gen";

export const router = createRouter({ layouts, routeTree });
```

Server and client entries:

```ts
/* src/server.ts */
import { router } from "./router";
export default createServerHandler({ router, authenticateFn });

/* src/client.ts */
import { router } from "./router";
hydrate(router);
```

### `isRouterConfig`

Runtime check for marker symbol:

```ts
function isRouterConfig(value: unknown): value is MarkedRouterConfig {
	return value !== null && typeof value === "object" && MARKER in value && value[MARKER] === true;
}
```

### Server → FlareState Flow

`createServerHandler` receives `router` (from `createRouter`). Server reads `routeTree` and `layouts` from it for route matching and module loading. After pipeline execution, the serializable subset is embedded in FlareState:

```ts
function extractSerializable(router: MarkedRouterConfig): SerializableRouterConfig {
	const { getScrollRestorationKey, layouts, queryClientGetter, routeTree, [MARKER]: _, ...clean } = router;
	return clean;
}

const flareState: FlareState = {
	c: {
		dir: middlewareContext.get("dir"),
		locale: middlewareContext.get("locale"),
		router: extractSerializable(config.router),
		theme: middlewareContext.get("theme"),
	},
	dk: registryKeys.length > 0 ? registryKeys : undefined,
	e: devErrors.length > 0 ? devErrors : undefined,
	m: pipelineResult.matches.map((match) => ({
		d: stripDeferred(match.loaderData),
		h: match.headConfig,
		i: match.matchId,
		p: match.preloaderContext,
		v: match.virtualPath,
	})),
	p: url.pathname,
	ph: perRouteHeads.length > 0 ? perRouteHeads : undefined,
	q: queryStates.length > 0 ? queryStates : undefined,
	r: matchResult.params,
	s: Object.fromEntries(url.searchParams),
};
```

### Client Consumption

On hydration (`hydrate(router)` from spec 14):

1. Parse `self.flare` via `parseFlareState()`
2. Router config available directly from the `router` arg (no merge needed — client imports same object)
3. Apply defaults to caches:
   - `matchCache` gcTime → `router.gcTime ?? 300_000`
   - `prefetchCache` gcTime → `router.prefetchGcTime ?? 300_000`
4. Apply defaults to navigation:
   - `prefetchStaleTime` → `router.prefetchStaleTime ?? 30_000`
   - `staleTime` → per-route `.options()` override or `router.staleTime ?? 0`
   - `viewTransitions` → per-nav override or `router.viewTransitions ?? false`
5. Apply defaults to `<Link>`:
   - `prefetch` → per-link override or `router.prefetch ?? false`
6. Apply URL behavior:
   - `basePath` → prepended to all generated URLs
   - `trailingSlash` → enforced on generated URLs
   - `caseSensitive` → used in route matching
7. Apply scroll restoration:
   - `scrollRestoration` → enable/disable
   - `scrollRestorationBehavior` → "auto" | "smooth"
   - `scrollRestorationMaxEntries` → LRU cache limit
   - `getScrollRestorationKey` → from imported `router` (not serialized)

### `serializeFlareState`

1. Walk FlareState, find `Deferred` values via `isDeferred()`, strip `promise` field
2. Convert to JSON string
3. Escape `</script>` → `<\/script>` (XSS prevention)

### `parseFlareState`

Validates required fields: `c` (object), `m` (array), `p` (string), `r` (object), `s` (object). Returns null on invalid input.

### Per-Route Override Merge

Route `.options()` overrides router config per field:

```ts
const effectiveStaleTime = route.options?.staleTime ?? router.staleTime ?? 0;
const effectiveGcTime = route.options?.gcTime ?? router.gcTime ?? 300_000;
const effectivePrefetch = route.options?.prefetch ?? router.prefetch ?? false;
```

Non-overridden fields inherit from router config.

### Defaults

| Field                         | Default                 | Notes                               |
| ----------------------------- | ----------------------- | ----------------------------------- |
| `basePath`                    | `""`                    | No prefix                           |
| `caseSensitive`               | `false`                 | Case-insensitive matching           |
| `gcTime`                      | `300_000`               | Cache entries expire after 5 min    |
| `getScrollRestorationKey`     | `(loc) => loc.pathname` | Key by pathname                     |
| `notFoundBoundary`            | `"nearest"`             | Closest ancestor boundary           |
| `prefetch`                    | `false`                 | No prefetch by default              |
| `prefetchGcTime`              | `300_000`               | Prefetch entries expire after 5 min |
| `prefetchStaleTime`           | `30_000`                | Prefetch cache valid for 30s        |
| `routeCacheMaxEntries`        | `200`                   | LRU route cache limit               |
| `scrollRestoration`           | `true`                  | Enabled by default                  |
| `scrollRestorationBehavior`   | `"auto"`                | Browser default scroll behavior     |
| `scrollRestorationMaxEntries` | `2000`                  | Max stored scroll positions         |
| `staleTime`                   | `0`                     | Always refetch on navigation        |
| `trailingSlash`               | `"never"`               | Strip trailing slashes              |
| `viewTransitions`             | `false`                 | Opt-in view transitions             |

## Test Cases

```
createRouter:
  Returns config with marker symbol
  Preserves all provided fields
  No mutation of input object
  No config → returns marked empty config
  isRouterConfig(createRouter()) → true
  isRouterConfig({}) → false
  isRouterConfig(null) → false

FlareState serialization:
  Serializes to JSON string
  Escapes </script> → <\/script>
  Preserves deferred markers: { __deferred: true, key: "x" }
  Strips promise field from deferred
  Handles nested deferred
  Empty matches → valid JSON with m: []
  No query states → q field omitted
  No dk keys → dk field omitted

parseFlareState:
  Valid state → returns FlareState
  null → returns null
  undefined → returns null
  Missing c → returns null
  Missing m → returns null
  Missing p → returns null
  m not array → returns null

Router config flow:
  router passed to createServerHandler → serializable subset serialized into FlareState.c.router
  Client imports same router object directly — no merge needed
  layouts, routeTree, queryClientGetter, getScrollRestorationKey NOT serialized (functions/code)
  router.staleTime used by navigation staleness check
  router.gcTime used by matchCache GC
  router.prefetchStaleTime used by prefetch dedup
  router.prefetchGcTime used by prefetchCache GC
  router.viewTransitions used as default for navigate()
  router.prefetch used as default for <Link>
  router.basePath prepended to generated URLs
  router.trailingSlash enforced on generated URLs
  router.caseSensitive used in route matching
  router.scrollRestoration enables/disables scroll save/restore
  router.routeCacheMaxEntries limits LRU cache
  router.notFoundBoundary controls 404 boundary resolution
  Missing router config → all field defaults apply

Per-route override:
  route.options.staleTime overrides router.staleTime
  route.options.gcTime overrides router.gcTime
  route.options.prefetch overrides router.prefetch
  Non-overridden fields → inherited from router config
  No route.options → full router config defaults apply

ContextState:
  dir serialized when set by middleware
  locale serialized when set by middleware
  theme serialized when set by middleware
  Missing dir/locale/theme → fields omitted
```

## Notes

- `createRouter` is isomorphic — imported by both server entry (`server.ts`) and client entry (`client.ts`)
- Server uses full `RouterConfig` (including functions like `getScrollRestorationKey`)
- Client imports same `router` object — no merge needed. `SerializableRouterConfig` in FlareState is for SSR-only scenarios or third-party consumers.
- `viewTransitions` must be serializable — no functions. Per-nav `ViewTransitionConfig` (spec 17) supports functions.
- `ContextState` is extensible — middleware can set arbitrary keys via `serverRequestContext.set()`
- FlareState shape is single-char keyed for transfer size — not for readability
- `q` field only present when query client is configured and has SSR-tracked queries
- `e` field only present in dev mode when SSR pipeline captured errors (spec 37 DevErrorOverlay)
- `ph` field only present when routes define per-route head configs (spec 27 head-client)
- `dk` field only present when `createRegistry()` tracked dynamic keys during SSR
- `FlareBuildConfig.globalOptions` (spec 21) removed — `createRouter` is the single source for runtime defaults
- Per-route `.options()` overrides specific fields; non-overridden inherit from router config
