# Registry

Layer 6. Cross-cutting. Depends on defer (Deferred), server-context (AsyncLocalStorage), hydration (waitForLazyPreloads).

Dynamic component registry. Server decides which components render, client resolves from pre-loaded registry. Enables multi-tenant UIs, CMS-driven pages, A/B testing.

## Types

```ts
interface Registry<T extends Record<string, LazyComponent>> {
	get(key: string): LazyComponent | undefined;
	keys(): string[];
}

type LazyComponent = ReturnType<typeof lazy>;

interface RegistryTrackingResult<R> {
	dk: () => string[];
	result: R;
}
```

## Exports

```ts
createRegistry<T extends Record<string, LazyComponent>>(components: T): Registry<T>
withRegistryTracking<R>(fn: () => R): RegistryTrackingResult<R>
registerRegistry(registry: Registry<unknown>): void
scanStringsForPreload(
  data: unknown,
  registries: Registry<unknown>[],
  preloads: Promise<unknown>[],
): void
getRegisteredRegistries(): Registry<unknown>[]
dk(): string[]
```

## Behavior

### `createRegistry`

Wraps a record of lazy components. Server-side: Proxy that tracks key access. Client-side: raw record (no tracking needed).

```ts
const tenantComponents = createRegistry({
	"hero-banner": lazy(() => import("./components/hero-banner")),
	"pricing-table": lazy(() => import("./components/pricing-table")),
	"blog-post": lazy(() => import("./components/blog-post")),
});
```

**Server (SSR)**:

Registry wrapped in a `Proxy`. When `.get(key)` is called during SSR render, the key is recorded in the current request's tracking set (via `AsyncLocalStorage`).

```ts
const trackingStore = new AsyncLocalStorage<Set<string>>();

function createRegistryProxy(components): Proxy {
	return new Proxy(components, {
		get(target, prop) {
			const store = trackingStore.getStore();
			if (store && typeof prop === "string") {
				store.add(prop);
			}
			return target[prop];
		},
	});
}
```

**Client (browser)**:

No Proxy. Direct record access. No tracking overhead.

### `withRegistryTracking`

SSR wrapper. Creates a tracking context, runs the provided function, returns result + accessor for tracked keys.

```ts
function withRegistryTracking<R>(fn: () => R): RegistryTrackingResult<R> {
	const tracked = new Set<string>();
	const result = trackingStore.run(tracked, fn);
	return {
		dk: () => Array.from(tracked),
		result,
	};
}
```

Used by SSR layer to wrap `renderToStream`:

```ts
const { result: stream, dk } = withRegistryTracking(() => renderToStream(config));
/* After render completes: */
const dynamicKeys = dk();
/* Serialized to self.flare.dk in HTML */
```

### `registerRegistry`

Client-side. Adds a registry to the global list for preload discovery.

```ts
const registries: Registry<unknown>[] = [];

function registerRegistry(registry: Registry<unknown>): void {
	registries.push(registry);
}

function getRegisteredRegistries(): Registry<unknown>[] {
	return registries;
}
```

Called at app startup (before hydrate):

```ts
registerRegistry(tenantComponents);
registerRegistry(cmsBlocks);
```

### `scanStringsForPreload`

Walks a data tree looking for string values that match registry keys. For each match, calls `.preload()` on the lazy component and pushes the promise.

```ts
function scanStringsForPreload(data: unknown, registries: Registry<unknown>[], preloads: Promise<unknown>[]): void {
	if (typeof data === "string") {
		for (const registry of registries) {
			const component = registry.get(data);
			if (component) {
				preloads.push(component.preload());
			}
		}
		return;
	}
	if (Array.isArray(data)) {
		for (const item of data) scanStringsForPreload(item, registries, preloads);
		return;
	}
	if (data !== null && typeof data === "object") {
		for (const value of Object.values(data)) {
			scanStringsForPreload(value, registries, preloads);
		}
	}
}
```

Called during:

1. **Hydration** — scan SSR state's loaderData for component keys, preload chunks before hydrate
2. **Prefetch** — scan prefetched loaderData, preload chunks in background
3. **Navigation** — scan fetched loaderData, preload chunks before render

### `dk`

Returns dynamic keys tracked during current SSR render. Shortcut for `withRegistryTracking`'s dk accessor.

