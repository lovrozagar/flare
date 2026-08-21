# Route Builder

Layer 1. Depends on router-primitives (Location, RouteMeta, VirtualPath) + errors (UnauthorizedError, UnauthenticatedError).

Type-safe chain API for defining pages, layouts, and root layouts. Each chain step removes used methods and narrows generics progressively.

## Shared Types

### RouteOptions

```ts
interface RouteOptions {
	gcTime?: number;
	prefetch?: PrefetchStrategy;
	prefetchGcTime?: number;
	prefetchStaleTime?: number;
	staleTime?: number;
}

type PrefetchStrategy = false | "intent" | "render" | "viewport";
```

### InputConfig

```ts
interface InputConfig<TParams, TSearch> {
	params?: ParamsValidator<TParams>;
	searchParams?: SearchParamsValidator<TSearch>;
}

type ParamsValidator<T> = ((raw: Record<string, string>) => T) | { parse: (raw: Record<string, string>) => T };

type SearchParamsValidator<T> = ((raw: URLSearchParams) => T) | { parse: (raw: URLSearchParams) => T };
```

Accepts Zod schemas (`.parse()`) or plain transform functions. Narrows `TParams` and `TSearch` generics. Validation runs before authorize/preloader/loader — invalid input throws before any route logic executes.

### EffectsConfig

```ts
interface EffectsConfig<TParams, TSearch> {
	loaderDeps?: (ctx: { search: TSearch }) => unknown[];
	shouldRefetch?: (ctx: EffectsContext<TParams, TSearch>) => boolean;
}

interface EffectsContext<TParams, TSearch> {
	location: {
		current: { hash: string; params: TParams; pathname: string; search: TSearch };
		next: { hash: string; params: TParams; pathname: string; search: TSearch };
	};
	trigger: "initial" | "navigation" | "revalidation";
}
```

- `loaderDeps`: return values fed into match ID computation. When deps change → different match ID → loader re-runs. Accessed in loader as `ctx.deps`.
- `shouldRefetch`: return `true` to force loader re-run even if match ID unchanged.
- If no `.effects()` called, `deps` in loader context is `[]`.

### LoaderCause

```ts
type LoaderCause = "enter" | "prefetch" | "stay";
```

- `"enter"` — user navigated to this route (initial load or CSR nav)
- `"prefetch"` — triggered by hover/viewport prefetch strategy
- `"stay"` — user is on this route, refetch triggered (invalidation or shouldRefetch)

### DeferFn

```ts
type DeferFn = <T>(fn: () => Promise<T>, options?: { key?: string }) => Deferred<T>;

interface Deferred<T> {
	__deferred: true;
	key: string;
	promise: Promise<T>;
}
```

Wraps async work for NDJSON streaming. The promise resolves on the server, result streams as a chunk. Client receives a placeholder that resolves when chunk arrives.

`key` used for deduplication and error targeting in NDJSON protocol.

### HeadConfig

