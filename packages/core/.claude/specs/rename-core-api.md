# Rename Core API: createServer, createClient, Builder Patterns

## Summary

| Current                       | New                            | Import Path                 |
| ----------------------------- | ------------------------------ | --------------------------- |
| `createServerHandler(config)` | `createServer(router)` builder | `flare/server`      |
| `hydrate(routerFn, opts?)`    | `createClient(router)` builder | `flare/client`      |
| `createRouter(config)`        | `createRouter(config)`         | `flare` (unchanged) |
| —                             | `createMiddleware(scope)`      | `flare/middleware`  |
| —                             | `background(promise)`          | `flare/server`      |

## Architecture Decisions

### waitUntil — zero user API

Eliminated from all user-facing config. Resolved automatically:

- `server.fetch(request, env?, ctx?)` accepts optional `ExecutionContext` third arg
- CF Vite plugin passes `(request, env, ctx)` natively — `ctx.waitUntil` available
- Node/Bun: no ctx → fire-and-forget (long-running process)
- Internally: `waitUntil` added to existing `ServerContextValue` (AsyncLocalStorage already used)
- Framework exports `background(promise)` for internal use + power users

### Minor server settings → Vite plugin

`allowedExtensions`, `serverLogs`, `dedupeFetch` are build-time decisions. Moved to `FlarePluginConfig.server`.

### Security — `.security()` builder method

CSP, Permissions-Policy, and all security headers consolidated into one builder method. Keys are actual HTTP header names — zero abstraction. CSP and Permissions-Policy accept structured objects (merged with strict defaults) OR raw strings (escape hatch). All other headers are strings (override defaults). Strict defaults always applied — `.security()` only needed for overrides.

Default security headers (always on):

- `Content-Security-Policy`: strict CSP with per-request nonce, `'self'` defaults
- `Cross-Origin-Opener-Policy: same-origin-allow-popups`
- `Cross-Origin-Resource-Policy: same-origin`
- `Permissions-Policy`: all privacy-invasive APIs disabled, `payment=(self)`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`

- `X-Powered-By: flare`

Dev mode auto-loosens CSP (WebSocket for HMR, localhost connects). HSTS/COOP skipped in dev. `X-Powered-By: false` to disable.

### Middleware — scoped, single registration point

One `.middlewares([])` on server. Scope declared on middleware via `createMiddleware(scope)`. No middleware on pages, layouts, or server functions.

### Auth — first-class, NOT middleware

`authenticateFn` = HOW (one impl). Route `.authenticate()` = WHETHER. Type narrowing (non-null vs nullable `ctx.auth`) cannot be replicated with middleware.

### SSR cache — moved from router to server

`cache.ssr` is server-only. Router keeps `cache.client` only.

---

## API Reference

### `createRouter(config)` — `flare`

Config object. No builder.

```ts
createRouter({
  /* REQUIRED */
  layouts: Record<string, () => Promise<{ default: unknown }>>,
  routeTree: TreeNode,

  /* OPTIONAL */
  basePath?: string,
  cache?: {
    client?: ClientCacheConfig | false,
  },
  caseSensitive?: boolean,
  direction?: DirectionConfig,
  getScrollRestorationKey?: (location: Location) => string,
  notFoundMode?: "fuzzy" | "root",
  queryClientGetter?: () => unknown,
  rewrite?: LocationRewrite,
  routeCacheMaxEntries?: number,
  scrollRestoration?: boolean,
  scrollRestorationBehavior?: "auto" | "smooth",
  scrollRestorationMaxEntries?: number,
  theme?: ThemeConfig,
  trailingSlash?: "always" | "never" | "preserve",
  viewTransitions?: boolean | { types: string[] },
})
```

**`ClientCacheConfig`**

```ts
{
  cacheDeferred?: boolean,
  gcTime?: number,
  prefetch?: false | "intent" | "render" | "viewport",
  prefetchGcTime?: number,
  prefetchStaleTime?: number,
  staleTime?: number,
}
```

**`DirectionConfig`**

```ts
{
  attribute?: string,
  defaultDir?: "ltr" | "rtl",
  rtlLocales?: readonly string[],
  storageKey?: string,
}
```

**`ThemeConfig`**

```ts
{
  attribute?: string,
  defaultTheme?: "dark" | "light" | "system",
  disableTransitionOnChange?: boolean,
  storageKey?: string,
  themes?: readonly ("dark" | "light" | "system")[],
}
```

**`LocationRewrite`**

```ts
{
  input?: (ctx: { url: URL }) => URL | string | undefined,
  output?: (ctx: { url: URL }) => URL | string | undefined,
}
```

---

### `createServer(router)` — `flare/server`

Builder. 7 methods. All one-time (removed from type after call).

```ts
createServer(router: MarkedRouterConfig)
  .middlewares(mws: FlareMiddleware[])
  .authenticateFn(fn: AuthenticateFn)
  .serverContext(fn: ServerContextFactory)
  .cache(config: ServerCacheConfig)
  .security(config: SecurityConfig | ((ctx: SecurityContext) => SecurityConfig))
  .keepalive(config: KeepaliveConfig)
  .sitemap(config: SitemapConfig)
