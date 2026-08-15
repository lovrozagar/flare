# Loader Pipeline

Layer 2. Depends on router-primitives (Location, computeMatchId), errors (all), route-builder (result types), server-context, defer.

Orchestrates the full server-side request lifecycle: validate → authenticate → preloader/authorize loop → loaders → head/headers.

## Types

### PipelineConfig

```ts
interface PipelineConfig<TEnv = unknown> {
	abortController: AbortController;
	authenticateFn?: AuthenticateFn<TEnv>;
	cause: LoaderCause;
	env: TEnv;
	prefetch: boolean;
	request: Request;
	routes: ResolvedRoute[];
	url: URL;
}

type AuthenticateFn<TEnv = unknown> = (ctx: AuthenticateFnContext<TEnv>) => Auth | null | Promise<Auth | null>;

interface AuthenticateFnContext<TEnv = unknown> {
	callerData?: unknown[];
	env: TEnv;
	request: Request;
	url: URL;
}
```

`Auth` type from module augmentation (`FlareRegister.auth`). `authenticateFn` is the app's auth resolver (e.g. JWT from cookies/headers).

### ResolvedRoute

Runtime representation of a matched route definition. Produced by loading route modules after tree match.

```ts
interface ResolvedRoute {
	_type: "render" | "response" | "layout" | "root-layout";
	authenticate?: unknown[]; /* args from .authenticate(...args) */
	authorize?: (ctx: AuthorizeContext) => boolean | Promise<boolean>;
	effectsConfig?: EffectsConfig;
	errorRender?: (props: ErrorRenderProps) => JSX.Element;
	head?: (ctx: HeadContext) => HeadConfig;
	headers?: (ctx: HeadersContext) => ResponseHeaders;
	inputConfig?: InputConfig;
	loader?: (ctx: LoaderContext) => unknown | Promise<unknown>;
	notFoundRender?: (props: NotFoundRenderProps) => JSX.Element;
	options?: RouteOptions;
	preloader?: (ctx: PreloaderContext) => unknown | Promise<unknown>;
	render?: (props: RenderProps) => JSX.Element;
	response?: (ctx: ResponseContext) => Response | Promise<Response>;
	unauthorizedRender?: (props: UnauthorizedRenderProps) => JSX.Element;
	variablePath: string;
	virtualPath: string;
}
```

### PipelineResult

```ts
interface PipelineResult {
	auth: Auth | null;
	deferContexts: Map<string, DeferContext>;
	matches: PipelineMatch[];
}

interface PipelineMatch {
	deferContext: DeferContext;
	error?: Error;
	headConfig?: HeadConfig;
	loaderData: unknown;
	matchId: string;
	preloaderContext: Record<string, unknown>;
	responseHeaders?: ResponseHeaders;
	route: ResolvedRoute;
	status: "success" | "error";
}
```

## Exports

```ts
runPipeline<TEnv = unknown>(config: PipelineConfig<TEnv>): Promise<PipelineResult>
```

## Execution Phases

### Phase 1: Input Validation

For each route in order (root → page):

1. If `route.inputConfig.params` exists, call with raw params from URL match
2. If `route.inputConfig.searchParams` exists, call with `url.searchParams`
3. Build validated `Location` via `buildLocation(url, validatedParams, virtualPath, variablePath, validatedSearch)`

**Fail fast**: first validation error aborts pipeline. Error thrown as-is (Zod parse errors bubble up). Results in 400 response.

### Phase 2: Authentication

Called once per request. Result cached for all subsequent phases.

1. Check if any route has `authenticate` (truthy — set by `.authenticate()` chain method)
2. If no route needs auth → skip, `auth = null`
3. If `authenticateFn` not provided → `auth = null`
4. Otherwise: `auth = await authenticateFn({ env, request, url, callerData: route.authenticate })`
5. For each route with `authenticate`: if `auth === null`, throw `UnauthenticatedError`
6. `authenticateFn` can throw `RedirectResponse` (e.g. redirect to login)

### Phase 3: Preloader + Authorize (sequential, interleaved per route)

For each route (root → page), sequentially:

