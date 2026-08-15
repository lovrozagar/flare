# Server Handler

Layer 3. Depends on middleware (22), server-fn (23), loader-pipeline (06), SSR (08), ndjson-server (09), server-context (05), errors (02), router-primitives (01), boundaries (10), config (21).

Top-level orchestrator. Receives HTTP requests, decides what to do, returns responses.

## Types

### ServerHandler

```ts
interface ServerHandler<TEnv = unknown> {
	fetch(request: Request, env: TEnv, executionContext?: ExecutionContext): Promise<Response>;
}
```

Cloudflare Workers compatible. `executionContext` optional for non-Worker runtimes.

### ServerHandlerConfig

```ts
interface ServerHandlerConfig<TEnv = unknown> {
	allowedExtensions?: string[]; /* extensions that bypass static file 404 (e.g. [".json", ".xml"]) */
	authenticateFn?: AuthenticateFn<TEnv>;
	boundaries?: GlobalBoundaries;
	csp?: CspDirectives;
	dedupeFetch?: boolean; /* patch globalThis.fetch for per-request dedup (default: true) */
	entryScript?: string;
	isDev?: boolean;
	middlewares?: FlareMiddleware<TEnv>[];
	router: MarkedRouterConfig; /* from createRouter() (spec 25) */
	serverFns?: Map<string, ServerFnRegistration>;
}
```

`router` is required — the `MarkedRouterConfig` from `createRouter()` (spec 25). Contains `routeTree`, `layouts`, `queryClientGetter`, and all runtime defaults. Server reads `router.routeTree` for route matching, `router.layouts` for module loading, `router.queryClientGetter?.()` for per-request QueryClient. Serializable config subset embedded in `FlareState.c.router` for client hydration.

### CspDirectives

```ts
interface CspDirectives {
	"base-uri"?: string[];
	"connect-src"?: string[];
	"default-src"?: string[];
	"font-src"?: string[];
	"form-action"?: string[];
	"frame-ancestors"?: string[];
	"frame-src"?: string[];
	"img-src"?: string[];
	"media-src"?: string[];
	"object-src"?: string[];
	"script-src"?: string[];
	"style-src"?: string[];
	"upgrade-insecure-requests"?: boolean;
	"worker-src"?: string[];
}
```

Merged with CSP defaults. Nonce injected at runtime into `script-src`.

### ServerFnRegistration

Defined in spec 23. Repeated here for context:

```ts
interface ServerFnRegistration {
	authenticate: boolean;
	authorizeFn?: (ctx: { auth: unknown; input: unknown }) => boolean | Promise<boolean>;
	fn: (ctx: HandlerContext<unknown, unknown>) => unknown | Promise<unknown>;
	input?: Validator<unknown>;
	method: "get" | "post";
	name: string;
}
```

### CSR Request Headers

```ts
const CSR_HEADERS = {
	DATA_REQUEST: "x-d" /* "1" when CSR navigation */,
	MATCH_IDS: "x-m" /* comma-separated stale matchIds */,
	PREFETCH: "x-p" /* "1" when prefetch */,
};
```

## Exports

```ts
createServerHandler<TEnv = unknown>(
  config: ServerHandlerConfig<TEnv>,
): ServerHandler<TEnv>
```

Single export. Returns object with `fetch` method.

## Behavior

### Request Flow