```ts
interface HeadConfig {
	canonical?: string;
	css?: string;
	custom?: CustomHeadConfig;
	description?: string;
	favicons?: FaviconConfig;
	images?: SeoImage[];
	jsonLd?: Thing | Thing[]; /* from schema-dts */
	keywords?: string;
	languages?: Record<string, string>;
	meta?: MetaConfig;
	openGraph?: OpenGraphConfig;
	robots?: RobotsConfig;
	title?: string;
	twitter?: TwitterConfig;
}

interface FaviconConfig {
	"96x96"?: string;
	"192x192"?: string;
	"512x512"?: string;
	appleTouchIcon?: string;
	ico?: string;
	svg?: string;
}

interface SeoImage {
	alt?: string;
	height?: number;
	type?: string;
	url: string;
	width?: number;
}

interface MetaConfig {
	applicationName?: string;
	appleMobileWebAppCapable?: "yes" | "no";
	appleMobileWebAppStatusBarStyle?: "default" | "black" | "black-translucent";
	appleMobileWebAppTitle?: string;
	author?: string;
	charset?: string;
	creator?: string;
	generator?: string;
	manifest?: string;
	mobileWebAppCapable?: "yes" | "no";
	publisher?: string;
	viewport?: string | false;
}

interface OpenGraphConfig {
	alternateLocale?: string[];
	audio?: Array<{ secureUrl?: string; type?: string; url: string }>;
	description?: string;
	images?: SeoImage[];
	locale?: string;
	siteName?: string;
	title?: string;
	type?: "article" | "product" | "profile" | "website";
	url?: string;
	videos?: Array<{
		height?: number;
		secureUrl?: string;
		type?: string;
		url: string;
		width?: number;
	}>;
}

interface RobotsConfig {
	follow?: boolean;
	index?: boolean;
	"max-image-preview"?: "large" | "none" | "standard";
	"max-snippet"?: number;
	"max-video-preview"?: number;
	noarchive?: boolean;
	noimageindex?: boolean;
}

interface TwitterConfig {
	card?: "app" | "player" | "summary" | "summary_large_image";
	creator?: string;
	description?: string;
	images?: Array<{ alt?: string; url: string }>;
	site?: string;
	title?: string;
}

interface CustomHeadConfig {
	links?: Array<Record<string, string>>;
	meta?: Array<Record<string, string>>;
	scripts?: Array<{ children?: string; src?: string; type?: string }>;
	styles?: Array<{ children: string }>;
}
```

Child overrides parent for same key. Merged sequentially: root → layouts → page.

### ResponseHeaders

```ts
type ResponseHeaders = Record<string, string>;
```

Child overrides parent for same key. Merged sequentially like head.

### Auth Resolution

```ts
type ResolvedAuth<TAuth> = /* .authenticate() or .authenticate(data)      → */ Auth;
/* no .authenticate()                          → */ null;
```

`Auth` type provided via module augmentation:

```ts
declare module "@lovrozagar/flare" {
	interface FlareRegister {
		auth: AppAuth;
	}
}
```

### AbortController

Every authorize, preloader, and loader callback receives `abortController: AbortController`. The framework creates one per request. Used to cancel in-flight work when:

- Client navigates away mid-load
- Request times out
- Server decides to abort (e.g. redirect detected in another loader)

Callbacks should pass `abortController.signal` to `fetch()` and other cancellable operations.

### Path Validation Types

Compile-time branded types that enforce correct virtualPath format:

```ts
type ValidatePagePath<T> = /* must NOT end with (group) segment */
type ValidateLayoutPath<T> = /* must end with (group) segment */
type ValidateRootPath<T> = /* must be RootLayoutPath: _${string}_ */
```

- Page: terminal segment must be a URL segment, `[param]`, `[...param]`, or `[[...param]]`
- Layout: terminal segment must be `(groupName)`
- Root: entire path must be `_name_` pattern

### Prefetch Flag

`prefetch: boolean` in loader/head/headers/render context indicates the route is being loaded for prefetch (hover/viewport strategy), not for actual rendering. When `true`, callbacks may skip expensive side effects (analytics, logging) since data will be cached for later use.

---

## createPage

```ts
createPage<TPath extends VirtualPath>(
  virtualPath: ValidatePagePath<TPath>
): PageBuilderInitial<TPath>
```

Pages end with URL segment, `[param]`, `[...param]`, or `[[...param]]`. Never `(group)`.

### Chain

```
createPage(virtualPath)
  ├── .options(opts)           → cache/prefetch options
  ├── .input(config)           → narrows TParams, TSearch
  ├── .authenticate(...args)   → narrows TAuth, sets callerData
  ├── .authorize(fn)           → guard, can short-circuit
  ├── .effects(config)         → stores loaderDeps/shouldRefetch
  ├── .preloader(fn)           → narrows TPreloaderContext
  ├── .loader(fn)              → narrows TLoaderData
  ├── .head(fn)                → SEO/meta per route
  ├── .headers(fn)             → HTTP response headers
  ├── .render(fn)              → TERMINAL: returns JSX          ──┐
  │   ├── .errorRender(fn)     → optional error boundary          │ after render
  │   ├── .notFoundRender(fn)  → optional notFound boundary       │
  │   └── .unauthorizedRender(fn) → optional unauthorized boundary│
  └── .response(fn)            → TERMINAL: returns Response     ──┘
```

