# Flare

Solid + Vite meta-framework. You declare pages and layouts with a typed builder. The server streams HTML (`renderToStream`). Later navigations speak NDJSON (`x-d: 1`). Prefetch, ISR, deferred loaders, and forms reuse that protocol.

This repo is the source of [`@lovrozagar/flare`](https://www.npmjs.com/package/@lovrozagar/flare) `0.1.1`. The CLI binary is `flare`.

If you are an agent: read this file end to end. It is the usage contract. Import only from the paths in [Package exports](#package-exports). Do not invent a kitchen-sink `flare` barrel for UI.

## Table of contents

- [Start](#start)
- [What Flare is](#what-flare-is)
- [Install](#install)
- [First app](#first-app)
- [App anatomy](#app-anatomy)
- [CLI](#cli)
- [Routes](#routes)
- [Route builder](#route-builder)
- [Params, search, and input](#params-search-and-input)
- [Layouts, outlet, path segments](#layouts-outlet-path-segments)
- [Loaders and streaming](#loaders-and-streaming)
- [Hooks](#hooks)
- [Auth](#auth)
- [Errors and redirects](#errors-and-redirects)
- [Cache](#cache)
- [Head](#head)
- [Headers and response routes](#headers-and-response-routes)
- [Navigation](#navigation)
- [Rewrite](#rewrite)
- [Intercept](#intercept)
- [Forms and server functions](#forms-and-server-functions)
- [Env split functions](#env-split-functions)
- [Styles](#styles)
- [Fonts and images](#fonts-and-images)
- [i18n, theme, direction](#i18n-theme-direction)
- [Middleware](#middleware)
- [Mount](#mount)
- [Security](#security)
- [Store and revalidation](#store-and-revalidation)
- [Query](#query)
- [Lazy](#lazy)
- [Service worker](#service-worker)
- [Sitemap and search engines](#sitemap-and-search-engines)
- [Tracing](#tracing)
- [Testing](#testing)
- [NDJSON protocol](#ndjson-protocol)
- [Duration strings](#duration-strings)
- [Plugin](#plugin)
- [Package exports](#package-exports)
- [Repository layout](#repository-layout)
- [Develop](#develop)
- [License](#license)

## Start

```bash
bun add @lovrozagar/flare
flare init
bun run dev
```

```ts
/* src/routes/_root_.tsx */
import { createRootLayout } from "@lovrozagar/flare/root-layout";
import { ResetCSS } from "@lovrozagar/flare/reset-css";

export const route = createRootLayout("_root_").render((props) => (
	<html lang="en">
		<head>
			<meta charset="utf-8" />
			<ResetCSS />
		</head>
		<body>{props.children}</body>
	</html>
));
```

```ts
/* src/routes/index.tsx */
import { createPage } from "@lovrozagar/flare/page";
import { Link } from "@lovrozagar/flare/link";

export const route = createPage("_root_/")
	.loader(() => ({ message: "Hello from Flare" }))
	.head(() => ({ title: "Home" }))
	.render((props) => (
		<main>
			<h1>{props.loaderData.message}</h1>
			<Link to="/about">About</Link>
		</main>
	));
```

```bash
curl http://127.0.0.1:5173/
# streamed HTML document + FlareState for hydration
```

`flare init` writes `src/client.tsx`, `src/server.ts`, `src/router.ts`, a root layout, and `vite.config.ts` with `flare()`. `flare generate` (or the Vite plugin on boot/watch) writes `src/_gen/routes.gen.ts` and `src/_gen/types.gen.d.ts`.

The same app runs on Node, Bun, Deno, and Cloudflare Workers. Vite is the bundler. Solid is the renderer.

## What Flare is

- **Builder DX.** `createPage("_root_/about").loader(...).head(...).render(...)`. Types flow from the generated route tree into `Link`, `navigate`, and loader `ctx`.
- **Server-driven.** Loaders, auth, cache, and head run on the server. The client hydrates, then fetches NDJSON for SPA navigations.
- **NDJSON only.** Data requests are line-delimited JSON (`t:"l"` loader, `t:"c"` deferred chunk, `t:"h"` head, `t:"r"` redirect). There is no parallel JSON-RPC surface.
- **Streaming first.** `ctx.defer()` + `<Await>` stream after the shell. HTML never waits for every promise.
- **One plugin.** `flare()` from `@lovrozagar/flare/plugins` is Vite: codegen, `sx` / `class=` compile, images, server functions, prerender, service worker, dev dashboard.
- **Web Standards.** Handlers see `Request`. Responses are `Response`. Workers get `waitUntil` via `serverContext` / `background()`.

Flare is not Next with Solid bolted on. There is no `getServerSideProps` object. A route is one file and one chain.

## Install

Consumers need Vite 8 and Solid 1.9. This repo develops on [Bun](https://bun.sh) 1.3+.

```bash
bun add @lovrozagar/flare
# or
npm add @lovrozagar/flare
# or
pnpm add @lovrozagar/flare
```

Peers: `solid-js`, `@solidjs/web`, `@solidjs/vite-plugin`, `vite`. Optional: `sharp` (images), `isbot` (skip locale cookies for bots), `@tanstack/solid-query` (query), `@tanstack/query-broadcast-client-experimental` (query broadcast), `oxc-parser`, `oxc-resolver`.

The CLI is a workspace package (`@flare/cli`, binary `flare`). In this repo it is on the path via workspace linking. A published consumer uses `flare init` after adding the package.

## First app

```bash
mkdir my-app && cd my-app
bun init -y
bun add @lovrozagar/flare solid-js @solidjs/web vite @solidjs/vite-plugin
flare init
bun run dev
```

| File                      | Role                                                        |
| ------------------------- | ----------------------------------------------------------- |
| `src/client.tsx`          | `createClient(() => router)`                                |
| `src/server.ts`           | `createServer(router)` — Vite SSR / Workers `fetch`         |
| `src/router.ts`           | `createRouter({ layouts, routeTree })`                      |
| `src/routes/_root_.tsx`   | Root HTML document                                          |
| `src/routes/index.tsx`    | Home page                                                   |
| `vite.config.ts`          | `flare()` plugin                                            |
| `src/_gen/routes.gen.ts`  | Generated tree + lazy imports (do not hand-edit)            |
| `src/_gen/types.gen.d.ts` | `/// <reference types="@lovrozagar/flare/virtual-types" />` |

Scripts: `dev` (`vite dev`), `build`, `preview`, `generate` (`flare generate`).

```bash
flare init --template saas
flare init --template blog
flare init --template marketing
```

Flags: `--auth cookie|jwt|none`, `--cache isr|ssg|ssr|mixed`, `--style tailwind|css-modules|none`, `--locale en,hr`. Existing files refuse overwrite unless you pass `--force`.

## App anatomy

### Client

```ts
import { createClient } from "@lovrozagar/flare/client";
import { router } from "./router";

createClient(() => router)
	.onReady((ctx) => {
		/* ctx.navigate, ctx.invalidate, ctx.navigationPhase */
	})
	.onHydrated(() => {})
	.onIdle(() => {})
	.onInteraction(() => {});
```

`createClient` hydrates on the next microtask. Or call `hydrate(router)` from `@lovrozagar/flare/hydrate` yourself.

### Router

```ts
import { createRouter } from "@lovrozagar/flare/router";
import { layouts, routeTree } from "./_gen/routes.gen";

export const router = createRouter({
	layouts,
	routeTree,
	basePath: undefined,
	caseSensitive: false,
	notFoundMode: "fuzzy",
	trailingSlash: "preserve",
	scrollRestoration: true,
	viewTransitions: true,
	cache: { client: { prefetch: "intent", staleTime: 30_000 } },
	locale: { defaultLocale: "en", locales: ["en", "hr"], paramName: "locale" },
	theme: { defaultTheme: "system" },
	direction: { defaultDir: "ltr" },
});
```

| Option                                                                                                        | Meaning                                                 |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `layouts` / `routeTree`                                                                                       | From `src/_gen/routes.gen.ts`                           |
| `basePath`                                                                                                    | App mounted under `/app`                                |
| `caseSensitive`                                                                                               | URL matching                                            |
| `notFoundMode`                                                                                                | `"fuzzy"` hydrate nearest match; `"root"` use `_root_/` |
| `trailingSlash`                                                                                               | `"always"` \| `"never"` \| `"preserve"`                 |
| `scrollRestoration` / `getScrollRestorationKey` / `scrollRestorationBehavior` / `scrollRestorationMaxEntries` | History scroll                                          |
| `routeCacheMaxEntries`                                                                                        | Client match cache size                                 |
| `rewrite`                                                                                                     | Vanity URLs — see [Rewrite](#rewrite)                   |
| `queryClientGetter`                                                                                           | TanStack — see [Query](#query)                          |

### Server

```ts
import { createServer } from "@lovrozagar/flare/server";
import { router } from "./router";

export const server = createServer(router)
	.authenticateFn(async ({ request }) => {
		const session = request.headers.get("cookie");
		return session ? { id: "user-1" } : null;
	})
	.serverContext(({ request }) => ({ requestId: request.headers.get("x-request-id") ?? "" }))
	.security({ "X-Frame-Options": "DENY" })
	.cache({ store })
	.keepalive({ interval: 30_000 })
	.use("/api/*", apiProxy({ target: "https://api.example.com" }))
	.mount("/rpc", (request) => new Response("ok"))
	.sitemap({ origin: "https://example.com" })
	.tracing({ timing: true });

export default {
	fetch(request: Request, env?: unknown, ctx?: { waitUntil?: (p: Promise<unknown>) => void }) {
		return server.fetch(request, env, ctx);
	},
};
```

`server.fetch` is the Vite SSR handler and the Workers `fetch` export. `getStaticParams()` feeds prerender. `background(promise)` from `@lovrozagar/flare/server-context` binds `waitUntil` so ISR work cannot 500 a finished render.

## CLI

```
flare init [--template saas|blog|marketing] [--auth] [--cache] [--style] [--force]
flare generate | flare gen [--watch]
flare add auth|cache|loader|head|input|error-boundary <paths...>
flare font add|list|info|remove
flare routes
flare status
flare validate
```

`plan`, `remove`, `rename`, `setup-ai` are reserved and not implemented.

### `flare generate` / `flare gen`

Scans `src/routes/` and writes `src/_gen/`. The Vite plugin also runs this on boot and on watch. `--watch` regenerates when route files change.

`codegen.fsVirtualPaths` (plugin default `true`) requires suffix files. Set `fsVirtualPaths: false` to keep handwritten `createPage("_root_/about")` strings (the product e2e app does this).

### `flare add`

Patches an existing route chain: `auth`, `cache [--isr N] [--ssg]`, `loader`, `head`, `input`, `error-boundary`.

### `flare font`

```bash
flare font add --name Inter
flare font list
flare font info Inter
flare font remove Inter
```

Writes `public/fonts/` and prints `import { inter } from "@lovrozagar/flare/fonts/inter"`.

### `flare routes` / `status` / `validate`

- `routes` — print the generated tree.
- `status` — project health (flare dep, `_gen`, Vite config).
- `validate` — chain / file conventions.

## Routes

### String virtual paths

```ts
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/blog/[slug]")
	.loader((ctx) => ({ slug: ctx.location.params.slug }))
	.render((props) => <h1>{props.loaderData.slug}</h1>);
```

The string is the virtual path. `_root_` is the root layout scope. Groups like `_root_/(blog)/blog` share a layout without a URL segment.

### Filesystem virtual paths

With `codegen: { fsVirtualPaths: true }` (plugin default):

```
src/routes/_root_/about/about.page.tsx           → createPage("_root_/about")
src/routes/_root_/(blog)/blog.layout.tsx         → createLayout("_root_/(blog)")
src/routes/_root_/users/[id]/user.page.tsx       → createPage("_root_/users/[id]")
src/routes/_root_/files/[...path]/files.page.tsx
src/routes/_root_/optional-locale/[[locale]]/opt.page.tsx
src/routes/_admin_/dashboard/dash.page.tsx       → createPage("_admin_/dashboard")
```

Folders starting with `_` other than `_name_` root scopes are ignored (`_utils`). `[_]internal` is a literal `_internal` URL segment. `ignorePrefix` on the plugin skips extra names.

### Multiple roots

`_root_` and `_admin_` are separate HTML documents. Crossing from one to the other is a full load, not SPA.

## Route builder

Chain order (typical): `intercept` → `cache` → `authenticate` → `input` → `effects` → `authorize` → `preloader` → `loader` → `head` / `headers` → `render` or `response` → error slots.

| Method                                                                                        | Role                                                             |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `.cache(config)`                                                                              | Client / SSR / ISR / SSG / CDN                                   |
| `.authenticate()` / `.authenticate("optional")` / `.authenticate(false)`                      | Auth gate                                                        |
| `.authorize(fn)`                                                                              | Role check; inherits parent unless overridden                    |
| `.input({ params, searchParams })`                                                            | Standard Schema or parse fn                                      |
| `.effects({ loaderDeps, shouldRefetch })`                                                     | When to rerun the loader on search change                        |
| `.preloader(fn)`                                                                              | Runs parent → child before loaders; result is `preloaderContext` |
| `.loader(fn)`                                                                                 | Server data                                                      |
| `.head(fn)` / `.head(fn, { replace: true })`                                                  | Title, meta, JSON-LD                                             |
| `.headers(fn)`                                                                                | Extra response headers                                           |
| `.render(fn)`                                                                                 | Solid UI                                                         |
| `.response(fn)`                                                                               | Raw `Response` (sitemap.xml, robots) — no HTML                   |
| `.intercept({ from, render })`                                                                | Modal / drawer over another route                                |
| `.redirect({ to, status })`                                                                   | Static redirect route                                            |
| `.middleware(...)`                                                                            | Per-route middleware                                             |
| `.errorRender()` / `.notFoundRender()` / `.unauthenticatedRender()` / `.unauthorizedRender()` | Boundaries                                                       |

`createLayout` and `createRootLayout` share the same idea. Root layouts own `<html>`. `createPathSegment` is URL-only (no UI) — used for `[[locale]]`.

Loader / preloader / authorize `ctx` always has: `request`, `location`, `auth`, `env`, `locale()`, `serverContext`, `abortController`, plus throw helpers (`notFound`, `redirect`, `unauthenticated`, `unauthorized`) and URL helpers. Loader `ctx` also has `defer`, `cause` (`"enter"` \| `"prefetch"` \| `"stay"`), `prefetch`, `deps`.

## Params, search, and input

| Pattern       | Type                    |
| ------------- | ----------------------- |
| `[id]`        | `string`                |
| `[...path]`   | `string[]`              |
| `[[locale]]`  | `string \| undefined`   |
| `[[...rest]]` | `string[] \| undefined` |

```ts
import { z } from "zod";

export const route = createPage("_root_/users/[id]")
	.input({
		params: z.object({ id: z.string().min(1) }),
		searchParams: z.object({ tab: z.string().optional() }),
	})
	.loader((ctx) => ({ id: ctx.location.params.id, tab: ctx.location.search.tab }))
	.render((props) => <p>{props.loaderData.id}</p>);
```

Validators: Zod, Valibot, ArkType, TypeBox, Yup, Effect, Superstruct, or `{ parse }` / a function. Invalid params are 400/500 depending on the schema path. `Link` and `navigate({ to, params, search })` are typed from `src/_gen/types.gen.d.ts`.

## Layouts, outlet, path segments

```ts
import { createLayout } from "@lovrozagar/flare/layout";
import { Outlet } from "@lovrozagar/flare/outlet";

export const route = createLayout("_root_/(blog)")
	.loader(() => ({ section: "Blog" }))
	.render((props) => (
		<div>
			<nav>{props.loaderData?.section}</nav>
			{props.children}
			{/* or <Outlet /> */}
		</div>
	));
```

```ts
import { createPathSegment } from "@lovrozagar/flare/path-segment";

export const route = createPathSegment("[[locale]]");
```

Child errors bubble to the nearest layout/root that defines `.errorRender()` / `.notFoundRender()` / `.unauthenticatedRender()` / `.unauthorizedRender()`.

```ts
.errorRender((props) => (
	<main>
		<p>{props.error.message}</p>
		<button type="button" onClick={() => props.retry()}>
			Retry
		</button>
	</main>
))
```

## Loaders and streaming

```ts
import { Await } from "@lovrozagar/flare/await";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/blog/[slug]")
	.preloader((ctx) => ({ locale: ctx.locale() }))
	.loader((ctx) => {
		const slug = ctx.location.params.slug;
		const comments = ctx.defer(async () => db.comments(slug), { key: "comments" });
		return { slug, title: `Post: ${slug}`, comments };
	})
	.render((props) => (
		<main>
			<h1>{props.loaderData.title}</h1>
			<Await pending={<p>Loading…</p>} promise={props.loaderData.comments}>
				{(comments) => <ul>{/* … */}</ul>}
			</Await>
		</main>
	));
```

Pipeline: authenticate → authorize → preloaders (parent → child) → loaders. `ctx.defer(fn, { key, prerender: "resolve" | "stream" })` marks a field for NDJSON `t:"c"` chunks. Prefetch skips deferred execution (shell only). History restore of a deferred match refetches so `<Await>` gets a live promise.

`<Await>` also accepts `error` and `onError`. Missing deferred data must not throw in `.then` — the component treats a missing promise as pending.

## Hooks

From `@lovrozagar/flare` (route-builder barrel) / the same names on the provider:

```ts
import {
	useBlocker,
	useLoaderData,
	useLoaderT,
	useLocation,
	useMatch,
	useNavigate,
	useParams,
	usePreloaderContext,
	useSearch,
} from "@lovrozagar/flare";

const data = useLoaderData({ from: "_root_/about" });
const params = useParams({ from: "_root_/users/[id]" });
const search = useSearch({ from: "_root_/users/[id]" });
const navigate = useNavigate();
const blocker = useBlocker(() => dirty());
```

`from` is a virtual path, not a URL. Accessors are Solid signals.

## Auth

```ts
export const route = createPage("_root_/dashboard")
	.authenticate()
	.authorize(({ user }) => user.role === "admin")
	.render(() => <h1>Dashboard</h1>);
```

- `.authenticate()` — required; null user → `UnauthenticatedError` (401).
- `.authenticate("optional")` — user may be null.
- `.authenticate(false)` — skip even if a parent required it.
- Child inherits parent auth unless it sets its own mode.
- `createServer(router).authenticateFn(fn)` is the app-wide hook (cookie, header, JWT).

Throw helpers: `ctx.notFound()`, `ctx.redirect({ to, params, search, status, replace })`, `ctx.unauthenticated()`, `ctx.unauthorized()`.

## Errors and redirects

```ts
import {
	NotFoundError,
	RedirectResponse,
	UnauthenticatedError,
	UnauthorizedError,
	isNotFoundError,
	isRedirectResponse,
} from "@lovrozagar/flare/errors";
```

Default redirect status is **303**. `.redirect({ to, status: 307 })` overrides. External: `{ href: "https://example.com" }`. `javascript:` is rejected.

## Cache

### Client

```ts
createRouter({
	cache: { client: { prefetch: "intent", staleTime: 30_000, gcTime: "5m" } },
});

export const route = createPage("_root_/about").cache({
	client: { staleTime: "10s", prefetch: "viewport", cacheDeferred: true },
});
```

`prefetch`: `false` | `"intent"` | `"viewport"` | `"render"`. `staleTime` / `gcTime` / `prefetchStaleTime` accept ms or [duration strings](#duration-strings). `hasDeferred` cache entries are treated stale so popstate does not replay a dead marker. `client: false` turns client cache off for that route.

### SSR store / ISR / SSG

`ssr`, `isr`, and `ssg` are mutually exclusive.

```ts
.cache({
	ssr: { staleTime: 5_000, ttl: 60, tags: ["posts"], key: ({ params }) => params.slug },
})

.cache({ ssg: true })

.cache({
	ssg: {
		params: () => [{ slug: "hello" }],
		defer: "resolve",
	},
})

.cache({
	isr: {
		revalidate: 60,
		params: () => [{ slug: "hello" }],
		dynamicParams: true,
	},
})
```

- **SSR cache** — store-backed HTML/data. Needs a `FlareStore` on `createServer(...).cache({ store })`.
- **SSG** — built at `vite build` when `flare({ prerender: true })`.
- **ISR** — `{ revalidate }` time-based, or omit `revalidate` for tag-only. `isr: true` is on-demand only. `dynamicParams: false` 404s unlisted params.
- Tag purge: [Store and revalidation](#store-and-revalidation).

HTML that embeds a per-request CSP nonce is never `304`. A 304 would reuse the old body (old nonce) against a new CSP and block inline scripts. ETag still lands on the 200.

### CDN

```ts
.cache({
	cdn: { maxAge: 60, swr: 300, tags: ["posts"], vary: ["Accept-Language"], private: false },
})
```

Sets `Cache-Control` / `CDN-Cache-Control`. Dev can emulate a CDN disk cache (`dev.cdnCache`, default on). Product e2e turns it off so HTML stays fresh.

## Head

```ts
.head((ctx) => ({
	title: `About — ${ctx.loaderData.year}`,
	description: "…",
	canonical: "https://example.com/about",
	robots: { index: true, follow: true },
	openGraph: { title: "…", images: [{ url: "…", width: 1200, height: 630 }] },
	twitter: { card: "summary_large_image", title: "…" },
	jsonLd: [{ "@type": "WebPage", name: "About" }],
	icons: { ico: "/favicon.ico", svg: "/icon.svg" },
	css: "/page.css",
}))
```

`ctx.parentHead` is the merged parent. Child titles win. `.head(fn, { replace: true })` drops inherited description/keywords. SPA navigation applies per-route heads and removes stale meta / JSON-LD.

## Headers and response routes

```ts
.headers((ctx) => ({
	"Cache-Control": "private",
	"X-From": ctx.loaderData.id,
}))
```

```ts
/* src/routes/_root_/sitemap.xml/sitemap.page.tsx */
export const route = createPage("_root_/sitemap.xml").response(() => {
	return new Response("<urlset>…</urlset>", {
		headers: { "content-type": "application/xml" },
	});
});
```

`.response()` skips HTML / loaders / head. Use it for `sitemap.xml`, `robots.txt`, feeds.

## Navigation

```tsx
import { Link } from "@lovrozagar/flare/link";
import { navigate } from "@lovrozagar/flare";

<Link to="/blog/[slug]" params={{ slug: "hello-world" }} prefetch="intent">
	Post
</Link>

<Link href="https://example.com" target="_blank">
	External
</Link>

<Link to="/about" replace hash="section" disabled />

<button
	type="button"
	onClick={() => navigate({ to: "/users/[id]", params: { id: "1" }, search: { tab: "bio" } })}
>
	Go
</button>
```

- Internal `to` is typed. External `href` is not rewritten.
- `prefetch={false}` disables. Default comes from router / route cache.
- `activeClass` / `inactiveClass` / `activeProps` / `inactiveProps` / `aria-current`.
- `createRouter({ viewTransitions: true })` wraps updates in `document.startViewTransition` (Chromium). Put `<ViewTransitionCSS />` from `@lovrozagar/flare/view-transition-css` in the root head.
- `useBlocker(() => dirty())` — first-class leave guard.
- Optional chrome: `<NavigationProgress />` from `@lovrozagar/flare/navigation-progress`.

`ctx.invalidate()` / `router.invalidate()` refetches current matches.

## Rewrite

Vanity URLs without changing the matched virtual path.

```ts
import type { LocationRewrite } from "@lovrozagar/flare/rewrite";

const rewrite: LocationRewrite = {
	input: ({ url }) => {
		if (url.pathname === "/vanity") {
			const next = new URL(url);
			next.pathname = "/about";
			return next;
		}
		return undefined;
	},
	output: ({ url }) => {
		if (url.pathname === "/about") {
			const next = new URL(url);
			next.pathname = "/vanity";
			return next;
		}
		return undefined;
	},
};

createRouter({ rewrite, layouts, routeTree });
```

`input` maps the request URL to the real route. `output` maps generated links / redirects back to the vanity URL. Return `undefined` to leave the URL alone.

## Intercept

Modal / drawer that keeps the background route mounted.

```ts
createPage("_root_/photo/[id]").intercept({
	from: ["_root_/gallery"],
	render: "_root_/photo/[id]",
});
```

```tsx
import { InterceptOutlet } from "@lovrozagar/flare/intercept-outlet";

<InterceptOutlet />;
```

`from` is the background virtual path(s). Closing the intercept returns to that route.

## Forms and server functions

```ts
import { z } from "zod";
import { createServerFn } from "@lovrozagar/flare/server-fn";
import { Form, FieldError } from "@lovrozagar/flare/form";

const save = createServerFn({ name: "save" })
	.input(z.object({ email: z.string().email() }))
	.handler(async ({ input, auth, revalidate, piggyback }) => {
		await revalidate({ tags: ["contacts"], tiers: ["ssr"] });
		piggyback(["contact", input.email], { email: input.email });
		return { ok: true, email: input.email };
	});

<Form
	action={save}
	onSuccess={(data) => console.log(data.email)}
	onError={(err) => console.error(err)}
>
	{(form) => (
		<>
			<input name="email" value={form.value("email")} />
			<FieldError name="email" />
			<button type="submit" disabled={form.pending()}>
				Save
			</button>
		</>
	)}
</Form>
```

- The Vite plugin strips handler bodies from the client bundle.
- Progressive enhancement works with JS off (`POST` + redirect).
- CSRF: mutating methods check `Origin` / `Referer`.
- `.authenticate()` / `.authorize(fn)` on the server fn (same idea as routes).
- `.validator()` is an alias of `.input()`.
- Streaming: `.handler(async function* ({ signal }) { yield chunk })`.
- `createServerFn({ name, method: "get" })` for idempotent GET RPC.
- `@lovrozagar/flare/server-fn-query` wires a server fn to TanStack Query.

`form.pending()`, `form.error()`, `form.result()`, `form.fieldErrors()`, `form.hasErrors()`, `form.reset()`, `form.value(name)`.

## Env split functions

```ts
import { createServerOnlyFn } from "@lovrozagar/flare/server-only";
import { createClientOnlyFn } from "@lovrozagar/flare/client-only";
import { createIsomorphicFn } from "@lovrozagar/flare/isomorphic";

const readSecret = createServerOnlyFn(() => process.env.SECRET);
const measure = createClientOnlyFn(() => performance.now());
const now = createIsomorphicFn({
	server: () => Date.now(),
	client: () => performance.now(),
});
```

The plugin drops the unused side from each bundle. Calling a server-only fn on the client throws.

## Styles

Three supported surfaces:

| API                                                                                        | Use                                                  |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `class="flex gap-4 p-8"`                                                                   | Tailwind utilities, compiled when `sx: { tw: true }` |
| `sx={{ color: "rgb(0,0,255)", padding: "16px", variants: { hover: { opacity: "0.8" } } }}` | Typed style object → atomic classes                  |
| `styles("box", { css, state, vars })`                                                      | Named scoped CSS, `data-c` attribute                 |

```tsx
import { styles, cn } from "@lovrozagar/flare/styles";

<div class="bg-blue-500 p-4" />
<div sx={{ color: "rgb(0, 100, 200)", padding: "16px" }} />
<div {...styles("box", { css: "color: rgb(255, 0, 0)" })} />
<div class={cn("base", on() && "active")} />
```

`tw=` on `styles()` or as a JSX attribute is **dropped**. Put utilities in `class=`. `css=` compiles through the same plugin (not a `data-c` hash).

## Fonts and images

```tsx
import { FontCSS } from "@lovrozagar/flare/fonts";
import { inter } from "@lovrozagar/flare/fonts/inter";
import { Image } from "@lovrozagar/flare/image";
import hero from "../assets/hero.jpg";

<FontCSS family="Inter" />
<Image src={hero} alt="Hero" widths={[400, 800, 1200]} placeholder={false} />
```

`flare font add` writes `public/fonts/` + subset CSS. Fallback metrics (`size-adjust`) reduce CLS.

`Image` emits `srcset`, optional blur placeholder. The Vite image plugin rewrites imports. `configureImage({ ... })` sets app-wide defaults. Typed imports look like `hero.d.jpg.ts` next to the file.

## i18n, theme, direction

```ts
createRouter({
	locale: { defaultLocale: "en", locales: ["en", "hr", "fr"], paramName: "locale" },
	theme: { defaultTheme: "system" },
	direction: { defaultDir: "ltr" },
});
```

Put the blocking scripts in the root `<head>` so first paint is correct:

```tsx
import { LocaleScript, LocaleProvider } from "@lovrozagar/flare/locale";
import { ThemeScript, ThemeProvider } from "@lovrozagar/flare/theme";
import { DirectionScript } from "@lovrozagar/flare/direction";

<head>
	<LocaleScript />
	<ThemeScript />
	<DirectionScript />
</head>;
```

- **Locale** — optional `[[locale]]` segment or prefix. Cookie `flare.locale` + `Accept-Language`. Default locale is stripped (`/en/about` → `/about`). Playwright / bot UAs skip Set-Cookie (`isbot`). Prefetch (`x-p: 1`) never writes the cookie.
- **Theme** — `data-theme`, system preference, `localStorage`.
- **Direction** — `dir` / `data-dir`.

Copy (separate from routing locale):

```ts
import { createTranslations, formatMessage } from "@lovrozagar/flare/i18n";

const translations = createTranslations({
	common: {
		en: () => import("./en/common"),
		hr: () => import("./hr/common"),
	},
});

const dict = await translations.load("en", ["common"]);
formatMessage(dict.common.hello, { name: "Flare" });
```

`useLoaderT({ from })` / `usePreloaderT({ from })` format messages stored on loader / preloader data.

## Middleware

```ts
import type { FlareMiddleware } from "@lovrozagar/flare/middleware";
import { onPage, virtualPath } from "@lovrozagar/flare/middleware";
import { i18n } from "@lovrozagar/flare/middleware/i18n";
import { keepalive } from "@lovrozagar/flare/middleware/keepalive";
import { staticAssets } from "@lovrozagar/flare/middleware/static-assets";
import { apiProxy } from "@lovrozagar/flare/middleware/api-proxy";
import { cdnProxy } from "@lovrozagar/flare/middleware/cdn-proxy";
import { markdownNegotiation } from "@lovrozagar/flare/middleware/markdown-negotiation";

const timing: FlareMiddleware = async (ctx) => {
	const start = Date.now();
	ctx.onResponse((response) => {
		const headers = new Headers(response.headers);
		headers.set("x-timing", `${Date.now() - start}ms`);
		return new Response(response.body, { headers, status: response.status });
	});
	return ctx.next();
};

createServer(router)
	.use(i18n({ locales: ["en", "hr"], defaultLocale: "en" }))
	.use(onPage(timing))
	.use(virtualPath("_root_/about"), timing)
	.use(keepalive())
	.use(staticAssets())
	.use("/api/*", apiProxy({ target: "https://api.example.com" }))
	.use(cdnProxy())
	.use(markdownNegotiation());
```

| Result                  | Meaning                                                 |
| ----------------------- | ------------------------------------------------------- |
| `ctx.next()`            | Continue                                                |
| `ctx.respond(response)` | Stop and return that response (still runs `onResponse`) |
| `ctx.bypass(response)`  | Return as-is                                            |

`requestType` is `"page"` \| `"server-fn"` \| `"mount"` \| `"internal"`. Per-route: `.middleware(fn)`.

## Mount

In-process island that is not a Flare page:

```ts
createServer(router).mount("/api", (request, env, ctx) => {
	ctx.waitUntil(log(request));
	return new Response(JSON.stringify({ ok: true }), {
		headers: { "content-type": "application/json" },
	});
});
```

Or pass an object with `{ fetch }`. Also exported as `mount` from `@lovrozagar/flare/mount`.

## Security

```ts
createServer(router).security(({ nonce }) => ({
	"Content-Security-Policy": {
		"default-src": ["'self'"],
		"script-src": ["'self'", `'nonce-${nonce}'`],
	},
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=31536000",
}));
```

Defaults: `nosniff`, CSP (dev `unsafe-inline`; prod nonce on HTML), HSTS in prod (skipped in dev). Set a header to `false` to omit it.

## Store and revalidation

```ts
import type { FlareStore, FlareStoreEntry } from "@lovrozagar/flare/store";
import { createFilesystemStore } from "@lovrozagar/flare/store-filesystem";
import { createRevalidateFn } from "@lovrozagar/flare/revalidation";

const store: FlareStore = createFilesystemStore(".flare/cache");
/* or implement { get, set, delete, deleteByTags } yourself */

createServer(router).cache({ store, cdnPurgeAdapter });

const revalidate = createRevalidateFn({ store, cdnPurgeAdapter });
await revalidate({ tags: ["posts"], keys: ["static:/about"], tiers: ["ssr", "cdn"] });
```

HTTP purge: `POST` with header `x-revalidation-secret` (set the secret on the handler cache config). Load prerendered artifacts with `loadPrerenderArtifacts(dir, store)` from `@lovrozagar/flare/prerender`.

## Query

```ts
import { getQueryClient } from "./query-client";
import { useSuspenseQuery } from "@lovrozagar/flare/suspense-query";
import { BroadcastProvider } from "@lovrozagar/flare/broadcast";

createRouter({ queryClientGetter: getQueryClient });
```

SSR dehydrates into the stream (`__flare_qc` / `t:"q"`). `useSuspenseQuery` suspends until the dehydrated entry is ready. Optional `BroadcastProvider` invalidates across tabs.

```ts
import { createQueryClientGetter } from "@lovrozagar/flare/query-client";

export const getQueryClient = createQueryClientGetter(() => new QueryClient());
```

## Lazy

```ts
import { lazy, clientLazy } from "@lovrozagar/flare/lazy";

const Heavy = lazy({
	loader: () => import("./heavy"),
	pending: () => <p>Loading</p>,
	error: (err) => <p>{err.message}</p>,
});

const BrowserOnly = clientLazy({
	loader: () => import("./chart"),
});
```

`lazy()` works on server and client. `clientLazy()` is browser-only (no SSR). Prefetch can preload chunks.

## Service worker

```ts
flare({
	serviceWorker: { offlineFallback: "/offline" },
});
```

Dev `sw.js` uses `skipWaiting` + `clients.claim`. The offline route is your page (`/offline`). Disable with `serviceWorker: false`.

## Sitemap and search engines

```ts
createServer(router).sitemap({
	origin: "https://example.com",
	changefreq: "weekly",
	exclude: ["/admin/*"],
	additionalEntries: [{ loc: "https://example.com/extra", priority: 0.3 }],
});
```

Or `generateSitemap(defs, config)` from `@lovrozagar/flare/sitemap`.

```ts
import { submitIndexNow, indexNowVerification } from "@lovrozagar/flare/search-engine";
import { submitSitemapToGoogle, notifyGoogleIndexing } from "@lovrozagar/flare/search-engine";
import { submitUrlsToBing } from "@lovrozagar/flare/search-engine";
```

IndexNow, Google Indexing / sitemap ping, Bing URL submit. Credentials stay on the server.

## Tracing

```ts
import { createTimingTracer, createOtelTracer, noopTracer } from "@lovrozagar/flare/tracing";

createServer(router).tracing({
	timing: true,
	tracer: createTimingTracer(),
});
```

`timing: true` emits `Server-Timing`. Pass an OTel-compatible tracer for spans.

## Testing

```ts
import { FlarePage, assertFlareStateShape, isHydrationError } from "@lovrozagar/flare/testing";

const flare = new FlarePage(page);
await flare.goto("/");
await flare.assertHydrated();
assertFlareStateShape(await flare.state());
```

Playwright helpers: hydration, FlareState shape, console-error filters. Product e2e also has app-local helpers under `e2e/apps/product/tests/e2e/helpers.ts`.

## NDJSON protocol

SPA / prefetch / data requests send `x-d: 1`. Prefetch also sends `x-p: 1`. Stale match skip uses `x-m`.

| `t` | Meaning         |
| --- | --------------- |
| `l` | Loader payload  |
| `c` | Deferred chunk  |
| `h` | Head            |
| `r` | Redirect        |
| `q` | Query dehydrate |

There is no JSON-RPC twin. HTML is `renderToStream`. Hydration reads `self.flare` (FlareState): `p` pathname, `r` params/search, `m` matches, `c` serializable router config.

## Duration strings

Anywhere a duration is accepted: number (ms) or `"30s"` / `"5m"` / `"1h"` / `"1d"`.

## Plugin

```ts
import { defineConfig } from "vite";
import { flare } from "@lovrozagar/flare/plugins";

export default defineConfig({
	plugins: [
		flare({
			codegen: { fsVirtualPaths: false },
			dev: { cdnCache: false, dashboard: true, serverTiming: true },
			prerender: true,
			serviceWorker: { offlineFallback: "/offline" },
			sx: { tw: true },
			image: { quality: 80, widths: [400, 800, 1200] },
			assetsBase: "/assets",
			alias: { "@": "/src" },
			port: undefined,
			purge: false,
			logLevel: "info",
		}),
	],
});
```

| Option                                 | Default                                     | Meaning                                                      |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `codegen.fsVirtualPaths`               | `true`                                      | Suffix files vs string `createPage`                          |
| `codegen.routesFilePath`               | `src/_gen/routes.gen.ts`                    |                                                              |
| `codegen.typesFilePath`                | `src/_gen/types.gen.d.ts`                   |                                                              |
| `dev.cdnCache`                         | `true`                                      | Disk CDN emulator                                            |
| `dev.dashboard`                        | `true`                                      | `/__flare` (node-only)                                       |
| `dev.serverTiming`                     | `true`                                      | `Server-Timing`                                              |
| `dev.staticCache`                      | `true`                                      |                                                              |
| `prerender`                            | off                                         | SSG/ISR emit                                                 |
| `purge`                                | off                                         | Dead CSS / `data-testid` strip                               |
| `serviceWorker`                        | off                                         | `sw.js`                                                      |
| `sx.tw`                                | compile `class=` Tailwind                   |                                                              |
| `image.quality` / `widths` / `exclude` | image pipeline                              |                                                              |
| `assetsBase`                           | `"/assets"`                                 | Must start with `/`, no trailing `/` (`"/"` = root-relative) |
| `entry.client` / `entry.server`        | `src/client`, `src/server`                  |                                                              |
| `ignorePrefix`                         | extra ignored folder names                  |                                                              |
| `port`                                 | Vite `server.port` (overrides CLI `--port`) |                                                              |
| `alias`                                | Vite alias                                  |                                                              |
| `solid`                                | passed to `@solidjs/vite-plugin`            | `ssr: true` is forced; `start: true` is rejected             |

`dev: false` turns every `dev.*` flag off. Dev dashboard is `@node-only` in e2e (not on Workers).

Do **not** set `flare({ port: 3000 })` in e2e apps — it steals Playwright’s `--port`.

## Package exports

Import features from their path.

| Export                                  | You get                                 |
| --------------------------------------- | --------------------------------------- |
| `@lovrozagar/flare`                     | `createRouter`, hooks, `navigate`       |
| `@lovrozagar/flare/router`              | `createRouter`                          |
| `@lovrozagar/flare/page`                | `createPage`                            |
| `@lovrozagar/flare/layout`              | `createLayout`                          |
| `@lovrozagar/flare/root-layout`         | `createRootLayout`                      |
| `@lovrozagar/flare/path-segment`        | `createPathSegment`                     |
| `@lovrozagar/flare/link`                | `Link`                                  |
| `@lovrozagar/flare/outlet`              | `Outlet`                                |
| `@lovrozagar/flare/hydrate`             | `hydrate`                               |
| `@lovrozagar/flare/client`              | `createClient`                          |
| `@lovrozagar/flare/await`               | `<Await>`                               |
| `@lovrozagar/flare/form`                | `Form`, `FieldError`                    |
| `@lovrozagar/flare/server-fn`           | `createServerFn`                        |
| `@lovrozagar/flare/server-fn-query`     | server fn ↔ Query                       |
| `@lovrozagar/flare/plugins`             | `flare()`                               |
| `@lovrozagar/flare/styles`              | `styles`, `cn`, `compileSx`             |
| `@lovrozagar/flare/fonts`               | `FontCSS`, `createFont`                 |
| `@lovrozagar/flare/fonts/<family>`      | `import { inter } from "…/fonts/inter"` |
| `@lovrozagar/flare/image`               | `Image`, `configureImage`               |
| `@lovrozagar/flare/theme`               | `ThemeScript`, `ThemeProvider`          |
| `@lovrozagar/flare/direction`           | `DirectionScript`                       |
| `@lovrozagar/flare/locale`              | `LocaleScript`, `LocaleProvider`        |
| `@lovrozagar/flare/i18n`                | `createTranslations`, `formatMessage`   |
| `@lovrozagar/flare/middleware`          | `onPage`, `virtualPath`, types          |
| `@lovrozagar/flare/middleware/*`        | builtins                                |
| `@lovrozagar/flare/errors`              | `NotFoundError`, redirects, auth errors |
| `@lovrozagar/flare/security`            | `SecurityConfig`                        |
| `@lovrozagar/flare/revalidation`        | `createRevalidateFn`                    |
| `@lovrozagar/flare/store`               | `FlareStore`                            |
| `@lovrozagar/flare/store-filesystem`    | disk store                              |
| `@lovrozagar/flare/query-client`        | `createQueryClientGetter`               |
| `@lovrozagar/flare/suspense-query`      | `useSuspenseQuery`                      |
| `@lovrozagar/flare/broadcast`           | cross-tab                               |
| `@lovrozagar/flare/lazy`                | `lazy`, `clientLazy`                    |
| `@lovrozagar/flare/server`              | `createServer`                          |
| `@lovrozagar/flare/server-context`      | ALS, `background`                       |
| `@lovrozagar/flare/server-only`         | `createServerOnlyFn`                    |
| `@lovrozagar/flare/client-only`         | `createClientOnlyFn`                    |
| `@lovrozagar/flare/isomorphic`          | `createIsomorphicFn`                    |
| `@lovrozagar/flare/testing`             | Playwright helpers                      |
| `@lovrozagar/flare/sitemap`             | sitemap XML                             |
| `@lovrozagar/flare/search-engine`       | IndexNow / Google / Bing                |
| `@lovrozagar/flare/rewrite`             | `LocationRewrite`                       |
| `@lovrozagar/flare/mount`               | `mount`                                 |
| `@lovrozagar/flare/intercept-outlet`    | `InterceptOutlet`                       |
| `@lovrozagar/flare/navigation-progress` | `<NavigationProgress>`                  |
| `@lovrozagar/flare/reset-css`           | `<ResetCSS>`                            |
| `@lovrozagar/flare/view-transition-css` | `<ViewTransitionCSS>`                   |
| `@lovrozagar/flare/prerender`           | `loadPrerenderArtifacts`                |
| `@lovrozagar/flare/tracing`             | timing / OTel                           |
| `@lovrozagar/flare/validation`          | `Validator`, `runValidator`             |
| `@lovrozagar/flare/codegen`             | generated types                         |
| `@lovrozagar/flare/generators`          | `runGenerate`                           |
| `@lovrozagar/flare/virtual-types`       | `/// <reference types="…" />`           |

## Repository layout

```
packages/core/     published `@lovrozagar/flare` (src, tests, spec)
packages/cli/      `flare` CLI (`@flare/cli`)
e2e/apps/          product, demo, fs-routes, tauri
e2e/{node,bun,workers,deno}/   env hosts + Playwright
e2e/run-env.ts     env × app runner
benchmark/         flare vs Next vs TanStack
```

`e2e/apps/*` own the tests. Runtimes only listen. `FLARE_E2E_APP` and `FLARE_E2E_ENV` select app and host.

## Develop

Requires [Bun](https://bun.sh) 1.3+ and TypeScript 7.

```bash
bun install
bun run test                 # core unit
bun run test:cli             # CLI unit
bun run test:all             # unit + build + e2e apps on node (dev then prod)
bun run test:all -- --env bun
bun run typecheck
bun run typecheck:consumers
bun run lint
bun run fmt:check
```

GitHub Actions (`.github/workflows/ci.yml`): `test` runs typecheck, fmt, lint, unit. `e2e` is a matrix of node / bun / workers / deno, each in Vite **dev** and (except deno/firefox) **prod** (`vite preview`).

Release: bump `packages/core/package.json`, commit, tag `vX.Y.Z` matching that version, and push the tag. `.github/workflows/release.yml` publishes `@lovrozagar/flare` to npm via GitHub Actions OIDC (no npm token) and opens the GitHub Release. The npm trusted publisher must name this file `release.yml`.

### Checks

TypeScript 7 `strict` plus [oxlint](https://oxc.rs/docs/guide/usage/linter.html) / [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html):

```bash
bun run typecheck
bun run typecheck:consumers
bun run lint
bun run lint:fix
bun run fmt
bun run fmt:check
```

Config: `.oxlintrc.json`, `.oxfmtrc.jsonc`. Tabs, double quotes, `printWidth` 120, semicolons. Generated `_gen/` / `*.gen.ts` are ignored.

Do not weaken `strict` or add `as any` to make typecheck pass.

### Test matrix

| Command                         | What it proves                             |
| ------------------------------- | ------------------------------------------ |
| `bun run test`                  | Core unit + integration                    |
| `bun run test:cli`              | CLI unit                                   |
| `bun run test:e2e`              | Playwright, every app × node, Vite **dev** |
| `bun run test:e2e:prod`         | Same tests, `vite build` + **preview**     |
| `bun run test:e2e:bun`          | Same tests, Bun listen (dev)               |
| `bun run test:e2e:bun:prod`     | Bun listen, prod preview                   |
| `bun run test:e2e:workers`      | Same tests, local workerd (dev)            |
| `bun run test:e2e:workers:prod` | workerd, prod preview                      |
| `bun run test:e2e:deno`         | Same tests, Deno (dev)                     |
| `bun run test:e2e:firefox`      | Same tests, Firefox (**dev only**)         |

```bash
bun run test:e2e -- --app product
bun run e2e/run-env.ts --env workers --app demo
TEST_MODE=prod bun run test:e2e:workers
```

| App         | Covers                        |
| ----------- | ----------------------------- |
| `product`   | Full framework surface        |
| `demo`      | Locale / i18n chrome          |
| `fs-routes` | `fsVirtualPaths` suffix files |
| `tauri`     | Desktop Vite shell            |

Runtimes: `e2e/node`, `e2e/bun`, `e2e/workers`, `e2e/deno`. Firefox uses the node host.

### Bench

`benchmark/` compares Flare, Next, and TanStack. Numbers: [`benchmark/RESULTS.md`](benchmark/RESULTS.md).

```bash
bun run --filter @lovrozagar/flare bench
```

## License

MIT. Copyright (c) 2026 Lovro Žagar.
