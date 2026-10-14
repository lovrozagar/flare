# Flare

A Solid 2 and Vite 8 framework. Routes are files with a typed builder. The server streams the first document. Later navigations fetch NDJSON data, which prefetch, ISR, deferred loaders, and server functions share. It runs on Node, Bun, and Cloudflare Workers.

Package: [`@lovrozagar/flare`](https://www.npmjs.com/package/@lovrozagar/flare). The contract behind every option below is the [dx folder](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/README.md): one file per surface, each row with its default, its outcome, and the test that proves it. This README names every export and the options you reach for most; the dx file each section links holds the rest.

## Install

```bash
bun add @lovrozagar/flare solid-js @solidjs/web @solidjs/vite-plugin vite oxc-parser magic-string
```

| peer                                                  | range                            | needed for                                        |
| ----------------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| `solid-js`, `@solidjs/web`                            | `>=2.0.0-rc.14`                  | every app                                         |
| `@solidjs/vite-plugin`                                | `>=3.0.0-next.49`                | every app; `flare()` adds it, so the app does not |
| `vite`                                                | `>=8.1.4`                        | every app                                         |
| `oxc-parser`, `magic-string`                          | `>=0.139.0`, `>=0.30.21`         | the plugin's codegen and boundary transform       |
| `@tanstack/solid-query`                               | `>=6.0.0-rc.5`                   | optional: `@lovrozagar/flare/query`               |
| `sharp`                                               | `>=0.35.3`                       | optional: `flare({ image })`                      |
| `@formatjs/intl-localematcher`, `negotiator`, `isbot` | `>=0.8.11`, `>=1.0.0`, `>=5.2.0` | optional: `@lovrozagar/flare/i18n/server`         |

Tailwind is the app's own `@tailwindcss/vite`; Flare does not wrap it.

## Quick start

A whole app: two pages, a root layout, one server function, and the Node server. Each file below is compiled in CI against the packed package, after `flare codegen` writes `src/_gen`.

<!-- quick-start: tsconfig.json -->

```json
{
	"compilerOptions": {
		"target": "ESNext",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"strict": true,
		"noEmit": true,
		"allowImportingTsExtensions": true,
		"jsx": "preserve",
		"jsxImportSource": "@solidjs/web",
		"types": ["vite/client", "node"],
		"skipLibCheck": true
	},
	"include": ["src", "vite.config.ts"]
}
```

<!-- quick-start: vite.config.ts -->

```ts
import { flare } from "@lovrozagar/flare/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [flare()] });
```

<!-- quick-start: src/routes/_root_/root.root-layout.tsx -->

```tsx
import { createRootLayout, Link, Stylesheet } from "@lovrozagar/flare";

export const route = createRootLayout("_root_").render((props) => (
	<html lang="en">
		<head>
			<meta charset="utf-8" />
			<title>Flare</title>
			<Stylesheet />
		</head>
		<body>
			<nav>
				<Link to="_root_/">Home</Link> <Link to="_root_/about">About</Link>
			</nav>
			{props.children}
		</body>
	</html>
));
```

<!-- quick-start: src/routes/_root_/home.page.tsx -->

```tsx
import { createPage } from "@lovrozagar/flare";
import { createSignal } from "solid-js";
import { greet } from "../../fns/greet.ts";

export const route = createPage("_root_/")
	.loader(() => ({ renderedAt: new Date().toISOString() }))
	.render((props) => {
		const [reply, setReply] = createSignal("");
		return (
			<main>
				<h1>Home</h1>
				<p>Rendered at {props.loaderData.renderedAt}</p>
				<button type="button" onClick={async () => setReply(await greet({ name: "Flare" }))}>
					Greet
				</button>
				<p>{reply()}</p>
			</main>
		);
	});
```

<!-- quick-start: src/routes/_root_/about/about.page.tsx -->

```tsx
import { createPage } from "@lovrozagar/flare";

export const route = createPage("_root_/about")
	.head(() => ({ title: "About" }))
	.render(() => <h1>About</h1>);
```

<!-- quick-start: src/fns/greet.ts -->

```ts
import { createServerFn } from "@lovrozagar/flare/server-fn";

// The validator and the handler run on the server; the client bundle keeps only the call.
export const greet = createServerFn({ method: "post" })
	.input({ parse: (value: { name: string }) => ({ name: String(value.name) }) })
	.handler(({ input }) => `Hello, ${input.name}`);
```

<!-- quick-start: src/router.ts -->

```ts
import { createRouter } from "@lovrozagar/flare";
import { chunks, layouts, routeTree } from "./_gen/routes.gen.ts";

export const router = createRouter({ layouts, routeTree, chunks });
```

<!-- quick-start: src/client.tsx -->

```tsx
import { createClient } from "@lovrozagar/flare/client";
import { router } from "./router.ts";

createClient(router);
```

<!-- quick-start: src/server.ts -->

```ts
import { createServer } from "@lovrozagar/flare/server";
import { serverFns } from "./_gen/server-fns.gen.ts";
import { router } from "./router.ts";

export const server = createServer({ router, serverFns });
```

`vite dev` serves it. `vite build` writes `dist/client` and `dist/server/server.js`, which exports `server`. The adapters serve no files, so a Node deploy puts its static layer in front, a CDN or this:

<!-- node-serve: serve.js -->

```js
// serve.js: `node serve.js` after `vite build`
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { createNodeListener } from "@lovrozagar/flare/adapters/node";
import { server } from "./dist/server/server.js";

const client = join(import.meta.dirname, "dist/client");
const types = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const listener = createNodeListener(server);

// A client file's path, or undefined for a target that names none: one `decodeURIComponent` rejects included, which the
// listener then answers.
function fileOf(target = "/") {
	try {
		const path = normalize(join(client, decodeURIComponent(new URL(target, "http://host").pathname)));
		return path.startsWith(client + sep) ? path : undefined;
	} catch {
		return undefined;
	}
}

createServer(async (req, res) => {
	const path = fileOf(req.url);
	const file = path === undefined ? undefined : await readFile(path).catch(() => undefined);
	if (file === undefined) return listener(req, res);
	res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
	res.end(file);
}).listen(Number(process.env.PORT ?? 3000));
```

## Routes

Routes are files under `src/routes`; the directory path is the route id, and codegen writes the id string the builder takes. A root folder `_name_` owns a document. `(group)` adds no URL segment.

| file                                    | id                       | URL                                             |
| --------------------------------------- | ------------------------ | ----------------------------------------------- |
| `_root_/root.root-layout.tsx`           | `_root_`                 | the document                                    |
| `_root_/home.page.tsx`                  | `_root_/`                | `/`                                             |
| `_root_/about/about.page.tsx`           | `_root_/about`           | `/about`                                        |
| `_root_/(blog)/blog.layout.tsx`         | `_root_/(blog)`          | none; wraps the pages below it                  |
| `_root_/users/[id]/user.page.tsx`       | `_root_/users/[id]`      | `/users/:id`, `id: string`                      |
| `_root_/files/[...path]/files.page.tsx` | `_root_/files/[...path]` | `/files/*`, `path: string[]`                    |
| `_root_/[[locale]]/opt.page.tsx`        | `_root_/[[locale]]`      | `/` and `/<tag>`, `locale: string \| undefined` |

`Link`, `navigate`, and `redirect` take the page id, never the URL. Full contract: [routes.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/routes.md).

## Route builders

Each route file exports `route`, built from one of four builders. The methods run in the order listed, and each may be called once.

| export              | from                | builds                                                    |
| ------------------- | ------------------- | --------------------------------------------------------- |
| `createPage`        | `@lovrozagar/flare` | a page: the only builder with `intercept` and `response`  |
| `createLayout`      | `@lovrozagar/flare` | a layout that wraps the pages in its child folders        |
| `createRootLayout`  | `@lovrozagar/flare` | the document for a root folder                            |
| `createPathSegment` | `@lovrozagar/flare` | a URL segment with a fixed render and an optional `cache` |

| method                                                                         | what it does                                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `intercept({ from, render })`                                                  | a client navigation from `from` opens `InterceptOutlet` over the background page          |
| `cache(config)`                                                                | the render mode and the client and CDN caches (Cache below)                               |
| `input({ params?, searchParams? })`                                            | validators (Standard Schema, `{ parse }`, or a function); a failure is 400 before auth    |
| `authenticate(...args)`, `authenticateOptional(...args)`                       | the session is required (null is 401), or may be null                                     |
| `authorize(fn)`                                                                | `false` is 403                                                                            |
| `effects({ loaderDeps?, shouldRefetch? })`                                     | when a cached match refetches                                                             |
| `preloader(fn)`                                                                | runs before `authorize`; its return is `preloaderContext`                                 |
| `loader(fn)`                                                                   | loader data, an object or nothing; loaders run in parallel                                |
| `response(fn)`                                                                 | answers with a `Response` and renders nothing                                             |
| `head(fn)`, `headers(fn)`, `security(config)`                                  | head tags, response headers, the security headers                                         |
| `render(fn)`                                                                   | the component; props are `params`, `search`, `loaderData`, `preloaderContext`, `children` |
| `errorRender`, `notFoundRender`, `unauthenticatedRender`, `unauthorizedRender` | the boundaries for a throw, 404, 401, and 403                                             |

Throw these from a loader, a preloader, `authorize`, or `.response()`:

| export            | from                | answers                                                                                                                       |
| ----------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `redirect`        | `@lovrozagar/flare` | `redirect({ to, params?, search?, hash?, href?, status?, replace? })`, typed by the target page; 303 and `replace` by default |
| `notFound`        | `@lovrozagar/flare` | 404 and the nearest `notFoundRender`                                                                                          |
| `unauthenticated` | `@lovrozagar/flare` | 401 and the nearest `unauthenticatedRender`                                                                                   |
| `unauthorized`    | `@lovrozagar/flare` | 403 and the nearest `unauthorizedRender`                                                                                      |
| `markSafeError`   | `@lovrozagar/flare` | marks an error whose message production may show                                                                              |

Full contracts: [builder.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/builder.md), [types.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/types.md).

## Router

`createRouter` is shared by the client and the server.

| option                           | default                                      | outcome                                                                             |
| -------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `layouts`, `routeTree`, `chunks` | required (codegen)                           | the matcher and the lazy route modules                                              |
| `basePath`                       | `"/"`                                        | every route is under it                                                             |
| `caseSensitive`                  | `false`                                      | `false` matches static segments ignoring case and redirects to the route's spelling |
| `trailingSlash`                  | `"preserve"`                                 | `"always"` or `"never"` redirects to that form                                      |
| `notFoundMode`                   | `"root"`                                     | `"fuzzy"` renders the deepest matching layout's not-found                           |
| `scrollRestoration`              | `true`                                       | positions kept in `sessionStorage` per history entry                                |
| `scrollRestorationBehavior`      | `"instant"`                                  | passed to `scrollTo`                                                                |
| `scrollRestorationMaxEntries`    | `50`                                         | oldest positions drop (1 to 200)                                                    |
| `getScrollRestorationKey`        | history index                                | the storage key                                                                     |
| `routeCacheMaxEntries`           | `100`                                        | the client match cache evicts the least recently used (1 to 500)                    |
| `prefetch`                       | `{ modules: "all", data: false }`            | what a link prefetches by default                                                   |
| `cache`                          | `{ client: { staleTime: 0, gcTime: "5m" } }` | the client cache for routes that set none                                           |
| `viewTransitions`                | `false`                                      | wraps navigations in a view transition                                              |
| `rewrite`                        | absent                                       | `(location) => location \| undefined`, before the client matches                    |
| `theme`, `direction`, `locale`   | absent                                       | the feature configs (Features below)                                                |

Durations take milliseconds or strings such as `"30s"`, `"5m"`, `"1m30s"`. Full contract: [router.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/router.md).

## Loaders and defer

A loader returns its data; the page reads it as `props.loaderData`, or anywhere below with `useLoaderData({ from })`. `ctx.defer(fn, { key?, prerender? })` streams a value after the shell: the component reads it with `useDeferred` inside a Solid `<Loading>`.

| option      | default                  | outcome                                                                                      |
| ----------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| `key`       | `d0`, `d1`, … per loader | the value's id on the wire                                                                   |
| `prerender` | the route's `defer`      | for a stored render: `"resolve"` stores the value, `"stream"` leaves a hole the client fills |

Full contract: [defer.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/defer.md).

## Cache

`.cache()` takes one mode, `ssr`, `isr`, or `ssg`, plus optional `cdn` and `client`. With no mode, a route renders per request and is stored nowhere.

| mode     | options                                                                                   | outcome                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ssr`    | `ttl`, `staleTime`, `tags`, `defer`                                                       | a live render stored in `createServer({ store })`; past `staleTime` a hit serves and re-renders behind it |
| `isr`    | `revalidate`, `params`, `dynamicParams`, `defer`                                          | renders on demand and revalidates; `params` lists the slugs built ahead                                   |
| `ssg`    | `params`                                                                                  | prerendered at build time into the static seeds                                                           |
| `cdn`    | `maxAge`, `swr`, `private`, `tags`, `allowCookies`                                        | `Cache-Control` with `s-maxage` and `stale-while-revalidate`, and `Cache-Tag`                             |
| `client` | `staleTime`, `gcTime`, `prefetch`, `prefetchStaleTime`, `prefetchGcTime`, `cacheDeferred` | the client match cache: a fresh match is reused without a fetch                                           |

A `Set-Cookie` downgrades a shared answer to private unless `cdn.allowCookies` is set. `revalidate({ keys?, tags? })` purges (Stores below). Full contract: [cache.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/cache.md).

## Links and navigation

`<Link to params? search? hash?>` renders an anchor with the built href and navigates on the client. `href` instead of `to` makes an external link.

| prop                                                           | default                        | outcome                                         |
| -------------------------------------------------------------- | ------------------------------ | ----------------------------------------------- |
| `prefetch`                                                     | the route's, then the router's | `"intent"`, `"viewport"`, `"render"`, or none   |
| `replace`                                                      | `false`                        | `replaceState` instead of a push                |
| `revalidate`                                                   | `false`                        | refetch the match even while it is fresh        |
| `scroll`                                                       | `true`                         | `false` keeps the scroll position               |
| `shallow`                                                      | `false`                        | change search or hash without running loaders   |
| `activeClass`, `inactiveClass`, `activeProps`, `inactiveProps` | —                              | applied by the active state                     |
| `isActive`                                                     | exact pathname and search      | replaces the active test                        |
| `disabled`, `force`                                            | `false`                        | stay an inert anchor; navigate even when active |
| `viewTransition`                                               | the router's                   | `false`, `true`, or `{ scope?, types? }`        |

`navigate({ to, params?, search?, hash?, replace?, revalidate?, scroll?, shallow?, state?, viewTransition? })` takes the same target, from anywhere on the client once `createClient` has booted.

| export                   | from                | returns                                                                  |
| ------------------------ | ------------------- | ------------------------------------------------------------------------ |
| `navigate`               | `@lovrozagar/flare` | the client navigation; rejects before boot and on the server             |
| `useNavigate`            | `@lovrozagar/flare` | the same function, from a component                                      |
| `useNavigation`          | `@lovrozagar/flare` | `{ pending }`, true from the fetch to the commit                         |
| `useNavigationProgress`  | `@lovrozagar/flare` | `{ pending, value }` for a progress bar; options `trickle`, `minDisplay` |
| `useLoaderData`          | `@lovrozagar/flare` | a route's own loader data, `{ from }` its id                             |
| `useParams`, `useSearch` | `@lovrozagar/flare` | a route's params and search, validated when the route validated them     |
| `useLocation`            | `@lovrozagar/flare` | `{ pathname, search, hash, params }`, raw                                |
| `useMatch`               | `@lovrozagar/flare` | `{ id, routeId }` of a route                                             |
| `usePreloaderContext`    | `@lovrozagar/flare` | a route's accumulated preloader context                                  |
| `useDeferred`            | `@lovrozagar/flare` | a deferred value inside `<Loading>`                                      |
| `useBlocker`             | `@lovrozagar/flare` | `fn({ current, next, trigger })`; `false` cancels the navigation         |
| `Outlet`                 | `@lovrozagar/flare` | where a layout renders its child                                         |
| `InterceptOutlet`        | `@lovrozagar/flare` | where an intercepted route renders over the page                         |
| `ViewTransitionBoundary` | `@lovrozagar/flare` | scopes a view transition to its subtree                                  |
| `ViewTransitionCSS`      | `@lovrozagar/flare` | the transition styles; `duration` defaults to `175`                      |

Full contracts: [link.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/link.md), [navigate.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/navigate.md).

## Head

`.head(fn)` returns the tags for its match; a child merges over its parents unless `{ replace: true }`.

| key                                                                                     | outcome                                                                                     |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `title`, `description`, `canonical`, `keywords`, `css`, `languages`, `jsonLd`, `images` | the matching tags                                                                           |
| `favicons`                                                                              | `ico`, `svg`, `appleTouchIcon`, `"96x96"`, `"192x192"`, `"512x512"`, one `<link>` each      |
| `robots`                                                                                | `index`, `follow`, `noarchive`, `noimageindex`, and the `max-*` previews                    |
| `openGraph`, `twitter`                                                                  | the `og:` and `twitter:` tags                                                               |
| `meta`                                                                                  | `charset`, `viewport`, `applicationName`, `author`, `manifest`, and the mobile web app tags |
| `custom`                                                                                | `links`, `meta`, `scripts`, `styles`, each script and style under the request's nonce       |

`<Stylesheet />` in the root layout's head writes the app's CSS: in production the built stylesheet, critical rules first; in dev the module styles, so the first paint is styled. Full contract: [head.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/head.md).

## Server

`createServer(options)` returns `{ fetch(request, env, ctx), bodyLimit }`, the production entry every adapter wraps.

| option                  | default      | outcome                                                                                                            |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `router`                | required     | the router                                                                                                         |
| `site`                  | —            | the https origin a shared render requests; required with an `ssg`, `isr`, or shared `ssr` route and with a sitemap |
| `authenticate`          | absent       | `(ctx) => session \| null`, run at most once per request                                                           |
| `serverContext`         | absent       | `(ctx: { request, env }) => value`, which `serverCtx()` returns                                                    |
| `locale`                | absent       | the object `i18n()` returns                                                                                        |
| `middleware`            | `[]`         | middleware, or `{ filter, handler }`, each wrapping the rest in order                                              |
| `mounts`                | `[]`         | `mount(prefix, fetch)` sub-apps; the longer prefix wins                                                            |
| `rewrite`               | absent       | `(path) => string \| undefined`: a redirect to the replacement, in one step                                        |
| `security`              | the defaults | a `SecurityConfig`, or `(ctx) => SecurityConfig`                                                                   |
| `sameSite`              | `[]`         | hosts whose `Sec-Fetch-Site: same-site` a server function accepts                                                  |
| `bodyLimit`             | 1 MiB        | the server-function body cap, 1 byte to 32 MiB: a body over it is 413 on every runtime                             |
| `store`, `static`       | absent       | the ISR and SSR store, and the read-only SSG seeds (Stores below)                                                  |
| `serverFns`             | `{}`         | the generated `src/_gen/server-fns.gen.ts`                                                                         |
| `documentResponseDefer` | `"stream"`   | `"buffer"` holds a document until every deferred value settles                                                     |

`SecurityConfig` sets `Content-Security-Policy` (a directives object with a per-request nonce by default, a string, or `false`), `Permissions-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, and `X-Powered-By`. A string sets a header and `false` removes it; a route's `.security()` merges over the server's.

| export             | from                       | what it is                                                                                                                                                                    |
| ------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createServer`     | `@lovrozagar/flare/server` | the server                                                                                                                                                                    |
| `createMiddleware` | `@lovrozagar/flare/server` | types `(ctx) => …`, which calls `ctx.next()`, `ctx.respond(response)`, or `ctx.bypass(response)`; `middleware` lists it, or `{ filter: { exact?, prefix?, kind? }, handler }` |
| `mount`            | `@lovrozagar/flare/server` | `mount(prefix, fetch)`: a sub-app under a canonical prefix                                                                                                                    |
| `proxy`            | `@lovrozagar/flare/server` | `proxy(request, upstream, { forwardCookies?, forwardAuthorization?, relaySetCookie? })` inside a mount                                                                        |
| `serverCtx`        | `@lovrozagar/flare/server` | the request's `serverContext` value                                                                                                                                           |
| `withFetchDedupe`  | `@lovrozagar/flare/server` | `withFetchDedupe(target, { maxBytes? })`: one upstream GET per request for the same URL and headers                                                                           |
| `nonce`            | `@lovrozagar/flare`        | the request's CSP nonce, for a raw `<script>` or `<style>`                                                                                                                    |

Full contract: [server.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/server.md).

## Server functions

```ts
export const save = createServerFn({ method: "post" })
	.authenticate()
	.input(schema)
	.authorize(({ auth, input }) => canEdit(auth, input))
	.handler(async ({ input, auth, env, request, serverContext, revalidate }) => store(input));
```

The export is the client function: `await save(input)` resolves to the handler's return. `.stream(async function* (ctx) {})` instead of `.handler()` returns an async iterator of the yielded values, and `ctx.signal` aborts when the client stops. The client bundle keeps none of the validator, `authorize`, or the handler. Full contract: [server-fn.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/server-fn.md).

## Environment functions

| export               | from                | what it is                                                            |
| -------------------- | ------------------- | --------------------------------------------------------------------- |
| `createServerOnlyFn` | `@lovrozagar/flare` | a function whose body the client build drops; calling it there throws |
| `createClientOnlyFn` | `@lovrozagar/flare` | the reverse: the server build drops the body                          |
| `createIsomorphicFn` | `@lovrozagar/flare` | `.server(fn).client(fn)`: each build keeps its own side               |

Full contract: [env.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/env.md).

## Client

`createClient(router)` hydrates on the next microtask. Chain `.onReady(fn)`, `.onHydrated(fn)`, `.onIdle(fn)`, and `.onInteraction(fn)` in the same turn. Full contract: [client.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/client.md).

## Types

Codegen writes `src/_gen/types.gen.d.ts`, which augments `FlareRegister`: page ids, params, search, and loader data, so `Link`, `navigate`, `redirect`, and the hooks are typed by the target route. An app adds its own fields to `FlareRegister` (`auth`, `env`, `serverContext`) by declaration merging.

| export                         | from                | what it is                                |
| ------------------------------ | ------------------- | ----------------------------------------- |
| `FlareRegister`                | `@lovrozagar/flare` | the interface codegen and the app augment |
| `Href`                         | `@lovrozagar/flare` | a typed internal href                     |
| `SearchOutput`, `ParamsOutput` | `@lovrozagar/flare` | a route's validated search and params     |
| `LocationRewrite`              | `@lovrozagar/flare` | the type of the router's `rewrite`        |

Full contract: [types.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/types.md).

## Vite plugin

`flare(options?)` from `@lovrozagar/flare/vite` is the whole plugin set, Solid's included.

| option                         | default                               | outcome                                                                                     |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `assetsBase`                   | `"/assets"`                           | the URL prefix of built files                                                               |
| `entry.client`, `entry.server` | `"src/client.tsx"`, `"src/server.ts"` | the two entries                                                                             |
| `image`                        | absent                                | `{ widths?, quality?, exclude? }` turns on image optimization with `sharp`                  |
| `prerender`                    | `false`                               | `true` or `{ concurrency?, env?, exclude?, sitemap? }`: SSG and ISR pages rendered at build |
| `css`                          | absent                                | `{ reset? }`: `true` prepends a preflight                                                   |
| `broadcast`                    | `true`                                | tells other open tabs of a theme, direction, or locale change                               |
| `fonts`                        | absent                                | `{ dir }`: the client build emits the registry fonts its chunks import                      |

The `flare` binary runs `flare codegen`, which writes `src/_gen` without starting Vite. Full contract: [plugin.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/plugin.md).

### Cloudflare Workers

Add Cloudflare's plugin beside `flare()`, targeting the `ssr` environment, and point Wrangler at Flare's worker entry. `vite dev` then renders in workerd with the app's bindings, and `vite build` writes the deploy config `wrangler deploy` reads.

```ts
// vite.config.ts
export default defineConfig({ plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), flare()] });
```

```jsonc
// wrangler.jsonc
{ "main": "@lovrozagar/flare/worker", "assets": { "directory": "./dist/client", "binding": "ASSETS" } }
```

## Adapters

| export                 | from                                 | use                                                                                                         |
| ---------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `createNodeListener`   | `@lovrozagar/flare/adapters/node`    | `createNodeListener(server, { trustProxy? })`: a `node:http` request listener                               |
| `toRequest`            | `@lovrozagar/flare/adapters/node`    | the target check and the client address the listener uses                                                   |
| `createBunFetch`       | `@lovrozagar/flare/adapters/bun`     | `Bun.serve(createBunFetch(server, { trustProxy? }))`, with Bun's 128 MiB body ceiling above any `bodyLimit` |
| `createWorkersHandler` | `@lovrozagar/flare/adapters/workers` | `createWorkersHandler(server, { assets? })` for a hand-written worker                                       |

`trustProxy` is how many proxy hops in front of the server are trusted (0 to 5, default 0): with one, `X-Forwarded-Proto: https` makes the request https. Full contract: [adapters.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/adapters.md).

## Stores and revalidate

| export                  | from                                 | what it is                                                              |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `createMemoryStore`     | `@lovrozagar/flare/server`           | an in-process `FlareStore`; build it once, outside a request            |
| `createFilesystemStore` | `@lovrozagar/flare/stores/fs`        | a `FlareStore` under `{ dir? }` on Node or Bun                          |
| `fileAssets`            | `@lovrozagar/flare/stores/fs`        | reads the client output from disk, for `createAssetsStore`              |
| `createAssetsStore`     | `@lovrozagar/flare/server`           | `createAssetsStore(read, { base? })`: the prerendered seeds as `static` |
| `createCacheApiStore`   | `@lovrozagar/flare/stores/cache-api` | a `FlareStore` over the Workers Cache API, `{ cacheName?, caches? }`    |
| `revalidate`            | `@lovrozagar/flare/server`           | `revalidate({ keys?, tags? })`: purge inside a request                  |
| `createRevalidateFn`    | `@lovrozagar/flare/server`           | `createRevalidateFn(store)`: the same purge, bound to a store           |

`store` and `static` take a store, or `(env) => store` to pick one from the request's env. Full contract: [store.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/store.md).

## SEO

| export           | from                    | what it does                                                                                               |
| ---------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `sitemap`        | `@lovrozagar/flare/seo` | builds `sitemap.xml` and `robots.txt` from the prerendered pages; also `flare({ prerender: { sitemap } })` |
| `indexNow`       | `@lovrozagar/flare/seo` | submits URLs to IndexNow: `{ host, key, urls, keyLocation? }`                                              |
| `googleIndexing` | `@lovrozagar/flare/seo` | the Google Indexing API, with service-account `credentials`                                                |
| `bingIndexing`   | `@lovrozagar/flare/seo` | Bing URL submission: `{ apiKey, siteUrl, urls }`                                                           |

Full contract: [seo.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/seo.md).

## Features

Theme and direction are router options plus components from the root entry. i18n is a server slot and a client provider. Each feature's full table is in [features.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/features.md).

| export                                                               | from                            | what it is                                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ThemeProvider`, `ThemeScript`, `useTheme`                           | `@lovrozagar/flare`             | `createRouter({ theme: { defaultTheme?, attribute?, storageKey?, themes?, disableTransitionOnChange? } })`; the script sets the theme before paint          |
| `DirectionProvider`, `DirectionScript`, `useDirection`               | `@lovrozagar/flare`             | `createRouter({ direction: { defaultDir?, attribute?, storageKey? } })`                                                                                     |
| `i18n`                                                               | `@lovrozagar/flare/i18n/server` | `createServer({ locale: i18n({ locales, defaultLocale, cookieName?, paramName?, botDetection? }) })`, from `./i18n/server`                                  |
| `LocaleProvider`, `LocaleScript`, `useLocale`                        | `@lovrozagar/flare/i18n`        | the client side, from `./i18n`: `<LocaleProvider config initial?>`                                                                                          |
| `createTranslations`, `formatMessage`, `useLoaderT`, `usePreloaderT` | `@lovrozagar/flare/i18n`        | typed messages, in components, loaders, and preloaders                                                                                                      |
| `Image`                                                              | `@lovrozagar/flare`             | `<Image src alt widths? sizes? quality? priority? placeholder? fill? fixed? />`, widths from `flare({ image })`                                             |
| `createFont`, `FontCSS`                                              | `@lovrozagar/flare`             | `createFont({ family, src, category, weights?, style?, fallbackMetrics? })` and its nonced style; registry fonts import from `@lovrozagar/flare/fonts/<id>` |
| `Stylesheet`                                                         | `@lovrozagar/flare`             | the app stylesheet (Head above)                                                                                                                             |
| `createQueryClientGetter`, `useSuspenseQuery`                        | `@lovrozagar/flare/query`       | TanStack Query, one client per request on the server, from `./query`                                                                                        |
| `serverFnQueryOptions`, `serverFnMutationOptions`                    | `@lovrozagar/flare/query`       | query and mutation options over a server function                                                                                                           |

