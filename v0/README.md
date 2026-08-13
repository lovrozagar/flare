# Flare

Solid meta-framework for Cloudflare Workers. Server-only loaders, NDJSON streaming navigation, fine-grained reactivity.

## Table of Contents

### Getting Started

- [Why Flare](#why-flare)
  - [Comparison](#comparison)
  - [When to Use Flare](#when-to-use-flare)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Deployment](#deployment)
  - [Cloudflare Workers](#cloudflare-workers)

### Architecture

- [Overview](#overview)
  - [Architecture](#architecture)
  - [Execution Model](#execution-model)
- [Configuration](#configuration)
  - [createRouter](#createrouter)
  - [createServerHandler](#createserverhandler)
  - [Static Context](#static-context)
- [Entry Points](#entry-points)
  - [Router Entry](#router-entry)
  - [Server Entry](#server-entry)
  - [Client Entry](#client-entry)
- [Build and Development](#build-and-development)
  - [Vite Plugin](#vite-plugin)
  - [File-Based Route Generation](#file-based-route-generation)
  - [Static Assets](#static-assets)
  - [Dev Server](#dev-server)
  - [HMR](#hmr)
  - [Build Modes](#build-modes)

### Routing

- [Virtual Paths](#virtual-paths)
  - [Route Factories](#route-factories)
    - [createRootLayout](#createrootlayout)
    - [createLayout](#createlayout)
    - [createPage](#createpage)
  - [Builder Chain](#builder-chain)
  - [Location Object](#location-object)
- [Builder Methods](#builder-methods)
  - [options](#options)
  - [authenticate](#authenticate)
  - [authorize](#authorize)
  - [input](#input)
  - [effects](#effects)
  - [preloader](#preloader)
  - [loader](#loader)
  - [head](#head)
  - [headers](#headers)
  - [render](#render)
  - [errorRender](#errorrender)
  - [notFoundRender](#notfoundrender)
  - [pendingRender](#pendingrender)
  - [unauthorizedRender](#unauthorizedrender)
  - [response](#response)
- [Router](#router)
  - [Route Matching](#route-matching)
  - [Router State](#router-state)
  - [History API](#history-api)
  - [buildLocation](#buildlocation)
- [Navigation](#navigation)
  - [Hard vs Framework](#hard-vs-framework)
  - [NDJSON Mode](#ndjson-mode)
  - [Link Component](#link-component)
  - [Prefetch Strategies](#prefetch-strategies)
  - [Programmatic Navigation](#programmatic-navigation)
  - [Shallow Navigation](#shallow-navigation)
  - [View Transitions](#view-transitions)
  - [Scroll Restoration](#scroll-restoration)
  - [Navigation Blocking](#navigation-blocking)

### Data

- [Data Loading](#data-loading)
  - [Preloaders](#preloaders)
  - [Loaders](#loaders)
  - [Loader Context](#loader-context)
  - [Match ID](#match-id)
  - [Route Cache](#route-cache)
  - [Cache and Staleness](#cache-and-staleness)
  - [Invalidation](#invalidation)
  - [Request Deduplication](#request-deduplication)
- [TanStack Query Integration](#tanstack-query-integration)
  - [Tracked QueryClient](#tracked-queryclient)
  - [Auto-Serialization](#auto-serialization)
  - [Auto-Hydration](#auto-hydration)
- [Hydration](#hydration)
  - [self.flare State](#selfflare-state)
  - [SSR to Client Handoff](#ssr-to-client-handoff)
  - [Match Cache Population](#match-cache-population)
  - [QueryClient Hydration](#queryclient-hydration)

### Auth and Server

- [Authentication and Authorization](#authentication-and-authorization)
  - [authenticateFn](#authenticatefn)
  - [authenticate Method](#authenticate-method)
  - [authorize Method](#authorize-method)
  - [Auth Flow](#auth-flow)
  - [Auth Inheritance](#auth-inheritance)
- [Server Functions](#server-functions)
  - [createServerFn](#createserverfn)
  - [Single-Flight Mutations](#single-flight-mutations)
  - [TanStack Query Helpers](#tanstack-query-helpers)
- [Middleware](#middleware)
  - [Built-in Middlewares](#built-in-middlewares)

### Rendering

- [Rendering](#rendering)
  - [SSR](#ssr)
  - [CSR](#csr)
  - [Streaming](#streaming)
  - [defer Helper](#defer-helper)
  - [Await Component](#await-component)
- [Head Management](#head-management)
- [SEO](#seo)
  - [Meta Tags](#meta-tags)
  - [Open Graph](#open-graph)
  - [Structured Data](#structured-data)
- [Styling](#styling)
  - [Global CSS](#global-css)
  - [Page Scoped CSS](#page-scoped-css)
  - [css Prop](#css-prop)
  - [tw Prop](#tw-prop)
  - [Tailwind Integration](#tailwind-integration)
  - [ResetCSS](#resetcss)
  - [ThemeScript](#themescript)
  - [View Transitions CSS](#view-transitions-css)
  - [styles Function](#styles-function)
- [Lazy Loading](#lazy-loading)
  - [lazy](#lazy)
  - [clientLazy](#clientlazy)
  - [preload](#preload)

### Error Handling

- [Error Handling](#error-handling)
  - [Error Classes](#error-classes)
  - [Boundary Bubbling](#boundary-bubbling)
  - [Redirect](#redirect)

### API Reference

- [Components](#components)
  - [Link](#link)
  - [Outlet](#outlet)
  - [Await](#await)
  - [HeadContent](#headcontent)
  - [Scripts](#scripts)
- [Hooks](#hooks)
  - [useLocation](#uselocation)
  - [useParams](#useparams)
  - [useSearch](#usesearch)
  - [useRouter](#userouter)
  - [useMatch](#usematch)
  - [useMatches](#usematches)
  - [useLoaderData](#useloaderdata)
  - [usePreloaderContext](#usepreloadercontext)
  - [useHydrated](#usehydrated)
  - [useBlocker](#useblocker)
  - [useScrollRestore](#usescrollrestore)
- [Contexts](#contexts)
  - [MiddlewareContext](#middlewarecontext)
  - [ServerRequestContext](#serverrequestcontext)
  - [PreloaderContext](#preloadercontext)
  - [RouterContext](#routercontext)
  - [getServerRequest](#getserverrequest)
  - [getServerNonce](#getservernonce)

### Advanced

- [Type Safety](#type-safety)
  - [Path Validation](#path-validation)
  - [Param and Search Inference](#param-and-search-inference)
  - [Preloader Context Chain](#preloader-context-chain)
- [Security](#security)
  - [Nonce](#nonce)
  - [CSP](#csp)
- [Testing](#testing)
  - [Route Segment Testing](#route-segment-testing)
  - [Mock Utilities](#mock-utilities)
  - [Integration Testing](#integration-testing)
- [Bundle Optimization](#bundle-optimization)
  - [Tree Shaking](#tree-shaking)
  - [Bundle Analysis](#bundle-analysis)
- [Code Generation](#code-generation)
  - [Route Trees](#route-trees)
  - [Type Declarations](#type-declarations)
- [License](#license)

---

## Why Flare

Flare is a Solid meta-framework for building SSR applications. Built on SolidJS's fine-grained reactivity for minimal client JavaScript and surgical DOM updates.

**Core principles:**

- **Server-only loaders** - Data loading runs exclusively on server, never shipped to client bundle
- **Fine-grained reactivity** - Solid's reactive system means no VDOM diffing, direct DOM updates
- **NDJSON navigation** - Streaming data protocol, layouts persist across navigation
- **Type-safe routing** - Virtual paths validated at compile time, full inference for params/search
- **Cloudflare Workers native** - Built for CF Workers with Web Standards core

### Comparison

| Feature          | Flare            | Next.js       | Remix          | SolidStart    | TanStack Start   |
| ---------------- | ---------------- | ------------- | -------------- | ------------- | ---------------- |
| **Runtime**      | Solid            | React         | React          | Solid         | React            |
| **Reactivity**   | Fine-grained     | Virtual DOM   | Virtual DOM    | Fine-grained  | Virtual DOM      |
| **Routing**      | Virtual paths    | File-based    | File-based     | File-based    | Code-based       |
| **Data loading** | Server-only      | Server/client | Server loaders | Server/client | Server functions |
| **Navigation**   | NDJSON streaming | RSC           | HTML           | HTML          | HTML             |
| **Deployment**   | CF Workers       | Vercel/etc    | Adapters       | Adapters      | Adapters         |

### When to Use Flare

**Good fit:**

- Performance-critical apps where bundle size matters
- Apps with complex data loading patterns
- Teams who prefer code-based routing over file conventions
- Projects that benefit from Solid's fine-grained reactivity

**Not ideal for:**

- Teams heavily invested in React ecosystem
- Apps requiring React-only component libraries (many have Solid versions)

---

## Installation

```bash
# npm
npx create-flare@latest my-app

# yarn
yarn create flare my-app

# pnpm
pnpm create flare my-app

# bun
bun create flare my-app
```

**Manual installation:**

```bash
# npm
npm install @flare/v0 solid-js @tanstack/solid-query
npm install -D vite typescript

# yarn
yarn add @flare/v0 solid-js @tanstack/solid-query
yarn add -D vite typescript

# pnpm
pnpm add @flare/v0 solid-js @tanstack/solid-query
pnpm add -D vite typescript

# bun
bun add @flare/v0 solid-js @tanstack/solid-query
bun add -D vite typescript
```

---

## Deployment

### Cloudflare Workers

```ts
/* wrangler.toml */
name = "my-app"
main = "src/server.ts"
compatibility_date = "2024-01-01"[site]
bucket = "./dist/client"
```

---

## Overview

### Architecture

```
Request → Server Handler → Route Matching → Preloaders → Loaders → Render → Response
                                              ↓            ↓
                                         (sequential)  (parallel)
                                              ↓            ↓
                                         context tree  loader data
```

**Server:** Matches URL, runs preloaders sequentially (building context tree), runs loaders in parallel, renders HTML, sends response.

**Client:** Hydrates server HTML, attaches event handlers, takes over navigation.

**Navigation:** After hydration, client-side navigation fetches loader data as streaming NDJSON. Layouts persist, only changed parts update.

### Execution Model

| Code                    | Runs on Server | Runs on Client   |
| ----------------------- | -------------- | ---------------- |
| `createRouter()`        | Yes            | Yes (isomorphic) |
| `createServerHandler()` | Yes            | No               |
| `hydrate()`             | No             | Yes              |
| `.preloader()`          | Yes            | No               |
| `.loader()`             | Yes            | No               |
| `.render()`             | Yes (SSR)      | Yes (hydration)  |
| `.head()`               | Yes            | No               |
| Server functions        | Yes            | No (RPC call)    |

### Virtual Paths

Virtual paths define route hierarchy including layouts. Unlike URL paths, they encode the full layout tree.

**Format:**

| Type               | Pattern        | Example                 |
| ------------------ | -------------- | ----------------------- |
| Root layout        | `_{name}_`     | `_root_`, `_admin_`     |
| Layout group       | `(name)`       | `(dashboard)`, `(auth)` |
| Static segment     | `segment`      | `products`, `about`     |
| Dynamic param      | `[param]`      | `[id]`, `[slug]`        |
| Optional param     | `[[param]]`    | `[[lang]]`              |
| Catch-all          | `[...param]`   | `[...path]`             |
| Optional catch-all | `[[...param]]` | `[[...path]]`           |

**Examples:**

```
URL: /products/123
virtualPath: _root_/products/[id]
variablePath: /products/[id]
pathname: /products/123

URL: /dashboard/settings
virtualPath: _root_/(dashboard)/settings
variablePath: /settings
pathname: /dashboard/settings
```

**Multiple root layouts:** Different entry points for different app sections.

```
_root_/          # Main app
_admin_/         # Admin panel (separate root layout)
```

### Route Factories

**createRootLayout(virtualPath)**

Root of the layout tree. Renders `<html>`, `<head>`, `<body>`. Can have multiple for different app sections.

```tsx
import { createRootLayout, HeadContent, Scripts } from "@flare/v0"

export const RootLayout = createRootLayout("_root_").render(({ children }) => (
	<html>
		<head>
			<HeadContent />
		</head>
		<body>
			{children}
			<Scripts />
		</body>
	</html>
))
```

**createLayout(virtualPath)**

Nested layouts. Wrap child routes with shared UI (sidebar, header). Layout groups `(name)` don't affect URL.

```tsx
export const DashboardLayout = createLayout("_root_/(dashboard)").render(({ children }) => (
	<div class="dashboard">
		<Sidebar />
		{children}
	</div>
))
```

**createPage(virtualPath)**

Leaf routes. Actual pages users visit.

```tsx
export const ProductPage = createPage("_root_/products/[id]").render(({ loaderData }) => (
	<Product data={loaderData} />
))
```

### Builder Chain

All factories return builders with chainable methods. Order matters for some (auth before loader).

```tsx
createPage("_root_/products/[id]")
  .options({...})         /* Cache timing */
  .authenticate(data)     /* Auth requirement - data passed to authenticateFn as callerData */
  .authorize(fn)          /* Custom auth logic - throw unauthorized() or return false */
  .input({...})           /* Param/search validation */
  .effects({...})         /* loaderDeps, shouldRefetch */
  .preloader(fn)          /* Sequential, builds context */
  .loader(fn)             /* Parallel, full context */
  .head(fn)               /* Meta tags, SEO, JSON-LD */
  .headers(fn)            /* Response headers */
  .render(fn)             /* Component */
  .errorRender(fn)        /* Error boundary */
  .notFoundRender(fn)     /* 404 boundary */
  .pendingRender(fn)      /* Loading state */
  .unauthorizedRender(fn) /* Auth error */
  .response(fn)           /* Non-HTML response */
```

**authenticate(callerData?):** Calls global `authenticateFn` with optional `callerData` argument.

```tsx
.authenticate()                           /* callerData = undefined */
.authenticate("admin")                    /* callerData = "admin" */
.authenticate(["admin", "editor"])        /* callerData = ["admin", "editor"] */
.authenticate({ role: "admin", level: 5 }) /* callerData = { role, level } */
```

**authorize(fn):** Custom auth logic. Return `false` or throw `unauthorized()` to deny access.

```tsx
.authorize(({ auth, location }) => {
  if (auth.orgId !== location.params.orgId) return false  /* Auto throws unauthorized */
  return auth
})

.authorize(({ auth }) => {
  if (!auth.isVerified) throw unauthorized("Email not verified")
  return auth
})
```

**head(fn):** Returns head configuration. Merges from root layout down to page (child overrides parent).

```tsx
.head(({ preloaderContext, loaderData, location, params, search }) => ({
  /* Basic */
  title: "Product Name - My Store",
  description: "Product description for SEO",
  canonical: "https://example.com/products/123",
  keywords: ["keyword1", "keyword2"],

  /* Robots */
  robots: {
    index: true,
    follow: true,
    noarchive: false,
    nosnippet: false,
    noimageindex: false,
  },

  /* Open Graph */
  openGraph: {
    title: "Product Name",
    description: "Product description",
    type: "product",
    url: "https://example.com/products/123",
    images: [{ url: "https://example.com/image.jpg", width: 1200, height: 630 }],
    siteName: "My Store",
    locale: "en_US",
  },

  /* Twitter */
  twitter: {
    card: "summary_large_image",
    site: "@mystore",
    creator: "@author",
    title: "Product Name",
    description: "Product description",
    image: "https://example.com/image.jpg",
  },

  /* Favicons */
  favicons: [
    { rel: "icon", href: "/favicon.ico" },
    { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
  ],

  /* Languages */
  languages: {
    "en": "https://example.com/en/products/123",
    "es": "https://example.com/es/products/123",
  },

  /* JSON-LD (schema-dts for type safety, zero bundle size) */
  jsonLd: {
    "@type": "Product",
    name: "Product Name",
    description: "Product description",
    image: "https://example.com/image.jpg",
    offers: {
      "@type": "Offer",
      price: "99.99",
      priceCurrency: "USD",
    },
  },

  /* Custom elements */
  custom: {
    meta: [
      { name: "author", content: "John Doe" },
      { property: "fb:app_id", content: "123456" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
    ],
    scripts: [
      { src: "https://example.com/script.js", async: true },
    ],
    styles: [
      { href: "https://example.com/style.css" },
    ],
  },

  /* Page-specific CSS (scoped) */
  css: `
    .product-page { padding: 2rem; }
  `,
}))
```

**Head merging:** Root layout sets defaults, child layouts/pages override. Arrays are replaced, not merged.

```tsx
/* Root layout */
.head(() => ({
  title: "My Store",
  robots: { index: true, follow: true },
}))

/* Page - overrides title, inherits robots */
.head(() => ({
  title: "Product Name - My Store",
}))
```

**headers(fn):** Sets response headers. Returns `Record<string, string>`.

```tsx
.headers(({ preloaderContext, loaderData, location }) => ({
  /* CDN caching */
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  "CDN-Cache-Control": "max-age=86400",
  "Surrogate-Control": "max-age=86400",

  /* Custom headers */
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
}))
```

### Preloaders vs Loaders

**Preloaders:** Run sequentially from root to page. Each preloader's return value is available to children via `preloaderContext`. Use for data needed by multiple routes (user, org, permissions).

```tsx
/* Root preloader */
.preloader(async ({ env, request }) => {
  const user = await getUser(request)
  return { user }  /* Available to all children */
})

/* Page preloader - has access to parent context */
.preloader(async ({ preloaderContext }) => {
  const org = await getOrg(preloaderContext.user.orgId)
  return { org }  /* Added to context chain */
})
```

**Loaders:** Run in parallel after all preloaders complete. Have full context. Use for page-specific data.

```tsx
.loader(async ({ preloaderContext, queryClient }) => {
  /* preloaderContext has { user, org } from preloader chain */
  const products = await queryClient.ensureQueryData({...})
  return { products }
})
```

### Streaming with defer()

`defer()` wraps promises that can resolve after initial HTML is sent. Shell renders immediately, deferred data streams when ready.

```tsx
.loader(async ({ defer }) => {
  const critical = await fetchCritical()      /* Blocks render */
  const deferred = defer(() => fetchSlow())   /* Streams later */
  return { critical, deferred }
})

.render(({ loaderData }) => (
  <div>
    <Header data={loaderData.critical} />
    <Await promise={loaderData.deferred} pending={<Skeleton />}>
      {(data) => <SlowContent data={data} />}
    </Await>
  </div>
))
```

**Note:** On initial page load, `defer()` awaits by default (`initialLoadDisableDefer: false`). Streaming happens on client-side navigation.

### Request Deduplication

**Automatic fetch deduplication:** GET/HEAD requests with same URL + headers are deduped within a request.

```tsx
/* These execute once, both get same promise */
const [a, b] = await Promise.all([
	fetch("https://api.example.com/user"),
	fetch("https://api.example.com/user"),
])
```

**dedupe() helper:** For non-fetch async operations.

```tsx
import { dedupe } from "@flare/v0/server"

const getUser = dedupe(async (id: string, env: Env) => {
	return env.D1.prepare("SELECT * FROM users WHERE id = ?").bind(id).first()
})

/* Same args + same request = same promise */
await getUser("123", env) /* Executes */
await getUser("123", env) /* Returns cached promise */
```

### Client-Only Components

HTML is prerendered on server and hydrated on client. For components that should only render on client (no SSR), use `clientLazy`:

```tsx
import { clientLazy } from "@flare/v0"

const Chart = clientLazy(() => import("./Chart"))

/* Renders nothing on server, loads + renders on client */
<Chart data={data} />
```

---

## Quick Start

### createRouter

**Minimal:**

```ts
/* src/router.ts */
import { createRouter } from "@flare/v0"

export const router = createRouter()
```

**Full options:**

```ts
/* src/router.ts */
import { createRouter } from "@flare/v0"
import { getQueryClient } from "./query-client"

export const router = createRouter({
	basePath: "",
	caseSensitive: false,
	defaultGcTime: 1_800_000,
	defaultPrefetch: "intent",
	defaultPrefetchGcTime: 50_000,
	defaultPrefetchStaleTime: 30_000,
	defaultRefetchOnSearchChange: false,
	defaultStaleTime: 0,
	defaultViewTransition: true,
	getQueryClient /* Optional - TanStack Query integration */,
	getScrollRestorationKey: (location) => location.pathname,
	notFoundBoundary: "nearest",
	queryClientSync: true /* Auto-serialize/hydrate QueryClient */,
	routeCacheMaxEntries: 200,
	scrollRestoration: true,
	scrollRestorationBehavior: "auto",
	scrollRestorationCacheMaxEntries: 2000,
	trailingSlash: "never",
})
```

**TanStack Query Integration (Optional):**

TanStack Query integration is optional. If `getQueryClient` is not provided, all Query-related code is tree-shaken from the bundle.

```ts
/* src/query-client.ts */
import { createQueryClientGetter } from "@flare/v0/query-client"

export const getQueryClient = createQueryClientGetter({
	defaultOptions: {
		queries: {
			gcTime: 50 * 60 * 1000 /* 50 minutes */,
			refetchOnWindowFocus: false,
			retry: 1,
			staleTime: 60 * 1000 /* 1 minute */,
		},
	},
})
```

When enabled (`queryClientSync: true`):

- **Server:** Queries used in loaders are tracked and dehydrated to SSR payload
- **Client:** QueryClient is hydrated from SSR payload, no refetch needed
- **Loader access:** `queryClient` available in loader context for `ensureQueryData`, `prefetchQuery`, etc.

### createServerHandler

**Minimal:**

```ts
/* src/server.ts */
import { createServerHandler } from "@flare/v0/server"

export default createServerHandler()
```

**Full options:**

```ts
/* src/server.ts */
import { createServerHandler } from "@flare/v0/server"

export default createServerHandler({
	authenticateFn: async ({ env, request, location, callerData }) => {
		const session = await getSession(request)
		if (!session) return null
		return { userId: session.userId, role: session.role }
	},
	csp: {
		defaultSrc: ["'self'"],
		scriptSrc: ["'self'", "'unsafe-inline'"],
		styleSrc: ["'self'", "'unsafe-inline'"],
		imgSrc: ["'self'", "data:", "blob:"],
		fontSrc: ["'self'"],
		connectSrc: ["'self'"],
	},
	initialLoadDisableDefer: false,
	middlewares: [],
	dedupeFetch: true,
})
```

### Client Entry

```ts
/* src/client.ts */
import { hydrate } from "@flare/v0/client"
import { router } from "./router"

hydrate(router)
```

### createRootLayout

**Minimal:**

```tsx
/* src/routes/_root.tsx */
import { createRootLayout } from "@flare/v0"

export const RootLayout = createRootLayout("_root_").render(({ children }) => (
	<html lang="en">
		<head>
			<HeadContent />
		</head>
		<body>
			{children}
			<Scripts />
		</body>
	</html>
))
```

**Full options:**

```tsx
/* src/routes/_root.tsx */
import { createRootLayout } from "@flare/v0"

export const RootLayout = createRootLayout("_root_")
  .options({
    staleTime: 60_000,
    gcTime: 300_000,
    prefetchStaleTime: 30_000,
    prefetchGcTime: 60_000,
  })
  .authenticate()
  .preloader(async ({ env, request }) => {
    return { user: await getUser(request) }
  })
  .loader(async ({ preloaderContext, queryClient }) => {
    return { settings: await queryClient.ensureQueryData({...}) }
  })
  .head(({ loaderData }) => ({
    title: "My App",
    meta: [{ name: "description", content: "Built with Flare" }],
  }))
  .headers(({ loaderData }) => ({
    "Cache-Control": "public, max-age=3600",
  }))
  .render(({ children, loaderData }) => (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadContent />
      </head>
      <body>
        <div id="app">{children}</div>
        <Scripts />
      </body>
    </html>
  ))
  .errorRender(({ error, reset }) => (
    <html>
      <body>
        <h1>Error</h1>
        <p>{error.message}</p>
        <button onClick={reset}>Retry</button>
      </body>
    </html>
  ))
  .notFoundRender(({ location }) => (
    <html>
      <body>
        <h1>404</h1>
        <p>Page not found: {location.pathname}</p>
      </body>
    </html>
  ))
```

### createLayout

**Minimal:**

```tsx
/* src/routes/(dashboard)/_layout.tsx */
import { createLayout } from "@flare/v0"

export const DashboardLayout = createLayout("_root_/(dashboard)").render(({ children }) => (
	<div class="dashboard">
		<Sidebar />
		<main>{children}</main>
	</div>
))
```

**Full options:**

```tsx
import { createLayout } from "@flare/v0"

export const DashboardLayout = createLayout("_root_/(dashboard)")
  .options({ staleTime: 30_000 })
  .authenticate("admin")
  .authorize(({ auth, location }) => {
    if (auth.orgId !== location.params.orgId) throw unauthorized()
    return auth
  })
  .input({
    params: z.object({ orgId: z.string() }),
  })
  .effects({
    loaderDeps: (ctx) => ({ orgId: ctx.params.orgId }),
  })
  .preloader(async ({ env, params }) => {
    return { org: await getOrg(params.orgId, env) }
  })
  .loader(async ({ preloaderContext, queryClient }) => {
    return { stats: await queryClient.ensureQueryData({...}) }
  })
  .head(({ loaderData }) => ({
    title: `${loaderData.org.name} Dashboard`,
  }))
  .render(({ children, loaderData }) => (
    <div class="dashboard">
      <Sidebar org={loaderData.org} />
      <main>{children}</main>
    </div>
  ))
  .errorRender(({ error, reset }) => <LayoutError error={error} reset={reset} />)
  .notFoundRender(() => <LayoutNotFound />)
  .pendingRender(() => <LayoutSkeleton />)
  .unauthorizedRender(({ reason }) => <LayoutUnauthorized reason={reason} />)
```

### createPage

**Minimal:**

```tsx
/* src/routes/index.tsx */
import { createPage } from "@flare/v0"

export const IndexPage = createPage("_root_/").render(() => <h1>Hello, Flare!</h1>)
```

**Full options:**

```tsx
/* src/routes/products/[id].tsx */
import { createPage } from "@flare/v0"

export const ProductPage = createPage("_root_/products/[id]")
	.options({
		staleTime: 60_000,
		gcTime: 300_000,
		prefetchStaleTime: 30_000,
		prefetchGcTime: 60_000,
	})
	.authenticate()
	.authorize(({ auth, location }) => {
		if (!auth.permissions.includes("products:read")) throw unauthorized()
		return auth
	})
	.input({
		params: z.object({ id: z.string() }),
		searchParams: z.object({
			tab: z.enum(["overview", "reviews", "specs"]).default("overview"),
		}),
	})
	.effects({
		loaderDeps: (ctx) => ({ tab: ctx.search.tab }),
		shouldRefetch: ({ cause }) => cause === "enter",
	})
	.preloader(async ({ env, params }) => {
		return { product: await getProduct(params.id, env) }
	})
	.loader(async ({ preloaderContext, queryClient, defer, location }) => {
		const reviews = defer(() =>
			queryClient.ensureQueryData({
				queryKey: ["reviews", location.params.id],
				queryFn: () => fetchReviews(location.params.id),
			}),
		)
		return { reviews }
	})
	.head(({ preloaderContext }) => ({
		title: preloaderContext.product.name,
		meta: [{ name: "description", content: preloaderContext.product.description }],
	}))
	.headers(() => ({
		"Cache-Control": "public, max-age=60",
	}))
	.render(({ preloaderContext, loaderData, location }) => (
		<article>
			<h1>{preloaderContext.product.name}</h1>
			<Tabs active={location.search.tab} />
			<Await promise={loaderData.reviews} pending={<ReviewsSkeleton />}>
				{(reviews) => <ReviewList items={reviews} />}
			</Await>
		</article>
	))
	.errorRender(({ error, reset }) => <ProductError error={error} reset={reset} />)
	.notFoundRender(() => <ProductNotFound />)
	.pendingRender(() => <ProductSkeleton />)
	.unauthorizedRender(({ reason }) => <ProductUnauthorized reason={reason} />)
```

#### Non-HTML Responses with `.response()`

For dynamic non-HTML responses like sitemaps, RSS feeds, or JSON APIs, use `.response()` instead of `.render()`. These are mutually exclusive — the builder chain enforces this at the type level.

```tsx
/* routes/sitemap.xml.ts */
export const route = createPage("_root_/sitemap.xml")
	.preloader(async ({ env }) => {
		return { products: await getAllProducts(env) }
	})
	.headers(() => ({
		"Cache-Control": "public, max-age=3600",
	}))
	.response(({ preloaderContext }) => {
		const urls = preloaderContext.products
			.map((p) => `<url><loc>https://example.com/products/${p.id}</loc></url>`)
			.join("")

		return new Response(
			`<?xml version="1.0" encoding="UTF-8"?>
       <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
         ${urls}
       </urlset>`,
			{ headers: { "Content-Type": "application/xml" } },
		)
	})
```

---

## Configuration

### createRouter

The router is the central configuration for routing behavior. Create it in `router.ts` — consumed by both server and client.

```tsx
/* router.ts */
import { createRouter } from "@flare/v0"
import { getQueryClient } from "./query-client"

export const router = createRouter({
	getQueryClient,
})
```

#### Full Options

```tsx
export const router = createRouter({
	/* TanStack Query integration (optional, tree-shaken if not provided) */
	getQueryClient,

	/* Base path for all routes (default: "") */
	basePath: "/app",

	/* URL case sensitivity (default: false) */
	caseSensitive: false,

	/* Trailing slash handling: "never" | "always" | "preserve" (default: "never") */
	trailingSlash: "never",

	/* Default prefetch strategy: "hover" | "viewport" | "render" | false (default: false) */
	defaultPrefetch: false,

	/* Default view transitions: boolean (default: true) */
	defaultViewTransition: true,

	/* Route data cache settings (milliseconds) */
	defaultStaleTime: 0 /* freshness (default: 0 = always refetch) */,
	defaultGcTime: 1_800_000 /* memory retention (default: 30min) */,
	defaultPrefetchStaleTime: 0 /* prefetch freshness (default: 0) */,
	defaultPrefetchGcTime: 1_800_000 /* prefetch retention (default: 30min) */,

	/* Refetch on search param change (default: false) */
	defaultRefetchOnSearchChange: false,

	/* Route cache max entries (default: 200) */
	routeCacheMaxEntries: 200,

	/* Scroll restoration */
	scrollRestoration: true /* enable (default: true) */,
	scrollRestorationBehavior: "auto" /* "auto" | "smooth" (default: "auto") */,
	scrollRestorationCacheMaxEntries: 2000 /* max stored positions (default: 2000) */,
	getScrollRestorationKey: (loc) => loc.pathname /* custom key function */,

	/* Not found boundary: "nearest" | "root" (default: "nearest") */
	notFoundBoundary: "nearest",
})
```

### createServerHandler

The server handler processes requests, runs middleware, authentication, and renders responses. Create it in `server.ts`.

```tsx
/* server.ts */
import { createServerHandler } from "@flare/v0/server"

export default createServerHandler({})
```

#### Full Options

```tsx
export default createServerHandler({
	/* Authentication (called only when route has .authenticate() or .authorize()) */
	authenticateFn: async ({ env, request, location, callerData }) => {
		const token = request.headers.get("Authorization")?.split(" ")[1]
		if (!token) return null

		const user = await verifyToken(token, env)
		return user /* whatever you return becomes `auth` in route context */
	},

	/* Content Security Policy */
	csp: {
		connectSrc: ["'self'"],
		fontSrc: ["'self'", "https://fonts.gstatic.com"],
		imgSrc: ["'self'", "data:", "blob:"],
		styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
	},

	/* Data protection — signs NDJSON data responses to prevent bot scraping */
	dataProtection: {
		secret: (env) => env.DATA_SECRET /* signing key */,
		windowSeconds: 60 /* signature validity window */,
	},

	/* Disable defer() streaming on initial load (default: false) */
	/* When true, defer() awaits on SSR — makes response CDN cacheable */
	initialLoadDisableDefer: false,

	/* Automatic fetch deduplication for GET/HEAD (default: true) */
	dedupeFetch: true,

	/* Request middlewares — run in order before route handling */
	middlewares: [],
})
```

#### Authentication Function

The `authenticateFn` receives context and returns the auth object available to routes:

| Property     | Type       | Description                                           |
| ------------ | ---------- | ----------------------------------------------------- |
| `env`        | `Env`      | CF Worker environment bindings (KV, D1, DO, R2, etc.) |
| `request`    | `Request`  | The incoming request                                  |
| `location`   | `Location` | Parsed URL with params, search, hash                  |
| `callerData` | `unknown`  | Data passed from `.authenticate(callerData)`          |

The return value becomes `auth` in the route context. Return `null` for unauthenticated requests.

### Static Context

The hydration payload includes static context available throughout the app:

```tsx
self.flare = {
  s: "sig.timestamp",  /* data request signature */
  r: { ... },          /* route/match data */
  q: [ ... ],          /* TanStack Query states */
  c: {                 /* static context */
    routerDefaults: {
      prefetchIntent: false,
      staleTime: 0,
      gcTime: 1_800_000,
    },
    locale: "en",
    dir: "ltr",
    theme: "light",
  }
}
```

Middleware can set these values which persist to the client and are available via `useRouter().context`.

---

## Entry Points

Flare apps have three entry points:

| Entry  | File        | Environment | Purpose                                           |
| ------ | ----------- | ----------- | ------------------------------------------------- |
| Router | `router.ts` | Isomorphic  | Router configuration, shared by server and client |
| Server | `server.ts` | Server only | Request handler, authentication, middleware       |
| Client | `client.ts` | Client only | Hydration initialization                          |

### Router Entry

The router entry is isomorphic — imported by both server and client. It configures routing behavior but doesn't contain platform-specific code.

```tsx
/* router.ts */
import { createRouter } from "@flare/v0"
import { getQueryClient } from "./query-client"

export const router = createRouter({
	getQueryClient,
	defaultStaleTime: 30_000,
	defaultPrefetch: "hover",
})
```

### Server Entry

The server entry is the only file that uses `export default`. It creates the request handler that runs on the server.

```tsx
/* server.ts */
import { createServerHandler } from "@flare/v0/server"

export default createServerHandler({
	authenticateFn: async ({ env, request }) => {
		const token = request.headers.get("Authorization")?.split(" ")[1]
		if (!token) return null
		return verifyToken(token, env)
	},
})
```

The Vite plugin automatically resolves the router, route tree, and layouts via virtual modules — you don't import them manually.

### Client Entry

The client entry initializes hydration. It imports the router and calls `hydrate()`.

```tsx
/* client.ts */
import { hydrate } from "@flare/v0/client"
import { router } from "./router"

hydrate(router)
```

The hydration process:

1. Reads `self.flare` state from the SSR payload
2. Populates the route match cache from `self.flare.r`
3. Hydrates TanStack Query from `self.flare.q` (if configured)
4. Calls Solid's `hydrate()` with the matched route tree
5. Sets up client-side navigation handlers

---

## Build and Development

### Vite Plugin

Flare uses a Vite plugin for development and build. The plugin handles route generation, code splitting, and platform-specific builds.

```tsx
/* vite.config.ts */
import { flare } from "@flare/v0/plugins"
import { cloudflare } from "@cloudflare/vite-plugin"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [
		flare({
			/* Tailwind integration (optional) */
			tailwind: {
				filePath: "./src/styles/tailwind.css",
				strict: false /* error on unknown classes */,
			},
		}),
		cloudflare({
			configPath: "./wrangler.jsonc",
			viteEnvironment: { name: "ssr" },
		}),
	],
	publicDir: "./public",
})
```

### File-Based Route Generation

Routes are discovered from `routes/` directory. File structure maps to virtual paths:

```
routes/
├── _root.tsx                    # _root_
├── about.tsx                    # _root_/about
├── products/
│   ├── _layout.tsx              # _root_/(products)
│   ├── index.tsx                # _root_/products
│   └── [id].tsx                 # _root_/products/[id]
├── (auth)/
│   ├── _layout.tsx              # _root_/(auth)
│   ├── login.tsx                # _root_/(auth)/login
│   └── register.tsx             # _root_/(auth)/register
└── docs/
    └── [...slug].tsx            # _root_/docs/[...slug]
```

**Generated files:**

| File                   | Environment | Contents                                       |
| ---------------------- | ----------- | ---------------------------------------------- |
| `routes.gen.ts`        | Server      | Full route tree with loaders, auth, boundaries |
| `routes.client.gen.ts` | Client      | Sparse route options, layouts only             |
| `types.gen.d.ts`       | Both        | Type declarations for routes                   |

### Static Assets

Static files in `public/` are served at the root URL:

```
public/
├── favicon.ico      # /favicon.ico
├── robots.txt       # /robots.txt
└── images/
    └── logo.png     # /images/logo.png
```

For build-time optimized assets, use imports:

```tsx
import logo from "./assets/logo.png"
;<img src={logo} alt="Logo" />
```

### Dev Server

Start the development server:

```bash
# Cloudflare Workers
bun run wrangler dev

# Or via package.json script
bun run dev
```

The dev server provides:

- Hot Module Replacement (HMR) for instant updates
- Server-side rendering on every request
- Route tree regeneration on file changes
- Error overlay for build and runtime errors

### HMR

Flare supports Vite's HMR for fast development:

- **Component changes**: Hot-swapped without full reload
- **Loader changes**: Page refresh required (server-only code)
- **Route changes**: Full refresh with route tree regeneration
- **Style changes**: Instant CSS updates

### Build Modes

Build for production:

```bash
# Cloudflare Workers
bun run wrangler deploy

# Or build only
bun run vite build
```

The build produces:

- **Server bundle**: Full route tree, loaders, SSR rendering
- **Client bundle**: Hydration code, layouts, sparse route options
- **Assets**: Optimized static files with content hashing

---

## Location Object

The `FlareLocation` object is available throughout the framework — in loaders, render functions, hooks, and navigation APIs.

```ts
interface FlareLocation {
	hash: string /* URL hash without # */
	params: Record<string, string | string[]> /* Parsed route params */
	pathname: string /* URL pathname */
	search: Record<string, unknown> /* Parsed search params */
	url: URL /* Full URL object */
	variablePath: string /* Route path with placeholders: /products/[id] */
	virtualPath: string /* Full virtual path: _root_/products/[id] */
}
```

**Access patterns:**

| Context          | How                                                         |
| ---------------- | ----------------------------------------------------------- |
| Loader/preloader | `ctx.location`                                              |
| Render function  | `props.location`                                            |
| Client component | `useLocation()` — returns `Accessor<Location>`              |
| Params only      | `useParams()` — returns `Accessor<Record<string, string>>`  |
| Search only      | `useSearch()` — returns `Accessor<Record<string, unknown>>` |

---

## Builder Methods

Detailed reference for each chainable method on `createPage`, `createLayout`, and `createRootLayout`.

### options

Cache timing configuration. Overrides `createRouter` defaults for this route.

```ts
.options({
  staleTime?: number,          /* Data freshness (ms). Default: router's defaultStaleTime */
  gcTime?: number,             /* Memory retention (ms). Default: router's defaultGcTime */
  prefetchStaleTime?: number,  /* Prefetch freshness. Default: router's defaultPrefetchStaleTime */
  prefetchGcTime?: number,     /* Prefetch retention. Default: router's defaultPrefetchGcTime */
})
```

### authenticate

Declares this route requires authentication. Calls global `authenticateFn` with optional `callerData`.

```ts
.authenticate()                              /* callerData = undefined */
.authenticate("admin")                       /* callerData = "admin" */
.authenticate(["admin", "editor"])           /* callerData = ["admin", "editor"] */
.authenticate({ role: "admin", level: 5 })   /* callerData = object */
.authenticate(({ params }) => params.orgId)  /* callerData = fn result */
```

If `authenticateFn` returns `null` → triggers `unauthorizedRender` with reason `"unauthenticated"`. If it throws → reason `"forbidden"`.

### authorize

Custom authorization logic. Runs after `authenticate`. Has access to resolved `auth`.

```ts
.authorize(({ auth, location, env, request, preloaderContext }) => {
  if (auth.orgId !== location.params.orgId) return false  /* Throws unauthorized */
  return auth  /* Return value replaces auth in downstream context */
})
```

Return `false` → auto-throws `unauthorized()`. Throw `unauthorized(message)` or `redirect(opts)` for explicit control.

**Context props:** `abortController`, `auth`, `env`, `location`, `preloaderContext`, `queryClient`, `request`, `match` [P], `matches` [P], `buildLocation` [P]

### input

Param/search/hash validation with Zod schemas. Parsed values replace raw strings in context.

```ts
.input({
  params: z.object({ id: z.string().uuid() }),
  searchParams: z.object({
    page: z.coerce.number().default(1),
    sort: z.enum(["name", "date"]).default("date"),
  }),
  hash: z.string().optional(),
})
```

Validation failure → throws `400` error, caught by `errorRender`.

### effects

Controls when loaders refetch on navigation.

```ts
.effects({
  /* Extract cache key dependencies from search params */
  loaderDeps: (ctx) => ({ tab: ctx.search.tab, page: ctx.search.page }),

  /* Control refetch behavior */
  shouldRefetch: ({ location, trigger }) => {
    /* location.current / location.next — compare old vs new */
    /* trigger: "initial" | "navigation" | "revalidation" */
    return trigger === "navigation"
  },
})
```

**`loaderDeps`:** Returns dependency object. Loader refetches only when deps change (shallow compare). Without it, loaders refetch on every navigation to the route.

**`shouldRefetch`:** Fine-grained control. Return `true` to refetch, `false` to use cache. Takes precedence over staleness checks.

### preloader

Sequential data loading. Runs root → page order. Return value accumulates into `preloaderContext` for children.

```ts
.preloader(async ({ env, request, auth, preloaderContext, queryClient, location }) => {
  const org = await getOrg(location.params.orgId, env)
  return { org }  /* Available to children as preloaderContext.org */
})
```

**Context props:** `abortController`, `auth`, `env`, `location`, `preloaderContext` (from parent), `queryClient`, `request`, `match` [P], `matches` [P], `buildLocation` [P]

### loader

Parallel data loading. All route loaders run concurrently via `Promise.allSettled` after preloaders complete.

```ts
.loader(async ({ preloaderContext, queryClient, defer, env, location, cause, deps, prefetch }) => {
  const products = await queryClient.ensureQueryData({
    queryKey: ["products", location.params.orgId],
    queryFn: () => fetchProducts(location.params.orgId, env),
  })

  const reviews = defer(() => fetchReviews(location.params.id))

  return { products, reviews }
})
```

**Context props:** `abortController`, `auth`, `cause`, `defer`, `deps`, `env`, `location`, `prefetch`, `preloaderContext`, `queryClient` (tracked), `request`, `match` [P], `matches` [P], `buildLocation` [P]

| Prop       | Type                              | Description                                               |
| ---------- | --------------------------------- | --------------------------------------------------------- |
| `cause`    | `"enter" \| "prefetch" \| "stay"` | Why the loader is running                                 |
| `defer`    | `DeferFn`                         | Wrap promises for streaming (see [Streaming](#streaming)) |
| `deps`     | `unknown[]`                       | Computed `loaderDeps` values                              |
| `prefetch` | `boolean`                         | `true` if this is a prefetch request                      |

### head

SEO and meta tag configuration. Merges root → page (child overrides parent).

```ts
.head(({ preloaderContext, loaderData, location }) => ({
  title: "Page Title",
  description: "Page description",
  canonical: "https://example.com/page",
  /* See Quick Start section for full HeadConfig shape */
}))
```

**Context props:** `auth` [P], `cause`, `loaderData`, `location`, `parentHead` (layout/page only), `prefetch`, `preloaderContext`, `match` [P], `matches` [P]

### headers

Response headers. Root layout sets base, children can override.

```ts
.headers(({ loaderData, location, env, request }) => ({
  "Cache-Control": "public, max-age=3600, s-maxage=86400",
  "CDN-Cache-Control": "max-age=86400",
}))
```

**Context props:** `auth` [P], `cause`, `env`, `loaderData`, `location`, `parentHeaders` (layout/page only), `prefetch`, `preloaderContext`, `request`, `match` [P], `matches` [P]

### render

Component function. Returns JSX.

```ts
/* Page */
.render(({ loaderData, preloaderContext, location, auth, cause, prefetch, queryClient }) => (
  <article>
    <h1>{preloaderContext.product.name}</h1>
    <ProductDetails data={loaderData} />
  </article>
))

/* Layout — receives children */
.render(({ children, loaderData }) => (
  <div class="layout">
    <Sidebar data={loaderData} />
    <main>{children}</main>
  </div>
))

/* Root layout — receives children, head, scripts */
.render(({ children }) => (
  <html>
    <head><HeadContent /></head>
    <body>{children}<Scripts /></body>
  </html>
))
```

**Props by factory:**

| Prop               | Page | Layout | Root |
| ------------------ | ---- | ------ | ---- |
| `auth`             | yes  | yes    | yes  |
| `buildLocation`    | [P]  | [P]    | [P]  |
| `cause`            | yes  | yes    | yes  |
| `children`         | no   | yes    | yes  |
| `loaderData`       | yes  | yes    | yes  |
| `location`         | yes  | yes    | yes  |
| `match`            | [P]  | [P]    | [P]  |
| `matches`          | [P]  | [P]    | [P]  |
| `prefetch`         | yes  | yes    | yes  |
| `preloaderContext` | yes  | yes    | yes  |
| `queryClient`      | yes  | yes    | yes  |

### errorRender

Error boundary. Catches errors from loader, preloader, or render of this route and descendants.

```ts
.errorRender(({ error, reset, location }) => (
  <div>
    <h1>Something went wrong</h1>
    <p>{error.message}</p>
    <button onClick={reset}>Retry</button>
  </div>
))
```

**Props:** `error`, `reset`, `location`, `buildLocation` [P], `match` [P], `matches` [P], `source` [P] (`"loader" | "component" | "preloader"`)

### notFoundRender

404 boundary. Catches `throw notFound()` from this route and descendants.

```ts
.notFoundRender(({ location }) => (
  <div>
    <h1>404</h1>
    <p>Page not found: {location.pathname}</p>
  </div>
))
```

**Props:** `location`, `buildLocation` [P], `data` [P] (payload from `notFound(data)`), `match` [P], `matches` [P], `type` [P] (`"route" | "resource"`)

### pendingRender

Loading state boundary. Shows while route data is loading during navigation.

```ts
.pendingRender(({ type, from, location }) => (
  <div>
    <Spinner />
    <p>Loading{from ? ` from ${from.pathname}` : ""}...</p>
  </div>
))
```

**Props:** `type` (`"initial" | "navigation" | "revalidation"`), `from` (`Location | undefined`), `location`, `buildLocation`, `match`, `matches`

Different from `<Await pending>` — pendingRender is navigation-level (before page renders). Await pending is deferred-data-level (within rendered page). They don't overlap.

### unauthorizedRender

Auth failure boundary. Catches authentication/authorization failures.

```ts
.unauthorizedRender(({ reason, auth, requiredAuth, location }) => {
  if (reason === "unauthenticated") {
    return <LoginPrompt returnTo={location.pathname} />
  }
  return <AccessDenied role={requiredAuth} />
})
```

**Props:** `auth` (`Auth | null`), `reason` (`"unauthenticated" | "forbidden"`), `requiredAuth` (`unknown` — callerData from `.authenticate()`), `location`, `buildLocation`, `match`, `matches`

### response

Non-HTML response. Page-only, mutually exclusive with `.render()`. For sitemaps, RSS, JSON APIs.

```ts
.response(({ preloaderContext, loaderData, request, env }) => {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  })
})
```

**Props:** `auth` [P], `env` [P], `loaderData`, `location` [P], `preloaderContext` [P], `request`

---

## Router

### Route Matching

Flare uses a radix tree for O(depth) route matching with backtracking for ambiguous paths.

**Priority order** (highest first):

1. Static segments (`/products`)
2. Dynamic params (`/[id]`)
3. Optional params (`/[[lang]]`)
4. Catch-all (`/[...path]`)
5. Optional catch-all (`/[[...path]]`)

```
/products/new     → matches /products/new (static) over /products/[id] (param)
/products/123     → matches /products/[id]
/docs/a/b/c       → matches /docs/[...slug] with slug = ["a", "b", "c"]
```

### Router State

Access router state and methods via `useRouter()`:

```ts
const router = useRouter()

router.state.isNavigating /* boolean — true during navigation */
router.state.location /* current FlareLocation */
```

### History API

```ts
const router = useRouter()

/* Navigation */
await router.navigate({ to: "/products/[id]", params: { id: "123" } })
await router.navigate({ to: "/search", search: { q: "flare" }, replace: true })

/* Cache management */
router.invalidate()                                     /* All routes */
router.invalidate({ routeId: "_root_/products/[id]" }) /* Specific route */
router.invalidate({ filter: (match) => ... })           /* Custom filter */
router.clearCache()                                     /* Clear all cached data */
await router.refetch()                                  /* Refetch current route */

/* Prefetch */
await router.prefetch({ to: "/products/[id]", params: { id: "123" } })
```

### buildLocation

Type-safe URL construction:

```ts
const router = useRouter()

router.buildUrl({ to: "/products/[id]", params: { id: "123" } })
/* → "/products/123" */

router.buildUrl({ to: "/search", search: { q: "flare", page: 2 } })
/* → "/search?q=flare&page=2" */

router.buildUrl({ to: "/docs/[...slug]", params: { slug: ["api", "hooks"] } })
/* → "/docs/api/hooks" */
```

Also available as `buildLocation` prop in loader/render contexts [P].

---

## Navigation

### Hard vs Framework

| Type          | Trigger                                           | What happens                       |
| ------------- | ------------------------------------------------- | ---------------------------------- |
| **Hard**      | Browser URL bar, `<a>` without Flare, full reload | Full SSR → HTML response           |
| **Framework** | `<Link>`, `router.navigate()`, back/forward       | NDJSON data fetch → partial update |

Framework navigation preserves layouts, only fetches changed route data.

### NDJSON Mode

All client-side navigation uses NDJSON (Newline-Delimited JSON) streaming.

**Request flow:**

1. Client sends GET with headers: `x-d: 1` (data request), `x-m: matchId1,matchId2` (routes needing data)
2. Server matches route, runs preloaders → loaders
3. Server streams NDJSON messages:

```
{"t":"l","m":"_root_","d":{...},"p":{...}}       /* Loader data + preloader context */
{"t":"l","m":"_root_/products/[id]","d":{...}}    /* Page loader data */
{"t":"h","m":"_root_/products/[id]","d":{...}}    /* Head config per route */
{"t":"q","d":[...]}                                /* TanStack Query states */
{"t":"r"}                                          /* Ready — render now */
{"t":"c","m":"_root_/products/[id]","k":"reviews","d":[...]}  /* Deferred chunk */
{"t":"d"}                                          /* Done — all chunks sent */
```

**Message types:**

| Type    | Description                                                           |
| ------- | --------------------------------------------------------------------- |
| `t:"l"` | Loader data. `m` = matchId, `d` = loaderData, `p` = preloaderContext  |
| `t:"h"` | Head config. `m` = matchId, `d` = HeadConfig                          |
| `t:"q"` | TanStack Query states for hydration                                   |
| `t:"r"` | Ready signal — all loaders done, client can render                    |
| `t:"c"` | Deferred chunk. `m` = matchId, `k` = key, `d` = data                  |
| `t:"e"` | Error. `m` = matchId, `k` = deferred key (optional), `e` = error info |
| `t:"x"` | Redirect. `u` = url, `s` = status, `r` = replace flag                 |
| `t:"d"` | Done — stream complete                                                |

**Partial updates:** Client sends `x-m` header with only matchIds that need refetching. Unchanged layouts skip loader execution entirely.

### Link Component

```tsx
import { Link } from "@flare/v0"
;<Link to="/products/[id]" params={{ id: "123" }} search={{ tab: "reviews" }} hash="section">
	View Product
</Link>
```

**Props:**

| Prop             | Type                                 | Default        | Description                          |
| ---------------- | ------------------------------------ | -------------- | ------------------------------------ |
| `to`             | `string`                             | required       | Route path pattern                   |
| `params`         | `Record<string, string \| string[]>` | -              | Route params                         |
| `search`         | `Record<string, unknown>`            | -              | Query params                         |
| `hash`           | `string`                             | -              | URL hash (without #)                 |
| `replace`        | `boolean`                            | `false`        | Use `replaceState`                   |
| `scroll`         | `boolean`                            | `true`         | Scroll to top                        |
| `shallow`        | `boolean`                            | `false`        | URL-only update, no data fetch       |
| `force`          | `boolean`                            | `false`        | Navigate even if URL matches current |
| `prefetch`       | `false \| "hover" \| "viewport"`     | router default | Prefetch strategy                    |
| `viewTransition` | `boolean \| ViewTransitionOptions`   | router default | View transition config               |
| `disabled`       | `boolean`                            | `false`        | Render as `<span>`                   |
| `activeClass`    | `string`                             | -              | CSS class when route matches         |
| `activeCss`      | `string`                             | -              | Inline CSS when active               |
| `activeTw`       | `string`                             | -              | Tailwind when active                 |
| `inactiveClass`  | `string`                             | -              | CSS class when not matched           |
| `inactiveCss`    | `string`                             | -              | Inline CSS when inactive             |
| `inactiveTw`     | `string`                             | -              | Tailwind when inactive               |
| `class`          | `string`                             | -              | Base CSS class                       |
| `css`            | `string`                             | -              | Base inline CSS                      |
| `tw`             | `string`                             | -              | Base Tailwind                        |

**Active matching:** Link is "active" when current URL matches the `to` path. Matches are prefix-based for layouts.

### Prefetch Strategies

| Strategy     | Trigger                   | Behavior                        |
| ------------ | ------------------------- | ------------------------------- |
| `false`      | Never                     | No prefetching                  |
| `"hover"`    | Mouse enter / touch start | Fetch on hover with small delay |
| `"viewport"` | IntersectionObserver      | Fetch when link enters viewport |
| `"render"`   | Component mount           | Fetch immediately on render     |

Configure globally via `createRouter({ defaultPrefetch })` or per-link via `prefetch` prop.

Prefetched data respects `prefetchStaleTime` and `prefetchGcTime`.

### Programmatic Navigation

```ts
const router = useRouter()

/* Navigate */
await router.navigate({
	to: "/products/[id]",
	params: { id: "123" },
	search: { tab: "reviews" },
	replace: false,
	scroll: true,
	viewTransition: true,
})

/* Or via useNavigate hook */
const navigate = useNavigate()
await navigate({ to: "/dashboard" })
```

### Shallow Navigation

Update URL without fetching data or running loaders. Useful for URL-synced UI state.

```tsx
;<Link to="/products" search={{ tab: "specs" }} shallow />

/* Or programmatically */
router.navigate({ to: "/products", search: { tab: "specs" }, shallow: true })
```

Shallow navigation:

- Updates URL and browser history
- Does NOT trigger loaders
- Does NOT update `loaderData`
- DOES update `useSearch()` and `useLocation()`

### View Transitions

Integrates with the View Transitions API for animated page transitions.

```ts
/* Enable globally */
createRouter({ defaultViewTransition: true })

/* Or per-link */
<Link to="/about" viewTransition />
<Link to="/about" viewTransition={{ types: ["fade", "slide-left"] }} />

/* Dynamic types */
<Link to="/about" viewTransition={{
  types: ({ direction, pathChanged }) => {
    if (!pathChanged) return false  /* No transition for same-path */
    return direction === "back" ? ["slide-right"] : ["slide-left"]
  }
}} />
```

**Direction detection:** Tracks history index. Forward = index increases, back = index decreases.

**CSS integration:**

```css
/* Data attributes set on <html> during transition */
[data-transition-direction="forward"] {
	/* Forward animation */
}

[data-transition-direction="back"] {
	/* Back animation */
}
```

**Accessibility:** Respects `prefers-reduced-motion`. Skips transitions automatically.

### Scroll Restoration

Automatic scroll position save/restore on navigation.

```ts
createRouter({
	scrollRestoration: true /* Enable (default: true) */,
	scrollRestorationBehavior: "auto" /* "auto" | "smooth" */,
	scrollRestorationCacheMaxEntries: 2000 /* Max stored positions */,
	getScrollRestorationKey: (loc) => loc.pathname /* Custom cache key */,
})
```

**Behavior:**

| Action             | Scroll                 |
| ------------------ | ---------------------- |
| Back/forward       | Restore saved position |
| New navigation     | Scroll to top          |
| Hash navigation    | Scroll to element      |
| Shallow navigation | No scroll change       |
| `scroll: false`    | No scroll change       |

**Element-level restoration** with `useScrollRestore`:

```tsx
const scrollRef = useScrollRestore("sidebar")
<div ref={scrollRef} style="overflow-y: auto">...</div>
```

### Navigation Blocking

Prevent navigation when user has unsaved changes.

```tsx
const [isDirty, setIsDirty] = createSignal(false)
const { isBlocked, proceed, reset } = useBlocker(() => isDirty())

<Show when={isBlocked()}>
  <div class="confirm-dialog">
    <p>Unsaved changes. Leave?</p>
    <button onClick={proceed}>Leave</button>
    <button onClick={reset}>Stay</button>
  </div>
</Show>
```

**`useBlocker(when)`** — client-only hook.

| Property    | Type                | Description                               |
| ----------- | ------------------- | ----------------------------------------- |
| `isBlocked` | `Accessor<boolean>` | Whether a navigation is currently blocked |
| `proceed`   | `() => void`        | Allow the blocked navigation              |
| `reset`     | `() => void`        | Cancel and stay on current page           |

Also handles `beforeunload` for browser navigation (close tab, URL bar).

---

## Data Loading

### Preloaders

Run sequentially from root to page. Each preloader's return value is available to children via `preloaderContext`.

```
Root preloader → Layout preloader → Page preloader
     ↓                  ↓                  ↓
  { user }        { user, org }     { user, org, product }
```

**Use for:** Shared data needed by multiple routes — user session, org config, permissions.

### Loaders

Run in parallel via `Promise.allSettled` after all preloaders complete.

```
Preloaders done → All loaders run concurrently
                   ├── Root loader
                   ├── Layout loader
                   └── Page loader
```

**Error isolation:** `allSettled` means one loader failure doesn't block others. Failed loaders trigger their `errorRender` boundary.

**Use for:** Route-specific data — product details, page content, API calls.

### Loader Context

Full context available in loaders:

```ts
.loader(async (ctx) => {
  ctx.abortController   /* AbortController — abort signal for cleanup */
  ctx.auth              /* Auth | null — resolved auth from authenticateFn */
  ctx.cause             /* "enter" | "prefetch" | "stay" */
  ctx.defer             /* DeferFn — wrap promises for streaming */
  ctx.deps              /* unknown[] — computed loaderDeps values */
  ctx.env               /* Env — CF Worker bindings (KV, D1, DO, R2, etc.) */
  ctx.location          /* FlareLocation — current route location */
  ctx.prefetch          /* boolean — true if prefetch request */
  ctx.preloaderContext  /* Accumulated preloader data from ancestors */
  ctx.queryClient       /* QueryClient (tracked) — auto-serialized */
  ctx.request           /* Request — incoming HTTP request */
})
```

### Match ID

Each matched route gets a unique ID = its `virtualPath`.

```
URL: /products/123
Matches: ["_root_", "_root_/(dashboard)", "_root_/products/[id]"]
```

Match IDs are used for:

- Cache keys in the route cache
- Identifying which routes need data in NDJSON requests (`x-m` header)
- Targeting invalidation

### Route Cache

Client maintains an LRU cache of route data keyed by match ID + params + deps.

```ts
createRouter({
	routeCacheMaxEntries: 200 /* Max cached entries (default: 200) */,
})
```

### Cache and Staleness

| Setting             | Meaning                                                          | Default             |
| ------------------- | ---------------------------------------------------------------- | ------------------- |
| `staleTime`         | Data considered fresh for this duration. No refetch while fresh. | `0` (always stale)  |
| `gcTime`            | Data kept in memory for this duration after last access.         | `1_800_000` (30min) |
| `prefetchStaleTime` | Same as staleTime but for prefetched data.                       | `0`                 |
| `prefetchGcTime`    | Same as gcTime but for prefetched data.                          | `1_800_000`         |

**Resolution:** Route `.options()` → router `default*` config.

**Navigation refetch behavior:**

| Change        | Refetch?                                                                           |
| ------------- | ---------------------------------------------------------------------------------- |
| Params change | Always                                                                             |
| Search change | Only if `loaderDeps` extracts search keys, or `defaultRefetchOnSearchChange: true` |
| Hash change   | Never                                                                              |

### Invalidation

```ts
const router = useRouter()

/* Invalidate all routes */
router.invalidate()

/* Invalidate specific route */
router.invalidate({ routeId: "_root_/products/[id]" })

/* Invalidate by match ID */
router.invalidate({ matchId: "_root_/products/[id]" })

/* Custom filter */
router.invalidate({ filter: (match) => match.virtualPath.includes("products") })

/* Refetch current route data */
await router.refetch()

/* Clear entire cache */
router.clearCache()
```

### Request Deduplication

**Automatic fetch dedup:** GET/HEAD requests with same URL + headers are deduped within a single server request.

**`dedupe()` helper:** For non-fetch operations:

```ts
import { dedupe } from "@flare/v0/server"

const getUser = dedupe(async (id: string, env: Env) => {
	return env.D1.prepare("SELECT * FROM users WHERE id = ?").bind(id).first()
})

/* Same args within same request = same promise */
await getUser("123", env) /* DB query */
await getUser("123", env) /* Cached promise */
await getUser("456", env) /* New DB query (different args) */
```

---

## TanStack Query Integration

Optional. When `getQueryClient` is provided to `createRouter`, all Query-related code is included. Without it, everything is tree-shaken.

### Tracked QueryClient

In loaders, `queryClient` is a tracked wrapper. Methods like `ensureQueryData` and `prefetchQuery` are intercepted to record which queries were used.

```ts
.loader(async ({ queryClient }) => {
  /* These calls are tracked for SSR serialization */
  const products = await queryClient.ensureQueryData({
    queryKey: ["products"],
    queryFn: fetchProducts,
  })
  return { products }
})
```

**Tracked methods:** `ensureQueryData`, `prefetchQuery`, `fetchQuery`, `getQueryData`, `setQueryData`

### Auto-Serialization

On SSR, tracked queries are dehydrated into `self.flare.q`:

```ts
self.flare.q = [
  { key: ["products"], data: [...], staleTime: 60000 },
  { key: ["user", "123"], data: {...} },
]
```

### Auto-Hydration

On client, `self.flare.q` is rehydrated into the QueryClient before rendering. No refetch needed for data already loaded during SSR.

Enable with `queryClientSync: true` (default when `getQueryClient` provided).

---

## Hydration

### self.flare State

The SSR payload embedded as `<script>self.flare = {...}</script>`:

```ts
interface FlareState {
	s?: string /* Data request signature */
	r: {
		/* Route state */
		pathname: string
		params: Record<string, string | string[]>
		matches: Array<{
			id: string /* virtualPath */
			loaderData: unknown
			preloaderContext?: unknown
		}>
	}
	q: Array<{
		/* TanStack Query states */
		key: unknown[]
		data: unknown
		staleTime?: number
	}>
	c: {
		/* Static context (from middleware) */
		routerDefaults?: { prefetchIntent?; staleTime?; gcTime? }
		locale?: string
		dir?: string
		theme?: string
	}
	ph?: Array<{
		/* Per-route head configs */
		matchId: string
		head: HeadConfig
	}>
	e?: Array<{
		/* Dev-only: SSR errors */
		source: string
		name: string
		message: string
		stack?: string
	}>
}
```

### SSR to Client Handoff

1. Server renders HTML with `self.flare` inline script
2. Client reads `self.flare` from `globalThis`
3. Route match cache populated from `self.flare.r`
4. QueryClient hydrated from `self.flare.q`
5. Solid's `hydrate()` attaches event handlers to existing DOM
6. Client navigation takes over — all subsequent nav via NDJSON

### Match Cache Population

Each match from `self.flare.r.matches` is inserted into the client route cache with its `loaderData` and `preloaderContext`. This prevents re-fetching data that was already loaded during SSR.

### QueryClient Hydration

Each entry from `self.flare.q` is set in the QueryClient with its data and staleTime. Queries marked fresh won't refetch until staleTime expires.

---

## Authentication and Authorization

### authenticateFn

Global authentication function defined on `createServerHandler`. Called only when a route has `.authenticate()` or `.authorize()`.

```ts
createServerHandler({
	authenticateFn: async ({ env, request, location, callerData }) => {
		const token = request.headers.get("Authorization")?.split(" ")[1]
		if (!token) return null /* → unauthorizedRender("unauthenticated") */

		const user = await verifyToken(token, env)
		return { sub: user.id, email: user.email, role: user.role }
	},
})
```

| Param        | Type            | Description                            |
| ------------ | --------------- | -------------------------------------- |
| `env`        | `Env`           | CF Worker bindings                     |
| `request`    | `Request`       | HTTP request                           |
| `location`   | `FlareLocation` | Parsed route location                  |
| `callerData` | `unknown`       | Value from `.authenticate(callerData)` |

**Return value** becomes `auth` in all downstream contexts. Return `null` → auth failure.

### authenticate Method

Declarative auth requirement on routes:

```ts
.authenticate()                  /* Just require auth, no callerData */
.authenticate("admin")           /* callerData = "admin" — check role in authenticateFn */
.authenticate({ minLevel: 5 })   /* callerData = object */
```

### authorize Method

Custom authorization after `authenticate`:

```ts
.authorize(({ auth, location }) => {
  /* auth is guaranteed non-null here (authenticate ran first) */
  if (auth.role !== "admin") throw unauthorized("Admin only")
  return auth  /* Return value replaces auth downstream */
})
```

### Auth Flow

```
1. Route matched → has .authenticate()?
   ├─ No  → public route, auth = null
   └─ Yes → call authenticateFn({ env, request, location, callerData })
       ├─ Returns null  → unauthorizedRender (reason: "unauthenticated")
       ├─ Throws        → unauthorizedRender (reason: "forbidden")
       └─ Returns auth  → continue
2. Has .authorize(fn)?
   └─ Call fn({ auth, location, ... })
       ├─ Returns false        → auto-throw unauthorized
       ├─ Throws redirect/unauth → handle
       └─ Returns value        → replaces auth in context
3. Run preloaders (auth in context)
4. Run loaders (auth in context)
5. Render (auth in props)
```

### Auth Inheritance

Auth flows down the route tree:

```ts
/* Layout — authenticate */
createLayout("_root_/(dashboard)")
  .authenticate("dashboard")

/* Page — inherits layout's auth, adds authorize */
createPage("_root_/(dashboard)/settings")
  .authorize(({ auth }) => {
    if (!auth.isAdmin) throw unauthorized()
    return auth
  })
  .render(({ auth }) => ...)  /* auth guaranteed non-null */
```

If a parent layout requires auth, all child routes inherit that auth requirement.

---

## Server Functions

### createServerFn

Type-safe RPC. Server code stays on server, client gets a thin fetch stub.

```ts
import { createServerFn } from "@flare/v0/server"

export const updateProduct = createServerFn({ method: "post", name: "updateProduct" })
	.authenticate()
	.input(
		z.object({
			id: z.string(),
			name: z.string(),
			price: z.number(),
		}),
	)
	.authorize(({ auth, input }) => auth.permissions.includes("products:write"))
	.handler(async ({ auth, input, env, request }) => {
		await env.D1.prepare("UPDATE products SET name = ?, price = ? WHERE id = ?")
			.bind(input.name, input.price, input.id)
			.run()
		return { success: true }
	})
```

**Builder chain:** `createServerFn(config)` → `.authenticate()` → `.input(schema)` → `.authorize(fn)` → `.handler(fn)`

| Config   | Type                                              | Description                      |
| -------- | ------------------------------------------------- | -------------------------------- |
| `method` | `"get" \| "post" \| "put" \| "patch" \| "delete"` | HTTP method                      |
| `name`   | `string`                                          | Function name (used in URL path) |

**Handler context:** `{ auth, input, env, request }`

**Build-time transform:** The Vite plugin replaces server code with a fetch call to `/_fn/{hash}/{name}`. Server handler matches this path, validates CSRF, runs the handler.

### Single-Flight Mutations

Call server functions from client:

```ts
import { updateProduct } from "./server-fns"

const result = await updateProduct({ id: "123", name: "New Name", price: 29.99 })
```

Input is validated on both client (fast feedback) and server (security). Validation errors throw `ServerFnValidationError` with Zod's flattened format.

### TanStack Query Helpers

Server functions include auto-generated TanStack Query options:

```ts
import { updateProduct, getProduct } from "./server-fns"

/* Query options — for useQuery/ensureQueryData */
const data = await queryClient.ensureQueryData(getProduct.queryOptions({ id: "123" }))

/* Mutation options — for useMutation */
const mutation = createMutation(() => updateProduct.mutationOptions())

/* Query key — for invalidation */
queryClient.invalidateQueries({ queryKey: getProduct.key({ id: "123" }) })
```

---

## Middleware

Middleware runs in order before route handling. Three result types control flow:

```ts
import { middlewareNext, middlewareRespond, middlewareBypass } from "@flare/v0/server"

type FlareMiddleware = (
	ctx: MiddlewareContext,
	next: () => Promise<MiddlewareResult>,
) => Promise<MiddlewareResult>
```

| Result                        | Behavior                                          |
| ----------------------------- | ------------------------------------------------- |
| `middlewareNext()`            | Continue to next middleware / route handler       |
| `middlewareRespond(response)` | Return response, still runs `onResponse` handlers |
| `middlewareBypass(response)`  | Return response, skip all `onResponse` handlers   |

**MiddlewareContext:**

| Property                | Type                         | Description                              |
| ----------------------- | ---------------------------- | ---------------------------------------- |
| `env`                   | `Env`                        | CF Worker bindings                       |
| `request`               | `Request`                    | HTTP request                             |
| `url`                   | `URL`                        | Parsed URL                               |
| `nonce`                 | `string`                     | CSP nonce for this request               |
| `executionContext`      | `ExecutionContext`           | CF `waitUntil`, `passThroughOnException` |
| `serverRequestContext`  | `Store`                      | Key-value store shared across request    |
| `onResponse`            | `(handler) => void`          | Register response transform              |
| `applyResponseHandlers` | `(res) => Promise<Response>` | Apply all `onResponse` handlers          |

### Built-in Middlewares

**static-assets:** Serve static files from CF ASSETS binding.

```ts
import { staticAssets } from "@flare/v0/server/middleware"

staticAssets({ paths: ["/assets/", "/favicon.ico"] })
```

Paths ending with `/` = prefix match. Exact strings = exact match. Uses `middlewareBypass`.

**api-proxy:** Forward requests to a service binding.

```ts
apiProxy({
	pathPrefix: "/api",
	target: ({ env }) => env.GATEWAY,
	rewrite: (path) => path.replace("/api", ""),
	headers: ({ env }) => ({ "X-API-Key": env.API_KEY }),
})
```

**cdn-proxy:** Serve assets from R2 bucket.

```ts
cdnProxy({
	pathPrefix: "/cdn",
	bucket: ({ env }) => env.R2_BUCKET,
	cacheControl: "public, max-age=31536000, immutable",
	edgeCache: true /* Use CF Cache API */,
})
```

**html-cache:** SWR cache for HTML responses via CF Cache API.

```ts
htmlCache({
	name: "my-app",
	html: { cacheControl: "public, max-age=60, stale-while-revalidate=600" },
	skip: /^\/_fn/,
	files: [{ path: "sitemap.xml", cacheControl: "public, max-age=3600" }],
})
```

Returns `x-swr-status: HIT|STALE` header. Skip via `x-skip-cache: "1"` header or `?xskipcache=1`.

**i18n:** Locale detection, URL routing, cookie persistence.

```ts
i18n({
	locales: ["en-us", "hr", "de"],
	defaultLocale: "en-us",
	cookie: { key: "locale", maxAge: 31536000 },
	skip: ["/_fn/"],
})
```

Detection priority: URL path → cookie → Accept-Language → default. Handles redirects for normalization (EN-US → en-us), default locale removal (/en-us/about → /about), and root locale redirect (/ → /hr for non-default users). CLDR language distance matching for script variants.

---

## Rendering

### SSR

Every initial page load is server-side rendered. The handler:

1. Matches URL to route
2. Runs middleware chain
3. Authenticates (if required)
4. Runs preloaders sequentially
5. Runs loaders in parallel
6. Calls `renderToStringAsync` with matched route tree
7. Returns HTML response with `self.flare` payload

### CSR

After hydration, all navigation is client-side:

1. Client intercepts `<Link>` clicks and `router.navigate()` calls
2. Fetches route data via NDJSON
3. Updates match cache
4. Solid's fine-grained reactivity updates only changed DOM nodes

### Streaming

`defer()` enables streaming — loaders return immediately, deferred data arrives later.

```ts
.loader(async ({ defer }) => {
  const critical = await fetchCritical()      /* Blocks render */
  const slow = defer(() => fetchSlow())       /* Streams after render */
  return { critical, slow }
})
```

**`defer(fn, opts?)`:**

| Option               | Type      | Default     | Description        |
| -------------------- | --------- | ----------- | ------------------ |
| `awaitOnInitialLoad` | `boolean` | from config | Force-await on SSR |
| `key`                | `string`  | auto        | Deferred chunk key |

**Initial load behavior:** `initialLoadDisableDefer: false` (default) means deferred data streams during SSR too. Set to `true` to await all deferred data on SSR (makes response CDN-cacheable).

### defer Helper

```ts
const data = defer(() => slowQuery(), { key: "reviews" })
/* data is Deferred<T> — has .promise, .__deferred, .__key */
```

### Await Component

Renders deferred data with loading and error states.

```tsx
<Await
	promise={loaderData.slow}
	pending={<Skeleton />}
	error={(err, reset) => <ErrorMsg error={err} onRetry={reset} />}
>
	{(data) => <Content data={data} />}
</Await>
```

| Prop       | Type                                             | Description                     |
| ---------- | ------------------------------------------------ | ------------------------------- |
| `promise`  | `Deferred<T> \| Promise<T>`                      | The deferred/promise to resolve |
| `pending`  | `JSX.Element`                                    | Loading state UI                |
| `error`    | `(err: Error, reset: () => void) => JSX.Element` | Error state UI                  |
| `children` | `(data: T) => JSX.Element`                       | Success state render function   |

---

## Head Management

Head config merges from root layout down to page. Child values override parent. Arrays are replaced, not merged.

```ts
/* Root: base defaults */
.head(() => ({
  title: "My App",
  robots: { index: true, follow: true },
  favicons: [{ rel: "icon", href: "/favicon.ico" }],
}))

/* Layout: adds context */
.head(() => ({
  title: "Dashboard - My App",
}))

/* Page: final overrides */
.head(({ loaderData }) => ({
  title: `${loaderData.product.name} - My App`,
  description: loaderData.product.description,
  openGraph: { title: loaderData.product.name, image: loaderData.product.image },
}))
```

Merged head is rendered by `<HeadContent />` in root layout.

---

## SEO

### Meta Tags

```ts
.head(() => ({
  title: "Page Title",
  description: "Meta description for search engines",
  canonical: "https://example.com/page",
  keywords: ["keyword1", "keyword2"],
  robots: { index: true, follow: true, noarchive: false, nosnippet: false },
}))
```

### Open Graph

```ts
.head(() => ({
  openGraph: {
    title: "OG Title",
    description: "OG Description",
    type: "website",
    url: "https://example.com/page",
    images: [{ url: "https://example.com/og.jpg", width: 1200, height: 630 }],
    siteName: "My Site",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    site: "@mysite",
    creator: "@author",
  },
}))
```

### Structured Data

JSON-LD rendered as `<script type="application/ld+json">`. Zero bundle size — server-only.

```ts
.head(() => ({
  jsonLd: {
    "@type": "Product",
    name: "Widget",
    offers: { "@type": "Offer", price: "9.99", priceCurrency: "USD" },
  },
}))
```

Use `schema-dts` for type safety.

---

## Styling

### Global CSS

Import in root layout or via Vite config:

```tsx
/* In root layout */
import "./global.css"

/* Or via Vite plugin */
flare({ tailwind: { filePath: "./src/styles/tailwind.css" } })
```

### Page Scoped CSS

Via `.head()`:

```ts
.head(() => ({
  css: `.product-page { padding: 2rem; }`,
}))
```

### css Prop

Inline CSS strings, scoped via `data-c` attribute at build time:

```tsx
<div css="padding: 1rem; background: blue">Hello</div>
```

Build transform: `css="..."` → `data-c={registerCSS(...)}` with scoped selectors.

### tw Prop

Tailwind classes compiled to CSS at build time. Zero runtime cost.

```tsx
<div tw="flex gap-4 p-4 hover:bg-gray-100">Hello</div>
```

Build transform: `tw="..."` → `css="..."` → scoped CSS. Requires `tailwind` config in Vite plugin.

### Tailwind Integration

```ts
/* vite.config.ts */
flare({
	tailwind: {
		filePath: "./src/styles/tailwind.css" /* Tailwind entry */,
		strict: false /* true = error on unknown classes */,
	},
})
```

### ResetCSS

Built-in CSS reset component:

```tsx
import { ResetCSS } from "@flare/v0"

/* In root layout <head> */
;<ResetCSS />
```

### ThemeScript

Prevents FOUC (Flash of Unstyled Content) for dark/light theme:

```tsx
import { ThemeScript } from "@flare/v0"

/* In root layout <head>, before other scripts */
;<ThemeScript />
```

Reads `localStorage`, sets `data-theme` attribute on `<html>` before paint.

Configure via `createFlareBuild({ theme: { defaultTheme, attribute, storageKey } })`.

### View Transitions CSS

Built-in CSS for view transition animations:

```tsx
import { ViewTransitionsCSS } from "@flare/v0"

/* In root layout <head> */
;<ViewTransitionsCSS />
```

### styles Function

Scoped styles with state variants and CSS variables:

```tsx
import { styles } from "@flare/v0"

/* Simple */
<div {...styles("box", "padding: 1rem")} />

/* With Tailwind */
<div {...styles("card", { tw: "flex gap-4 p-4" })} />

/* With state + vars */
<div {...styles("button", {
  state: { active: isActive(), size: "lg" },
  vars: { accent: accentColor() },
  css: (s, v) => `
    background: gray;
    ${s.active(true)} { background: ${v.accent}; }
    ${s.size("lg")} { padding: 2rem; }
  `,
})} />

/* With outerCss from parent */
function Card(props: { outerCss?: string }) {
  return <div {...styles("card", {
    tw: "p-4 rounded",
    outerCss: props.outerCss,
  })} />
}
```

**Returns:** `{ "data-c": string, style?: CSSProperties }` — spread onto element.

**Build-time transform:** `styles()` names validated for uniqueness. Errors in production if duplicate.

---

## Lazy Loading

### lazy

Server-side rendered, then lazy-loaded on client. Component is prerendered in SSR HTML.

```tsx
import { lazy } from "@flare/v0"

const HeavyChart = lazy(() => import("./HeavyChart"))

/* SSR: renders to HTML. Client: loads chunk, hydrates. */
<HeavyChart data={data} />
```

### clientLazy

Client-only component. Renders nothing during SSR, loads + renders on client after hydration.

```tsx
import { clientLazy } from "@flare/v0"

const InteractiveMap = clientLazy(() => import("./InteractiveMap"))

/* SSR: renders nothing. Client: loads chunk, renders. */
<InteractiveMap />
```

### preload

Fire-and-forget module preloading:

```tsx
import { preload } from "@flare/v0"

/* Preload a chunk without rendering */
preload(() => import("./HeavyChart"))

/* Useful in event handlers */
onMouseEnter={() => preload(() => import("./Tooltip"))}
```

---

## Error Handling

### Error Classes

```ts
import { redirect, notFound, unauthorized, forbidden } from "@flare/v0"
```

| Function                 | Error Class            | Status | Description         |
| ------------------------ | ---------------------- | ------ | ------------------- |
| `redirect(opts)`         | `RedirectResponse`     | 302    | Navigation redirect |
| `notFound(message?)`     | `NotFoundError`        | 404    | Page not found      |
| `unauthorized(message?)` | `UnauthenticatedError` | 401    | Not authenticated   |
| `forbidden(message?)`    | `ForbiddenError`       | 403    | Not authorized      |

**redirect options:**

```ts
/* Internal redirect */
redirect({ to: "/login", replace: true })
redirect({ to: "/login", status: 301 })

/* External redirect */
redirect({ href: "https://example.com/oauth" })
```

| Option    | Type      | Default | Description         |
| --------- | --------- | ------- | ------------------- |
| `to`      | `string`  | -       | Internal route path |
| `href`    | `string`  | -       | External URL        |
| `status`  | `number`  | `302`   | HTTP status code    |
| `replace` | `boolean` | `false` | Use `replaceState`  |

**Type guards:**

```ts
import {
	isRedirectResponse,
	isNotFoundError,
	isUnauthenticatedError,
	isForbiddenError,
} from "@flare/v0"
```

### Boundary Bubbling

Errors bubble up the route tree until caught by a boundary:

```
Page → Layout → Parent Layout → ... → Root Layout
```

All 4 boundary types bubble: `errorRender`, `notFoundRender`, `pendingRender`, `unauthorizedRender`.

**Best practice:** Define default boundaries on `_root_` to catch all uncaught errors:

```ts
createRootLayout("_root_")
  .render(...)
  .errorRender(...)
  .notFoundRender(...)
  .pendingRender(...)
  .unauthorizedRender(...)
```

**`notFoundBoundary`** config: `"nearest"` (default) bubbles to closest ancestor. `"root"` always goes to root layout.

### Redirect

Throw `redirect()` from anywhere — loaders, preloaders, authorize, middleware. Handled automatically.

```ts
.preloader(async ({ request }) => {
  const session = await getSession(request)
  if (!session) throw redirect({ to: "/login" })
  return { user: session.user }
})
```

---

## Components

### Link

See [Link Component](#link-component) in Navigation section.

### Outlet

Renders child routes within a layout. Used implicitly — layout's `children` prop contains the outlet.

```tsx
createLayout("_root_/(dashboard)").render(({ children }) => (
	<div class="layout">
		<Sidebar />
		<main>{children}</main> {/* Outlet renders here */}
	</div>
))
```

Context-based. Reactively updates when route changes within the layout.

### Await

See [Await Component](#await-component) in Rendering section.

### HeadContent

Renders merged head tags in `<head>`. SSR-only component — must be in root layout's `<head>`.

```tsx
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<HeadContent />
</head>
```

Renders: `<title>`, `<meta>`, `<link>`, `<script type="application/ld+json">`, favicons, canonical, hreflang, Open Graph, Twitter cards, custom elements, scoped CSS.

### Scripts

Renders Flare runtime scripts. Must be in root layout's `<body>`.

```tsx
<body>
	{children}
	<Scripts />
</body>
```

Renders: `self.flare` state payload + client entry `<script type="module">`. Both use CSP nonce.

---

## Hooks

### useLocation

```ts
const location = useLocation()
location().pathname /* "/products/123" */
location().search /* { tab: "reviews" } */
location().hash /* "section" */
```

Returns `Accessor<Location>`. Reactive — updates on navigation.

### useParams

```ts
const params = useParams<{ id: string }>()
params().id /* "123" */
```

Returns `Accessor<Record<string, string | string[]>>`. Type parameter for inference.

### useSearch

```ts
const search = useSearch<{ tab: string; page: number }>()
search().tab /* "reviews" */
search().page /* 1 */
```

Returns `Accessor<Record<string, unknown>>`. Type parameter for inference.

### useRouter

```ts
const router = useRouter()
router.navigate({ to: "/home" })
router.state.isNavigating
router.state.location
router.invalidate()
router.clearCache()
router.refetch()
router.prefetch({ to: "/about" })
router.buildUrl({ to: "/products/[id]", params: { id: "123" } })
```

See [Router](#router) section.

### useMatch

```ts
const match = useMatch({ from: "_root_/products/[id]" })
match()?.params /* { id: "123" } */
match()?.virtualPath /* "_root_/products/[id]" */
```

Returns `Accessor<RouteMatch | undefined>`. `undefined` if route not currently matched.

### useMatches

```ts
const matches = useMatches()
matches() /* [{ virtualPath: "_root_", ... }, { virtualPath: "_root_/products/[id]", ... }] */
```

Returns `Accessor<RouteMatch[]>`. All matched routes from root to leaf.

### useLoaderData

```ts
/* Basic */
const data = useLoaderData({ from: "_root_/products/[id]" })
data() /* { products: [...], reviews: Deferred<...> } */

/* With selector */
const name = useLoaderData({
	from: "_root_/products/[id]",
	select: (d) => d.product.name,
})
name() /* "Widget" */
```

Type-safe when code generation provides `LoaderDataMap`.

### usePreloaderContext

```ts
/* Basic */
const ctx = usePreloaderContext({ from: "_root_/(dashboard)" })
ctx() /* { user: {...}, org: {...} } */

/* With selector */
const user = usePreloaderContext({
	from: "_root_",
	select: (ctx) => ctx.user,
})
user() /* { id: "123", name: "John" } */
```

### useHydrated

```ts
const hydrated = useHydrated()
/* false during SSR, true after client hydration */

<Show when={hydrated()}>
  <InteractiveWidget />
</Show>
```

### useBlocker

See [Navigation Blocking](#navigation-blocking).

### useScrollRestore

Element-level scroll restoration for scrollable containers:

```tsx
const scrollRef = useScrollRestore("sidebar-scroll")
<div ref={scrollRef} style="overflow-y: auto; height: 100vh">
  <Navigation />
</div>
```

Saves/restores scroll position per `getScrollRestorationKey` + element ID.

---

## Contexts

### MiddlewareContext

Available in middleware functions:

| Property                | Type                         | Description                                             |
| ----------------------- | ---------------------------- | ------------------------------------------------------- |
| `env`                   | `Env`                        | CF Worker bindings                                      |
| `request`               | `Request`                    | HTTP request                                            |
| `url`                   | `URL`                        | Parsed URL                                              |
| `nonce`                 | `string`                     | CSP nonce                                               |
| `executionContext`      | `ExecutionContext`           | `waitUntil`, `passThroughOnException`                   |
| `serverRequestContext`  | `Store`                      | `.get(key)`, `.set(key, value)` — shared across request |
| `onResponse`            | `(handler) => void`          | Register response transform                             |
| `applyResponseHandlers` | `(res) => Promise<Response>` | Apply registered handlers                               |

### ServerRequestContext

Key-value store shared across a single request. Set in middleware, read in loaders.

```ts
/* Middleware */
ctx.serverRequestContext.set("locale", "en-us")

/* Loader */
const locale = ctx.serverRequestContext.get("locale")
```

### PreloaderContext

Accumulated context from preloader chain. Each preloader's return value merges into the context for children.

```ts
/* Root preloader returns { user } */
/* Layout preloader receives { user }, returns { org } */
/* Page preloader receives { user, org } */
```

### RouterContext

Client-side context from `self.flare.c`. Set by middleware, available via `useRouter().context`.

```ts
const router = useRouter()
router.context.locale /* "en-us" */
router.context.theme /* "dark" */
```

### getServerRequest

Access the current request from any server-side code (loaders, preloaders, server functions):

```ts
import { getServerRequest } from "@flare/v0/server"

const req = getServerRequest()
req.headers.get("Authorization")
```

Uses AsyncLocalStorage. Only available during request handling.

### getServerNonce

Access the CSP nonce for the current request:

```ts
import { getServerNonce } from "@flare/v0/server"

const nonce = getServerNonce()
/* 32 hex chars, unique per request */
```

---

## Type Safety

### Path Validation

Virtual paths are validated at compile time via code generation:

```ts
/* types.gen.d.ts generates: */
type RegisteredPath = "/" | "/products" | "/products/[id]" | "/blog/[slug]"

/* Usage — type error on invalid paths */
<Link to="/products/[id]" params={{ id: "123" }} />  /* OK */
<Link to="/invalid" />                                 /* Type error */
```

### Param and Search Inference

When `input()` defines schemas, params and search are inferred:

```ts
createPage("_root_/products/[id]")
	.input({
		params: z.object({ id: z.string().uuid() }),
		searchParams: z.object({ tab: z.enum(["info", "reviews"]) }),
	})
	.loader(({ location }) => {
		location.params.id /* string (uuid) */
		location.search.tab /* "info" | "reviews" */
	})
```

### Preloader Context Chain

Preloader context types accumulate through the tree:

```ts
/* Root: returns { user: User } */
/* Layout: preloaderContext has { user: User }, returns { org: Org } */
/* Page: preloaderContext has { user: User, org: Org } */
```

Generated types in `types.gen.d.ts` reflect the full accumulated context per route.

---

## Security

### Nonce

Every request generates a unique 128-bit cryptographic nonce (32 hex characters).

```ts
/* Auto-generated per request */
const nonce = getServerNonce()

/* Applied to CSP header */
Content-Security-Policy: script-src 'self' 'strict-dynamic' 'nonce-{nonce}'

/* Applied to inline scripts */
<script nonce={nonce}>self.flare = {...}</script>
<script nonce={nonce} type="module" src="/client.js"></script>
```

### CSP

Default Content Security Policy with 13 directives:

```ts
{
  baseUri: ["'self'"],       connectSrc: ["'self'"],
  defaultSrc: ["'self'"],    fontSrc: ["'self'"],
  formAction: ["'self'"],    frameAncestors: ["'self'"],
  frameSrc: ["'self'"],      imgSrc: ["'self'", "data:", "blob:"],
  mediaSrc: ["'self'"],      objectSrc: ["'none'"],
  scriptSrc: ["'self'"],     styleSrc: ["'self'", "'unsafe-inline'"],
  workerSrc: ["'self'"],
}
```

Customize via `createServerHandler({ csp: { ... } })`. User directives merge with defaults.

**Additional security headers (always applied):**

| Header                       | Value                                        |
| ---------------------------- | -------------------------------------------- |
| `X-Content-Type-Options`     | `nosniff`                                    |
| `X-Frame-Options`            | `SAMEORIGIN`                                 |
| `Referrer-Policy`            | `strict-origin-when-cross-origin`            |
| `X-XSS-Protection`           | `1; mode=block`                              |
| `Strict-Transport-Security`  | `max-age=31536000; includeSubDomains` (prod) |
| `Cross-Origin-Opener-Policy` | `same-origin` (prod)                         |
| `Permissions-Policy`         | Restricts 20 features                        |

**Dev mode relaxation:** Adds `'unsafe-inline'`, `'unsafe-eval'` to script-src, WebSocket URLs to connect-src, `blob:` to worker-src. HSTS/COOP disabled in dev.

---

## Testing

### Route Segment Testing

Test individual route builders in isolation:

```ts
import { ProductPage } from "./routes/products/[id]"

test("loader returns product", async () => {
	const result = await ProductPage.loader({
		env: mockEnv,
		request: new Request("http://localhost/products/123"),
		location: { params: { id: "123" }, pathname: "/products/123", search: {} },
		preloaderContext: { user: mockUser },
		/* ... */
	})
	expect(result.product).toBeDefined()
})
```

### Mock Utilities

```ts
import { createMockEnv, createMockRequest, createMockLocation } from "@flare/v0/testing"

const env = createMockEnv({ D1: mockD1, KV: mockKV })
const request = createMockRequest("/products/123", { headers: { Authorization: "Bearer token" } })
const location = createMockLocation({ params: { id: "123" } })
```

### Integration Testing

E2E with Playwright against Wrangler dev server:

```ts
import { test, expect } from "@playwright/test"

test("product page loads", async ({ page }) => {
	await page.goto("/products/123")
	await expect(page.locator("h1")).toContainText("Widget")
})

test("CSR navigation", async ({ page }) => {
	await page.goto("/")
	await page.click('a[href="/products/123"]')
	await expect(page).toHaveURL("/products/123")
	await expect(page.locator("h1")).toContainText("Widget")
})
```

---

## Bundle Optimization

### Tree Shaking

- **Server-only code:** Loaders, preloaders, authorize, head, headers — never in client bundle
- **TanStack Query:** Tree-shaken if `getQueryClient` not provided
- **Client bundle:** Only contains hydration code, layout render functions, sparse route options
- **Route-level splitting:** Each page's render function is a separate chunk

### Bundle Analysis

```bash
/* Vite's built-in analyzer */
bun run vite build --mode production

/* Check output */
dist/
├── client/          # Client chunks
│   ├── assets/      # Hashed CSS + JS
│   └── index.html   # Not used (SSR)
└── server/          # Server bundle
    └── index.js     # Single server entry
```

---

## Code Generation

### Route Trees

Generated from `routes/` directory on build start and file watch:

**Server (`routes.gen.ts`):**

```ts
export const routeTree: FlareTreeNode = { s: new Map([...]) }  /* Radix tree */
export const layouts: Record<string, () => Promise<LayoutModule>> = { ... }
const R0: FlareRouteData = {
  e: "PageName",                    /* Export name */
  o: O0,                            /* Route options (cache timing, auth) */
  p: () => import("./routes/..."),  /* Lazy module import */
  v: "/products/[id]",             /* Variable path */
  x: "_root_/products/[id]",      /* Virtual path */
}
```

**Client (`routes.client.gen.ts`):**

```ts
export const layouts: Record<string, () => Promise<{ default: unknown }>> = { ... }
export const routeOptionsOverrides: Record<string, RouteOptions> = { ... }  /* Sparse — only non-defaults */
```

Client has NO route tree, loaders, or auth logic. O(1) bundle size regardless of route count.

### Type Declarations

**`types.gen.d.ts`:**

```ts
declare module "@flare/v0" {
	interface FlareRegister {
		routeInfo: {
			"/products/[id]": {
				params: { id: string }
				search: { tab?: string }
				loaderData: { product: Product }
				preloaderContext: { user: User; org: Org }
			}
		}
	}
}
```

Powers type-safe `<Link>`, `useParams()`, `useLoaderData()`, `usePreloaderContext()`, etc.

---

## License

MIT
