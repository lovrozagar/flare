# HTTP Caching, Headers & Dev/Prod Parity

## Overview

Two-phase spec:

1. **Phase 1 — Runtime HTTP headers** (Vary, ETag, 304) — production correctness gaps
2. **Phase 2 — Dev/prod parity** — caching simulation, DX features, config surface

---

## Phase 1: Runtime HTTP Headers

### Problem

Flare has critical gaps in standard HTTP caching headers:

| Header                | Current State                       | Impact                                       |
| --------------------- | ----------------------------------- | -------------------------------------------- |
| `Vary`                | **Never set** on any response       | CDNs serve wrong content (HTML vs NDJSON)    |
| `ETag`                | **Never set** on SSG/ISR/SSR-cached | No conditional request support               |
| `If-None-Match` → 304 | **No handling**                     | Always sends full response even if unchanged |
| `Vary` user config    | **No option** in `cdn` config       | Users can't control Vary per-route           |

### Why This Is Critical

**The `Vary: flare-data` problem:** Flare differentiates HTML and NDJSON responses by the `flare-data` request header. Same URL → two completely different response bodies. Without `Vary: flare-data`, a CDN caches the first response (say HTML) and serves it for NDJSON requests too. SPA navigation breaks.

**ETag on store-served responses:** SSG, ISR cache hits, and SSR cache hits have deterministic content (served from store, not streaming). An ETag lets browsers and CDNs skip re-downloading unchanged content (304 Not Modified). Streaming responses (uncached SSR, NDJSON) can't have ETags — chunks are sent before the full body exists.

### Current Code Audit

**`server-handler/index.ts`** — `SECURITY_HEADERS`:

- Sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- No `Vary` anywhere

**`loader-pipeline/index.ts`** — `buildCdnCacheHeaders`:

- Builds `Cache-Control` from `cdn: { maxAge, swr, private }` config
- Builds `Surrogate-Key` from `cdn.tags`
- No `Vary` output, no `ETag`

**`server-handler/index.ts`** — response construction:

- HTML responses: no `ETag`, no `Vary`
- NDJSON responses: no `ETag`, no `Vary`
- Static file serving: no `ETag` (R2 assets have their own ETag via CF)

**`route-builder/types.ts`** — `CdnCacheConfig`:

- `maxAge`, `private`, `swr`, `tags`
- No `vary` option

### Design

#### 1. Auto-set `Vary: flare-data`

Every response from the server handler must include `Vary: flare-data`. This is non-negotiable — flare's NDJSON protocol requires it.

```ts
/* In SECURITY_HEADERS or applied separately */
headers.set("Vary", "flare-data");
```

If user adds custom Vary values, they're appended: `Vary: flare-data, Accept-Language`.

#### 2. User-configurable `cdn.vary`

Add `vary` to `CdnCacheConfig`:

```ts
interface CdnCacheConfig {
	maxAge: number;
	private?: boolean;
	swr?: number;
	tags?: string[];
	vary?: string[]; /* NEW — additional Vary header values */
}
```

Usage:

```ts
.cache({
  cdn: { maxAge: 3600, vary: ["Accept-Language", "Cookie"] }
})
```

Result: `Vary: flare-data, Accept-Language, Cookie`

`flare-data` is always included automatically — users don't need to add it.

#### 3. ETag on store-served responses

ETag only applies to responses served from the store — never to streaming responses.

| Response type                  | ETag? | Why                                                |
| ------------------------------ | ----- | -------------------------------------------------- |
| SSG (prerendered)              | YES   | Content fully known at prerender time, hash once   |
| ISR cache hit                  | YES   | Content cached in store, hash at cache-write time  |
| SSR with `.cache({ ssr })` hit | NO    | Only loader data is cached, HTML is still streamed |
| SSR uncached (streaming)       | NO    | Chunks sent before full body exists, can't hash    |
| NDJSON (streaming)             | NO    | Same streaming constraint                          |

No config option needed — always-on for store-served, absent for streaming. Zero downsides.