### `.authenticate(...args)`

Marks route as requiring authentication. Sets `RouteMeta.authenticate = true`. Arguments are stored as `callerData` on the route result — passed to the `authenticateFn` validator callback.

- `.authenticate()` → auth required, no callerData.
- `.authenticate("admin")` → auth required, `"admin"` passed as callerData to validator.
- No `.authenticate()` call → no auth resolution. `auth` typed as `null`.

Only the boolean flag is stored on `RouteMeta` (for client-side route detection). The args are stored on the route result for pipeline consumption.

### Method availability per step

| After calling     | options | input | authenticate | authorize | effects | preloader | loader | head | headers | render | response |
| ----------------- | ------- | ----- | ------------ | --------- | ------- | --------- | ------ | ---- | ------- | ------ | -------- |
| `createPage()`    | Y       | Y     | Y            | Y         | Y       | Y         | Y      | Y    | Y       | Y      | Y        |
| `.options()`      | -       | Y     | Y            | Y         | Y       | Y         | Y      | Y    | Y       | Y      | Y        |
| `.input()`        | -       | -     | Y            | Y         | Y       | Y         | Y      | Y    | Y       | Y      | Y        |
| `.authenticate()` | -       | -     | -            | Y         | Y       | Y         | Y      | Y    | Y       | Y      | Y        |
| `.authorize()`    | -       | -     | -            | -         | Y       | Y         | Y      | Y    | Y       | Y      | Y        |
| `.effects()`      | -       | -     | -            | -         | -       | Y         | Y      | Y    | Y       | Y      | Y        |
| `.preloader()`    | -       | -     | -            | -         | -       | -         | Y      | Y    | Y       | Y      | Y        |
| `.loader()`       | -       | -     | -            | -         | -       | -         | -      | Y    | Y       | Y      | -        |
| `.head()`         | -       | -     | -            | -         | -       | -         | -      | -    | Y       | Y      | -        |
| `.headers()`      | -       | -     | -            | -         | -       | -         | -      | -    | -       | Y      | -        |

Rules:

- Each method consumed once (except noted below).
- `.authorize()` is NOT repeatable — consumed after first call.
- `.loader()` removes `.response()` — after loading data for rendering, response path is invalid.
- `.head()` and `.headers()` available from the start — `loaderData` is `void` if no `.loader()` called. Calling `.head()` or `.headers()` removes `.loader()` and `.response()`.
- `.render()` and `.response()` are available early (before loader) — `loaderData` is `void` in that case.
- After `.render()`: only `.errorRender()`, `.notFoundRender()`, and `.unauthorizedRender()` (any order, each once).

### Callback contexts — Page

#### `.authorize(fn)`

```ts
interface PageAuthorizeContext<TPath, TParams, TSearch, TPreloaderContext> {
	abortController: AbortController;
	auth: ResolvedAuth<TAuth>;
	env: unknown;
	location: Location<TParams, TSearch>;
	preloaderContext: TPreloaderContext;
	request: Request;
}
```

Returns `boolean | Promise<boolean>`. `false` → framework throws `UnauthorizedError`.

#### `.preloader(fn)`

```ts
interface PagePreloaderContext<TPath, TParams, TSearch, TPreloaderContext> {
	abortController: AbortController;
	auth: ResolvedAuth<TAuth>;
	env: unknown;
	location: Location<TParams, TSearch>;
	preloaderContext: TPreloaderContext; /* parent's context, NOT own return */
	request: Request;
}
```

Returns object. Return value intersected with parent context: `TParent & Awaited<TReturn>`.

#### `.loader(fn)`

```ts
interface PageLoaderContext<TPath, TParams, TSearch, TPreloaderContext> {
	abortController: AbortController;
	auth: ResolvedAuth<TAuth>;
	cause: LoaderCause;
	defer: DeferFn;
	deps: unknown[];
	env: unknown;
	location: Location<TParams, TSearch>;
	prefetch: boolean;
	preloaderContext: TPreloaderContext;
	request: Request;
}
```