```
Request arrives -> createServerHandler.fetch(request, env, ctx)
  |
1. Generate nonce (16-byte random hex via generateNonce())
2. Create AbortController for request lifecycle
3. normalizeUrl(request)
   |- trailing slash (not root) -> 301 redirect to non-slash URL
   |- pathname has file extension AND not .html -> 404 Response
   |- else -> continue
4. runWithServerContext({ nonce, request }, async () => {
5.   Build MiddlewareContext { env, nonce, onResponse, request, url }
6.   runMiddlewares(config.middlewares, ctx)
     |- bypass -> return raw response (no headers, no handlers)
     |- respond -> apply response handlers + security headers -> return
     |- next -> continue
7.   Check server function request (pathname starts with "/_fn/")
     |- yes -> handleServerFnRequest() -> apply response handlers
                + security headers -> return
8.   matchRoute(config.router.routeTree, pathname)
     |- no match -> render 404 (global notFound boundary or fallback)
                    + security headers -> return
9.   Determine navigation format from headers:
     |- no x-d header -> Initial load (SSR)
     |- x-d: "1" -> NDJSON streaming navigation
10.  Load route modules (page + layouts from config.router.layouts)
11.  Build ResolvedRoute[] from loaded modules + matched route
12.  runPipeline({ abortController, authenticateFn, cause, env,
                   prefetch, request, routes, url })
13.  Check for redirect in pipeline results
     |- SSR redirect -> HTTP redirect Response (Location header)
     |- NDJSON redirect -> createRedirectNDJSONResponse()
14.  Render response:
     |- SSR: renderToStream() -> full HTML Response
     |- NDJSON (has deferred): createStreamingNDJSONResponse()
     |- NDJSON (no deferred): createNDJSONResponse()
15.  Apply response handlers (from middleware, FIFO order)
16.  Apply security headers (CSP with nonce, etc.)
17.  Return Response
   })
```

### URL Normalization

Called before any processing. Three outcomes:

**Trailing slash redirect**: If pathname is not `"/"` and ends with `"/"`, return 301 redirect to the same URL without trailing slash. Query string and hash preserved.

**Static file detection**: If pathname contains a `.` (file extension) AND the extension is NOT `.html`, return 404. Static assets should be served by the platform (Cloudflare, Vite dev server), not the app handler.

**Pass-through**: URL is clean, continue processing.

```ts
function normalizeUrl(request: Request): Response | null {
	const url = new URL(request.url);

	if (url.pathname !== "/" && url.pathname.endsWith("/")) {
		const target = url.pathname.slice(0, -1) + url.search + url.hash;
		return new Response(null, {
			headers: { Location: target },
			status: 301,
		});
	}

	const lastSegment = url.pathname.split("/").pop() ?? "";
	const dotIndex = lastSegment.lastIndexOf(".");
	if (dotIndex > 0) {
		const ext = lastSegment.slice(dotIndex);
		if (ext !== ".html" && !config.allowedExtensions?.includes(ext)) {
			return new Response("Not Found", { status: 404 });
		}
	}

	return null;
}
```

### Nonce Generation

One nonce per request. Generated via `generateNonce()` from server-context (spec 05). 32 hex chars (128-bit). Used for CSP `script-src 'nonce-...'` and injected into all `<script>`/`<style>` tags during SSR.

### Server Context Setup

Wraps entire request processing in `runWithServerContext({ nonce, request })`. All downstream code (middleware, pipeline, SSR) accesses nonce/request via `getServerNonce()` / `getServerRequest()`.

### Middleware Execution

Delegates to `runMiddlewares()` from spec 22. Three outcomes:

| Result    | Behavior                                                                 |
| --------- | ------------------------------------------------------------------------ |
| `bypass`  | Return response immediately. No response handlers. No security headers.  |
| `respond` | Apply response handlers (FIFO). Apply security headers. Return response. |
| `next`    | Continue to route handling.                                              |

Response handlers collected during middleware execution are applied after the route handler produces a response (for both `next` and `respond` results).

### Server Function Handling

When pathname starts with `/_fn/`, delegates to `handleServerFnRequest()` from spec 23:

```ts
handleServerFnRequest(request, env, config.serverFns, config.authenticateFn);
```

Full pipeline (spec 23):

1. Parse URL → extract `{id}` and `{name}` from `/_fn/{id}/{name}`
2. Look up `id` in `config.serverFns` Map, verify `name` matches
3. Validate HTTP method (registration.method vs request method)
4. If `authenticate === true` → run `authenticateFn`
5. Parse input (POST: JSON body, GET: search params)
6. If `input` exists → validate input
7. If `authorizeFn` exists → run authorization check
8. Call `fn({ auth, env, input, request })`
9. Error mapping per spec 02/23

Server function responses still go through response handlers and security headers (not bypass).

### Route Matching

Uses `matchRoute(config.router.routeTree, pathname)` from spec 01. Returns `MatchResult` with `params` and `route` (RouteData).