**Weak ETag required:** Flare stores HTML with a nonce placeholder (`NONCE_PLACEHOLDER`) and replaces it with a per-request CSP nonce at serve time. The actual bytes differ per request despite identical content. Weak ETag (`W/"hash"`) is correct — it signals semantic equivalence while allowing byte differences (RFC 9110 §8.8.1). Weak comparison works for conditional GET (RFC 9110 §8.8.3.2).

```ts
/* When writing to store (SSG prerender, ISR cache, SSR cache) */
const etag = `W/"${await computeEtag(body)}"`;
/* Hash the stored content (with placeholder, before nonce swap) */

/* When serving from store */
headers.set("ETag", etag);
```

Hash function: Web Crypto `SHA-256` truncated to 16 hex chars. Fast, collision-resistant enough for cache validation.

**Deferred loaders:** ETag covers the initial HTML shell only. Deferred data streams in separately after initial load — it's a distinct mechanism. A page with deferred loaders that opt out of cache still gets a valid ETag for the cached HTML skeleton. The deferred data runs fresh on each request regardless.

#### 4. `If-None-Match` → 304 handling

Before sending a cached response, check `If-None-Match`:

```ts
const ifNoneMatch = request.headers.get("If-None-Match");
/* Weak comparison: strip W/ prefix for matching (RFC 9110 §8.8.3.2) */
if (ifNoneMatch && weakMatch(ifNoneMatch, etag)) {
	return new Response(null, { status: 304, headers });
}
```

304 responses include the same headers (Vary, ETag, Cache-Control) but no body.

### Implementation Files

| File                                           | Action                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `flare/src/server-handler/index.ts`            | MODIFY — add `Vary: flare-data` to all responses, add 304 handling for cached pages |
| `flare/src/loader-pipeline/index.ts`           | MODIFY — `buildCdnCacheHeaders` outputs Vary from `cdn.vary` config                 |
| `flare/src/route-builder/types.ts`             | MODIFY — add `vary?: string[]` to `CdnCacheConfig`                                  |
| `flare/src/server-handler/etag.ts`             | CREATE — `computeEtag(body)`, `handleConditionalRequest(req, etag, headers)`        |
| `flare/tests/unit/server-handler/etag.test.ts` | CREATE — unit tests                                                                 |
| `flare/tests/unit/server-handler/vary.test.ts` | CREATE — Vary header assembly tests                                                 |

### Test Cases

**Vary:**

- Every HTML response has `Vary: flare-data`
- Every NDJSON response has `Vary: flare-data`
- Route with `cdn.vary: ["Accept-Language"]` → `Vary: flare-data, Accept-Language`
- Multiple Vary values don't duplicate `flare-data`

**ETag:**

- SSG page response has `ETag` header
- ISR cache hit has `ETag` header
- SSR with `.cache({ ssr })` has NO `ETag` (only loader data cached, HTML streamed)
- SSR uncached (streaming) has NO `ETag`
- NDJSON (streaming) has NO `ETag`
- ETag is deterministic (same content = same ETag)

**304:**

- Request with matching `If-None-Match` → 304, no body
- Request with non-matching `If-None-Match` → 200, full body
- 304 response includes `Vary`, `ETag`, `Cache-Control` headers
- Request without `If-None-Match` → 200 (no conditional)

---

## Phase 2: Dev/Prod Parity

### Problem

Most frameworks have significant behavioral differences between dev and production. This causes deploy surprises and makes it impossible to test production behavior during development. Flare should minimize these gaps and offer best-in-class DX features.

### Framework Comparison: Dev vs Prod Differences

#### Next.js

| Behavior                | Dev                                 | Prod                                   | Problem                             |
| ----------------------- | ----------------------------------- | -------------------------------------- | ----------------------------------- |
| SSG / Static Generation | Every request SSR'd, never cached   | Prerendered at build, served static    | Can't test cache behavior           |
| ISR revalidation        | `getStaticProps` runs every request | Stale-while-revalidate with timer      | Can't test revalidation             |
| Full Route Cache        | Disabled, pages always dynamic      | Static pages cached on server          | Hidden caching bugs                 |
| Link prefetching        | Disabled entirely                   | Auto-prefetch on viewport intersection | Can't test prefetch UX              |
| Router Cache            | No caching of visited routes        | 5min static, 30s dynamic               | Navigation feels different          |
| `dynamicParams: false`  | NOT enforced — all paths render     | Enforced — unlisted paths 404          | Deploy surprise: pages suddenly 404 |
| CSP headers             | Blanket relaxed policy              | Strict user-configured policy          | Security testing impossible         |
| Error overlay           | Dev error overlay                   | Production error boundary              | Expected                            |