```

**`.middlewares(mws)`**

```ts
;(mws: FlareMiddleware[]) => ServerBuilder
```

Single array. Framework filters by scope at runtime. Plain `FlareMiddleware` functions treated as `"global"`.

**`.authenticateFn(fn)`**

```ts
;<TAuth>(
	fn: (ctx: {
		callerData?: unknown[]
		env: TEnv
		request: Request
		serverContext: Record<string, unknown>
		url: URL
	}) => TAuth | null | Promise<TAuth | null>,
) => ServerBuilder
```

Typed `TAuth` flows to route `.authenticate()` / `.authorize()`.

**`.serverContext(fn)`**

```ts
;<TServerContext extends Record<string, unknown>>(
	fn: (ctx: { env: TEnv; request: Request }) => TServerContext | Promise<TServerContext>,
) => ServerBuilder
```

Typed `TServerContext` flows to `ctx.serverContext` in routes and server functions.

**`.cache(config)`**

```ts
;(config: {
	cdn?: CdnPurgeAdapter | ((env: TEnv) => CdnPurgeAdapter)
	headers?: boolean
	revalidateSecret?: string | ((env: TEnv) => string)
	ssr?: SsrCacheConfig
	store?: FlareStore | ((env: TEnv) => FlareStore)
}) => ServerBuilder
```

`CdnPurgeAdapter`:

```ts
{
  purgeByKeys?(keys: string[], callerData?: unknown): Promise<void>,
  purgeByTags(tags: string[], callerData?: unknown): Promise<void>,
}
```

`SsrCacheConfig`:

```ts
{
  key?: (ctx: { params: Record<string, string | string[]> }) => string,
  staleTime?: number,
  tags?: string[] | ((ctx: { params: Record<string, string | string[]> }) => string[]),
  ttl?: number,
}
```

`FlareStore`:

```ts
{
  delete(key: string): Promise<void>,
  deleteByKeys?(keys: string[], callerData?: unknown): Promise<void>,
  deleteByTags(tags: string[], callerData?: unknown): Promise<void>,
  get(key: string): Promise<FlareStoreEntry | null>,
  set(key: string, entry: FlareStoreEntry, ttl?: number): Promise<void>,
}
```

**`.security(config)`**

```ts
;(
	config:
		| SecurityConfig
		| ((ctx: {
				env: TEnv
				nonce: string
				request: Request
				serverContext: TServerContext
		  }) => SecurityConfig),
) => ServerBuilder
```

`SecurityConfig`:

```ts
{
  "Content-Security-Policy"?: CspDirectives | string | false,
  "Cross-Origin-Opener-Policy"?: string | false,
  "Cross-Origin-Resource-Policy"?: string | false,
  "Permissions-Policy"?: Partial<PermissionsPolicy> | string | false,
  "Referrer-Policy"?: string | false,
  "Strict-Transport-Security"?: string | false,
  "X-Content-Type-Options"?: string | false,
  "X-Frame-Options"?: string | false,
  "X-Powered-By"?: string | false,
}
```

`PermissionsPolicy`:

```ts
{
  accelerometer: boolean | "self" | string[],
  "browsing-topics": boolean | "self" | string[],
  camera: boolean | "self" | string[],
  geolocation: boolean | "self" | string[],
  gyroscope: boolean | "self" | string[],
  "interest-cohort": boolean | "self" | string[],
  magnetometer: boolean | "self" | string[],
  microphone: boolean | "self" | string[],
  payment: boolean | "self" | string[],
  usb: boolean | "self" | string[],
}
```

Static or dynamic. Static: object merged with defaults. Dynamic: function receives request context for multi-tenant SaaS (e.g. per-tenant CSP). CSP nonce auto-injected into `script-src` always (even with raw string — framework appends nonce). Permissions-Policy values: `false` → `=()`, `true` → `=*`, `"self"` → `=(self)`, `string[]` → `=("origin1" "origin2")`.

`CspDirectives` (structured CSP — values merge with defaults):

```ts
{
  "base-uri"?: string[],
  "block-all-mixed-content"?: boolean,
  "connect-src"?: string[],
  "default-src"?: string[],
  "font-src"?: string[],
  "form-action"?: string[],
  "frame-ancestors"?: string[],
  "frame-src"?: string[],
  "img-src"?: string[],
  "media-src"?: string[],
  "object-src"?: string[],
  "script-src"?: string[],
  "style-src"?: string[],
  "upgrade-insecure-requests"?: boolean,
  "worker-src"?: string[],
}
```

**Defaults** (applied when `.security()` not called):

- CSP: `base-uri 'self'; connect-src 'self' https:; default-src 'self'; img-src 'self' data: https:; object-src 'none'; script-src 'self' 'nonce-{auto}'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests`
- Permissions-Policy: all disabled, `payment=(self)`
- COOP: `same-origin-allow-popups`
- CORP: `same-origin`
- HSTS: `max-age=63072000; includeSubDomains; preload`
- Referrer-Policy: `strict-origin-when-cross-origin`
- X-Content-Type-Options: `nosniff`
- X-Frame-Options: `DENY`
- X-Powered-By: `flare`

**`.keepalive(config)`**

```ts
;(config: { handler?: (ctx: MiddlewareContext) => Promise<void>; interval: number }) =>
	ServerBuilder