## Testing

| export             | from                        | what it is                                                                                               |
| ------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `createTestServer` | `@lovrozagar/flare/testing` | `createTestServer(router, { serverContext? })`: a server for the app's own tests                         |
| `flarePage`        | `@lovrozagar/flare/testing` | `flarePage(page)` over a Playwright page: `load(path)` waits for hydration, `consoleErrors()`, `state()` |

Full contract: [testing.md](https://github.com/lovrozagar/flare/blob/main/blueprint/dx/testing.md).

## Package exports

Every entry and everything it exports. Types are listed with the values.

| entry                                | exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@lovrozagar/flare`                  | `createRouter`, `createPage`, `createLayout`, `createRootLayout`, `createPathSegment`, `Link`, `Outlet`, `InterceptOutlet`, `Stylesheet`, `navigate`, `redirect`, `notFound`, `unauthenticated`, `unauthorized`, `markSafeError`, `nonce`, `useNavigate`, `useNavigation`, `useNavigationProgress`, `useLoaderData`, `useParams`, `useSearch`, `useLocation`, `useMatch`, `usePreloaderContext`, `useDeferred`, `useBlocker`, `ViewTransitionBoundary`, `ViewTransitionCSS`, `ThemeProvider`, `ThemeScript`, `useTheme`, `DirectionProvider`, `DirectionScript`, `useDirection`, `Image`, `ImageBinding`, `ImageProps`, `createFont`, `Font`, `FontOptions`, `FontCSS`, `FontCSSProps`, `createServerOnlyFn`, `createClientOnlyFn`, `createIsomorphicFn`, `FlareRegister`, `QueryClientRegister`, `Href`, `LinkProps`, `LocationRewrite`, `InterceptState`, `SearchOutput`, `ParamsOutput` |
| `@lovrozagar/flare/client`           | `createClient`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@lovrozagar/flare/server`           | `createServer`, `createMiddleware`, `mount`, `proxy`, `serverCtx`, `withFetchDedupe`, `createMemoryStore`, `createAssetsStore`, `revalidate`, `createRevalidateFn`, `FlareStore`, `FlareStoreEntry`, `Middleware`, `MiddlewareEntry`, `MiddlewareFilter`, `RevalidateOptions`, `SecurityConfig`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@lovrozagar/flare/server-fn`        | `createServerFn`, `ServerFn`, `ServerFnBuilder`, `StreamFn`, `FnContext`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@lovrozagar/flare/query`            | `createQueryClientGetter`, `useSuspenseQuery`, `serverFnQueryOptions`, `serverFnMutationOptions`, `QueryOptionsInput`, `ServerFnQueryOptions`, `ServerFnMutationOptions`, `ServerFnKeyedMutationOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@lovrozagar/flare/i18n`             | `LocaleProvider`, `LocaleScript`, `useLocale`, `createTranslations`, `formatMessage`, `useLoaderT`, `usePreloaderT`, `LocaleConfigInput`, `LocaleProviderProps`, `LocaleState`, `Messages`, `RichComponent`, `RichComponents`, `Translate`, `Translations`, `Values`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@lovrozagar/flare/i18n/server`      | `i18n`, `I18n`, `I18nOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `@lovrozagar/flare/seo`              | `sitemap`, `indexNow`, `googleIndexing`, `bingIndexing`, `SitemapOptions`, `SitemapEntry`, `ChangeFreq`, `IndexNowOptions`, `GoogleIndexingOptions`, `GoogleCredentials`, `GoogleNotification`, `GoogleSitemap`, `BingIndexingOptions`, `SubmitResult`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@lovrozagar/flare/adapters/node`    | `createNodeListener`, `toRequest`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `@lovrozagar/flare/adapters/bun`     | `createBunFetch`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@lovrozagar/flare/adapters/workers` | `createWorkersHandler`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@lovrozagar/flare/worker`           | `default`, the Wrangler main entry, which runs only inside Vite with the plugin                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@lovrozagar/flare/stores/fs`        | `createFilesystemStore`, `fileAssets`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@lovrozagar/flare/stores/cache-api` | `createCacheApiStore`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@lovrozagar/flare/vite`             | `flare`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@lovrozagar/flare/generated`        | `defineLayouts`, `defineRouteTree`, which codegen's files call                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@lovrozagar/flare/testing`          | `createTestServer`, `flarePage`, `TestServer`, `FlarePage`, `FlarePageInput`, `FlareState`, `FlareStateMatch`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `@lovrozagar/flare/fonts/<id>`       | one module per registry font family, its default export a `Font`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Repository layout

```
packages/core/                   published `@lovrozagar/flare` (src, unit and integration tests)
packages/core/tests/e2e/         the Playwright grid: specs, boot.ts, and the apps it boots
packages/core/tests/e2e/apps/    `minimal`, `basepath`, and `docs`, the app every v1 feature runs in
scripts/                         check-tree, release, and browser-server (where the e2e browsers come from)
blueprint/                       the spec: decisions, bits, the dx contracts, and files.tsv, the tree check's source
_v0/                             the archived v0 tree
```

## Develop

Requires [Bun](https://bun.sh) 1.4.3 (the root `packageManager`) and Node 22.18 or later; CI runs Node 24.

```bash
bun install
bun run fmt                 # oxfmt, rewrites in place (CI runs fmt:check)
bun run lint                # oxlint
bun run typecheck           # core, src under consumer-strict flags, scripts/
bun run test                # vitest, 100% per-file coverage
bun run test:bun            # the same suite under the Bun runtime, no coverage gate
bun scripts/check-tree.ts   # the tree matches blueprint/files.tsv
bun run docs:dev            # the docs e2e app in dev, to check by eye
```

Config: `.oxlintrc.json`, `.oxfmtrc.jsonc`. Tabs, double quotes, `printWidth` 120, semicolons. Do not weaken `strict` or add `as any` to make typecheck pass.

Release: bump `packages/core/package.json`, commit, tag `vX.Y.Z` matching that version, and push the tag. `.github/workflows/release.yml` publishes `@lovrozagar/flare` to npm via GitHub Actions OIDC (no npm token) and opens the GitHub Release.

### End-to-end grid

`bun run test:e2e` runs all 18 projects, `<runtime>-<mode>-<browser>`: runtime `node`, `bun`, or `workers`; mode `dev` or `prod`; browser `chromium`, `firefox`, or `webkit`. Each boot starts its app on a free port with its own temp dirs and writes nothing into the app.

The browsers come from one pinned Playwright image, so every machine runs the same engine builds. A global setup reuses or starts its run-server in a container named `flare-browsers` (host network, host IPC) and every project connects to it. With `FLARE_BROWSER_WS` set, the projects connect there instead. Without a Docker daemon the shell can reach, they launch Playwright's installed engines (`bunx playwright install chromium firefox webkit`), as the macOS CI job does.

Docker needs no root for this once your user is in the `docker` group, a one-time setup:

```bash
sudo usermod -aG docker "$USER"   # then log in again, so new shells carry the group
```

One project, or a few:

```bash
bun run test:e2e -- --project node-dev-chromium
bun run test:e2e -- --project bun-prod-webkit --project workers-dev-firefox
bun run test:e2e -- --project node-prod-firefox -g "isr stored"
```

A run that names its projects runs the deep specs on every named project; an unnamed run runs them on the deep set only. `retries` is 0: a flaky case is a bug. CI runs the grid inside the same image on Linux in 3 shards, and the 6 webkit projects on macOS.

## License

MIT. Copyright (c) 2026 Lovro Žagar.
