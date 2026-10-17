# flare()

```ts
import { flare } from "@lovrozagar/flare/vite";

export default defineConfig({
  plugins: [flare({ assetsBase?, entry?, image?, prerender?, css?, broadcast?, fonts? })],
});
```

`flare()` returns the Vite plugins Flare owns, including `@solidjs/vite-plugin`. The repo tests `3.0.0-next.50` (B90). The peer range is `>=` that version (B79). The app does not add that plugin itself. Tailwind is the app's `@tailwindcss/vite`. Flare does not wrap it (B14).

Codegen is always on. It writes `src/_gen/routes.gen.ts`, `src/_gen/server-fns.gen.ts`, and `src/_gen/types.gen.d.ts`. What a route file is, a `.response()` page, gated by `.authenticate()`, its `.cache({ client })` and `.input()` sides, comes from the exported `route`'s own builder chain alone, through any module-level const it starts from; the same method on anything else in the file, a helper's `res.response()` or another builder, says nothing (`codegen/scan.test.ts` `route chain only`, BUGS.md 205). `server-fns.gen.ts` lists every exported `createServerFn` under `src`, found by the same oxc walk, as a lazy import keyed by its B41 id; the app passes it to `createServer({ serverFns })`. Those paths are not options. A server function in a module outside `src`, under the root or outside it, would never be registered, so every call would be a 404: dev and the build fail, naming the file and the function (`... is a server function outside src/. Codegen registers only src/, so every call would be a 404. Move it under src/`). A dependency under `node_modules` and a test run (Vite mode `test`) are not checked (`plugin/flare.test.ts` `server function home`, BUGS.md 201).

The plugin parses each route file once with `oxc-parser` and walks that tree (B75). A method counts only as a call node. A comment, a string, and a regex literal do not. The route id is a string literal or a template with no substitutions, and the scan returns its span so a later rewrite does not search the file text. `from` and `render` on `.intercept()` must be literals. An identifier there fails the build and names the file and the method. A parse error fails the build and names the file. Babel is not a dependency. `typeof import` of the route module still supplies the route types (`dx/types.md`). The cases are `vite/codegen/scan.test.ts`.

## Development errors

A compile, codegen, or transform failure fails the build. Vite shows its overlay and the terminal names the file. Flare adds no panel.

A runtime bug in `vite dev` sends Vite's HMR payload `{ type: "error", err: { message, stack } }`. The dev server sends it on the server socket. A client navigation that applies an `e` frame sends the same payload on the client hot channel. Vite opens its overlay. Flare renders no overlay and no dashboard (B4, B76). The document body contains the message and the stack when the shell is not yet committed, including when `errorRender` does not print them. Flushed bytes are not rewritten. The server logs the message and the stack through `logger.ts`. The overlay opens only in the tab whose request or render caused the bug (BUGS.md B38, B42). In dev, the server gives a document request without a `flare-dev-tab` header a fresh tab token, which its error sink uses, and writes `<meta name="flare-dev-tab">` into the HTML it returns at the response boundary, after the app and any store answered, so no stored body ever holds a token (B95 (b)). The client reads the meta, announces it on the hot channel as `flare:tab`, and sends it as the `flare-dev-tab` header on its data, fill, prefetch, and server-function requests. The server reads the token only from that header. A server payload carries the token of the request that produced it and is sent to that tab only. A payload for a token not yet announced (a document-load bug before the tab connects) is held for at most 30 seconds and 20 payloads, then sent on the announce or dropped. A payload with no token opens no overlay; the terminal still logs it. A client `flare:error` is answered to the client that sent it. A deferred value's rejection sends nothing from the server, because only the client knows whether an `<Errored>` caught it: an uncaught one reaches the B77 walk on the client, which sends it from that tab (BUGS.md B6). The tab token is also the dev log bridge's target (`observability.md`). A production bundle has none of this.

`notFound()`, `unauthenticated()`, `unauthorized()`, `redirect()`, and an input failure do not send a payload and do not carry a stack.