No match -> render 404 page. Uses global `notFound` boundary from `config.boundaries` if available. Falls back to minimal HTML: `<html><body><h1>404</h1><p>Not Found</p></body></html>`. Status 404. Security headers applied.

### Navigation Format Detection

```ts
const isDataRequest = request.headers.get("x-d") === "1";
const isPrefetch = request.headers.get("x-p") === "1";
const staleMatchIds = request.headers.get("x-m")?.split(",") ?? [];

if (!isDataRequest) {
	/* Initial load -> SSR */
} else {
	/* NDJSON navigation */
}
```

### Route Module Loading

After route match, load the matched page module and all layout modules for the matched route's virtual path.

1. Derive layout keys from `virtualPath` via `deriveLayouts()`
2. For each layout key, look up in `config.router.layouts` and call the lazy loader
3. Call matched route's lazy loader (`route.p()`)
4. Assemble `ResolvedRoute[]` array (root -> layouts -> page order)

### Loader Cause

```ts
const cause: LoaderCause = isPrefetch ? "prefetch" : "enter";
```

Server always resolves to `"prefetch"` or `"enter"`. `"stay"` is client-only (invalidation/shouldRefetch while already on the route, spec 15). Both SSR and CSR data requests are `"enter"` — user is entering the route.

### Pipeline Execution

Delegates to `runPipeline()` from spec 06. Config:

```ts
{
  abortController,
  authenticateFn: config.authenticateFn,
  cause,
  env,
  prefetch: isPrefetch,
  request,
  routes: resolvedRoutes,
  url,
}
```

### Redirect Handling

After pipeline returns, check for redirect in results.

**Server-side redirect limit**: max 5 internal redirects per request. If middleware or auth produces more than 5 redirects within a single request processing cycle, throw `Error("Redirect loop detected")` → 500 response. Prevents the Next.js-style infinite redirect exploit where middleware chains redirect indefinitely within one request.

**Pipeline-level redirect** (thrown from authenticate/preloader/authorize): caught in handler's try/catch, converted to redirect response.

**Loader-level redirect** (caught per-loader in pipeline results): first `RedirectResponse` in match array order wins.

SSR mode:

```ts
return new Response(null, {
	headers: { Location: redirect.url },
	status: redirect.status,
});
```

NDJSON mode:

```ts
return createRedirectNDJSONResponse(redirect);
```

External redirects (`redirect.external === true`) always return HTTP redirect regardless of navigation format.

### SSR Rendering (Initial Load)

When no `x-d` header present. Calls `renderToStream()` from spec 08:

```ts
const ssrResult = renderToStream({
	auth: pipelineResult.auth,
	cause,
	entryScript: config.entryScript,
	matches: pipelineResult.matches,
	moduleScripts,
	nonce,
	prefetch: isPrefetch,
	resolvedHead,
	url,
});

return new Response(ssrResult.body, {
	headers: {
		...ssrResult.headers,
		...securityHeaders(nonce, config.csp, config.isDev),
	},
	status: ssrResult.status,
});
```

### NDJSON Rendering (CSR Navigation)

When `x-d: "1"`. Checks if any deferred contexts exist:

- Has deferred -> `createStreamingNDJSONResponse()`
- No deferred -> `createNDJSONResponse()`

Both from spec 09. Config:

```ts
{
  deferContexts: pipelineResult.deferContexts,
  matches: pipelineResult.matches,
}
```

### Response Handler Application

After route handler produces a response (SSR or NDJSON), apply response handlers collected from middleware:

```ts
let response = routeResponse;
for (const handler of responseHandlers) {
	response = await handler(response);
}
```

Runs for `next` and `respond` middleware results. Skipped for `bypass`.

### Security Headers

Applied to every response except `bypass`. Merged onto existing response headers.

```ts
const SECURITY_HEADERS = {
	"Cross-Origin-Opener-Policy": "same-origin-allow-popups",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
};
```

### CSP Construction

CSP header built from defaults + config overrides + nonce:

```ts
const CSP_DEFAULTS: CspDirectives = {
	"base-uri": ["'self'"],
	"connect-src": ["'self'", "https:"],
	"default-src": ["'self'"],
	"img-src": ["'self'", "data:", "https:"],
	"script-src": ["'self'", "'strict-dynamic'"],
	"style-src": ["'self'", "'unsafe-inline'"],
	"upgrade-insecure-requests": true,
};
```

Merge: config `csp` values appended to defaults per directive (array concat, no dedup). Nonce injected into `script-src` as `'nonce-${nonce}'`.

Final CSP string: directives joined with `; `, sources joined with space.

```ts
function buildCspHeader(nonce: string, overrides?: CspDirectives, isDev?: boolean): string;
```

### Dev Mode CSP Relaxation

When `config.isDev === true`, CSP relaxed:

```ts
{
  "connect-src": [...defaults, "ws://localhost:*", "http://localhost:*"],
  "script-src": [...defaults, "'unsafe-inline'", "'unsafe-eval'"],
  "style-src": [...defaults, "'unsafe-inline'"],
}
```

Enables Vite HMR websocket, inline scripts from dev server, and eval for source maps.

### Error Handling (Top-Level)

The handler wraps the entire request flow in try/catch. Errors that escape the pipeline/middleware:

| Error                        | Response                                     |
| ---------------------------- | -------------------------------------------- |
| `RedirectResponse`           | HTTP redirect (Location header + status)     |
| `UnauthenticatedError`       | Render unauthorized boundary or 401 fallback |
| `UnauthorizedError`          | Render unauthorized boundary or 403 fallback |
| `NotFoundError`              | Render notFound boundary or 404 fallback     |
| Input validation error (Zod) | 400 plain text response with error message   |
| Any other `Error`            | Render error boundary or 500 fallback        |

SSR errors render the appropriate boundary component. NDJSON errors return error JSON. Boundary rendering follows the walk-up chain from spec 10 — when no route boundaries exist, global boundaries from `config.boundaries` are used. When no global boundary exists, minimal HTML fallback.

### Minimal Fallback Pages

Used when no boundary component is configured:

```html
<!-- 404 -->
<!doctype html>
<html>
	<head>
		<title>Not Found</title>
	</head>
	<body>
		<h1>404</h1>
		<p>Not Found</p>
	</body>
</html>

<!-- 401 -->
<!doctype html>
<html>
	<head>
		<title>Unauthorized</title>
	</head>
	<body>
		<h1>401</h1>
		<p>Unauthorized</p>
	</body>
</html>

<!-- 403 -->
<!doctype html>
<html>
	<head>
		<title>Forbidden</title>
	</head>
	<body>
		<h1>403</h1>
		<p>Forbidden</p>
	</body>
</html>

<!-- 500 -->
<!doctype html>
<html>
	<head>
		<title>Server Error</title>
	</head>
	<body>
		<h1>500</h1>
		<p>Internal Server Error</p>
	</body>
</html>
```

Dev mode appends error message and stack trace to the 500 fallback body.

### AbortController Lifecycle

Created at request start. Passed to pipeline for all phases. Aborted when:

- Client disconnects (if runtime supports it)
- `executionContext` deadline approaching (Workers)

Callbacks in pipeline/middleware can check `abortController.signal.aborted` to bail early.

On client disconnect, the response stream's writable side closes (Cloudflare Workers). Solid's `renderToStream` may continue producing HTML that is discarded. Deferred promise callbacks should check `signal.aborted` to short-circuit expensive work and save CPU.

### Stale Match Filtering (x-m Header)

When `x-m` header is present, only routes whose matchIds are in the comma-separated list run loaders. Other routes in the match chain still load modules and run preloaders/authorize but skip loaders. Loader data for skipped routes is `undefined` with `status: "success"`.

Used for navigations within the same layout — layout data already cached on client.

**Trade-off: stale preloaderContext for skipped routes.** Preloaders run for ALL routes (including skipped ones) because downstream loaders may depend on accumulated preloaderContext. However, the fresh preloaderContext from skipped routes is NOT sent to the client — only stale (non-skipped) routes' data goes through NDJSON. The client retains its cached preloaderContext for skipped routes. This means the client's cached preloaderContext may be stale if the preloader would produce different results (e.g. different theme, permissions). This is an acceptable trade-off: preloaderContext is typically stable within a session (user identity, theme, permissions rarely change mid-navigation). For cases where preloaderContext freshness matters, use `revalidate: true` or `invalidate()` to force all routes to refetch.

