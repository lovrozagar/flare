# Lazy

Layer 4 (client). Depends on solid-js (`lazy`, `createSignal`, `onMount`, `sharedConfig`).

SSR-safe lazy component loading. `lazy` for universal components, `clientLazy` for client-only components.

## Types

```ts
interface LazyOptions<P extends Record<string, unknown>> {
	loader: () => Promise<{ default: Component<P> }>
	pending?: Component<P>
}

interface ClientLazyOptions<P extends Record<string, unknown>> {
	eager?: boolean /* start loading at factory call (default: false) */
	loader: () => Promise<{ default: Component<P> }>
	pending?: Component<P>
}
```

## Exports

```ts
lazy<P>(options: LazyOptions<P>): Component<P>
clientLazy<P>(options: ClientLazyOptions<P>): Component<P & { pending?: Component<P> }>
waitForLazyPreloads(): Promise<void>
```

## Behavior

### `lazy`

SSR-transparent lazy component. Renders `pending` on both server AND initial client render for hydration alignment.

**Server (SSR)**: always renders `pending` (or null). Component never loaded server-side — it's a client module.

**Client (hydration)**: starts as `pending` to match SSR output. After hydration completes (`onMount`), swaps to loaded component.

**Client (post-hydration)**: renders loaded component immediately.

Implementation:

1. At factory call: starts `loader()` immediately, caches promise globally
2. During SSR (`sharedConfig.context` truthy): renders `pending`
3. During hydration (`sharedConfig.context` truthy on first render): renders `pending`, then swaps after `onMount`
4. After hydration: renders loaded component

```ts
/* Global preload tracking */
const GLOBAL_KEY = "__FLARE_LAZY_LOADED__"

function lazy<P>(options: LazyOptions<P>): Component<P> {
  const { loader, pending } = options
  let loaded: Component<P> | undefined
  let loadPromise: Promise<void> | undefined

  /* Start loading immediately */
  loadPromise = loader().then((mod) => {
    loaded = mod.default
    /* Track in global for waitForLazyPreloads */
    getGlobalLoaded().add(loadPromise)
  })
  getGlobalPending().add(loadPromise)

  return (props: P) => {
    const isSSR = !!sharedConfig.context
    const [component, setComponent] = createSignal<Component<P> | undefined>(
      isSSR ? undefined : loaded
    )

    if (isSSR || !loaded) {
      onMount(() => {
        if (loaded) setComponent(() => loaded)
        else loadPromise?.then(() => setComponent(() => loaded))
      })
    }

    return () => {
      const Comp = component()
      if (Comp) return <Comp {...props} />
      if (pending) return <pending {...props} />
      return null
    }
  }
}
```

### `clientLazy`

Client-only component. Returns null (or `pending`) on server. Never loads on SSR.

**Server**: returns `pending` component (or renders nothing).

**Client**: loads component. `eager: true` starts loading at factory call time. Default (`eager: false`) starts loading on first render.

```tsx
const HeavyChart = clientLazy({
	loader: () => import("./chart"),
	pending: () => <div>Loading chart...</div>,
})

/* SSR: renders "Loading chart..." */
/* Client: loads chart module, swaps when ready */
```

Per-instance `pending` prop overrides factory-level `pending`:

```tsx
<HeavyChart pending={() => <Spinner />} data={data} />
```

### `waitForLazyPreloads`

Returns a promise that resolves when all `lazy()` preloads have completed. Called before `solidHydrate()` to ensure component code is ready before hydration starts.

```ts
async function waitForLazyPreloads(): Promise<void> {
	const pending = getGlobalPending()
	if (pending.size === 0) return
	await Promise.all([...pending])
}
```

Critical for hydration: if component code isn't loaded, hydration would render `pending` and then swap — causing a flash. `waitForLazyPreloads` ensures hydration renders the real component immediately.

## Test Cases

```
lazy:
  SSR: renders pending component
  SSR: renders null when no pending
  Client hydration: starts as pending (matches SSR)
  Client hydration: swaps to loaded after onMount
  Client post-hydration: renders loaded immediately
  Loader called once (cached)
  Multiple instances share same load promise

clientLazy:
  SSR: renders pending
  SSR: renders null when no pending
  Client: loads and renders component
  eager: true → starts loading at factory call
  eager: false → starts loading on first render
  Per-instance pending prop overrides factory pending

waitForLazyPreloads:
  No lazy components → resolves immediately
  All loaded → resolves immediately
  Pending loads → waits for all
  Called before hydrate() → ensures components ready
```

## Notes

- `lazy` starts loading at factory call — NOT at first render. This is intentional: import happens as soon as the module is evaluated (typically at app startup), giving maximum time to load.
- `clientLazy` with `eager: false` defers to first render — for heavy components that may never render
- `waitForLazyPreloads` is critical for hydration alignment — without it, lazy components render pending during hydration then flash to loaded
- Factory-level `createSignal` means state is per-factory-call, shared across all instances. This is correct — all instances of the same lazy component share the load state.
- `sharedConfig.context` is Solid's SSR detection — truthy during SSR and initial hydration render
- Global tracking via `__FLARE_LAZY_LOADED__` survives Vite module identity issues (same global regardless of import path)