Production sends nothing. A written error document contains a generic message and a digest, not the thrown message and not a stack frame. `markSafeError` keeps the message and still omits the stack. `error.stack` is `""`. The server log contains the digest with the error's name, message, and stack, so an operator ties a 500 to its cause; the client sees only the digest (B76, `tests/integration/builder.test.ts` `production error log`, BUGS.md 158). Solid's production server build sanitizes a render-phase throw; Flare tells it what to use instead, so a named status thrown in render keeps its status and a bug's log line carries the thrown message and stack, while the client sees only the generic message (`stream-options.test.ts` `in place`, `tests/integration/render-errors.test.ts`, BUGS.md 217). A throw before the shell is a 500 with the built-in error page in production, the generic message and the digest, and in dev that page also contains the message and the stack (`error-page.test.ts`, `tests/integration/fetch-boundary.test.ts` `render before the shell`, BUGS.md 215).

The payload builder is `shared/errors/dev-report.ts`. It does not import Vite. Cases: `dev-report.test.ts` `payload`, `string`, `sends`, `no send`.

## Options

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `assetsBase` | no | `"/assets"` | a path that starts with `/` and does not end with `/`, except `"/"` | the URL prefix of built files | a query, a hash, or a trailing slash throws when the plugin is created | `vite/plugin/options.test.ts` `assets base` |
| `entry.client` | no | `"src/client.tsx"` | a path inside the project that exists | the client entry | an absolute path throws. A missing file throws | `vite/plugin/flare.test.ts` `entry` |
| `entry.server` | no | `"src/server.ts"` | the same | the server entry | the same | same |
| `image` | no | absent | `{ widths?, quality?, exclude? }` | absent: no image plugin and `sharp` is not loaded. `{}` turns optimization on with the defaults | `{}` is not "leave it off" | `vite/plugin/options.test.ts` `image empty` |
| `prerender` | no | `false` | `true` or the object below | `true` prerenders every SSG route and every ISR route whose `params` exist | `isr: true` and `isr: {}` are not rendered at build (`cache.md`). An omitted `revalidate` does not by itself render a route. Omitted or `false` fails the build when any built route exists, and the error names the route. An app with none of them still builds | `vite/prerender/run.test.ts` `200`, `prerender off`, `isr true`, `isr empty` |
| `css` | no | absent | `{ reset? }` | see below. Omission adds no preflight | a key other than `reset` throws when the options are parsed | `vite/plugin/options.test.ts` `css key` |
| `broadcast` | no | `true` | `boolean` | `true` leaves `client/sync/enabled.ts` as `broadcastEnabled = true`. `false` replaces that module in the client environment, in dev and in the client build, with `export const broadcastEnabled = false`. Post and subscribe then do nothing. This tab still writes theme and direction to `localStorage`, and `setLocale` still navigates. The server module stays `true` and still does not post, because `BroadcastChannel` is absent there | a non-boolean throws when the plugin is created. Omitted and `true` are the same. This switch is the only one, and it covers theme, direction, and locale | `vite/plugin/options.test.ts` `broadcast on`, `broadcast off`; `client/sync/enabled.test.ts` `on`; `client/sync/channel.test.ts` `off`, `missing` |
| `fonts` | no | absent | `{ dir }`, a non-empty path relative to the root | the client build emits the woff2 files of the registry families its chunks import (`@lovrozagar/flare/fonts/<id>`), read from `dir/<family>/<file>.woff2` and written at their registry url. Absent, no font file is emitted and the app serves `/fonts/...` itself, `public/fonts` included | a file a used family lists but `dir` lacks fails the build and names it. Another key, an empty `dir`, or a non-object throws when the options are parsed. In `vite dev` the same registry urls are served from `dir` (`font/woff2`, `no-cache`), for any registry family; a url that is not a registry file, a file `dir` lacks, or a `..` segment falls through to the app (BUGS.md B7) | `vite/plugin/fonts.test.ts` `fonts emit`, `dev serve`, `dev fallthrough`, `fonts absent`, `fonts dir missing file`; `options.test.ts` `fonts` |