```
preloaderContext = {}

for each route:
  /* 3a. Preloader */
  if route.preloader:
    result = await route.preloader({
      abortController,
      auth,
      env,
      location: route.validatedLocation,
      preloaderContext: { ...preloaderContext },
      request,
    })
    preloaderContext = { ...preloaderContext, ...result }

  route.preloaderSnapshot = { ...preloaderContext }

  /* 3b. Authorize (immediately after preloader, same route) */
  if route.authorize:
    allowed = await route.authorize({
      abortController,
      auth,
      env,
      location: route.validatedLocation,
      preloaderContext: route.preloaderSnapshot,
      request,
    })
    if allowed === false → throw UnauthorizedError
```

**Root layout**: authorize receives NO `preloaderContext` (root has no parent). Preloader receives empty context.

**Snapshots**: each route gets a frozen copy (spread) of `preloaderContext` at its point in the chain. Used by authorize, loader, head, headers, render.

**Short-circuit**: if authorize throws or returns false, pipeline stops. No further routes processed.

### Phase 4: Loaders (parallel)

All loaders run simultaneously via `Promise.all`. Each route gets its own `DeferContext`.

```
for each route (parallel):
  deps = route.effectsConfig?.loaderDeps?.({ search }) ?? []
  matchId = computeMatchId({
    routeId: route.virtualPath,
    params: route.validatedParams,
    search: route.validatedSearch,
    loaderDeps: route.effectsConfig?.loaderDeps
  })
  deferContext = createDeferContext(matchId)

  try:
    loaderData = await route.loader({
      abortController,
      auth,
      cause,
      defer: deferContext.defer,
      deps,
      env,
      location: route.validatedLocation,
      prefetch,
      preloaderContext: route.preloaderSnapshot,
      request,
    })
    match = { loaderData, status: "success" }
  catch (error):
    match = { error, loaderData: undefined, status: "error" }
```

Routes without a loader: `loaderData = undefined`, `status = "success"`.

**Error isolation**: each loader's error is caught independently. One loader failing does NOT abort siblings. AbortController is NOT signaled on individual loader failure — only on handler-level abort (client disconnect, redirect from phase 2/3).

**Redirect from loader**: `RedirectResponse` caught per-loader, stored in match result. Handler inspects results and handles redirect (first one wins in array order).

### Phase 5: Head Chain (sequential)

For each route (root → page) with a `head` callback:

```
mergedHead = undefined

for each route:
  if route.head and route.status === "success":
    routeHead = route.head({
      cause,
      loaderData: route.loaderData,
      location: route.validatedLocation,
      parentHead: mergedHead,
      prefetch,
      preloaderContext: route.preloaderSnapshot,
    })
    mergedHead = mergeHeadConfigs(mergedHead, routeHead)

  route.headConfig = mergedHead
```

Root layout: `parentHead = undefined`. Skipped for errored routes.

### Phase 6: Headers Chain (sequential)

For each route (root → page) with a `headers` callback:

```
mergedHeaders = undefined

for each route:
  if route.headers and route.status === "success":
    routeHeaders = route.headers({
      cause,
      env,
      loaderData: route.loaderData,
      location: route.validatedLocation,
      parentHeaders: mergedHeaders,
      prefetch,
      preloaderContext: route.preloaderSnapshot,
      request,
    })
    mergedHeaders = mergeResponseHeaders(mergedHeaders, routeHeaders)

  route.responseHeaders = mergedHeaders
```

Root layout: `parentHeaders = undefined`. Skipped for errored routes.

## Error Handling

| Phase            | Error                  | Behavior                                             |
| ---------------- | ---------------------- | ---------------------------------------------------- |
| Input validation | Zod/validator error    | Pipeline throws immediately, 400                     |
| Authentication   | `RedirectResponse`     | Pipeline throws, handler redirects                   |
| Authentication   | `UnauthenticatedError` | Pipeline throws, handler renders boundary            |
| Authentication   | Other error            | Pipeline throws, handler renders error boundary      |
| Preloader        | `RedirectResponse`     | Pipeline throws, handler redirects                   |
| Preloader        | Other error            | Pipeline throws, handler renders error boundary      |
| Authorize        | Returns `false`        | Framework throws `UnauthorizedError`, pipeline stops |
| Authorize        | Throws any error       | Pipeline stops, handler renders appropriate boundary |
| Loader           | `RedirectResponse`     | Caught per-loader, stored in match result            |
| Loader           | `NotFoundError`        | Caught per-loader, stored in match result            |
| Loader           | Other error            | Caught per-loader, stored in match result            |
| Head/Headers     | Any error              | Caught per-route, silently ignored (non-critical)    |