Returns `TLoaderData | Promise<TLoaderData>`.

#### `.head(fn)`

```ts
interface PageHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData> {
	cause: LoaderCause;
	loaderData: TLoaderData;
	location: Location<TParams, TSearch>;
	parentHead: HeadConfig | undefined;
	prefetch: boolean;
	preloaderContext: TPreloaderContext;
}
```

Returns `HeadConfig`. No `env`, `request`, `auth` — head is pure data transformation, not server logic.

#### `.headers(fn)`

```ts
interface PageHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData> {
	cause: LoaderCause;
	env: unknown;
	loaderData: TLoaderData;
	location: Location<TParams, TSearch>;
	parentHeaders: ResponseHeaders | undefined;
	prefetch: boolean;
	preloaderContext: TPreloaderContext;
	request: Request;
}
```

Returns `ResponseHeaders`. Has `env` and `request` (may need request info for cache headers, etc.).

#### `.render(fn)`

```ts
interface PageRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData> {
	loaderData: TLoaderData;
	location: Location<TParams, TSearch>;
	preloaderContext: TPreloaderContext;
}
```

Returns `JSX.Element`. No `env`, `request`, `abortController` — render is not async, doesn't need server primitives. No `auth`, `cause`, `prefetch` — loader-pipeline concepts. Auth accessible via `preloaderContext` (idiomatic: root preloader resolves auth and passes it down).

#### `.response(fn)`

```ts
interface PageResponseContext {
	request: Request;
}
```

Returns `Response`. For API routes, webhooks, non-HTML endpoints. Not wrapped in NDJSON. No `loaderData` — `.loader()` and `.response()` are mutually exclusive.

#### `.errorRender(fn)`

```ts
interface PageErrorRenderProps<TParams, TSearch> {
	error: Error;
	location: Location<TParams, TSearch>;
	reset: () => void;
}
```

Catches errors thrown in **this route's** loader or render. `reset()` clears boundary, re-triggers loader.

#### `.notFoundRender(fn)`

```ts
interface PageNotFoundRenderProps<TParams, TSearch> {
	location: Location<TParams, TSearch>;
}
```

Catches `NotFoundError` thrown in **child** routes.

#### `.unauthorizedRender(fn)`

```ts
interface PageUnauthorizedRenderProps<TParams, TSearch> {
	error: UnauthenticatedError | UnauthorizedError;
	location: Location<TParams, TSearch>;
}
```

Catches `UnauthenticatedError` (401) and `UnauthorizedError` (403) — walk-up chain like other boundaries.

### Result type — Page

```ts
interface PageResultRender<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
	_type: "render";
	authenticate?: unknown[]; /* args from .authenticate(...args) */
	authorize?: (ctx: PageAuthorizeContext<TPath, TParams, TSearch, TPreloaderContext>) => boolean | Promise<boolean>;
	effectsConfig?: EffectsConfig<TParams, TSearch>;
	errorRender?: (props: PageErrorRenderProps<TParams, TSearch>) => JSX.Element;
	head?: (ctx: PageHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => HeadConfig;
	headers?: (ctx: PageHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData>) => ResponseHeaders;
	inputConfig?: InputConfig<TParams, TSearch>;
	loader?: (ctx: PageLoaderContext<TPath, TParams, TSearch, TPreloaderContext>) => TLoaderData | Promise<TLoaderData>;
	notFoundRender?: (props: PageNotFoundRenderProps<TParams, TSearch>) => JSX.Element;
	options?: RouteOptions;
	preloader?: (ctx: PagePreloaderContext<TPath, TParams, TSearch, TPreloaderContext>) => unknown;
	render: (props: PageRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData>) => JSX.Element;
	unauthorizedRender?: (props: PageUnauthorizedRenderProps<TParams, TSearch>) => JSX.Element;
	virtualPath: TPath;
}

interface PageResultResponse<TPath, TParams, TSearch, TAuth, TPreloaderContext> {
	_type: "response";
	authenticate?: unknown[]; /* args from .authenticate(...args) */
	authorize?: (ctx: PageAuthorizeContext<TPath, TParams, TSearch, TPreloaderContext>) => boolean | Promise<boolean>;
	effectsConfig?: EffectsConfig<TParams, TSearch>;
	inputConfig?: InputConfig<TParams, TSearch>;
	options?: RouteOptions;
	preloader?: (ctx: PagePreloaderContext<TPath, TParams, TSearch, TPreloaderContext>) => unknown;
	response: (ctx: PageResponseContext) => Response;
	virtualPath: TPath;
}
```

