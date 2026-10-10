# Boundaries

Layer 3. Depends on errors (NotFoundError, UnauthenticatedError, UnauthorizedError), route-builder (errorRender, notFoundRender), defer (Deferred, isDeferred).

Error, notFound, and unauthorized boundary rendering. Plus the `<Await>` component for deferred data consumption.

## Boundary Types

### Error Boundary

Catches any `Error` thrown in a route's loader or render (except `NotFoundError`, `UnauthenticatedError`, `UnauthorizedError`, `RedirectResponse`).

### NotFound Boundary

Catches `NotFoundError` thrown in **child** routes' loaders. A page's notFoundRender catches errors from its own children (if it were a layout) — but more commonly used on layouts to catch page-level 404s.

### Unauthorized Boundary

Catches `UnauthenticatedError` (401) and `UnauthorizedError` (403). Both map to the same boundary type.

## Boundary Props

### ErrorRenderProps

```ts
interface ErrorRenderProps<TParams = Record<string, string>, TSearch = Record<string, string>> {
	error: Error;
	location: Location<TParams, TSearch>;
	reset: () => void;
}
```

- `error`: the caught error instance
- `location`: current route location with typed params/search
- `reset()`: clears the error boundary, re-triggers the loader. Component re-renders fresh.

### NotFoundRenderProps

```ts
interface NotFoundRenderProps<TParams = Record<string, string>, TSearch = Record<string, string>> {
	location: Location<TParams, TSearch>;
}
```

### UnauthorizedRenderProps

```ts
interface UnauthorizedRenderProps<TParams = Record<string, string>, TSearch = Record<string, string>> {
	error: UnauthenticatedError | UnauthorizedError;
	location: Location<TParams, TSearch>;
}
```

## Boundary Walk-Up

Errors propagate up the route chain until caught:

```
Page errorRender
  → Layout errorRender
    → Root Layout errorRender
      → Global error boundary
```

Same chain for notFound and unauthorized boundaries.

### Resolution Rules

| Error type             | Caught by                  | Walk-up chain                  |
| ---------------------- | -------------------------- | ------------------------------ |
| `NotFoundError`        | `notFoundRender`           | page → layouts → root → global |
| `UnauthenticatedError` | `unauthorizedRender`       | page → layouts → root → global |
| `UnauthorizedError`    | `unauthorizedRender`       | page → layouts → root → global |
| `RedirectResponse`     | Framework (not a boundary) | converted to HTTP redirect     |
| Any other `Error`      | `errorRender`              | page → layouts → root → global |

### Catch Scope

- `errorRender` on a route catches errors from **that route's** loader and render
- `notFoundRender` on a route catches `NotFoundError` from **child** routes
- If no boundary in the chain catches the error, the global boundary renders

## Global Boundaries

Configured at handler level. Last resort for uncaught errors.

```ts
interface GlobalBoundaries {
	error?: (props: ErrorRenderProps) => JSX.Element;
	notFound?: (props: NotFoundRenderProps) => JSX.Element;
	unauthorized?: (props: UnauthorizedRenderProps) => JSX.Element;
}
```

Passed to `createServerHandler({ boundaries: { error, notFound, unauthorized } })`.

If no global boundary configured and error reaches it, framework renders minimal fallback:

- Error: bare 500 page
- NotFound: bare 404 page
- Unauthorized: bare 401/403 page

## Per-Route Boundaries

Defined via route builder chain:

```ts
createPage("_root_/products/[id]")
  .loader(async (ctx) => { ... })
  .render(({ loaderData }) => <Product data={loaderData} />)
  .errorRender(({ error, reset }) => (
    <div>
      <p>Failed to load product: {error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  ))
  .notFoundRender(({ location }) => (
    <p>Product not found at {location.pathname}</p>
  ))
  .unauthorizedRender(({ error, location }) => (
    <p>{error.name === "UnauthenticatedError" ? "Please log in" : "Access denied"}</p>
  ))
```

All three optional. Any order after `.render()`. Each consumed once.

## `<Await>` Component

Renders deferred data with loading/error/success states. Own pending/error/success state machine — does not wrap Solid `<Loading>`.

### Props

```ts
interface AwaitProps<T> {
	children: (data: T) => JSX.Element;
	error?: (err: Error, reset: () => void) => JSX.Element;
	pending?: JSX.Element;
	promise: Deferred<T> | Promise<T>;
}
```

### Behavior

State machine: `pending → success | error`

1. If `promise` is a `Deferred` with pre-resolved data (`__resolved`): render success immediately
2. If `promise` is a `Deferred` with pre-resolved error (`__error`): render error immediately
3. Otherwise: show `pending` fallback, await promise
4. On resolve: render `children(data)`
5. On reject: render `error(err, reset)` if provided, otherwise re-throw to nearest error boundary

### Reset

`reset()` in error callback:

1. Clears error state
2. Returns to pending state
3. Re-fetches: triggers `router.invalidate()` for the owning route's matchId, which causes navigation to re-run the loader and re-stream the deferred chunk

### SSR Behavior

On server (initial HTML):

- If deferred was awaited (pre-resolved): renders success HTML directly
- If deferred is streaming: renders pending fallback in HTML, client hydrates and waits for NDJSON chunk

### Usage

```tsx
<Await promise={loaderData.reviews} pending={<Skeleton />}>
  {(reviews) => <ReviewList items={reviews} />}
</Await>

/* With error handling */
<Await
  promise={loaderData.reviews}
  pending={<Spinner />}
  error={(err, reset) => (
    <div>
      <p>Error: {err.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}
>
  {(reviews) => <ReviewList items={reviews} />}
</Await>
```

