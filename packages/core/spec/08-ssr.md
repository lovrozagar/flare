# SSR

Layer 2. Depends on router-primitives (Location), errors (NotFoundError, UnauthenticatedError, UnauthorizedError), server-context (nonce), loader-pipeline (PipelineResult, PipelineMatch), defer (isDeferred).

Server-side rendering via Solid's `renderToStream`. Produces streaming HTML Response for initial page loads.

## Types

### SSRConfig

```ts
interface SSRConfig {
	auth: Auth | null;
	cause: LoaderCause;
	entryScript?: string;
	matches: PipelineMatch[];
	moduleScripts: string[];
	nonce: string;
	prefetch: boolean;
	queryClientGetter?: () => QueryClient;
	resolvedHead: HeadConfig;
	url: URL;
}
```

### FlareState

Serialized into `self.flare` for client hydration. Canonical shape defined in spec 25 (router-config).

```ts
interface FlareState {
	c: ContextState; /* dir, locale, router, theme */
	dk?: string[]; /* dynamic registry keys (spec 18) */
	e?: DevError[]; /* dev-only SSR errors for client overlay */
	m: FlareMatchState[]; /* matched routes */
	p: string; /* pathname */
	ph?: PerRouteHead[]; /* per-route head configs for client init */
	q?: QueryState[]; /* TanStack Query hydration (optional) */
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
	dir?: string;
	locale?: string;
	router?: SerializableRouterConfig; /* from createRouter(), spec 25 */
	theme?: string;
}

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

Single-char keys for bundle size.

### SSRResult

```ts
interface SSRResult {
	body: ReadableStream<Uint8Array>;
	headers: Record<string, string>;
	status: number;
}
```

## Exports

```ts
renderToStream(config: SSRConfig): SSRResult

serializeFlareState(state: FlareState): string
buildFlareStateScript(state: FlareState, nonce: string): string

mergeHeadConfigs(parent: HeadConfig | undefined, child: HeadConfig | undefined): HeadConfig
mergeResponseHeaders(parent: ResponseHeaders | undefined, child: ResponseHeaders | undefined): ResponseHeaders

renderHeadToHtml(head: HeadConfig, nonce: string): string
```

## Behavior

### `renderToStream`

1. **Clear scoped styles**: `clearScopedStyles()` (spec 30) — reset style registry for this request
2. **Build FlareState** from pipeline matches (strip deferred promises, preserve markers)
3. **Build component tree**: root layout → layouts → page via Outlet nesting, wrapped in `ErrorBoundaryWrapper` per depth (same as CSR, spec 17)
4. **Set SSR context** on `sharedConfig.context` directly (Solid SSR workaround)
5. **Call Solid's `renderToStream()`** with the component tree
6. **Collect scoped styles**: `getScopedStyles()` (spec 30) — all styles registered during render
7. **Transform stream**: inject scoped `<style id="__FLARE_SCOPED__">` into `</head>`, inject state script + module scripts after `</body>`
8. **Determine status** from match errors
9. **Build response headers**: Content-Type + resolved route headers + CSP

Returns `SSRResult` with streaming body, headers, and status code.

### Component Tree Construction

```
<FlareContext.Provider value={flareContext}>
  <NoHydration>
    <RootLayout props={rootProps}>
      <Hydration>
        <QueryClientProvider client={queryClient}>  {/* conditional: only when queryClientGetter provided */}
          <ErrorBoundaryWrapper match={layout1Match} depth={0}>
            <Layout1 props={layout1Props}>
              <ErrorBoundaryWrapper match={layout2Match} depth={1}>
                <Layout2 props={layout2Props}>
                  <ErrorBoundaryWrapper match={pageMatch} depth={2}>
                    <Page props={pageProps} />
                  </ErrorBoundaryWrapper>
                </Layout2>
              </ErrorBoundaryWrapper>
            </Layout1>
          </ErrorBoundaryWrapper>
        </QueryClientProvider>
      </Hydration>
    </RootLayout>
  </NoHydration>