Next.js 16 additions: Turbopack stable (default bundler), React Compiler (`reactCompiler: true` for auto-memoization), `use cache` directive for explicit caching, filesystem caching for Turbopack between restarts, improved dev logging split into Compile + Render timing.

#### TanStack Start

| Behavior                | Dev                                 | Prod                              | Problem                             |
| ----------------------- | ----------------------------------- | --------------------------------- | ----------------------------------- |
| Static Prerendering     | Not run (build-time only)           | Crawl-based prerender at build    | Can't test prerender                |
| Static Server Functions | Run live on each request            | Cached as static JSON at build    | Different execution model           |
| ISR                     | Uses HTTP cache headers (CDN-based) | Same headers, CDN actually caches | Dev has no CDN — headers do nothing |
| Prefetching             | Works (Vite HMR compatible)         | Works                             | OK                                  |
| Cache headers           | Emitted but ignored (no CDN)        | CDN respects `s-maxage`, SWR      | False sense of caching in dev       |

TanStack Start's ISR is purely HTTP header-based — no framework-level store. Elegant but dev literally cannot test caching without a CDN proxy. Unique strengths: fully type-safe routing at compile time, unified devtools panel, server functions replace TRPC/GraphQL/REST, composable typed middleware.

#### Remix / React Router 7

| Behavior            | Dev                                          | Prod                                   | Problem                    |
| ------------------- | -------------------------------------------- | -------------------------------------- | -------------------------- |
| Loader caching      | No caching, loaders run every request        | Cache-Control headers respected by CDN | Can't test caching locally |
| Prefetching         | Works (hover/intent-based)                   | Works                                  | OK                         |
| Headers             | Emitted but CDN strips them in `netlify dev` | CDN respects them                      | Dev headers are lies       |
| Static prerendering | N/A — SSR-first                              | N/A                                    | N/A                        |
| Error boundaries    | Works same                                   | Works same                             | OK                         |

Unique strengths: composable middleware with `next()` pattern (before + after handlers), route-level error boundaries, loader/action colocation, intent-based prefetching (hover, focus, touch).

#### Nuxt

| Behavior         | Dev                                                          | Prod                 | Problem                |
| ---------------- | ------------------------------------------------------------ | -------------------- | ---------------------- |
| Prerender        | Route rules with `prerender: true` work in dev               | Build-time prerender | GOOD — dev/prod parity |
| SWR / ISR        | Payload extraction works in dev with `swr`/`isr` route rules | CDN-level caching    | GOOD — partial parity  |
| Hybrid rendering | `routeRules` respected in dev                                | Same                 | OK                     |
| Prefetching      | Works (preloads payloads)                                    | Works                | OK                     |

Nuxt is the best of the bunch for dev/prod parity. Closest to true parity.

##### Nuxt Unique DX Features (evaluate for Flare)