---

## createLayout

```ts
createLayout<TPath extends VirtualPath>(
  virtualPath: ValidateLayoutPath<TPath>
): LayoutBuilderInitial<TPath>
```

Layouts must end with `(group)` segment. E.g. `_root_/(auth)`, `_root_/(dashboard)`.

### Chain

Same as page **except**:

- **No `.response()` method** — layouts always render JSX
- **`.render()` receives `children: JSX.Element`**

```
createLayout(virtualPath)
  ├── .options(opts)
  ├── .input(config)
  ├── .authenticate(...args)
  ├── .authorize(fn)
  ├── .effects(config)
  ├── .preloader(fn)
  ├── .loader(fn)
  ├── .head(fn)
  ├── .headers(fn)
  └── .render(fn)              → TERMINAL (only terminal)
      ├── .errorRender(fn)
      ├── .notFoundRender(fn)
      └── .unauthorizedRender(fn)
```

### Method availability per step

Same table as page minus the `response` column.

### Callback contexts — Layout

Same as page for `.authorize()`, `.preloader()`, `.loader()`, `.head()`, `.headers()`. Layout preloader receives parent's `preloaderContext` (from root layout or parent layout above it).

#### `.render(fn)` — Layout

```ts
interface LayoutRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData> {
	children: JSX.Element;
	loaderData: TLoaderData;
	location: Location<TParams, TSearch>;
	preloaderContext: TPreloaderContext;
}
```

`children` is the nested route content. Rendered by `<Outlet>` inside the layout. No `.response()` — layouts always render JSX.

### Result type — Layout

```ts
interface LayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
  _type: "layout"
  authenticate?: unknown[]                     /* args from .authenticate(...args) */
  authorize?: (ctx: LayoutAuthorizeContext<...>) => boolean | Promise<boolean>
  effectsConfig?: EffectsConfig<TParams, TSearch>
  errorRender?: (props: LayoutErrorRenderProps<TParams, TSearch>) => JSX.Element
  head?: (ctx: LayoutHeadContext<...>) => HeadConfig
  headers?: (ctx: LayoutHeadersContext<...>) => ResponseHeaders
  inputConfig?: InputConfig<TParams, TSearch>
  loader?: (ctx: LayoutLoaderContext<...>) => TLoaderData | Promise<TLoaderData>
  notFoundRender?: (props: LayoutNotFoundRenderProps<TParams, TSearch>) => JSX.Element
  options?: RouteOptions
  preloader?: (ctx: LayoutPreloaderContext<...>) => unknown
  render: (props: LayoutRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData>) => JSX.Element
  unauthorizedRender?: (props: LayoutUnauthorizedRenderProps<TParams, TSearch>) => JSX.Element
  virtualPath: TPath
}
```

---

## createRootLayout

```ts
createRootLayout<TPath extends RootLayoutPath>(
  virtualPath: ValidateRootPath<TPath>
): RootLayoutBuilderInitial<TPath>
```

Root path: `_root_`, `_docs_`, `_admin_`, etc. Pattern: `_${name}_`.

### Chain

Same as layout chain. Key differences in **callback context fields**.

### Callback contexts — Root Layout

Differs from page/layout in authorize, preloader, and head.

#### `.authorize(fn)` — Root

```ts
interface RootAuthorizeContext<TPath, TParams, TSearch> {
	abortController: AbortController;
	auth: ResolvedAuth<TAuth>;
	env: unknown;
	location: Location<TParams, TSearch>;
	request: Request;
}
```