## Exports

```ts
/* Components */
Await: <T>(props: AwaitProps<T>) => JSX.Element

/* Types */
GlobalBoundaries
ErrorRenderProps
NotFoundRenderProps
UnauthorizedRenderProps

/* Boundary resolution (internal) */
findErrorBoundary(matches: ResolvedRoute[], errorRouteIndex: number): ErrorRenderFn | null
findNotFoundBoundary(matches: ResolvedRoute[], throwRouteIndex: number): NotFoundRenderFn | null
findUnauthorizedBoundary(matches: ResolvedRoute[], errorRouteIndex: number): UnauthorizedRenderFn | null
```

## SSR Error Rendering

When a loader errors during SSR:

1. Pipeline catches error, stores in `PipelineMatch.error`
2. SSR layer finds appropriate boundary via walk-up
3. Boundary component rendered server-side with error props
4. Status code set based on error type (404, 401, 403, 500)
5. Client hydrates the error boundary state

### Dev Error Overlay

In development mode only:

- Errors collected during pipeline execution
- Rendered as full-screen overlay on top of page
- Shows error source (which loader/render), name, message, stack trace
- Dismiss individual errors or all (Escape key)
- Auto-clears on HMR (file save triggers reload)
- Mounted via Portal on `document.body`

Not included in production builds.

## Test Cases

```
Error boundary walk-up:
  Page errorRender catches page loader error
  Page errorRender catches page render error
  Layout errorRender catches child page error (if page has no errorRender)
  Root errorRender catches layout error (if layout has no errorRender)
  Global error boundary catches if no route boundary exists
  No boundary anywhere → minimal 500 fallback

NotFound boundary walk-up:
  Layout notFoundRender catches NotFoundError from child page loader
  Root notFoundRender catches if layout has no notFoundRender
  Global notFound boundary catches if no route boundary
  NotFoundError in root loader → global notFound boundary
  No notFound boundary → minimal 404 fallback

Unauthorized boundary walk-up:
  UnauthenticatedError (401) → unauthorized boundary
  UnauthorizedError (403) → unauthorized boundary
  Both error types caught by same boundary type
  Walk-up: page → layout → root → global
  No unauthorized boundary → minimal 401/403 fallback

RedirectResponse:
  NOT caught by boundaries — handled by framework
  Converted to HTTP redirect (SSR) or client-side navigate (CSR)

Boundary props:
  ErrorRenderProps receives error instance
  ErrorRenderProps receives current location
  ErrorRenderProps reset() clears error, re-runs loader
  NotFoundRenderProps receives location
  UnauthorizedRenderProps receives error (UnauthenticatedError or UnauthorizedError)
  UnauthorizedRenderProps receives location

<Await> component:
  Renders pending fallback while promise pending
  Renders children(data) when promise resolves
  Renders error(err, reset) when promise rejects
  No error callback + rejection → re-throws to nearest error boundary
  Pre-resolved Deferred → renders success immediately (no pending flash)
  Pre-errored Deferred → renders error immediately
  reset() in error callback → returns to pending, re-runs promise
  Accepts raw Promise (not just Deferred)
  Accepts Deferred<T> — unwraps to T for children callback

Per-route boundaries:
  .errorRender() after .render() → attached to route result
  .notFoundRender() after .render() → attached to route result
  Either order: .errorRender().notFoundRender() or .notFoundRender().errorRender()
  Both optional — route without boundaries bubbles errors up
  Each consumed once — .errorRender() twice is type error

Global boundaries:
  Configured via createServerHandler({ boundaries: { error, notFound, unauthorized } })
  All three optional
  Missing global + missing route boundary → minimal HTML fallback
  Global receives same props as route boundary

SSR error rendering:
  Loader error during SSR → boundary rendered server-side, status 500
  NotFoundError during SSR → notFound boundary, status 404
  UnauthenticatedError during SSR → unauthorized boundary, status 401
  Error in boundary render → escalates to parent boundary (infinite loop guard)
```

## Notes

- `unauthorizedRender` IS on the route builder chain in v2 — all three boundary types (`errorRender`, `notFoundRender`, `unauthorizedRender`) available after `.render()`. Walk-up for `UnauthenticatedError`/`UnauthorizedError`: page `unauthorizedRender` → layout `unauthorizedRender` → root `unauthorizedRender` → global `unauthorized` boundary → minimal 401/403 fallback.
- `<Await>` tracks the deferred promise itself — pending state renders the `pending` slot, not a Solid `<Loading>` boundary
- `reset()` works on both SSR and client — SSR re-runs loader, client re-executes promise
- Boundary resolution is route-index based: error at index 2 walks indices 1 → 0 → global
- Dev error overlay is a separate concern from boundaries — it shows ALL errors, boundaries show user-facing UI
- No "streaming boundary" as a separate type — `<Await>` plus Flare NDJSON (`t:"c"`) handle deferred streaming. Solid `<Loading>` is used by Outlet for route-module readiness, not by `<Await>`.
- `<Await>` API defined here (spec 10) as part of boundary system. Implementation details (Deferred shape, SSR pre-resolution, helpers) in spec 37 (components). Spec 10 is canonical for behavior, spec 37 for component internals.
- Error boundary prevents crash propagation — without it, a single loader failure would break the entire page