| Feature                       | What it does                                                                                       | Flare equivalent?                | Should Flare have it?                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------- |
| **DevTools UI**               | In-browser panel: routes, components, composables, modules, plugins, hooks timeline, virtual files | No                               | CONSIDER — lightweight version                       |
| **Component Inspector**       | Click element in browser -> jump to source file:line in editor                                     | No                               | YES — high value, low effort                         |
| **SSR Log Replay**            | Server-side `console.log` replayed in browser console tagged `[ssr]`                               | No (has server log transport)    | CONSIDER — already have server logs infra            |
| **Route Groups in Meta**      | Route groups `(auth)` exposed in `page.meta` for middleware checks                                 | Partial (groups in virtual path) | EVALUATE                                             |
| **Middleware via routeRules** | Enforce/disable middleware per URL pattern in config                                               | Via route chain                  | DIFFERENT — flare uses route-level, not config-level |
| **Layout via routeRules**     | Set layouts per URL pattern in config                                                              | Via filesystem convention        | DIFFERENT — flare convention > config                |
| **Module Marketplace**        | Install modules from DevTools UI                                                                   | No                               | NO — not relevant for flare's scope                  |
| **Virtual Files Viewer**      | Inspect generated virtual modules in DevTools                                                      | No                               | CONSIDER — useful for debugging gen files            |
| **Payload Extraction in Dev** | ISR/SWR payloads (`.json`) generated in dev mode                                                   | No                               | YES — part of `staticCache` plan                     |
| **Hook Performance Timeline** | Track time spent in each hook/composable                                                           | No                               | CONSIDER — useful for loader perf                    |

#### SvelteKit

| Behavior     | Dev                 | Prod                          | Problem                       |
| ------------ | ------------------- | ----------------------------- | ----------------------------- |
| Prerendering | Not run in dev      | Run at build time via adapter | Can't test prerender behavior |
| Caching      | No caching in dev   | Adapter-dependent             | Different behavior            |
| Prefetching  | Works (hover-based) | Works                         | OK                            |

Docs explicitly warn: "do performance testing in preview mode after build."

##### SvelteKit Unique Features (evaluate for Flare)

| Feature                | What it does                                                         | Flare equivalent?          | Should Flare have it?                |
| ---------------------- | -------------------------------------------------------------------- | -------------------------- | ------------------------------------ |
| **Adapter System**     | Same codebase deploys to Node, serverless, edge, static via adapters | Cloudflare-first           | DIFFERENT — flare is opinionated     |
| **`handleFetch` hook** | Intercept/modify server-side fetch calls                             | No                         | CONSIDER — useful for mocking in dev |
| **`handle` hook**      | Intercept every request, modify response, bypass framework           | Middleware                 | ALREADY HAVE                         |
| **Snapshot**           | Preserve component state across navigations (scroll, form inputs)    | No                         | CONSIDER                             |
| **Shallow routing**    | Update URL without running loaders                                   | YES — `shallow` navigation | ALREADY HAVE                         |

#### Astro

| Behavior           | Dev                                       | Prod                          | Problem                    |
| ------------------ | ----------------------------------------- | ----------------------------- | -------------------------- |
| Static pages (SSG) | Rendered on each request                  | Pre-built as static HTML      | Can't test static behavior |
| SSR pages          | Rendered on each request                  | Same                          | OK                         |
| Hybrid mode        | `prerender` flag respected but not cached | Static files served from disk | Dev is always dynamic      |
| Cache headers      | Can set per-page, but no CDN in dev       | CDN caches based on headers   | Headers do nothing in dev  |

##### Astro 6 (Beta, 2026) — Notable

Astro 6 is doing what Flare already does: Vite Environment API + workerd runtime in dev for true dev/prod parity. Their dev server now runs inside the same runtime as production (Cloudflare Workers). Flare already has this via Cloudflare's Vite plugin.

##### Astro Unique Features (evaluate for Flare)

| Feature                  | What it does                                         | Flare equivalent?       | Should Flare have it?                   |
| ------------------------ | ---------------------------------------------------- | ----------------------- | --------------------------------------- |
| **Content Collections**  | Type-safe Markdown/MDX with Zod schemas              | No                      | NO — different use case (content sites) |
| **View Transitions**     | Built-in browser-native View Transition API          | YES — ViewTransitionCSS | ALREADY HAVE                            |
| **Islands Architecture** | Ship zero JS, selective hydration per component      | No — full hydration     | NO — different paradigm                 |
| **Dev Toolbar**          | In-browser toolbar for dev utilities                 | Partial (error overlay) | CONSIDER                                |
| **`Astro.cache`**        | Per-route server-side response caching in middleware | Via ISR store           | SIMILAR                                 |
| **Partitioned Cookies**  | First-party cookie partitioning support              | No                      | NICE-TO-HAVE                            |