**No `preloaderContext`** — root has no parent above it.

#### `.preloader(fn)` — Root

```ts
interface RootPreloaderContext<TPath, TParams, TSearch> {
	abortController: AbortController;
	auth: ResolvedAuth<TAuth>;
	env: unknown;
	location: Location<TParams, TSearch>;
	request: Request;
}
```

**No `preloaderContext`** — nothing to inherit. Return value becomes `TPreloaderContext` for downstream routes.

#### `.loader(fn)` — Root

Same as page. **Does** receive `preloaderContext` — from root's own `.preloader()` return.

#### `.head(fn)` — Root

```ts
interface RootHeadContext<TParams, TSearch, TPreloaderContext, TLoaderData> {
	cause: LoaderCause;
	loaderData: TLoaderData;
	location: Location<TParams, TSearch>;
	prefetch: boolean;
	preloaderContext: TPreloaderContext;
}
```

**No `parentHead`** — root head IS the base.

#### `.headers(fn)` — Root

```ts
interface RootHeadersContext<TParams, TSearch, TPreloaderContext, TLoaderData> {
	cause: LoaderCause;
	env: unknown;
	loaderData: TLoaderData;
	location: Location<TParams, TSearch>;
	prefetch: boolean;
	preloaderContext: TPreloaderContext;
	request: Request;
}
```

**No `parentHeaders`** — root headers IS the base.

#### `.render(fn)` — Root

```ts
interface RootLayoutRenderProps<TParams, TSearch, TPreloaderContext, TLoaderData> {
	children: JSX.Element;
	loaderData: TLoaderData;
	location: Location<TParams, TSearch>;
	preloaderContext: TPreloaderContext;
}
```

Renders `<html>`, `<head>`, `<body>`. `children` is everything below root.

### Result type — Root Layout

```ts
interface RootLayoutResult<TPath, TParams, TSearch, TAuth, TPreloaderContext, TLoaderData> {
  _type: "root-layout"
  /* same shape as LayoutResult */
  render: (props: RootLayoutRenderProps<...>) => JSX.Element
  virtualPath: TPath
}
```

---

## Generic Narrowing

Each chain step narrows one generic. Skipped steps keep defaults.

```
TPath             → fixed at factory call                              no default
TParams           → narrowed by .input({ params })                     default: Record<string, string>
TSearch           → narrowed by .input({ searchParams })               default: Record<string, string>
TAuth             → narrowed by .authenticate()                        default: false
TPreloaderContext → narrowed by .preloader(fn) return type             default: Record<string, never>
TLoaderData       → narrowed by .loader(fn) return type               default: void
```

### Preloader context accumulation

- Root preloader: no parent → return becomes `TPreloaderContext`
- Layout preloader: receives parent's context, return intersects: `TParent & Awaited<TReturn>`
- Page preloader: receives accumulated parent context, same intersection
- Preloader must return an **object** (not primitive) — intersection types only work with object types

```ts
/* root defines theme */
createRootLayout("_root_").preloader(async () => ({ theme: "dark" as const }));
/* TPreloaderContext = { theme: "dark" } */

/* layout adds user, receives theme from root */
createLayout("_root_/(auth)").preloader(async (ctx) => {
	ctx.preloaderContext.theme; /* "dark" — typed from parent */
	return { user: await getUser() };
});
/* TPreloaderContext = { theme: "dark" } & { user: User } */

/* page receives both */
createPage("_root_/(auth)/dashboard").loader(async (ctx) => {
	ctx.preloaderContext.theme; /* "dark" */
	ctx.preloaderContext.user; /* User */
	return { stats: await getStats(ctx.preloaderContext.user.id) };
});
```

### Loader data inference

```ts
.loader(async (ctx) => {
  const post = await fetchPost(ctx.location.params.slug)
  return { post, comments: ctx.defer(() => fetchComments(post.id)) }
})
/* TLoaderData = { post: Post; comments: Deferred<Comment[]> } */
```

`Awaited<T>` applied to loader return — async functions unwrapped automatically.