```

Registers `/_flare/keepalive` endpoint (server-side) and serializes `interval` to client for periodic pinging. Client automatically pings at interval, pauses when tab hidden, resumes when visible. Optional `handler` runs on each ping (e.g. extend session). Replaces both `keepalive` on `RouterConfig` and `keepalive()` middleware.

**`.sitemap(config)`**

```ts
;(config: {
	engines: {
		bing?: {
			apiKey: string | ((env: TEnv) => string)
			siteUrl: string
		}
		google?: {
			credentials: ServiceAccountCredentials | ((env: TEnv) => ServiceAccountCredentials)
			siteUrl: string
		}
		indexNow?: {
			host: string
			key: string | ((env: TEnv) => string)
		}
	}
	secret: string | ((env: TEnv) => string)
	sitemapUrl: string
}) => ServerBuilder
```

**`.fetch(request, env?, ctx?)`**

```ts
fetch(request: Request, env?: TEnv, ctx?: { waitUntil?: (p: Promise<unknown>) => void }): Promise<Response>
```

Builder IS the handler. CF plugin calls `server.fetch(request, env, ctx)`. Third arg provides `waitUntil` to AsyncLocalStorage context automatically.

**Type design:**

```ts
interface ServerBuilder<TExcluded extends string = never> {
	authenticateFn: "authenticateFn" extends TExcluded
		? never
		: <TAuth>(fn: AuthenticateFn<TAuth>) => ServerBuilder<TExcluded | "authenticateFn">
	cache: "cache" extends TExcluded
		? never
		: (config: ServerCacheConfig) => ServerBuilder<TExcluded | "cache">
	keepalive: "keepalive" extends TExcluded
		? never
		: (config: KeepaliveConfig) => ServerBuilder<TExcluded | "keepalive">
	middlewares: "middlewares" extends TExcluded
		? never
		: (mws: FlareMiddleware[]) => ServerBuilder<TExcluded | "middlewares">
	security: "security" extends TExcluded
		? never
		: (
				config: SecurityConfig | ((ctx: SecurityContext) => SecurityConfig),
			) => ServerBuilder<TExcluded | "security">
	serverContext: "serverContext" extends TExcluded
		? never
		: <T>(fn: ServerContextFactory<T>) => ServerBuilder<TExcluded | "serverContext">
	sitemap: "sitemap" extends TExcluded
		? never
		: (config: SitemapConfig) => ServerBuilder<TExcluded | "sitemap">
	fetch(request: Request, env?: unknown, ctx?: ExecutionContext): Promise<Response>
}
```

---

### `createClient(router)` — `flare/client`

Builder. 2 hooks. All one-time.

```ts
createClient(
  router: MarkedRouterConfig | (() => MarkedRouterConfig | Promise<MarkedRouterConfig>)
)
  .onHydrated(fn: () => void)
  .onReady(fn: (ctx: FlareProviderContext) => void)