### Flare Current State

| Behavior                          | Flare Dev                                          | Flare Prod                              | Parity?  |
| --------------------------------- | -------------------------------------------------- | --------------------------------------- | -------- |
| SSG prerender                     | Skipped                                            | Runs in `closeBundle` -> `dist/static/` | NO       |
| ISR store                         | No store -> always SSR                             | KV store -> stale-while-revalidate      | NO       |
| Param validation (`staticParams`) | Runs (enforced)                                    | Runs (enforced)                         | YES      |
| Link prefetching                  | Works (same as prod)                               | Works                                   | YES      |
| CSP headers                       | Auto-injects HMR directives, preserves user config | Strict user config                      | YES      |
| Loader execution                  | Same pipeline                                      | Same pipeline                           | YES      |
| Runtime (workerd)                 | Same runtime via CF Vite plugin                    | Same                                    | YES      |
| Dev error overlay                 | Shown                                              | Hidden                                  | Expected |
| Style validation                  | Extra dev checks                                   | Skipped                                 | Expected |

### Scorecard Summary

| Feature                  | Next    | TanStack | Remix   | Nuxt    | SvelteKit | Astro 6 | **Flare (now)** | **Flare (planned)** |
| ------------------------ | ------- | -------- | ------- | ------- | --------- | ------- | --------------- | ------------------- |
| SSG in dev               | NO      | NO       | N/A     | YES     | NO        | NO      | NO              | **YES**             |
| ISR in dev               | NO      | NO       | NO      | PARTIAL | NO        | NO      | NO              | **YES**             |
| Prefetch in dev          | NO      | YES      | YES     | YES     | YES       | N/A     | **YES**         | **YES**             |
| Param validation in dev  | NO      | N/A      | N/A     | N/A     | N/A       | N/A     | **YES**         | **YES**             |
| CSP parity               | NO      | N/A      | N/A     | N/A     | N/A       | N/A     | **YES**         | **YES**             |
| Cache headers in dev     | NO      | EMITTED  | EMITTED | YES     | NO        | EMITTED | NO              | **YES**             |
| Runtime parity (workerd) | NO      | NO       | NO      | NO      | NO        | YES     | **YES**         | **YES**             |
| Vary/ETag/304            | PARTIAL | NO       | NO      | NO      | NO        | NO      | **NO**          | **YES**             |
| Component inspector      | NO      | NO       | NO      | YES     | NO        | NO      | NO              | **CONSIDER**        |
| Dev toolbar / DevTools   | NO      | PARTIAL  | NO      | YES     | NO        | PARTIAL | NO              | **CONSIDER**        |

### Features to Implement

#### Priority 1 — Dev Caching (the `FileSystemStore` plan)

`FileSystemStore` in `.flare/cache/`, SSG prerender on dev start, ISR cache on first hit, HMR-aware invalidation. This puts Flare ahead of everything except Nuxt (which only has partial ISR).

#### Priority 2 — CDN Simulator

Local CDN simulation. Reads `Cache-Control` headers from responses, caches full responses in `.flare/cache/cdn/`. Adapter fn for status headers. No framework does this — first of its kind.

#### Priority 3 — Component Inspector

**From Nuxt.** Click any element in browser -> opens source file:line in editor. High developer impact, relatively low implementation cost.

How it works: injects `data-source` attributes during SSR in dev mode with `file:line:col`, click handler in dev overlay resolves to `/__open-in-editor?file=...` endpoint that triggers editor protocol.

Vite already has `/__open-in-editor` support built in. Flare just needs to:

1. Inject source location attributes during JSX transform (dev only)
2. Add click handler in dev overlay (Ctrl+click or toggle mode)

#### Priority 4 — SSR Log Replay

**From Nuxt.** Server-side `console.log` during SSR appears in browser console tagged `[ssr]`.

Flare already has server log transport infrastructure (`serverLogs` config, `getServerLogs()`). The gap is replaying them in the browser console. Could piggyback on the NDJSON stream or inject as a `<script>` in the HTML.

#### Priority 5 — Server-Timing Headers