</FlareContext.Provider>
```

`QueryClientProvider` wraps inside `<Hydration>` and outside `ErrorBoundaryWrapper` chain. Only present when `config.queryClientGetter` provided (spec 33). `queryClient` created per-request via `queryClientGetter()`.

- Same `ErrorBoundaryWrapper` as CSR (spec 17) — identical boundary walk-up logic for error/notFound/unauthorized on both SSR and client. Errors caught during SSR render are handled by the same boundary resolution chain.
- `<NoHydration>` wraps document shell (html, head, body). Prevents hydration markers on structural HTML elements.
- `<Hydration>` wraps app content inside root layout. Enables fine-grained hydration.
- `sharedConfig.context` set directly using symbol IDs from FlareContext/OutletContext — avoids Solid's SSR render-order issue (children render before parents).

### Render Props Assembly

Each route's render function receives its typed props:

```ts
{
  children,          /* layout/root only — nested route content */
  loaderData,        /* from pipeline match */
  location,          /* validated Location */
  preloaderContext,  /* route's snapshot */
}
```

### `serializeFlareState`

1. Walk FlareState, find `Deferred` values via `isDeferred()`, strip `promise` field
2. Convert to JSON string
3. Escape `</script>` → `<\/script>` (XSS prevention)
4. Return escaped JSON string

### `buildFlareStateScript`

Returns: `<script nonce="${nonce}">self.flare=${serializeFlareState(state)};</script>`

Injected at end of `<body>` before module scripts.

### `mergeHeadConfigs`

Merge strategy per field type:

| Strategy                                    | Fields                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| **Child overrides** (scalar)                | title, description, canonical, keywords, css                             |
| **Merge keys** (object, child wins per-key) | meta, openGraph, twitter, favicons, languages, robots                    |
| **Concatenate** (array)                     | images, jsonLd, custom.links, custom.meta, custom.scripts, custom.styles |

```
mergeHeadConfigs(undefined, child) → child
mergeHeadConfigs(parent, undefined) → parent
mergeHeadConfigs(undefined, undefined) → {}
```

### `mergeResponseHeaders`

Simple spread merge: child values override parent for same key. Different keys preserved.

```ts
mergeResponseHeaders(
  { "Cache-Control": "public", "X-Custom": "1" },
  { "Cache-Control": "no-store" },
)
→ { "Cache-Control": "no-store", "X-Custom": "1" }
```

### `renderHeadToHtml`

Converts resolved `HeadConfig` to HTML string for `<head>`:

| HeadConfig field                | HTML output                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `title`                         | `<title>text</title>`                                                          |
| `description`                   | `<meta name="description" content="...">`                                      |
| `canonical`                     | `<link rel="canonical" href="...">`                                            |
| `keywords`                      | `<meta name="keywords" content="...">`                                         |
| `robots`                        | `<meta name="robots" content="index,follow,...">`                              |
| `meta.viewport`                 | `<meta name="viewport" content="...">`                                         |
| `meta.charset`                  | `<meta charset="...">`                                                         |
| `meta.author`                   | `<meta name="author" content="...">`                                           |
| `meta.manifest`                 | `<link rel="manifest" href="...">`                                             |
| `meta.appleMobileWebAppCapable` | `<meta name="apple-mobile-web-app-capable" content="...">`                     |
| `meta.*` (other)                | `<meta name="..." content="...">`                                              |
| `favicons.ico`                  | `<link rel="icon" href="..." sizes="any">`                                     |
| `favicons.svg`                  | `<link rel="icon" type="image/svg+xml" href="...">`                            |
| `favicons.appleTouchIcon`       | `<link rel="apple-touch-icon" href="...">`                                     |
| `favicons["96x96"]`             | `<link rel="icon" type="image/png" sizes="96x96" href="...">`                  |
| `favicons["192x192"]`           | `<link rel="icon" type="image/png" sizes="192x192" href="...">`                |
| `favicons["512x512"]`           | `<link rel="icon" type="image/png" sizes="512x512" href="...">`                |
| `images`                        | `<meta property="og:image" ...>` per image                                     |
| `openGraph.title`               | `<meta property="og:title" content="...">`                                     |
| `openGraph.description`         | `<meta property="og:description" content="...">`                               |
| `openGraph.type`                | `<meta property="og:type" content="...">`                                      |
| `openGraph.url`                 | `<meta property="og:url" content="...">`                                       |
| `openGraph.siteName`            | `<meta property="og:site_name" content="...">`                                 |
| `openGraph.locale`              | `<meta property="og:locale" content="...">`                                    |
| `openGraph.alternateLocale`     | `<meta property="og:locale:alternate" content="...">` per locale               |
| `openGraph.images`              | `<meta property="og:image" ...>` per image (overrides top-level images for OG) |
| `openGraph.videos`              | `<meta property="og:video" ...>` per video                                     |
| `openGraph.audio`               | `<meta property="og:audio" ...>` per audio                                     |
| `twitter.card`                  | `<meta name="twitter:card" content="...">`                                     |
| `twitter.site`                  | `<meta name="twitter:site" content="...">`                                     |
| `twitter.creator`               | `<meta name="twitter:creator" content="...">`                                  |
| `twitter.title`                 | `<meta name="twitter:title" content="...">`                                    |
| `twitter.description`           | `<meta name="twitter:description" content="...">`                              |
| `twitter.images`                | `<meta name="twitter:image" ...>` per image                                    |
| `languages`                     | `<link rel="alternate" hreflang="key" href="value">` per entry                 |
| `jsonLd`                        | `<script type="application/ld+json" nonce="...">JSON</script>` per Thing       |
| `css`                           | `<link rel="stylesheet" href="...">`                                           |
| `custom.links`                  | `<link ...attributes>` per entry                                               |
| `custom.meta`                   | `<meta ...attributes>` per entry                                               |
| `custom.scripts`                | `<script nonce="..." ...attributes>children</script>` per entry                |
| `custom.styles`                 | `<style nonce="...">children</style>` per entry                                |

All `<script>` and `<style>` tags get `nonce` attribute. Output order matches table order.

### Script Injection

Injected at end of `<body>` via stream transform:

1. **Flare state**: `<script nonce="...">self.flare={...};</script>`
2. **Entry script** (dev only): `<script nonce="..." type="module" src="/@flare/entry"></script>`
3. **Module scripts**: `<script nonce="..." type="module" src="..."></script>` per client bundle

### Status Derivation

From pipeline match results:

| Condition                            | Status                                         |
| ------------------------------------ | ---------------------------------------------- |
| Any match has `RedirectResponse`     | N/A — handler intercepts before renderToStream |
| Any match has `UnauthenticatedError` | 401                                            |
| Any match has `UnauthorizedError`    | 403                                            |
| Any match has `NotFoundError`        | 404                                            |
| Any match has other error            | 500                                            |
| All success                          | 200                                            |

Priority order: 401 > 403 > 404 > 500 > 200 (redirects handled at handler level, never reach renderToStream)

### Response Headers

```ts
{
  "Content-Type": "text/html; charset=utf-8",
  ...resolvedRouteHeaders,     /* from pipeline phase 6 */
  ...cspHeaders,               /* Content-Security-Policy with nonce */
}
```

CSP constructed from nonce: `script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';` (exact directives configurable via handler config).