```

**`.onHydrated(fn)`** — DOM hydration complete, before navigation setup. No args.

**`.onReady(fn)`** — Fully bootstrapped (hydration + navigation + scroll restoration). Receives `FlareProviderContext`:

```ts
{
  hydrated: Accessor<boolean>,
  intercepted: Accessor<InterceptedState | null>,
  invalidate: (options?: InvalidateOptions) => void,
  isNavigating: Accessor<boolean>,
  location: Accessor<ProviderLocation>,
  navigate: (options: InternalNavigateOptions) => Promise<void>,
  navigationPhase: Accessor<NavigationPhase>,
  notFound: Accessor<boolean>,
  params: Accessor<Record<string, string | string[]>>,
  prefetch: (options: PrefetchOptions) => Promise<void>,
  viewTransition: Accessor<ViewTransition | null>,
}
```

**Type design:**

```ts
interface ClientBuilder<TExcluded extends string = never> {
	onHydrated: "onHydrated" extends TExcluded
		? never
		: (fn: () => void) => ClientBuilder<TExcluded | "onHydrated">
	onReady: "onReady" extends TExcluded
		? never
		: (fn: (ctx: FlareProviderContext) => void) => ClientBuilder<TExcluded | "onReady">
}
```

---

### `createMiddleware(scope)` — `flare/middleware`

```ts
createMiddleware(scope?: "global" | "page" | "server-fn")
  .handler(fn: (ctx: MiddlewareContext, next: () => Promise<MiddlewareResult>) => Promise<MiddlewareResult>)
```

**`MiddlewareContext`**

```ts
{
  env: TEnv,
  error: (...args: unknown[]) => void,
  log: (...args: unknown[]) => void,
  nonce: string,
  onResponse: (handler: (response: Response) => Response | Promise<Response>) => void,
  request: Request,
  serverContext: Record<string, unknown>,
  url: URL,
  warn: (...args: unknown[]) => void,
}
```

Default scope: `"global"`. Plain `FlareMiddleware` functions (existing signature) also `"global"` — no breaking change.

**`mount()` middleware** (replaces `config.mount`):

```ts
import { mount } from "flare/middleware"