Zero-UI performance insights. `Server-Timing` header with loader/middleware execution times. Chrome DevTools natively renders it in the Network tab.

#### Priority 6 — Dev Toolbar (future)

**From Nuxt/Astro.** In-browser floating panel with:

- Route info (current match, params, layouts)
- Cache status (HIT/MISS/STALE for current page)
- Loader timing
- Virtual files viewer (generated routes)
- Component inspector toggle

This is a larger effort. Could start minimal (route info + cache status) and expand.

### Not Adopting

| Feature                           | Why not                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| Astro Islands / partial hydration | Different paradigm — Flare does full hydration with SolidJS |
| Astro Content Collections         | Content site concern — out of scope                         |
| Nuxt Module Marketplace           | Package management concern — not framework                  |
| SvelteKit Adapter System          | Flare is Cloudflare-first by design                         |
| TanStack unified devtools panel   | Nice but TanStack-ecosystem-specific                        |

### Dev Config

```ts
flare({
	dev: {
		/**
		 * Dev caching behavior. Controls all server-side cache layers.
		 * true = all on (static + loader), false = all off, or granular object.
		 * @default true
		 */
		cache: {
			/**
			 * SSG prerender + ISR page cache.
			 * SSG: prerendered to .flare/cache/ on dev startup.
			 * ISR: cached after first render, stale-while-revalidate.
			 * HMR invalidates affected entries.
			 * @default true
			 */
			static: true,

			/**
			 * SSR per-loader store cache (.cache({ ssr: { staleTime, ttl } })).
			 * Uses same FileSystemStore as static cache.
			 * @default true
			 */
			loader: true,

			/**
			 * Local CDN cache simulation.
			 * Reads Cache-Control headers from responses, caches in .flare/cache/cdn/,
			 * serves on cache hit. No framework does this — first of its kind.
			 *
			 * false = off (default).
			 * true = on with default X-flare-cache header.
			 * { headers } = on with custom status header mapping.
			 *
			 * @default false
			 */
			cdn: false as
				| boolean
				| {
						/**
						 * Map simulator cache state to CDN status response headers.
						 * Flare provides the facts — you decide what headers to emit,
						 * matching whatever CDN you deploy behind.
						 *
						 * The Cache-Control header is already on the response (built by
						 * flare from .cache({ cdn: { maxAge, swr } })). This callback
						 * only adds the status headers the CDN would add in prod.
						 */
						headers: (event: {
							age: number;
							cacheControl: string;
							fresh: boolean;
							hit: boolean;
							revalidating: boolean;
							swr: boolean;
						}) => Record<string, string>;
				  },
		},

		/**
		 * Enforce SSG/ISR param validation (dynamicParams: false -> 404).
		 * true = dev matches prod behavior (default).
		 * false = all params allowed in dev (Next.js behavior).
		 * @default true
		 */
		staticParams: true,

		/**
		 * Show dev error overlay on unhandled errors.
		 * @default true
		 */
		errorOverlay: true,

		/**
		 * Component inspector — Ctrl+click element to open source in editor.
		 * Injects data-source attributes during dev SSR.
		 * Uses Vite's built-in /__open-in-editor endpoint.
		 * @default true
		 */
		inspector: true,

		/**
		 * Emit Server-Timing headers with loader/middleware execution times.
		 * Visible in Chrome DevTools Network tab — zero custom UI.
		 * @default true
		 */
		serverTiming: true,
	},
});
```

#### Shorthand forms

```ts
dev: {
	cache: true;
} /* static + loader on, cdn off (default) */
dev: {
	cache: false;
} /* all caching off */
dev: {
	cache: {
		cdn: true;
	}
} /* all on including cdn with X-flare-cache header */
dev: {
	cache: {
		cdn: cfHeaders;
	}
} /* all on, cdn with CF-style headers */
dev: {
	cache: {
		static: false;
	}
} /* loader on, static off (fast startup, test loader logic) */
```

#### CDN header adapter examples