## Test Cases

```
renderToStream:
  Minimal page → SSRResult with body stream, status 200, Content-Type header
  Page with loader data → self.flare.m[0].d contains serialized loader data
  Page with deferred → self.flare.m[0].d has markers (__deferred, key), promise stripped
  Multiple matches (root + layout + page) → nested component tree, 3 entries in self.flare.m
  All matches have headConfig → resolvedHead rendered in <head>
  Module scripts → <script type="module" nonce="..."> tags at end of body
  Nonce → every <script> and <style> has nonce attribute
  Error in one loader → status 500, error boundary component rendered (same ErrorBoundaryWrapper as CSR)
  NotFoundError → status 404
  No matches errored → status 200
  clearScopedStyles called before render → fresh style registry per request
  Components using styles() → CSS collected via getScopedStyles()
  Scoped styles injected as <style id="__FLARE_SCOPED__"> in </head>

serializeFlareState:
  Serializes to JSON string
  Escapes </script> → <\/script>
  Preserves deferred markers: { __deferred: true, key: "x" }
  Strips promise field from deferred values
  Handles nested deferred: { a: { b: Deferred } }
  Empty state → valid JSON

buildFlareStateScript:
  Returns <script> with nonce attribute
  Contains self.flare = ...
  State is serialized inside script

mergeHeadConfigs:
  undefined + child → child
  parent + undefined → parent
  undefined + undefined → {}
  Scalar override: { title: "App" } + { title: "Page" } → { title: "Page" }
  Object merge: { meta: { a: "1" } } + { meta: { b: "2" } } → { meta: { a: "1", b: "2" } }
  Object override: { meta: { a: "1" } } + { meta: { a: "2" } } → { meta: { a: "2" } }
  Array concat: { images: [a] } + { images: [b] } → { images: [a, b] }
  jsonLd concat: { jsonLd: thing1 } + { jsonLd: thing2 } → { jsonLd: [thing1, thing2] }
  Custom concat: { custom: { links: [l1] } } + { custom: { links: [l2] } } → { custom: { links: [l1, l2] } }
  robots merge: { robots: { index: true } } + { robots: { follow: false } } → { robots: { index: true, follow: false } }
  Partial child: { title: "A", description: "B" } + { title: "C" } → { title: "C", description: "B" }

mergeResponseHeaders:
  undefined + child → child
  parent + undefined → parent
  Same key → child overrides: { "X": "1" } + { "X": "2" } → { "X": "2" }
  Different keys → both kept: { "X": "1" } + { "Y": "2" } → { "X": "1", "Y": "2" }
  Case-sensitive: "Content-Type" and "content-type" are different keys

renderHeadToHtml:
  title → <title>text</title>
  description → <meta name="description" content="text">
  robots { index: true, follow: false } → <meta name="robots" content="index,nofollow">
  robots { index: false } → <meta name="robots" content="noindex">
  robots { noarchive: true } → <meta name="robots" content="noarchive">
  robots { noimageindex: true } → <meta name="robots" content="noimageindex">
  robots { "max-snippet": 150 } → <meta name="robots" content="max-snippet:150">
  robots { "max-image-preview": "large" } → <meta name="robots" content="max-image-preview:large">
  meta.viewport: false → no viewport meta emitted (suppress default)
  openGraph.title → <meta property="og:title" content="text">
  twitter.card → <meta name="twitter:card" content="summary">
  jsonLd single → <script type="application/ld+json" nonce="n">{"@type":"..."}</script>
  jsonLd array → multiple <script> tags
  favicons.svg → <link rel="icon" type="image/svg+xml" href="/icon.svg">
  favicons.ico → <link rel="icon" href="/favicon.ico" sizes="any">
  languages → <link rel="alternate" hreflang="en" href="/en"> per entry
  css → <link rel="stylesheet" href="/styles.css">
  custom.links → <link> with all attributes
  custom.scripts → <script nonce="n"> with attributes and children
  Empty head → empty string
  All tags properly escaped (no XSS via attribute injection)

Status derivation:
  All success → 200
  One NotFoundError → 404
  One UnauthenticatedError → 401
  One UnauthorizedError → 403
  Mixed errors → highest priority wins (401 > 403 > 404 > 500)
  RedirectResponse → handler intercepts before renderToStream, returns HTTP 3xx directly
```