mount(prefix: string, handler: MountFetchHandler)
```

`MountFetchHandler`:

```ts
;(request: Request, env?: TEnv) => Response | Promise<Response>
```

---

### `background(promise)` — `flare/server`

```ts
background(promise: Promise<unknown>): void
```

Safe to call anywhere in server code (loaders, middleware, server functions). On CF: delegates to `ctx.waitUntil`. On Node/Bun: fire-and-forget. Reads from AsyncLocalStorage — no arg threading.

---

### Vite plugin config additions — `flare/plugins`

```ts
flare({
  /* EXISTING */
  console?: { dev?: ConsoleConfig, prod?: ConsoleConfig },
  dev?: DevConfig | false,
  fsCodegen?: boolean,
  generated?: { routesFilePath?: string },
  ignorePrefix?: string,
  image?: FlareImageConfig,
  prerender?: PrerenderPluginConfig | boolean,
  solid?: Partial<SolidPluginOptions>,
  tailwind?: boolean | string,

  /* NEW */
  devOverlay?: boolean,
  server?: {
    allowedExtensions?: string[],
    dedupeFetch?: boolean,
    serverLogs?: boolean,
  },
})
```

---

## Full Example

```ts
/* router.ts */
export const router = createRouter({
	layouts,
	routeTree,
	cache: { client: { prefetch: "viewport", staleTime: 60_000 } },
	theme: { defaultTheme: "system" },
})

/* server.ts */
export const server = createServer(router)
	.middlewares([mount("/api", apiHandler)])
	.authenticateFn(({ request }) => validateSession(request))
	.serverContext(({ request }) => ({ requestId: crypto.randomUUID() }))
	.cache({ store: kvStore, cdn: cdnAdapter, revalidateSecret: "secret" })
	.security({ "Content-Security-Policy": { "img-src": ["https://cdn.example.com"] } })
	.keepalive({ interval: 5_000 })