---

## Error Propagation

What happens when callbacks throw:

| Callback                             | Throws                               | Result                                                                       |
| ------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------- |
| Input validation                     | Zod parse error                      | 400 response, route not executed                                             |
| Authorize returns `false`            | Framework throws `UnauthorizedError` | Caught by nearest `unauthorized` boundary                                    |
| Authorize throws                     | Any error                            | Caught by nearest `error` boundary                                           |
| Preloader throws `RedirectResponse`  | Redirect                             | HTTP redirect response                                                       |
| Preloader throws other error         | Error                                | Caught by nearest `error` boundary                                           |
| Loader throws `NotFoundError`        | 404                                  | Caught by nearest `notFound` boundary                                        |
| Loader throws `UnauthenticatedError` | 401                                  | Caught by nearest `unauthorized` boundary (via unauthenticated mapping)      |
| Loader throws `UnauthorizedError`    | 403                                  | Caught by nearest `unauthorized` boundary                                    |
| Loader throws `RedirectResponse`     | Redirect                             | HTTP redirect or NDJSON redirect message                                     |
| Loader throws other error            | 500                                  | Caught by nearest `error` boundary                                           |
| Render throws                        | Error                                | Caught by this route's `.errorRender()` or nearest ancestor `error` boundary |

"Nearest boundary" walks up the route chain: page → layout → root layout → global boundary.

---

## Execution Order

Runtime execution during request handling (defined in loader-pipeline spec, summarized here):

```
1. Input validation               → params + search validated per route, fail fast on error
2. authenticate(request)           → Auth | null (global, once per request)
3. For each matched route (root → page), sequential:
   a. preloader(ctx)               → accumulates context, takes snapshot
   b. authorize(ctx)               → uses route's snapshot, short-circuits on false/throw
4. For each matched route (parallel):
   loader(ctx)                     → parallel via Promise.all, each with own DeferContext
5. For each matched route (root → page):
   a. head(ctx)                    → sequential, parentHead flows down
   b. headers(ctx)                 → sequential, parentHeaders flows down
6. render(props)                   → root first, children nest via Outlet
```

---

## Usage Examples

### Minimal page

```ts
createPage("_root_/about")
  .render(() => <h1>About</h1>)
```

### Page with auth + loader

```ts
createPage("_root_/(auth)/dashboard")
  .input({ params: z.object({}) })
  .authenticate()
  .loader(async (ctx) => {
    /* ctx.auth is Auth (non-null, guaranteed by .authenticate()) */
    return { stats: await getStats(ctx.auth.sub) }
  })
  .head(({ loaderData }) => ({ title: `Dashboard — ${loaderData.stats.name}` }))
  .render(({ loaderData, preloaderContext }) => <Dashboard stats={loaderData.stats} />)
```

### Page with deferred data

```ts
createPage("_root_/products/[id]")
  .input({ params: z.object({ id: z.string().min(1) }) })
  .loader(async (ctx) => ({
    product: await fetchProduct(ctx.location.params.id),
    reviews: ctx.defer(() => fetchReviews(ctx.location.params.id)),
  }))
  .render(({ loaderData }) => (
    <div>
      <ProductCard product={loaderData.product} />
      <Await pending={<Spinner />} promise={loaderData.reviews}>
        {(reviews) => <ReviewList reviews={reviews} />}
      </Await>
    </div>
  ))
```

### API route (response variant)

```ts
createPage("_root_/api/health").response(
	() =>
		new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" },
		}),
);
```

### Layout with preloader

```ts
createLayout("_root_/(auth)")
  .authenticate()
  .preloader(async (ctx) => ({
    permissions: await getPermissions(ctx.auth.sub),
  }))
  .render(({ children, preloaderContext }) => (
    <div>
      <Sidebar permissions={preloaderContext.permissions} />
      <main>{children}</main>
    </div>
  ))
```

### Root layout

