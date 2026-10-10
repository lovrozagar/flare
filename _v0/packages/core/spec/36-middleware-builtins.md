# Middleware Builtins

Layer 3 (depends on middleware system). Cloudflare Workers first.

Built-in middleware for common patterns: API proxy, CDN proxy, HTML cache, i18n, static assets.

## `apiProxy`

### Types

```ts
interface ServiceBinding {
	fetch: (request: Request) => Promise<Response>;
}

interface ApiProxyConfig<TEnv = unknown> {
	enabled?: boolean | ((ctx: { env: TEnv }) => boolean);
	headers?: (ctx: { env: TEnv; request: Request }) => Record<string, string>;
	pathPrefix: string;
	rewrite?: (path: string) => string;
	target: (ctx: { env: TEnv }) => ServiceBinding;
}
```

### Behavior

Forwards requests matching `pathPrefix` to a Cloudflare service binding.

- Matches `pathPrefix/` prefix and exact `pathPrefix`
- `rewrite` transforms path before forwarding (default: strips prefix)
- `headers` adds custom headers to proxied request
- `enabled` can be static or dynamic (e.g., local dev only)
- Returns `bypass` — API responses skip response handlers

```ts
apiProxy({
	enabled: ({ env }) => env.PUBLIC_ENVIRONMENT === "local",
	pathPrefix: "/api",
	rewrite: (path) => path.slice(4),
	target: ({ env }) => env.GATEWAY_SERVICE,
});
```

## `cdnProxy`

### Types

```ts
interface R2BucketBinding {
	get: (key: string) => Promise<{
		body: ReadableStream;
		etag: string;
		httpMetadata?: { contentType?: string };
		size: number;
	} | null>;
}

interface CdnProxyConfig<TEnv = unknown> {
	bucket: (ctx: { env: TEnv }) => R2BucketBinding;
	cacheControl?: string; /* default: "public, max-age=31536000, immutable" */
	edgeCache?: boolean; /* default: false */
	pathPrefix: string;
}
```

### Behavior

Serves static assets from R2 bucket.

- Matches `pathPrefix/` prefix only
- Sets `Cache-Control`, `Content-Type`, `Content-Length`, `ETag` headers
- `edgeCache: true` uses Cloudflare Cache API for edge caching
  - Cache lookup before R2
  - `waitUntil` for async cache put
- 404 for missing objects
- Returns `bypass` — static assets skip response handlers

## `htmlCache`

### Types

```ts
interface FileCacheRule {
	cacheControl: string;
	path: string; /* suffix match */
}

interface HtmlCacheConfig<TEnv = unknown> {
	enabled?: boolean | ((ctx: { env: TEnv }) => boolean);
	files?: FileCacheRule[];
	html: { cacheControl: string };
	name: string; /* cache namespace */
	skip?: RegExp; /* paths to skip */
}
```

### Behavior

SWR (Stale-While-Revalidate) cache using Cloudflare Cache API.

**Cache determination:**

1. File rules: path suffix match → use file's cacheControl
2. HTML: no extension in path → use html.cacheControl
3. Neither → skip (return next)

**Cache flow:**

1. GET only — other methods pass through
2. Skip if: `skip` regex matches, `x-skip-cache: 1` header, `?xskipcache=1` param
3. Cache hit:
   - **Fresh** (age < max-age) → return with `x-swr-status: HIT`
   - **Stale** (age < max-age + swr) → return with `x-swr-status: STALE`, background revalidation via `waitUntil`
   - **Expired** → cache miss
4. Cache miss → `onResponse` handler stores response in cache

**Nonce extraction**: on cache hit, reads first 4KB of cached HTML to extract the nonce used when the page was originally rendered. Calls `setServerNonce(extractedNonce)` (spec 05) to override the per-request nonce so the CSP header matches the nonce attributes already in the cached HTML body. The per-request nonce is discarded for cached responses — CSP header and HTML `<script nonce="...">` tags agree on the same (original) nonce.

**Headers:**

- `x-cached-at` — internal timestamp (stripped from response)
- `x-swr-status` — HIT or STALE
- `x-skip-cache` — request header to bypass cache

## `i18n`

### Types

```ts
interface I18nCookieConfig {
	key: string;
	maxAge?: number; /* default: 31536000 (1 year) */
	secure?: boolean; /* default: auto-detect from URL */
}

interface I18nConfig {
	cookie: I18nCookieConfig;
	defaultLocale: string;
	locales: string[];
	skip?: string[];
}
```

### Behavior

Locale detection and routing. Priority: URL path > cookie > Accept-Language > default.

**Detection flow:**

1. Bots (via `isbot`) → always get `defaultLocale` (consistent SEO)
2. Skip configured paths (e.g., `/_flare/`) and file extensions
3. Normalize locale case: `/EN-US/about` → 302 to `/en-us/about`
4. Extract locale from path, cookie, Accept-Language (CLDR matching)