### Planned (plan 15)

Not in v1. Plan 15 adds it, and `FlareOptions` has no such key until then (BUGS.md 113).

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `devLogs` | no | `{ server: true, browser: "warn" }` | `{ server?: boolean, browser?: false \| "error" \| "warn" \| "all" }` | the dev log bridge both ways (`observability.md`, B100) | a production bundle contains no bridge code. Another key throws when the options are parsed | `vite/dev/log-bridge.test.ts`; `options.test.ts` `dev logs` |

## image

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `widths` | no | `[640, 750, 828, 1080, 1200, 1920]` | unique integers, `1`–`4096` | the only widths the build and the dev endpoint accept | `2048` and `3840` were in the v0 default and are not in this one. A width above `4096` throws at plugin creation | `features/image/vite/optimize.test.ts` `other width` |
| `quality` | no | `75` | integer `1`–`100` | webp quality | `75.5` throws | `optimize.test.ts` `quality` |
| `exclude` | no | absent | `RegExp` tested against the project-relative path | a match is copied unchanged | a pattern that matches every path disables optimization without an error | `optimize.test.ts` `exclude` |

The component props are in `features.md`.

## css

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `reset` | no | `false` | `boolean` | `true` prepends the fixed preflight to the one cached stylesheet, and an HTML document's critical block includes the preflight rules that match the shell. `false` adds nothing | a top-level `reset` does not type-check. `<ResetCSS />` does not exist. There is no second reset file. A second preflight in the app's Tailwind file is the app's to remove | `vite/css/inject.test.ts` `reset on`, `reset off`; `shared/css/critical.test.ts` `reset inlined`; `options.test.ts` `reset off` |

In `vite dev`, an edit to a plain stylesheet (CSS or a preprocessor file, not a CSS module, imported with no query) reaches the page through the client's CSS update and the dev styles. The server's modules stay in place: Flare takes the update as handled in every server environment, ahead of every other plugin, so neither Vite nor Solid's plugin sends the server a full reload, and only the stylesheet's own importers evaluate again on their next import. A CSS module, a `?inline` or `?url` import, and any code edit keep Vite's own update (`vite/dev/css-update.test.ts`, BUGS.md 99).

## prerender

Prerender reads `site` from the built server module's `createServer({ site })`. A failed route prints the route id on stderr and the process exits non-zero.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `concurrency` | no | `1` | integer `≥ 1` | how many routes render at once | the default is one so a shared store is not written by two renders of the same key | `vite/prerender/run.test.ts` `concurrency` |
| `env` | no | `{}` | a record, or `() => record \| Promise<record>` | passed as `env` on each prerender `fetch` | the function is called when prerender starts, not when the config file is evaluated | `run.test.ts` `env` |
| `exclude` | no | `[]` | route ids | those routes are not rendered | an excluded SSG route then renders per request and warns once when `static` is absent | `run.test.ts` `exclude` |
| `sitemap` | no | absent | `seo.md` | writes `sitemap.xml` at the root of the client static output, served at `/sitemap.xml`, after every page rendered | there is no `origin` on this object. The origin is `site`. The public URL is `site` + `/sitemap.xml`. A server without `site` fails the build with `prerender.sitemap reads createServer({ site })`, and nothing is written | `features/seo/vite/sitemap.test.ts` `site`, `file` |

## Vite config the plugin rejects

`server.host` of `true`, `"0.0.0.0"`, or `"::"` throws when the config is resolved. Omitted, `"localhost"`, `"127.0.0.1"`, and `"::1"` are allowed. The dev server is not a public listener. The test is `vite/plugin/flare.test.ts` `host`.

## Does not exist

These v0 `flare()` fields do not type-check, and a cast throws when the options are parsed (`options.test.ts` `unknown`):