## Notes

- Uses Solid's `renderToStream()` (not `renderToStringAsync`) for streaming from day 1
- `sharedConfig.context` set directly via symbol IDs — Solid SSR renders children before parents, so Provider-based context doesn't work for SSR
- `<NoHydration>` / `<Hydration>` from solid-js/web control hydration marker placement
- `self.flare` is a global assignment — accessible immediately on client, no DOM query needed
- Deferred values in FlareState are markers only — actual data streams via NDJSON after initial HTML (CSR nav). During SSR, Solid's `renderToStream` handles deferred resolution via its built-in streaming Suspense: if a deferred promise resolves while the HTML stream is still open, Solid inlines the resolved content as a `<script>` chunk appended to the stream. The HTML stream stays open until all Suspense boundaries resolve. Flare does not need a separate SSR delivery mechanism — Solid's streaming handles it.
- `css` field is a URL string for external stylesheet, NOT inline CSS content
- TanStack Query state serialized in `FlareState.q` when query client provided (spec 33)
- `FlareState.e` carries dev-only SSR errors to client `devErrorStore` for overlay (spec 37)
- `FlareState.ph` carries per-route heads for client `initRouteHierarchy` (spec 27)
- Head merge runs sequentially: root → layouts (nesting order) → page
- `mergeHeadConfigs` and `mergeResponseHeaders` are pure functions, also used by NDJSON layer for CSR nav
- Redirects short-circuit SSR — handler detects redirect in pipeline results and returns HTTP 3xx before rendering
- Scoped styles (spec 30) integrated via `clearScopedStyles()` before render + `getScopedStyles()` after render. `clearScopedStyles` isolates per-request style state (Cloudflare Workers run concurrent requests in same isolate). Collected styles injected as `<style id="__FLARE_SCOPED__">` in `</head>` via stream transform.
- SSR uses same `ErrorBoundaryWrapper` as CSR (spec 17) — identical boundary walk-up for error/notFound/unauthorized. No separate SSR-only boundary resolution.