**Redirects:**

- Invalid locale in path (e.g., `/de-de` not in locales) → redirect to fallback locale
- Root `/` with non-default cookie locale → redirect to `/{locale}`
- Non-root path with non-default cookie locale → redirect to `/{locale}{path}`
- Default locale in path (`/en-us/about`) → redirect to `/about` (strip default)

**Accept-Language matching**: uses `@formatjs/intl-localematcher` CLDR distance matching for script variants (zh-Hans/zh-Hant, sr-Latn/sr-Cyrl). Only used when no cookie set (first visit).

**Cookie**: set via `onResponse` handler when locale differs from cookie value. `Set-Cookie` with `Path=/`, `SameSite=Lax`.

**Context**: sets `locale` on `serverRequestContext` for downstream access via `LOCALE_KEY`.

**Route integration**: no URL rewriting needed. Default locale stripped via redirect (`/en-us/about` → `/about`). Non-default locales matched via `[[locale]]` optional route param in the route tree (e.g., `_root_/[[locale]]/products`). When locale is default, the `[[locale]]` segment is absent from the URL. When non-default (`/hr/products`), the route tree's `[[locale]]` node matches `hr`.

### Exports

```ts
LOCALE_KEY: "locale"; /* context key for serverRequestContext.get/set */
```

### Dependencies

- `@formatjs/intl-localematcher` — CLDR locale matching
- `isbot` — bot detection
- `negotiator` — Accept-Language parsing

## `staticAssets`

### Types

```ts
interface StaticAssetsConfig {
	paths: string[];
}
```

### Behavior

Serves static assets via Cloudflare's `ASSETS` binding.

- Paths ending with `/` → prefix match (e.g., `/assets/` matches `/assets/foo.js`)
- Paths without `/` → exact match (e.g., `/favicon.ico`)
- Pre-processes into `Set` (exact) and array (prefixes) for O(1)/O(n) lookup
- Returns `bypass` — static assets skip all response handlers
- Env must include `ASSETS: { fetch: typeof fetch }`

```ts
staticAssets({ paths: ["/assets/", "/favicon.ico"] });
```

## Test Cases

```
apiProxy:
  Matches pathPrefix → forwards to target
  No match → next
  enabled: false → next
  enabled: function → evaluated per request
  rewrite transforms path
  Custom headers added to proxied request
  Returns bypass

cdnProxy:
  Matches prefix → fetches from R2
  Missing object → 404 bypass
  Sets Cache-Control, Content-Type, ETag headers
  edgeCache: true → cache lookup before R2
  edgeCache: true → cache put via waitUntil
  No caches API → skips edge cache

htmlCache:
  GET only — POST/PUT pass through
  HTML path (no extension) → cached with html config
  File rule match → cached with file config
  Fresh hit → HIT status, no revalidation
  Stale hit → STALE status, background revalidation
  Expired → cache miss, stores after render
  skip regex → pass through
  x-skip-cache header → bypass cache read
  ?xskipcache=1 → bypass cache read
  Nonce extracted from cached HTML first 4KB
  Non-cacheable path → next

i18n:
  Path locale detected → used
  Cookie locale detected → used when no path locale
  Accept-Language → used when no cookie (first visit)
  Default locale in path → 302 redirect to strip it
  Non-default cookie + root path → 302 to /{locale}
  Invalid locale in path → 302 to fallback
  Case normalization: /EN-US → 302 to /en-us
  Bot → always defaultLocale
  Skip paths → defaultLocale, no redirect
  File extensions → defaultLocale, no redirect
  Cookie set via onResponse when locale changes
  CLDR matching handles script variants

staticAssets:
  Prefix path → ASSETS.fetch + bypass
  Exact path → ASSETS.fetch + bypass
  No match → next
```

## Notes

- `apiProxy`, `cdnProxy`, `staticAssets` return `bypass` — non-HTML responses skip response handler chain (CSP headers, etc.)
- `htmlCache` uses `respond` (not `bypass`) — cached HTML still needs response handlers for security headers (CSP nonce, etc.)
- `i18n` uses `bypass` for redirects — no body, no need for response handlers
- `apiProxy` typically local-dev only — production uses separate gateway worker
- `cdnProxy` eliminates cross-origin overhead vs direct R2 URLs
- `htmlCache` SWR pattern: always fast (serve stale), eventual consistency (background revalidate)
- `i18n` CLDR matching: `zh` matches `zh-Hans` not `zh-Hant`, `sr` matches `sr-Cyrl` not `sr-Latn`
- `LOCALE_KEY` exported so consumers can read locale from context: `serverRequestContext.get(LOCALE_KEY)`