`alias`, `codegen`, `dev`, `ignorePrefix`, `logLevel`, `port`, `purge`, `retainPreviousAssets`, `serviceWorker`, `site`, `solid`, `sx`.

Every variant, and the intrinsic size the binding carries, is upright: the image's EXIF orientation is applied, as a browser shows the original, and the variant carries no orientation for a viewer to apply twice; the dev endpoint does the same (`features/image/vite/optimize.test.ts` `exif orientation`, BUGS.md 191). `configureImage` does not exist. An image `loader` option does not exist. Widths, quality, and exclude are `flare({ image })`.

`<ResetCSS />` does not exist (B14). A top-level `reset` does not type-check. The preflight is `css: { reset: true }`.

`solid` does not type-check on `flare()`. The plugin calls `solid({ ssr: true, extensions: [".tsx", ".jsx"] })` and does not pass `start`. `ssr: true` is required. External host means Flare owns the entries, the dev server, and server functions (B89). `solid.start` does not turn Flare into Solid Start. The app's production listener is the adapter (`adapters.md`), not `vite preview` (`vite/plugin/flare.test.ts` `solid options`).

Dev build id is `dev`. Production is the first 12 hex digits of sha256 over the sorted, deduped, root-relative JS and CSS URLs in the client manifest (`entry.file` and `entry.css` only), then each server JS chunk's file name and final code in file-name order; a sourcemap is never read. Both server builds write the placeholder `__FLARE_ID__`, the same length as the id, so no sourcemap position moves; the ssr build hashes its final chunks and writes the id over it, and the prerender build after it writes the same id. The same app built in two directories has one id, and a change to server code alone gives a new one (B84, BUGS.md 176). `vite/plugin/build-id.ts` reads `dist/client/.vite/manifest.json`. It does not read `.output/public`. A production build with no manifest fails and names the path (`build-id.test.ts` `dev`, `hash`, `stamp`, `missing`, `server output`).