```ts
function dk(): string[] {
	const store = trackingStore.getStore();
	return store ? Array.from(store) : [];
}
```

### Hydration Integration

SSR serializes dynamic keys into FlareState:

```ts
interface FlareState {
	c: ContextState; /* dir, locale, router, theme */
	dk?: string[]; /* dynamic component keys accessed during SSR */
	e?: DevError[]; /* dev-only SSR errors */
	m: FlareMatchState[]; /* matched routes */
	p: string; /* pathname */
	ph?: PerRouteHead[]; /* per-route head configs */
	q?: QueryState[]; /* TanStack Query hydration */
	r: Record<string, string | string[]>; /* params */
	s: Record<string, string>; /* search */
}
```

Client hydration preloads these chunks:

```ts
const state = parseFlareState(raw);
const preloads: Promise<unknown>[] = [];

if (state.dk) {
	for (const key of state.dk) {
		for (const registry of getRegisteredRegistries()) {
			const component = registry.get(key);
			if (component) preloads.push(component.preload());
		}
	}
}

await Promise.all(preloads);
/* Then hydrate */
```

### Usage Pattern

**Server** — loader returns component key as string:

```ts
.loader(async (ctx) => {
  const tenant = await getTenantConfig(ctx.location.params.org)
  return {
    heroComponent: tenant.heroType,   /* "hero-banner" */
    sections: tenant.sections,         /* ["pricing-table", "blog-post"] */
  }
})
```

**Client** — render resolves key from registry:

```tsx
.render(({ loaderData }) => {
  const Hero = tenantComponents.get(loaderData.heroComponent)
  return (
    <div>
      {Hero ? <Hero /> : null}
      {loaderData.sections.map((key) => {
        const Section = tenantComponents.get(key)
        return Section ? <Section /> : null
      })}
    </div>
  )
})
```

Server tracks `"hero-banner"`, `"pricing-table"`, `"blog-post"` as accessed keys → serialized in `dk` → client preloads those chunks before hydration → no flash of loading state.

## Test Cases

```
createRegistry:
  get(existing key) → returns lazy component
  get(missing key) → returns undefined
  keys() → returns all registered keys

Server tracking:
  get(key) during SSR → key added to tracking set
  Multiple gets → all keys tracked (no duplicates)
  get(key) outside tracking context → no error, key not tracked
  Concurrent requests → isolated tracking sets (AsyncLocalStorage)

withRegistryTracking:
  Wraps function execution in tracking context
  dk() after execution → returns accessed keys
  No registry access → dk() returns []
  Multiple registries → all tracked in same set
  Nested tracking → inner context independent

registerRegistry:
  Adds registry to global list
  Multiple registries registered → all in list
  getRegisteredRegistries() returns all

scanStringsForPreload:
  String matching registry key → preload pushed
  String not matching → ignored
  Nested object with key strings → all found
  Array with key strings → all found
  Non-string values → skipped
  Deferred values → skipped (not walked into promises)
  Empty data → no preloads
  Multiple registries → all scanned, each matching component preloaded

dk:
  Inside tracking context → returns tracked keys
  Outside tracking context → returns []
  After SSR render → contains all accessed component keys

Hydration integration:
  state.dk contains keys → chunks preloaded before hydrate
  state.dk empty → no preloads
  state.dk undefined → no preloads
  Preload failure → Promise.all rejects (propagates to hydrate)

End-to-end:
  Server loader returns component key string
  SSR render accesses registry → key tracked
  dk serialized in FlareState
  Client registers same registry
  Hydration preloads dk chunks
  Render resolves component from registry → no loading flash

Prefetch integration:
  Prefetched loaderData scanned for component keys
  Matching chunks preloaded in background
  Navigate later → chunks already cached
```

## Notes

- Registry is the bridge between server-decided UI and client-side component resolution
- `AsyncLocalStorage` ensures per-request isolation — no cross-request contamination of tracked keys
- Client-side has no Proxy overhead — direct record access after registration
- `scanStringsForPreload` is intentionally shallow on promises — deferred data resolved later, those components preload when chunks arrive
- `dk` array is small (typically < 20 keys) — minimal serialization overhead
- Registry keys are plain strings — no special format, matched against all registered registries
- Component not found in registry → renders nothing (defensive). App should handle gracefully.
- TanStack Query is optional in v2 (spec 33) — query client registry from v0 removed, QueryClient configured at handler level