/* client.tsx */
createClient(router).onReady((ctx) => {
	window.__navigate = ctx.navigate
})
```

---

## Files to Modify

### New files

- `public/flare/src/server/index.ts` — `createServer` builder + `background()` export
- `public/flare/src/client/index.tsx` — `createClient` builder

### Modified files

- `public/flare/src/index.ts` — re-export `createServer`, `createClient`
- `public/flare/src/middleware/index.ts` — add `createMiddleware(scope)`, scope filtering, `mount()` middleware
- `public/flare/src/server-handler/index.ts` — refactor to internal module, remove `waitUntil`/`mount`/`allowedExtensions`/`serverLogs`/`dedupeFetch` from config, CSP/security headers wired from `.security()` builder, use `background()` internally
- `public/flare/src/server-context/index.ts` — add `waitUntil` to `ServerContextValue`, export `background()`
- `public/flare/src/hydrate/index.tsx` — refactor to internal module, remove `devOverlay` option
- `public/flare/package.json` — add `./server`, `./client` exports; DELETE `./server-handler`, `./hydrate`
- `public/flare/src/plugins/index.ts` — add `devOverlay` + `server: { allowedExtensions, serverLogs, dedupeFetch }` to `FlarePluginConfig`, resolve via virtual modules

### Consumer updates — ALL apps

- `public/flare-real-world/src/server.ts`
- `public/flare-real-world/src/client.tsx`
- `public/flare-e2e/src/server.ts`
- `public/flare-e2e/src/client.tsx`
- `public/flare-benchmark/` — all server/client entry points
- `public/flare-v0/` — all server/client entry points

---

## Backwards Compatibility

**ZERO. RUTHLESS MODE.**

- Old export paths (`./server-handler`, `./hydrate`) DELETED. No wrappers. No deprecation.
- Old function names (`createServerHandler`, `hydrate`) DELETED. No aliases.
- `waitUntil` option DELETED from all user-facing config.
- `csp` option DELETED from `ServerHandlerConfig` — use `.security({ "Content-Security-Policy": ... })`.
- `mount` config option DELETED — use `mount()` middleware.
- `keepalive` DELETED from `RouterConfig` — use `.keepalive()` on server builder.
- `keepalive()` middleware DELETED — use `.keepalive()` on server builder.
- `/__flare/ping` renamed to `/_flare/keepalive` (normalize all internal routes to `/_flare/` prefix).
- All consumer apps updated in same change.

### Internal routes (all `/_flare/` prefix)

| Route                    | Purpose            | Registered by                                    |
| ------------------------ | ------------------ | ------------------------------------------------ |
| `/_flare/keepalive`      | Keepalive ping     | `.keepalive()` builder                           |
| `/_flare/revalidate`     | ISR revalidation   | `.cache()` builder (when `revalidateSecret` set) |
| `/_flare/sitemap/submit` | Sitemap submission | `.sitemap()` builder                             |
| `/_flare/image?`         | Image optimization | Vite plugin (dev only)                           |

---

## Testing — MANDATORY TDD

**Vitest:** `/home/ecomet/Development/monorepo/public/flare/tests`
**Playwright:** `/home/ecomet/Development/monorepo/public/flare-e2e`

### Process

1. **RED** — Write tests FIRST. Must fail.
2. **CODE** — Implement until new tests pass.
3. **GREEN** — All new tests pass.
4. **FULL SUITE** — Run ALL tests for BOTH unit AND e2e:
   - Unit: `bun run --cwd /home/ecomet/Development/monorepo/public/flare test`
   - Dev E2E: `cd /home/ecomet/Development/monorepo/public/flare-e2e && bunx playwright test`
   - Prod E2E: `cd /home/ecomet/Development/monorepo/public/flare-e2e && TEST_MODE=prod bunx playwright test`
5. **ZERO FAILURES** — Fix everything. No skips. No flaky tolerance.

**CRUCIAL: BOTH new vitest (unit) AND playwright (e2e) tests MUST be written and run. ALL existing tests MUST remain green. If not done — DO NOT report done, continue work. ABSOLUTE ZERO FALSE POSITIVE TOLERANCE.**

### New tests

**Vitest:**

- `createServer` builder: all 7 methods, `.fetch()` returns Response
- `createServer` types: duplicate calls are TS errors
- `createServer` `.fetch()` third arg wires `ctx.waitUntil` into `background()`
- `background()`: delegates to `waitUntil` when available, fire-and-forget when not
- `createMiddleware` scoping: global/page/server-fn filtered at runtime
- `createMiddleware` backwards compat: plain functions → global
- `mount()` middleware: prefix matching + handler delegation
- `createClient` builder: `.onHydrated()` + `.onReady()` at correct lifecycle points
- `createClient` types: duplicate calls are TS errors
- `.security()` static config: CSP directives merged with defaults, nonce auto-injected
- `.security()` static config: Permissions-Policy serialized from structured object
- `.security()` static config: raw string passthrough for CSP and Permissions-Policy
- `.security()` dynamic config: function receives request context, returns per-request config
- `.security()` defaults: all security headers applied when `.security()` not called
- Vite plugin: `devOverlay` option, `server.*` options resolved via virtual modules

**Playwright:**

- `createServer(router).middlewares([...])` serves pages
- Scoped middleware: page runs on nav, not server-fn; server-fn runs on server-fn, not page
- `createClient(router).onReady(ctx => ...)` hydrates + exposes context
- `background()` in loader doesn't block response
- Security headers: CSP with nonce, Permissions-Policy, HSTS, COOP, CORP present on HTML responses
- Security headers: `.security()` overrides applied (e.g. custom CSP directive, X-Frame-Options change)
- Dev overlay: visible in dev, absent in prod

### Completion — ABSOLUTE

**DO NOT report done unless ALL true:**

1. All new tests written and green
2. Full vitest suite — 0 failures
3. Full playwright suite — 0 failures
4. Zero false positives. Flaky = fix it.

**Not done = continue. No exceptions.**