On Node and Bun, `vite dev` is handled by `vite/dev/handler.ts` unless `middlewareMode` is set. The handler loads `entry.server` through the SSR runner and calls `fetch`. Every dev runtime renders the dev document itself (B95 (b)): when the dev server starts, flare computes `devHead`, the tags `transformIndexHtml` adds to an empty document, and passes it through the server's info module; the server writes `devHead` last in `<head>`, then a `csp-nonce` meta with the response's own nonce (Vite's client reads it for the styles it injects and its overlay), then the tab meta, before the first `</head>`, across chunks, so a deferred value streams in dev as in production. No app HTML goes through Vite, so no inline script is rewritten. A config change restarts the dev server, which computes `devHead` again. A plugin whose `transformIndexHtml` output depends on the request URL is not supported in dev: it sees `/`. The handler passes the app's answer through as it is: `Set-Cookie` stays separate headers, bodies stream, a client disconnect cancels the response, and if headers were already sent the socket is destroyed. A module that failed to load answers the dev error page in the request's tab. `appType` is `custom` (`dev-head.test.ts`; `dev-document.test.ts` `dev tags`, `chunks`; `handler.test.ts` `document passes through`, `stream`, `middleware mode`).

Client output defaults to `dist/client` with the manifest on. The entry file is `assets/client-[hash].js` and chunks are `assets/[hash].js`. A lazy import's modulepreload list leaves out the chunks the client entry imports statically, which are always loaded before it runs (`preload.test.ts` `entry closure not preloaded`, BUGS.md 79). SSR output defaults to `dist/server/server.js`, minified, with sourcemaps. A caller `outDir` wins. `cssCodeSplit` is false. `resolve.dedupe` lists `solid-js` and `@solidjs/web`. `ssr.noExternal` lists those two, `@lovrozagar/flare`, and `@tanstack/solid-query`. `optimizeDeps.exclude` lists `@lovrozagar/flare`. Vite `base` is not set. A `build.assetsDir` that disagrees with the directory derived from `assetsBase` throws. `assetsBase` of `/` is a URL prefix of `/` and the on-disk directory is still `assets` (`environments.test.ts` `defaults`, `assets dir`).

The document emits `<script type="module" async>import("<url>")</script>` beside the state script. The dev URL is `/` plus the project-relative client entry. The production URL is that entry's hashed file in the client manifest. A missing production entry fails the build (`server/render/document.test.ts` `client import`; `vite/plugin/environments.test.ts` `client url`). The server reads that URL, and the build id, from `server/lifecycle/build-info.ts`. `flare()` replaces that module in the `ssr` and `worker` environments with its load hook, the same mechanism as the stylesheet's `builtSheet`. A define cannot carry them: a Vite builder resolves every environment's `define` before the client builds. In dev the module holds the dev URL and the id `dev`. In a build, the client environment builds first, and the module holds the manifest's hashed entry through `assetUrl` and the manifest's build id. `@lovrozagar/flare` is in `ssr.noExternal`, so a production bundle holds literals. `createServer` passes the URL to the document's client script. Without the plugin the source module has no URL, so no client script is emitted, and the id `dev`. There is no public option for either (`vite/plugin/flare.test.ts` `client entry define`; `server/lifecycle/create.test.ts` `client script`; `server/lifecycle/build-info.test.ts` `source`).

The generated route record carries literal `cache.client` fields and `intercept.from` and `intercept.render`. A non-literal is omitted and is not a build error. `Link` and navigation read those fields. Auth and `ssr`, `ssg`, and `isr` are not copied onto the record (`vite/codegen/routes.test.ts` `client literals`, `no auth copy`).

`vite dev` rewrites both generated files after a short debounce when a route file under `src/routes` changes. Unchanged output is not written. A startup failure fails the build. A watch failure is reported and does not exit the process. Files are sorted by UTF-16 code unit. An empty route set removes both generated files (`routes.test.ts` `watch`, `unchanged`, `empty`). The `flare codegen` bin does not watch.

## Cloudflare Workers

Workers is the app's own plugin, as in TanStack Start (B109). Add Cloudflare's plugin beside `flare()` and point the Wrangler config at Flare's worker entry:

```ts
// vite.config.ts
import { cloudflare } from "@cloudflare/vite-plugin";
import { flare } from "@lovrozagar/flare/vite";

export default defineConfig({ plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), flare()] });
```

```jsonc
// wrangler.jsonc
{ "main": "@lovrozagar/flare/worker", "assets": { "directory": "./dist/client", "binding": "ASSETS" } }
```

`vite dev` then renders in workerd with the app's bindings, and `vite build` builds the worker and writes its deploy config. Flare checks the composition when the config resolves: the plugin must target `ssr` and `main` must be `@lovrozagar/flare/worker`, or dev and build throw with the fix. Every Cloudflare option is the plugin's own: `inspectorPort: 0` and `persistState: false` let two dev servers of one app run side by side (each binds its own inspector port and keeps state in memory). Without the plugin, dev and builds run on Node or Bun as before. The plugin needs Node 22.15 or later. `@lovrozagar/flare/worker` is only for that `main`: Vite resolves it through `flare()`, and a plain Node import of it throws.

Prerender runs the app's server on Node at build time, from a Node build of it that is deleted once the seeds are written, so a page whose loader needs a Workers binding (KV, D1, R2, `caches`) cannot be prerendered: mark it `ssr` or `isr`. A prerender failure in a Workers app says so and names the route (`vite/prerender/run.test.ts` `500`).

The plugin writes the deploy config to `<outDir>/server/wrangler.json`, with the Workers bundle beside it, and a pointer to it at `.wrangler/deploy/config.json` in the Vite root, which `wrangler deploy` reads; `.wrangler/` belongs in the app's `.gitignore`. In Workers dev, workerd's console reaches the terminal through Miniflare after the response, so a render error's `[flare:render]` line can arrive after the request has answered (BUGS.md 93).

