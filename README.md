# Flare

Solid meta-framework. File or string routes, server-driven loaders, NDJSON streaming, `renderToStream`, ISR/SSG, `sx` + Tailwind, and one Vite plugin.

This repo is the source of the [`@lovrozagar/flare`](https://www.npmjs.com/package/@lovrozagar/flare) npm package (`0.1.0`). The CLI binary is still `flare`.

## Table of contents

- [Start](#start)
- [What Flare is](#what-flare-is)
- [Install](#install)
- [First app](#first-app)
- [CLI](#cli)
  - [`flare init`](#flare-init)
  - [`flare generate` / `flare gen`](#flare-generate--flare-gen)
  - [`flare add`](#flare-add)
  - [`flare font`](#flare-font)
  - [`flare routes` / `status` / `validate`](#flare-routes--status--validate)
- [Routes](#routes)
  - [String virtual paths](#string-virtual-paths)
  - [Filesystem virtual paths](#filesystem-virtual-paths)
  - [Params and search](#params-and-search)
  - [Layouts and outlet](#layouts-and-outlet)
- [Loaders and streaming](#loaders-and-streaming)
- [Auth](#auth)
- [Cache](#cache)
  - [Client](#client)
  - [SSR store / ISR / SSG](#ssr-store--isr--ssg)
  - [CDN](#cdn)
- [Head](#head)
- [Navigation](#navigation)
- [Forms and server functions](#forms-and-server-functions)
- [Styles](#styles)
- [Fonts and images](#fonts-and-images)
- [i18n, theme, direction](#i18n-theme-direction)
- [Middleware](#middleware)
- [Security](#security)
- [Query](#query)
- [Lazy](#lazy)
- [Service worker](#service-worker)
- [Plugin](#plugin)
- [Package exports](#package-exports)
- [Repository layout](#repository-layout)
- [Develop](#develop)
  - [Checks](#checks)
  - [Test matrix](#test-matrix)
  - [E2E apps and runtimes](#e2e-apps-and-runtimes)
  - [Bench](#bench)
- [License](#license)

## Start

```bash
bun add @lovrozagar/flare
flare init
bun run dev
```

```ts
/* src/routes/_root_.tsx */
import { createRootLayout } from "@lovrozagar/flare/root-layout"

export const route = createRootLayout("_root_").render((props) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
    </head>
    <body>{props.children}</body>
  </html>
))
```

```ts
/* src/routes/index.tsx */
import { createPage } from "@lovrozagar/flare/page"
import { Link } from "@lovrozagar/flare/link"

export const route = createPage("_root_/")
  .loader(() => ({ message: "Hello from Flare" }))
  .head(() => ({ title: "Home" }))
  .render((props) => (
    <main>
      <h1>{props.loaderData.message}</h1>
      <Link to="/about">About</Link>
    </main>
  ))
```

```bash
curl http://127.0.0.1:5173/
# HTML document, streamed, with FlareState for hydration
```

`flare init` writes `src/client.tsx`, `src/server.ts`, `src/router.ts`, a root layout, and `vite.config.ts` with `flare()`. `flare generate` (or the Vite plugin watch) writes `src/_gen/routes.gen.ts` and `src/_gen/types.gen.d.ts`.

The same app runs on Node, Bun, Deno, and Cloudflare Workers. Vite is the bundler. Solid is the renderer.

## What Flare is

Flare is a Solid + Vite meta-framework. You declare pages and layouts with a typed builder. The server streams HTML (`renderToStream`) and later navigations speak NDJSON (`x-d: 1`). Prefetch, ISR, and deferred loaders reuse that protocol.

- **Builder DX.** `createPage("_root_/about").loader(...).head(...).render(...)`. Types flow from the generated route tree into `Link`, `navigate`, and loader `ctx`.
- **Server-driven.** Loaders, auth, cache, and head run on the server. The client hydrates and then fetches NDJSON for SPA navigations.
- **NDJSON only.** Data requests are line-delimited JSON (`t:"l"` loader, `t:"c"` deferred chunk, `t:"h"` head, `t:"r"` redirect). There is no parallel JSON-RPC surface.
- **Streaming first.** `defer()` + `<Await>` stream comments after the shell. HTML never waits for every promise.
- **One plugin.** `flare()` from `@lovrozagar/flare/plugins` is Vite: codegen, `sx`/`class=` compile, images, server functions, prerender, service worker, dev dashboard.
- **Web Standards.** Handlers see `Request`. Responses are `Response`. Workers get `waitUntil` via `serverContext`.

Flare is not Next with Solid bolted on. There is no `getServerSideProps` object. A route is one file and one chain.

## Install

Requires [Bun](https://bun.sh) 1.3+ to develop this repo. Consumers run `flare` on Bun, Node, Deno, or Workers with Vite 8 and Solid 1.9.

```bash
bun add @lovrozagar/flare
# or
npm add @lovrozagar/flare
# or
pnpm add @lovrozagar/flare
```

The CLI is a workspace package (`@flare/cli`, binary `flare`). After install in this repo it is on the path via workspace linking. Peers: `solid-js`, `vite`, `vite-plugin-solid`, plus optional `sharp`, `isbot`, `@tanstack/solid-query`, `oxc-parser`, `oxc-resolver`.

## First app

`flare init` is the supported scaffold.

```bash
mkdir my-app && cd my-app
bun init -y
bun add @lovrozagar/flare
flare init
bun run dev
```

That writes:

| File                    | Role                                               |
| ----------------------- | -------------------------------------------------- |
| `src/client.tsx`        | Browser hydrate entry                              |
| `src/server.ts`         | `createServerHandler` + Vite SSR / Workers `fetch` |
| `src/router.ts`         | `createRouter({ layouts, routeTree })`             |
| `src/routes/_root_.tsx` | Root HTML document                                 |
| `src/routes/index.tsx`  | Home page                                          |
| `vite.config.ts`        | `flare()` plugin                                   |

Scripts: `dev` (`vite dev`), `build`, `preview`, `generate` (`flare generate`).

Presets:

```bash
flare init --template saas
flare init --template blog
flare init --template marketing
```

Flags: `--auth cookie|jwt|none`, `--cache isr|ssg|ssr|mixed`, `--style tailwind|css-modules|none`, `--locale en,hr`. Existing files refuse overwrite unless you pass `--force`.

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

### `flare init`

See [First app](#first-app). Interactive if you omit flags.

### `flare generate` / `flare gen`

Scans `src/routes/` and writes `src/_gen/`. The Vite plugin also runs this on boot and on watch.

| Flag      | Meaning                            |
| --------- | ---------------------------------- |
| `--watch` | Regenerate when route files change |

`codegen.fsVirtualPaths` (default `true` in the plugin) requires suffix files: `*.page.tsx`, `*.layout.tsx`, `*.root-layout.tsx`, `*.path-segment.tsx`. Set `fsVirtualPaths: false` to keep handwritten `createPage("_root_/about")` strings (the product e2e app does this).

### `flare add`

Patches an existing route chain:

| Command                                     | Adds                                   |
| ------------------------------------------- | -------------------------------------- |
| `flare add auth <paths>`                    | `.authenticate()`                      |
| `flare add cache <paths> [--isr N] [--ssg]` | `.cache()`                             |
| `flare add loader <path>`                   | `.loader()` stub                       |
| `flare add head <path>`                     | `.head({ title })`                     |
| `flare add input <path>`                    | `.input()` schema stub                 |
| `flare add error-boundary <path>`           | `.errorRender()` + `.notFoundRender()` |

### `flare font`

Downloads registered families into `public/fonts/` and prints import snippets.

```bash
flare font add --name Inter
flare font list
flare font info Inter
flare font remove Inter
```

### `flare routes` / `status` / `validate`

- `routes` — print the generated tree.
- `status` — project health (flare dep, `_gen`, Vite config).
- `validate` — chain/file conventions.

## Routes

### String virtual paths

```ts
import { createPage } from "@lovrozagar/flare/page"

export const route = createPage("_root_/blog/[slug]")
  .loader((ctx) => ({ slug: ctx.location.params.slug }))
  .render((props) => <h1>{props.loaderData.slug}</h1>)
```

The string is the virtual path. `_root_` is the root layout scope. Groups like `_root_/(blog)/blog` share a layout without a URL segment.

### Filesystem virtual paths

With `codegen: { fsVirtualPaths: true }` (plugin default):

```
src/routes/_root_/about/about.page.tsx          → createPage("_root_/about")
src/routes/_root_/(blog)/blog.layout.tsx        → createLayout("_root_/(blog)")
src/routes/_root_/users/[id]/user.page.tsx      → createPage("_root_/users/[id]")
src/routes/_root_/files/[...path]/files.page.tsx
src/routes/_root_/optional-locale/[[locale]]/opt.page.tsx
```

Folders starting with `_` other than `_root_` / `_admin_`-style scopes are ignored (`_utils`). `ignorePrefix` on the plugin skips extra names.

### Params and search

| Pattern       | Type                    |
| ------------- | ----------------------- |
| `[id]`        | `string`                |
| `[...path]`   | `string[]`              |
| `[[locale]]`  | `string \| undefined`   |
| `[[...rest]]` | `string[] \| undefined` |

`.input({ params, search })` validates with Standard Schema (Zod, Valibot, ArkType, TypeBox, Yup, Effect, Superstruct). Invalid params are 400/500 depending on the schema path.

`Link` and `navigate({ to, params, search })` are typed from `src/_gen/types.gen.d.ts`.

### Layouts and outlet

```ts
import { createLayout } from "@lovrozagar/flare/layout"
import { Outlet } from "@lovrozagar/flare/outlet"

export const route = createLayout("_root_/(blog)")
  .loader(() => ({ section: "Blog" }))
  .render((props) => (
    <div>
      <nav>{props.loaderData.section}</nav>
      {props.children}
    </div>
  ))
```

Root layouts use `createRootLayout` and own `<html>`. `createPathSegment` is a URL-only node (no UI). Child errors can be caught with `.errorRender()` / `.notFoundRender()` / `.unauthenticatedRender()` / `.unauthorizedRender()` on the layout or root.

## Loaders and streaming

```ts
export const route = createPage("_root_/blog/[slug]")
  .preloader((ctx) => ({ locale: ctx.locale() }))
  .loader((ctx) => {
    const slug = ctx.location.params.slug
    const comments = ctx.defer(async () => {
      await db.comments(slug)
    })
    return { slug, title: `Post: ${slug}`, comments }
  })
  .render((props) => (
    <main>
      <h1>{props.loaderData.title}</h1>
      <Await pending={<p>Loading…</p>} promise={props.loaderData.comments}>
        {(comments) => <ul>{/* … */}</ul>}
      </Await>
    </main>
  ))
```

Pipeline: authenticate → authorize → preloaders (parent → child) → loaders. `ctx.defer()` marks a field for NDJSON `t:"c"` chunks. Prefetch skips deferred execution (shell only). History restore of a deferred match refetches so `<Await>` gets a live promise.

`createServerOnlyFn` / `createClientOnlyFn` / `createIsomorphicFn` split implementations by environment.

## Auth

```ts
export const route = createPage("_root_/dashboard")
  .authenticate()
  .authorize(({ user }) => user.role === "admin")
  .render(() => <h1>Dashboard</h1>)
```

`.authenticate()` / `.authenticate("optional")` / `false`. Failures throw `UnauthenticatedError` (401) or `UnauthorizedError` (403). Root/layout `.unauthenticatedRender()` / `.unauthorizedRender()` draw the boundary. `createRouter({ authenticateFn })` is the app-wide hook (cookie, header, JWT).

Throw helpers on loader/preloader ctx: `ctx.notFound()`, `ctx.redirect({ to })`, `ctx.unauthenticated()`, `ctx.unauthorized()`.

## Cache

### Client

```ts
createRouter({
	cache: { client: { prefetch: "intent", staleTime: 30_000 } },
});

export const route = createPage("_root_/about").cache({
	client: { staleTime: "10s", prefetch: "viewport", cacheDeferred: true },
});
```

`prefetch`: `false` | `"intent"` | `"viewport"` | `"render"`. `staleTime` / `gcTime` / `prefetchStaleTime` accept ms or duration strings. `hasDeferred` cache entries are treated stale so popstate does not replay a dead marker.

### SSR store / ISR / SSG

```ts
.cache({
  ssr: { staleTime: 5_000, ttl: 60, tags: ["posts"] },
  static: true,                          // SSG
  // or ISR:
  // static: { revalidate: 60, params: () => [{ slug: "hello" }] },
})
```

- **SSR cache** — store-backed HTML/data, `staleTime` + `ttl` + tags.
- **SSG** — `.cache({ static: true })` or `{ params, defer }`. Built at `vite build`.
- **ISR** — `{ revalidate, params, dynamicParams }`. Tag purge via `@lovrozagar/flare/revalidation` and `x-revalidation-secret`.

HTML that embeds a per-request CSP nonce is never `304`. A 304 would reuse the old body (old nonce) against a new CSP and block inline scripts. ETag still lands on the 200.

### CDN

`.cache({ cdn: { maxAge, swr, tags, vary } })` sets `Cache-Control` / `CDN-Cache-Control`. Dev can emulate a CDN disk cache (`dev.cdnCache`, default on). Product e2e turns it off so HTML stays fresh.

## Head

```ts
.head((ctx) => ({
  title: `About — ${ctx.loaderData.year}`,
  description: "…",
  canonical: "https://example.com/about",
  openGraph: { title: "…", images: [{ url: "…", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "…" },
  jsonLd: [{ "@type": "WebPage", name: "About" }],
}))
```

Child titles win. `{ replace: true }` as the second argument drops inherited description/keywords. SPA navigation applies per-route heads and removes stale meta / JSON-LD.

## Navigation

```tsx
import { Link } from "@lovrozagar/flare/link"
import { navigate } from "@lovrozagar/flare"

<Link to="/blog/[slug]" params={{ slug: "hello-world" }} prefetch="intent">
  Post
</Link>

<Link href="https://example.com" target="_blank">External</Link>
<Link to="/about" replace hash="section" disabled />
```

- Internal `to` is typed. External `href` is not rewritten. `javascript:` is sanitized.
- `prefetch={false}` disables. Default comes from router / route cache.
- `activeClass` / `inactiveClass` / `activeProps` / `inactiveProps` / `aria-current`.
- `createRouter({ viewTransitions: true })` wraps updates in `document.startViewTransition` (Chromium). `ViewTransitionCSS` in the root head.
- Scroll restoration and blockers (`useBlocker`) are first-class.
- `createRouter({ rewrite })` maps vanity URLs (`/vanity` → `/about`) without changing the address bar on output.

Default redirect status is **303**. `.redirect({ to, status: 307 })` overrides.

## Forms and server functions

```ts
import { createServerFn } from "@lovrozagar/flare/server-fn"
import { Form, FieldError } from "@lovrozagar/flare/form"

const save = createServerFn
  .input(z.object({ email: z.string().email() }))
  .handler(async ({ input }) => ({ ok: true, email: input.email }))

<Form action={save}>
  {(form) => (
    <>
      <input name="email" />
      <FieldError name="email" />
      <button type="submit">Save</button>
    </>
  )}
</Form>
```

Server functions are RPC over the same origin. The Vite plugin strips handler bodies from the client bundle. Progressive enhancement works with JS off. CSRF origin checks apply to mutating methods.

`createServerFn` supports `.validator()`, streaming, and `revalidate` tags after mutation.

## Styles

Three supported surfaces (current pipeline):

| API                                                   | Use                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `class="flex gap-4 p-8"`                              | Tailwind utilities, compiled by the `sx` AST plugin (`sx: { tw: true }`) |
| `sx={{ color: "rgb(0,0,255)", variants: { … } }}`     | Typed style object → atomic classes                                      |
| `styles("box", { css: "padding: 8px", state, vars })` | Named scoped CSS, `data-c` attribute                                     |

`tw=` on `styles()` or as a JSX attribute is dropped. Put utilities in `class=`. `css=` compiles through the same plugin (not a `data-c` hash).

```tsx
<div class="bg-blue-500 p-4" />
<div sx={{ color: "rgb(0, 100, 200)", padding: "16px" }} />
<div {...styles("box", { css: "color: rgb(255, 0, 0)" })} />
```

## Fonts and images

```tsx
import { FontCSS } from "@lovrozagar/flare/fonts"
import { Image } from "@lovrozagar/flare/image"

<FontCSS family="Inter" />
<Image src={hero} alt="Hero" widths={[400, 800, 1200]} />
```

`flare font add` writes `public/fonts/` + subset CSS. Fallback metrics (`size-adjust`) reduce CLS.

`Image` emits `srcset`, optional blur placeholder, and `placeholder={false}` to skip it. The Vite image plugin rewrites imports.

## i18n, theme, direction

```ts
createRouter({
	locale: { defaultLocale: "en", locales: ["en", "hr", "fr"], paramName: "locale" },
	theme: { defaultTheme: "system" },
	direction: { defaultDir: "ltr" },
});
```

- **Locale** — optional `[[locale]]` segment or prefix. Cookie + `Accept-Language`. `LocaleScript` / `LocaleProvider`. Playwright / bot UAs skip Set-Cookie (`isbot`).
- **Theme** — `ThemeScript` + `ThemeProvider`, `data-theme`, system preference, `localStorage`.
- **Direction** — `DirectionScript` + `dir` / `data-dir`.

`@lovrozagar/flare/i18n` is message formatting for copy, separate from routing locale.

## Middleware

```ts
import { i18n } from "@lovrozagar/flare/middleware/i18n";
import { keepalive } from "@lovrozagar/flare/middleware/keepalive";
import { staticAssets } from "@lovrozagar/flare/middleware/static-assets";
import { apiProxy } from "@lovrozagar/flare/middleware/api-proxy";
import { cdnProxy } from "@lovrozagar/flare/middleware/cdn-proxy";
import { markdownNegotiation } from "@lovrozagar/flare/middleware/markdown-negotiation";
```

| Export                | Role                                         |
| --------------------- | -------------------------------------------- |
| `i18n`                | Locale detect, cookie, prefix redirects      |
| `keepalive`           | 204 probe                                    |
| `staticAssets`        | `public/`                                    |
| `apiProxy`            | Prefix rewrite to an upstream                |
| `cdnProxy`            | Object/CDN key serve                         |
| `markdownNegotiation` | `Accept: text/markdown` → markdown from HTML |

`createRouter({ middleware })` or per-route `.middleware()`. `onResponse` can append headers. `mount("/api", handler)` is an in-process API island (`@lovrozagar/flare/mount`).

## Security

`createRouter({ security })` / `@lovrozagar/flare/security`:

- `X-Content-Type-Options: nosniff`
- CSP — dev `unsafe-inline`; prod nonce on HTML
- HSTS in prod (skipped in dev)
- COOP / frame options when configured

`isbot` skips locale cookies for automated clients. Server functions check origin on POST.

## Query

```ts
import { getQueryClient } from "./query-client";

createRouter({ queryClientGetter: getQueryClient });
```

TanStack Query on Solid. SSR dehydrates into the stream. `useSuspenseQuery` / `@lovrozagar/flare/suspense-query`. Broadcast client optional for cross-tab invalidation (`@lovrozagar/flare/broadcast`).

## Lazy

```ts
import { lazy, clientLazy } from "@lovrozagar/flare/lazy"

const Heavy = lazy({
  loader: () => import("./heavy"),
  pending: () => <p>Loading</p>,
})
```

`lazy()` works on server and client. `clientLazy()` is browser-only (no SSR). Prefetch can preload chunks.

## Service worker

```ts
flare({
	serviceWorker: { offlineFallback: "/offline" },
});
```

Dev `sw.js` uses `skipWaiting` + `clients.claim`. Offline route is your page (`/offline`). Disable with `serviceWorker: false`.

## Plugin

```ts
import { flare } from "@lovrozagar/flare/plugins";

export default defineConfig({
	plugins: [
		flare({
			codegen: { fsVirtualPaths: false },
			dev: { cdnCache: false, dashboard: true, serverTiming: true },
			prerender: true,
			serviceWorker: { offlineFallback: "/offline" },
			sx: { tw: true },
			image: { quality: 80 },
			assetsBase: "/assets",
		}),
	],
});
```

| Option                   | Default                   | Meaning                              |
| ------------------------ | ------------------------- | ------------------------------------ |
| `codegen.fsVirtualPaths` | `true`                    | Suffix files vs string `createPage`  |
| `dev.cdnCache`           | `true`                    | Disk CDN emulator                    |
| `dev.dashboard`          | `true`                    | `/__flare` (node-only)               |
| `dev.serverTiming`       | `true`                    | `Server-Timing`                      |
| `prerender`              | off                       | SSG/ISR emit                         |
| `purge`                  | off                       | Dead CSS / test-id strip             |
| `serviceWorker`          | off                       | `sw.js`                              |
| `sx.tw`                  | compile `class=` Tailwind |
| `assetsBase`             | `"/assets"`               | Must start with `/`, no trailing `/` |

Dev dashboard is `@node-only` in e2e (not on Workers).

## Package exports

Import features from their path. `import { createPage } from "@lovrozagar/flare/page"` — not a kitchen-sink `flare` barrel for UI.

| Export                                                               | Purpose                                 |
| -------------------------------------------------------------------- | --------------------------------------- |
| `@lovrozagar/flare` / `@lovrozagar/flare/router`                     | `createRouter`                          |
| `@lovrozagar/flare/page` / `layout` / `root-layout` / `path-segment` | Route builders                          |
| `@lovrozagar/flare/link` / `outlet` / `hydrate` / `client`           | Client UI                               |
| `@lovrozagar/flare/await`                                            | `<Await>`                               |
| `@lovrozagar/flare/form` / `server-fn` / `server-fn-query`           | Mutations                               |
| `@lovrozagar/flare/plugins`                                          | Vite plugin                             |
| `@lovrozagar/flare/styles`                                           | `styles()`, `cn`                        |
| `@lovrozagar/flare/fonts` / `image`                                  | Fonts, `Image`                          |
| `@lovrozagar/flare/theme` / `direction` / `locale` / `i18n`          | Chrome scripts + providers              |
| `@lovrozagar/flare/middleware/*`                                     | Builtins                                |
| `@lovrozagar/flare/errors`                                           | `NotFoundError`, redirects, auth errors |
| `@lovrozagar/flare/security` / `revalidation` / `store`              | Headers, purge, store                   |
| `@lovrozagar/flare/query-client` / `suspense-query` / `broadcast`    | TanStack                                |
| `@lovrozagar/flare/lazy`                                             | `lazy` / `clientLazy`                   |
| `@lovrozagar/flare/server` / `server-context`                        | Handler + ALS                           |
| `@lovrozagar/flare/testing`                                          | Playwright helpers                      |
| `@lovrozagar/flare/sitemap` / `search-engine`                        | Sitemap + IndexNow                      |
| `@lovrozagar/flare/rewrite` / `mount`                                | Vanity URLs, `/api` mount               |
| `@lovrozagar/flare/codegen` / `generators`                           | Generate API                            |

## Repository layout

```
packages/core/     published `@lovrozagar/flare` package (src, tests, spec)
packages/cli/      `flare` CLI (`@flare/cli`)
e2e/apps/          product, demo, fs-routes, tauri
e2e/{node,bun,workers,deno}/   env hosts + Playwright
e2e/run-env.ts     env × app runner
benchmark/         flare vs Next vs TanStack
```

`e2e/apps/*` own the tests. Runtimes only listen. `FLARE_E2E_APP` and `FLARE_E2E_ENV` select app and host.

## Develop

`packages/core` is the published `@lovrozagar/flare` package. `e2e/*` imports it over `workspace:*`.

Requires [Bun](https://bun.sh) 1.3+ and TypeScript 7.

```bash
bun install
bun run test                 # core unit
bun run test:cli             # CLI unit
bun run test:all             # unit + all e2e apps on node
bun run test:all -- --env bun
bun run typecheck            # core src
bun run typecheck:consumers  # e2e apps + generated types
bun run lint                 # oxlint
bun run fmt:check            # oxfmt --check
```

GitHub Actions (`.github/workflows/ci.yml`, Honey-shaped): `test` runs typecheck, fmt, lint, and unit. `e2e` is a matrix of node / bun / workers / deno.

### Checks

TypeScript 7 `strict` plus [oxlint](https://oxc.rs/docs/guide/usage/linter.html) / [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) (same stack as oat):

```bash
bun run typecheck
bun run typecheck:consumers
bun run lint                 # oxlint
bun run lint:fix
bun run fmt                  # oxfmt
bun run fmt:check
```

Config: `.oxlintrc.json`, `.oxfmtrc.jsonc`. Tabs, double quotes, `printWidth` 120, semicolons (this repo already uses them). Generated `_gen/` / `*.gen.ts` files are ignored.

Do not weaken `strict` or add `as any` to make typecheck pass.

### Test matrix

| Command                    | What it proves                 |
| -------------------------- | ------------------------------ |
| `bun run test`             | Core unit + integration        |
| `bun run test:cli`         | CLI unit                       |
| `bun run test:e2e`         | Playwright, every app × node   |
| `bun run test:e2e:bun`     | Same tests, Bun listen         |
| `bun run test:e2e:workers` | Same tests, local workerd      |
| `bun run test:e2e:deno`    | Same tests, Deno               |
| `bun run test:e2e:firefox` | Same tests, Firefox (dev only) |
| `bun run test:e2e:prod`    | Node, `TEST_MODE=prod`         |

```bash
bun run test:e2e -- --app product
bun run e2e/run-env.ts --env workers --app demo
TEST_MODE=prod bun run test:e2e:workers
```

### E2E apps and runtimes

| App         | Covers                                                          |
| ----------- | --------------------------------------------------------------- |
| `product`   | Full framework surface (routing, cache, forms, styles, i18n, …) |
| `demo`      | Locale / i18n chrome                                            |
| `fs-routes` | `fsVirtualPaths` suffix files                                   |
| `tauri`     | Desktop Vite shell                                              |

Runtimes: `e2e/node`, `e2e/bun`, `e2e/workers`, `e2e/deno`. Firefox uses the node host with a Firefox Playwright config.

### Bench

`benchmark/` compares Flare, Next, and TanStack. Numbers: [`benchmark/RESULTS.md`](benchmark/RESULTS.md).

```bash
bun run --filter @lovrozagar/flare bench
```

## License

MIT. Copyright (c) 2026 Lovro Žagar.