```ts
createRootLayout("_root_")
  .preloader(async (ctx) => ({
    theme: "light" as const,
  }))
  .head(() => ({
    title: "My App",
    meta: { viewport: "width=device-width, initial-scale=1.0" },
  }))
  .render(({ children, preloaderContext }) => (
    <html data-theme={preloaderContext.theme}>
      <head><Head /></head>
      <body>{children}</body>
    </html>
  ))
```

---

## Test Cases

```
createPage:
  Minimal: createPage("_root_/about").render(fn) → { _type: "render" }
  Full chain: .options().input().authenticate().authorize().effects().preloader().loader().head().headers().render()
  Skip to render: .render(fn) → loaderData is void, preloaderContext is Record<string, never>
  Skip to loader: .loader(fn).render(fn) → TPreloaderContext is Record<string, never>
  Response without loader: .response(fn) → { _type: "response" } (no loader field)
  Response with loader: .loader(fn).response(fn) → NOT ALLOWED (type error)
  Error boundaries: .render(fn).errorRender(fn).notFoundRender(fn) → both attached
  Reverse boundary order: .render(fn).notFoundRender(fn).errorRender(fn) → works
  Invalid path: createPage("_root_/(auth)") → compile error (ends with group)

createLayout:
  Requires (group) ending: createLayout("_root_/(auth)") → ok
  No response method: layout builder has no .response()
  Render receives children: render props have children: JSX.Element
  Invalid path: createLayout("_root_/about") → compile error (no group)
  Preloader receives parent context: ctx.preloaderContext typed from parent layout/root

createRootLayout:
  Root path: createRootLayout("_root_") → ok
  Preloader has NO preloaderContext field (no parent)
  Authorize has NO preloaderContext field (no parent)
  Head has NO parentHead field (root IS parent)
  Render receives children: root wraps entire app
  Loader DOES receive preloaderContext (from root's own preloader)

Chain enforcement (all compile errors):
  .options() after .input() → options consumed
  .input() after .authenticate() → input consumed
  .authenticate() after .authorize() → authenticate consumed
  .authorize() after .effects() → authorize consumed
  .effects() after .preloader() → effects consumed
  .head() without .loader() → valid, loaderData is void
  .head() then .loader() → loader consumed (type error)
  .headers() without .loader() → valid, loaderData is void
  .response() after .loader() → response not available
  .render() twice → render consumed
  .errorRender() before .render() → not available
  .errorRender() twice → consumed after first

Generic narrowing:
  No .authenticate() → auth is null in authorize/preloader/loader/render
  .authenticate() → auth is Auth (non-null) everywhere
  .authenticate("admin") → auth is Auth, "admin" passed as callerData to validator
  .input({ params: z.object({ id: z.string() }) }) → location.params.id is string
  .input({ searchParams: z.object({ page: z.coerce.number() }) }) → location.search.page is number
  No .input() → params is Record<string, string>, search is Record<string, string>
  .preloader returns { x: 1 } → preloaderContext.x is number in loader/head/headers/render
  No .preloader() → preloaderContext is Record<string, never>
  .loader returns { data: T } → loaderData.data is T in head/headers/render
  No .loader() → loaderData is void in render

Error propagation:
  Authorize returns false → UnauthorizedError thrown, 403 boundary
  Preloader throws redirect({ to: "/login" }) → redirect response
  Loader throws notFound() → 404 boundary
  Loader throws generic Error → 500 boundary
  Render throws → caught by this route's errorRender or ancestor error boundary
```

## Notes

- Builder types enforce order via progressive interface narrowing — each step returns a more restricted interface
- No `queryClient` in v2 — removed TanStack Query coupling from all contexts
- `.authenticate(...args)` always sets `RouteMeta.authenticate = true`. Args stored as callerData on route result, passed to `authenticateFn` validator callback in pipeline.
- `env` is `unknown` — typed at handler level by the app, not by Flare
- `_type` discriminant enables runtime route type dispatch in handler
- Layout `children` rendered via `<Outlet>` component (see outlet spec)
- `.response()` is page-only — for endpoints that return raw HTTP responses
- `deps` in loader context is `[]` if no `.effects()` was called
- Head/headers available without `.loader()` — `loaderData` is `void` if no loader. Static pages can set head directly.