## Test Cases

```
createServerHandler:
  Returns object with fetch method
  fetch accepts (Request, env) — executionContext optional
  fetch returns Promise<Response>

URL normalization:
  "/" -> pass through (no redirect)
  "/about" -> pass through
  "/about/" -> 301 redirect to "/about"
  "/about/?q=1" -> 301 redirect to "/about?q=1"
  "/a/b/c/" -> 301 redirect to "/a/b/c"
  "/styles.css" -> 404 (static file)
  "/images/logo.png" -> 404 (static file)
  "/api/data.json" -> 404 (static file)
  "/page.html" -> pass through (.html allowed)
  "/about.us" -> 404 (has extension, not .html)
  "/.hidden" -> pass through (dot at start, no extension)

Nonce:
  Generated once per request
  32 hex characters
  Unique across requests
  Present in CSP header as nonce-{value}
  Injected into SSR script/style tags

Server context:
  runWithServerContext wraps entire request handling
  getServerNonce() returns request nonce inside handler
  getServerRequest() returns request inside handler
  Concurrent requests have isolated contexts

Middleware integration:
  No middlewares configured -> proceeds to route handling
  Empty middleware array -> proceeds to route handling
  Middleware returns next -> continues to route handling
  Middleware returns respond -> response + handlers + security headers
  Middleware returns bypass -> response returned as-is, no headers
  Response handlers applied in registration order
  Middleware error propagates to top-level catch
  ctx.env matches handler env argument
  ctx.nonce matches generated nonce
  ctx.url matches parsed request URL

Server function handling:
  /_fn/valid-id -> calls registered fn, returns { data: result }
  /_fn/unknown-id -> 404 { message: "Server function not found" }
  /_fn/id with input validator, valid input -> fn called with parsed input
  /_fn/id with input validator, invalid input -> 400 { message: ... }
  /_fn/id fn throws ServerFnValidationError -> 400
  /_fn/id fn throws UnauthenticatedError -> 401
  /_fn/id fn throws UnauthorizedError -> 403
  /_fn/id fn throws generic Error -> 500
  /_fn/id response goes through response handlers
  /_fn/id response gets security headers
  No serverFns configured -> all /_fn/* -> 404

Route matching:
  Matched route -> load modules, run pipeline
  No match -> 404 response
  No match + global notFound boundary -> boundary rendered, 404
  No match + no boundary -> minimal HTML fallback, 404
  404 response gets security headers

Navigation format:
  No x-d header -> SSR (initial load)
  x-d: "1" -> NDJSON navigation
  x-p: "1" -> cause = "prefetch", prefetch = true
  No x-p -> cause = "enter" (both data request and SSR)
  x-m: "a,b,c" -> only those matchIds run loaders

Route module loading:
  Page module loaded via route.p()
  Layout modules loaded from config.router.layouts
  deriveLayouts determines which layouts to load
  Modules loaded in parallel
  ResolvedRoute[] ordered root -> layouts -> page

Pipeline execution:
  authenticateFn from config passed through
  env from fetch args passed through
  AbortController created and passed
  Pipeline result used for rendering
  prefetch flag from x-p header

Redirect handling (SSR):
  Pipeline throws RedirectResponse -> HTTP redirect
  Loader RedirectResponse (first in route order) -> HTTP redirect
  Redirect status preserved (301, 302, 307, 308)
  Location header set to redirect URL
  No body in redirect response

Redirect handling (NDJSON):
  Pipeline throws RedirectResponse -> createRedirectNDJSONResponse
  Loader RedirectResponse -> createRedirectNDJSONResponse
  External redirect -> HTTP redirect (not NDJSON)

SSR rendering:
  No x-d -> renderToStream called
  SSRResult.body used as Response body
  SSRResult.status used as Response status
  SSRResult.headers merged with security headers
  entryScript from config passed to renderToStream
  resolvedHead from pipeline head chain

NDJSON rendering:
  x-d: "1" -> NDJSON response
  Has deferred contexts -> createStreamingNDJSONResponse
  No deferred contexts -> createNDJSONResponse
  Content-Type: application/x-ndjson
  Cache-Control: no-store

Response handlers:
  Applied after route handler response
  Applied for "next" middleware result
  Applied for "respond" middleware result
  NOT applied for "bypass" middleware result
  FIFO order (first registered runs first)
  Each handler receives previous handler's response
  Handler can be async (Promise<Response>)

Security headers:
  Applied to every response (except bypass)
  Content-Security-Policy with nonce
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security with includeSubDomains + preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Do not overwrite existing response headers (merge)

CSP construction:
  Default directives applied when no config.csp
  Config csp values appended to defaults (array concat)
  Nonce injected into script-src
  'strict-dynamic' in script-src by default
  Directives joined with "; "
  Sources joined with space
  upgrade-insecure-requests -> directive without value

CSP dev mode:
  isDev: true -> unsafe-inline + unsafe-eval in script-src
  isDev: true -> ws://localhost:* in connect-src
  isDev: true -> unsafe-inline in style-src
  isDev: false -> strict CSP (no unsafe-*)
  isDev: undefined -> strict CSP

Error handling (top-level):
  RedirectResponse -> HTTP redirect
  UnauthenticatedError -> 401 (boundary or fallback)
  UnauthorizedError -> 403 (boundary or fallback)
  NotFoundError -> 404 (boundary or fallback)
  Zod validation error -> 400 plain text
  Generic Error -> 500 (boundary or fallback)
  Error during SSR -> boundary rendered server-side
  Error during NDJSON -> error JSON response
  Dev mode 500 -> error message + stack in body
  Prod mode 500 -> no stack trace exposed

AbortController:
  Created per request
  Passed to pipeline
  Abort on client disconnect (if supported)
  Callbacks can check signal.aborted

Stale match filtering:
  x-m header present -> filter loaders to listed matchIds
  Unlisted routes -> loaderData = undefined, status = "success"
  Preloaders/authorize still run for all routes
  No x-m header -> all routes run loaders

End-to-end:
  Minimal: single page, no auth, no middleware -> SSR 200
  Full: root + layout + page, auth, middleware, preloaders -> SSR 200
  CSR nav: x-d: "1" -> NDJSON with loader data
  Prefetch: x-d: "1" + x-p: "1" -> NDJSON, cause "prefetch"
  404 nav: no match + x-d: "1" -> NDJSON error
  Redirect: loader redirect + x-d: "1" -> NDJSON redirect message
  Server fn: /_fn/id + x-d: "1" -> JSON (not NDJSON)
  Bypass: middleware bypass -> raw response, no CSP
```