```ts
/* Cloudflare-style headers */
import { cfHeaders } from "@lovrozagar/flare/cdn";
/* Equivalent to: */
const cfHeaders = (e) => ({
	Age: String(e.age),
	"CF-Cache-Status": !e.hit
		? "MISS"
		: e.revalidating
			? "UPDATING"
			: !e.fresh && e.swr
				? "STALE"
				: e.fresh
					? "HIT"
					: "EXPIRED",
});

/* Fastly-style headers */
const fastlyHeaders = (e) => ({
	Age: String(e.age),
	"X-Cache": e.hit ? "HIT" : "MISS",
});

/* Vercel-style headers */
const vercelHeaders = (e) => ({
	Age: String(e.age),
	"x-vercel-cache": !e.hit ? "MISS" : !e.fresh && e.swr ? "STALE" : "HIT",
});
```

These are convenience exports from `flare/cdn` — not core framework code. Users can write their own. Flare provides the cache state facts (`hit`, `fresh`, `swr`, `age`, `revalidating`, `cacheControl`), user decides the headers.

#### CSP in dev

Not a config option. Flare auto-injects HMR directives (`ws://localhost:*`, `http://localhost:*`, `unsafe-inline`, `unsafe-eval`) additively into the user's CSP config. User directives are always preserved — no blanket "relaxed" replacement. Strictly internal.

### Caching Architecture

#### Three cache layers, one FileSystemStore

In prod, each layer uses its own backing store:

- `static` (SSG/ISR) → KV store or `dist/static/` files
- `loader` (SSR cache) → KV store
- `cdn` → real CDN (Cloudflare, Fastly, etc.)

In dev, `FileSystemStore` replaces all three:

- `static` → `.flare/cache/static/`
- `loader` → `.flare/cache/loader/`
- `cdn` → `.flare/cache/cdn/`

Same `Store` interface for static + loader. CDN simulator is a thin middleware layer that reads `Cache-Control` headers and caches full responses.

#### How the CDN simulator works

**On response (after SSR, before sending to client):**

1. Read `Cache-Control` from response headers (already built by flare from `.cache({ cdn: { maxAge, swr } })`)
2. Parse `s-maxage` > `max-age`, `stale-while-revalidate`, `private`, `no-store`
3. If cacheable → write to `.flare/cache/cdn/{url-hash}.json` with `{ body, headers, storedAt, maxAge, swr }`
4. Call `headers()` adapter with `{ hit: false, ... }` → add status headers (e.g. `X-flare-cache: MISS`)

**On request (before SSR):**

1. Hash URL + `Vary` header values → cache key
2. Check `.flare/cache/cdn/{key}.json`
3. If fresh → serve from cache, call adapter with `{ hit: true, fresh: true }`
4. If stale + within SWR → serve stale, trigger background re-render, call adapter with `{ hit: true, swr: true, revalidating: true }`
5. If expired/missing → pass through to SSR

~100 lines of code. Standard HTTP cache semantics.

#### Directory structure

```
.flare/
  cache/
    static/
      about/index.html
      about/index.ndjson
      fr/about/index.html
    loader/
      flare:_root_/products/[id]:{"id":"42"}.json
    cdn/
      a1b2c3d4.json
    manifest.json
```

#### Lifecycle

1. `vite dev` starts → prerender SSG routes → write to `.flare/cache/static/`
2. Request comes in → CDN simulator checks `.flare/cache/cdn/` → static store checks `.flare/cache/static/` → loader store checks `.flare/cache/loader/`
3. Cache miss → SSR runs → stores write back to respective directories
4. Route file changes (HMR) → clear affected entries across all cache directories
5. `.flare/` gitignored, wiped on `vite dev --clean` or fresh restart

#### FileSystemStore

Implements the same `Store` interface as the KV store:

- `get(key)` — reads JSON file
- `set(key, data, ttl?)` — writes JSON file with `storedAt` timestamp
- `delete(key)` — removes file
- `list(prefix?)` — glob match for tag-based invalidation

Same interface means the server handler code path is identical in dev and prod — only the store implementation differs.

#### HMR integration

On route file change:

1. Determine which URL patterns the changed file affects
2. Clear matching entries from `.flare/cache/static/` and `.flare/cache/cdn/`
3. Clear matching loader cache entries from `.flare/cache/loader/`
4. If SSG route: re-prerender immediately
5. If ISR route: just clear (next request triggers fresh SSR + cache)

### Implementation Files (Phase 2)

| File                                                    | Action                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `flare/src/store/filesystem.ts`                         | CREATE — `FileSystemStore` implementing `Store`                                 |
| `flare/src/server-handler/cdn-simulator.ts`             | CREATE — CDN cache middleware (~100 lines)                                      |
| `flare/src/cdn/presets.ts`                              | CREATE — `cfHeaders`, `fastlyHeaders`, `vercelHeaders` convenience exports      |
| `flare/src/plugins/index.ts`                            | MODIFY — add `dev` config, inject `FileSystemStore` + CDN simulator in dev      |
| `flare/src/plugins/dev-prerender.ts`                    | CREATE — dev-mode prerender on server start                                     |
| `flare/src/server-handler/index.ts`                     | MODIFY — respect `staticParams` config, use injected store, add `Server-Timing` |
| `flare/src/plugins/inspector.ts`                        | CREATE — JSX source location injection (dev only)                               |
| `flare/tests/unit/store/filesystem.test.ts`             | CREATE — unit tests                                                             |
| `flare/tests/unit/server-handler/cdn-simulator.test.ts` | CREATE — CDN simulator tests                                                    |

---

## What Flare Gets Right (and Others Don't)

- **Runtime parity** — workerd in dev via CF Vite plugin (Astro 6 just caught up, everyone else doesn't have it)
- **Prefetching works in dev** — Next.js disables it entirely
- **Param validation in dev** — Next.js doesn't enforce `dynamicParams: false`, causing deploy surprises
- **CSP respects user config in dev** — auto-injects HMR needs additively, doesn't blanket-relax
- **Dev/prod code paths are identical** — same server handler, same matching, same pipeline
- **Planned: Vary/ETag/304** — correct HTTP caching headers on all responses (Phase 1)
- **Planned: SSG/ISR/loader cache in dev** — `FileSystemStore` for all server-side caching
- **Planned: Local CDN simulator** — first framework to simulate CDN caching in dev, with pluggable header adapters
- **Planned: Server-Timing headers** — zero-UI performance insights via Chrome DevTools
- **Planned: Component inspector** — Ctrl+click to source, leveraging Vite's built-in `__open-in-editor`

## Sources

- [Next.js 16](https://nextjs.org/blog/next-16)
- [Next.js Caching Guide](https://nextjs.org/docs/app/guides/caching)
- [Next.js Prefetching Guide](https://nextjs.org/docs/app/guides/prefetching)
- [Next.js ISR Guide](https://nextjs.org/docs/app/guides/incremental-static-regeneration)
- [TanStack Start ISR](https://tanstack.com/start/latest/docs/framework/react/guide/isr)
- [TanStack Start Static Prerendering](https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering)
- [TanStack Start Devtools](https://tanstack.com/router/latest/docs/framework/react/devtools)
- [Remix Headers](https://remix.run/docs/en/main/route/headers)
- [Nuxt 4 Announcement](https://nuxt.com/blog/v4)
- [Nuxt DevTools Features](https://devtools.nuxt.com/guide/features)
- [Nuxt Rendering Modes](https://nuxt.com/docs/4.x/guide/concepts/rendering)
- [SvelteKit Performance](https://svelte.dev/docs/kit/performance)
- [SvelteKit Hooks](https://svelte.dev/docs/kit/hooks)
- [Astro 6 Beta](https://astro.build/blog/astro-6-beta/)
- [Astro On-demand Rendering](https://docs.astro.build/en/guides/on-demand-rendering/)
- [Cloudflare Cache Responses](https://developers.cloudflare.com/cache/concepts/cache-responses/)
- [Fastly X-Cache Header](https://www.fastly.com/documentation/reference/http/http-headers/X-Cache/)
- [Link prefetching only in production — Next.js #23687](https://github.com/vercel/next.js/issues/23687)