**Redirect priority**: if multiple loaders throw redirects (parallel), first one in route order wins.

## Response Route Handling

Routes with `_type: "response"` (API endpoints):

1. Pipeline runs phases 1-4 normally
2. Phases 5-6 (head/headers) skipped for the response route
3. Handler calls `route.response({ request })` directly
4. Returns raw `Response` — not wrapped in HTML or NDJSON

## Test Cases

```
Input validation:
  Valid params + search → pipeline continues
  Invalid params → throws immediately, no authenticate/preloader/loader called
  Invalid search → throws immediately
  Route with no inputConfig → passes through, raw params/search used
  Multiple routes, second has invalid input → first route's input validated but pipeline aborted

Authentication:
  No routes need auth → authenticateFn not called, auth = null
  Route with .authenticate(), auth resolved → auth passed to all contexts
  Route with .authenticate(), auth = null → throws UnauthenticatedError
  Route with .authenticate("admin"), "admin" passed as callerData to authenticateFn
  authenticateFn throws RedirectResponse → pipeline throws redirect
  authenticateFn called once even with 3 auth routes (cached)
  No authenticateFn + route with .authenticate() → auth = null → throws UnauthenticatedError

Preloader + Authorize (interleaved):
  Root preloader runs, then root authorize, then layout preloader, then layout authorize
  Root preloader: preloaderContext arg = {}
  Layout preloader receives root's accumulated context via spread copy
  Layout authorize receives snapshot including root + layout preloader results
  Page authorize receives full accumulated snapshot
  Root authorize has NO preloaderContext field
  Authorize returns false → throws UnauthorizedError, no further routes processed
  Authorize throws RedirectResponse → pipeline stops
  Preloader throws RedirectResponse → pipeline stops
  Route without preloader → snapshot inherits parent context unchanged
  Route without authorize → skipped, continues to next route
  Preloader mutating its copy doesn't affect subsequent routes' copies

Loaders (parallel):
  All loaders start simultaneously (Promise.all)
  Each loader receives its route's preloaderSnapshot
  Each loader receives its own DeferContext
  Loader error in route A does NOT abort route B's loader
  Loader throws NotFoundError → caught, stored in match { error, status: "error" }
  Loader throws RedirectResponse → caught, stored in match result
  Route without loader → loaderData = undefined, status = "success"
  deps computed from effectsConfig.loaderDeps({ search })
  No effectsConfig → deps = []
  matchId computed via computeMatchId({ routeId, params, search, loaderDeps })

Head chain:
  Root head: parentHead = undefined
  Layout head: parentHead = merged head from root
  Page head: parentHead = merged head from root + layouts
  Route without head → mergedHead unchanged, passed to next route
  Errored route → head skipped for that route

Headers chain:
  Same pattern as head chain
  Root headers: parentHeaders = undefined
  Errored route → headers skipped for that route

Full pipeline:
  Minimal: single page, no auth, no preloader → validates, skips auth, runs loader
  Complex: root + layout + page with auth, preloaders, loaders, head, headers
  Response route: phases 1-4 run, phases 5-6 skipped
  Prefetch: all contexts receive prefetch = true, cause = "prefetch"
  AbortController passed through all phases, callbacks can check signal.aborted
```

## Notes

- Pipeline is internal — not exported to user code, called by server handler
- `env` is `unknown` at pipeline level — handler types it via generic `TEnv`
- AbortController created by handler, passed to pipeline — handler may abort on client disconnect
- Head/headers errors are swallowed (non-critical) — ensures page still renders even if head callback fails
- Preloader snapshots use spread copy — not deep clone. Nested object references shared. Consumers should not mutate.
- `response` routes skip head/headers — they return raw Response
- Pipeline does NOT construct the Response — it returns structured results for the handler/SSR layer to use
- No TanStack Query in v2 — removed queryClient from all contexts