## Notes

- `createServerHandler` is called once at app startup. `fetch` called per request. Config is captured in closure.
- `executionContext` is Cloudflare-specific — provides `waitUntil()` for post-response work. Optional for non-CF runtimes.
- Security headers are always applied (except bypass). No opt-out mechanism beyond `middlewareBypass`.
- CSP `'strict-dynamic'` propagates trust to dynamically loaded scripts (Vite chunks). Nonce only needed on initial scripts.
- Static file 404 is intentional — handler should never serve static files. Platform (CF, Vite, nginx) handles static assets before the handler.
- Server function path `/_fn/` is a reserved prefix. Route tree should not contain routes starting with `_fn`.
- `config.router.layouts` is a map of layout key -> lazy loader. Layout keys from `deriveLayouts()` (spec 01). Generated by route generator (spec 19).
- `router` config merged into pipeline contexts but not into route tree — runtime merge, not build-time.
- NDJSON 404 (no route match on CSR nav) sends error messages rather than rendering HTML. Client handles 404 display.
- Response handler errors are caught by the top-level handler and result in 500 responses.
- No HTML navigation mode in v2 — removed. Only SSR (initial load) and NDJSON (CSR navigation).
- Handler does not call `executionContext.waitUntil()` itself — middleware or response handlers can if they have access via `env` or captured reference.
- `config.entryScript` is dev-only — in production, module scripts come from the build manifest.
