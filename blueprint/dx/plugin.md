# flare()

```ts
import { flare } from "@lovrozagar/flare/vite";

export default defineConfig({
  plugins: [flare({ assetsBase?, entry?, image?, prerender?, css?, broadcast? })],
});
```

`flare()` returns the Vite plugins Flare owns, including `@solidjs/vite-plugin`. The repo tests `3.0.0-next.47`. The peer range is `>=` that version (B79). The app does not add that plugin itself. Tailwind is the app's `@tailwindcss/vite`. Flare does not wrap it (B14).

Codegen is always on. It writes `src/_gen/routes.gen.ts` and `src/_gen/types.gen.d.ts`. Those paths are not options.

The plugin parses each route file once with `oxc-parser` and walks that tree (B75). A method counts only as a call node. A comment, a string, and a regex literal do not. The route id is a string literal or a template with no substitutions, and the scan returns its span so a later rewrite does not search the file text. `from` and `render` on `.intercept()` must be literals. An identifier there fails the build and names the file and the method. A parse error fails the build and names the file. Babel is not a dependency. `typeof import` of the route module still supplies the route types (`dx/types.md`). The cases are `vite/codegen/scan.test.ts`.

## Development errors

A compile, codegen, or transform failure fails the build. Vite shows its overlay and the terminal names the file. Flare adds no panel.

A runtime bug in `vite dev` sends Vite's HMR payload `{ type: "error", err: { message, stack } }`. The dev server sends it on the server socket. A client navigation that applies an `e` frame sends the same payload on the client hot channel. Vite opens its overlay. Flare renders no overlay and no dashboard (B4, B76). The document body contains the message and the stack when the shell is not yet committed, including when `errorRender` does not print them. Flushed bytes are not rewritten. The server logs the message and the stack through `logger.ts`.

`notFound()`, `unauthenticated()`, `unauthorized()`, `redirect()`, and an input failure do not send a payload and do not carry a stack.

Production sends nothing. A written error document contains a generic message and a digest, not the thrown message and not a stack frame. `markSafeError` keeps the message and still omits the stack. `error.stack` is `""`. The server log contains the digest and not the stack. A throw before the shell is an empty 500 in production, and in dev that body contains the message and the stack.

The payload builder is `shared/errors/dev-report.ts`. It does not import Vite. Cases: `dev-report.test.ts` `payload`, `string`, `sends`, `no send`.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `assetsBase` | no | `"/assets"` | a path that starts with `/` and does not end with `/`, except `"/"` | the URL prefix of built files | a query, a hash, or a trailing slash throws when the plugin is created | `vite/plugin/options.test.ts` `assets base` |
| `entry.client` | no | `"src/client.tsx"` | a path inside the project that exists | the client entry | an absolute path throws. A missing file throws | `vite/plugin/flare.test.ts` `entry` |
| `entry.server` | no | `"src/server.ts"` | the same | the server entry | the same | same |
| `image` | no | absent | `{ widths?, quality?, exclude? }` | absent: no image plugin and `sharp` is not loaded. `{}` turns optimization on with the defaults | `{}` is not "leave it off" | `vite/plugin/options.test.ts` `image empty` |
| `prerender` | no | `false` | `true` or the object below | `true` prerenders every SSG route and every ISR route whose `params` exist | `isr: true` and `isr: {}` are not rendered at build (`cache.md`). An omitted `revalidate` does not by itself render a route. Omitted or `false` fails the build when any built route exists, and the error names the route. An app with none of them still builds | `vite/prerender/run.test.ts` `200`, `prerender off`, `isr true`, `isr empty` |
| `css` | no | absent | `{ reset? }` | see below. Omission adds no preflight | a key other than `reset` throws when the options are parsed | `vite/plugin/options.test.ts` `css key` |
| `broadcast` | no | `true` | `boolean` | `true` leaves `client/sync/enabled.ts` as `broadcastEnabled = true`. `false` replaces that module in the client environment, in dev and in the client build, with `export const broadcastEnabled = false`. Post and subscribe then do nothing. This tab still writes theme and direction to `localStorage`, and `setLocale` still navigates. The server module stays `true` and still does not post, because `BroadcastChannel` is absent there | a non-boolean throws when the plugin is created. Omitted and `true` are the same. This switch is the only one, and it covers theme, direction, and locale | `vite/plugin/options.test.ts` `broadcast on`, `broadcast off`; `client/sync/enabled.test.ts` `on`; `client/sync/channel.test.ts` `off`, `missing` |

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

## prerender

Prerender reads `site` from the built server module's `createServer({ site })`. A failed route prints the route id on stderr and the process exits non-zero.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `concurrency` | no | `1` | integer `≥ 1` | how many routes render at once | the default is one so a shared store is not written by two renders of the same key | `vite/prerender/run.test.ts` `concurrency` |
| `env` | no | `{}` | a record, or `() => record \| Promise<record>` | passed as `env` on each prerender `fetch` | the function is called when prerender starts, not when the config file is evaluated | `run.test.ts` `env` |
| `exclude` | no | `[]` | route ids | those routes are not rendered | an excluded SSG route then renders per request and warns once when `static` is absent | `run.test.ts` `exclude` |
| `sitemap` | no | absent | `seo.md` | writes `sitemap.xml` at the root of the client static output, served at `/sitemap.xml` | there is no `origin` on this object. The origin is `site`. The public URL is `site` + `/sitemap.xml` | `features/seo/server/sitemap.test.ts` `site`, `file` |

## Vite config the plugin rejects

`server.host` of `true`, `"0.0.0.0"`, or `"::"` throws when the config is resolved. Omitted, `"localhost"`, `"127.0.0.1"`, and `"::1"` are allowed. The dev server is not a public listener. The test is `vite/plugin/flare.test.ts` `host`.

## Does not exist

These v0 `flare()` fields do not type-check, and a cast throws when the options are parsed (`options.test.ts` `unknown`):

`alias`, `codegen`, `dev`, `ignorePrefix`, `logLevel`, `port`, `purge`, `retainPreviousAssets`, `serviceWorker`, `site`, `solid`, `sx`.

`configureImage` does not exist. An image `loader` option does not exist. Widths, quality, and exclude are `flare({ image })`.

`<ResetCSS />` does not exist (B14). A top-level `reset` does not type-check. The preflight is `css: { reset: true }`.

`solid` does not type-check on `flare()`. The plugin calls `solid({ ssr: true, extensions: [".tsx", ".jsx"] })` and does not pass `start`. `ssr: true` is required. External host means Flare owns the entries, the dev server, and server functions (B89). `solid.start` does not turn Flare into Solid Start. The app's production listener is the adapter (`adapters.md`), not `vite preview` (`vite/plugin/flare.test.ts` `solid options`).

Dev build id is `dev`. Production is the first 12 hex digits of sha256 over the sorted, deduped, root-relative JS and CSS URLs in the client manifest (`entry.file` and `entry.css` only). `vite/plugin/build-id.ts` reads `dist/client/.vite/manifest.json`. It does not read `.output/public`. A production build with no manifest fails and names the path (`build-id.test.ts` `dev`, `hash`, `missing`).

On Node and Bun, `vite dev` is handled by `vite/dev/handler.ts` unless `middlewareMode` is set. The handler loads `entry.server` through the SSR runner and calls `fetch`. HTML is buffered. An inline script or style without `src` is peeled, `transformIndexHtml` runs, and the tags are restored. A path whose last segment contains a dot is transformed as `/`. `Set-Cookie` stays separate headers. Other bodies stream. A client disconnect cancels the response. If headers were already sent, the socket is destroyed. `appType` is `custom`. Workers dev stays unsupported (`handler.test.ts` `peel`, `dot path`, `stream`, `middleware mode`).

Client output defaults to `dist/client` with the manifest on. The entry file is `assets/client-[hash].js` and chunks are `assets/[hash].js`. SSR output defaults to `dist/server/server.js`, minified, with sourcemaps. A caller `outDir` wins. `cssCodeSplit` is false. `resolve.dedupe` lists `solid-js` and `@solidjs/web`. `ssr.noExternal` lists those two, `@lovrozagar/flare`, and `@tanstack/solid-query`. `optimizeDeps.exclude` lists `@lovrozagar/flare`. Vite `base` is not set. A `build.assetsDir` that disagrees with the directory derived from `assetsBase` throws. `assetsBase` of `/` is a URL prefix of `/` and the on-disk directory is still `assets` (`environments.test.ts` `defaults`, `assets dir`).

The document emits `<script type="module" async>import("<url>")</script>` beside the state script. The dev URL is `/` plus the project-relative client entry. The production URL is that entry's hashed file in the client manifest. A missing production entry fails the build (`server/render/document.test.ts` `client import`).

The generated route record carries literal `cache.client` fields and `intercept.from` and `intercept.render`. A non-literal is omitted and is not a build error. `Link` and navigation read those fields. Auth and `ssr`, `ssg`, and `isr` are not copied onto the record (`vite/codegen/routes.test.ts` `client literals`, `no auth copy`).

`vite dev` rewrites both generated files after a short debounce when a route file under `src/routes` changes. Unchanged output is not written. A startup failure fails the build. A watch failure is reported and does not exit the process. Files are sorted by UTF-16 code unit. An empty route set removes both generated files (`routes.test.ts` `watch`, `unchanged`, `empty`). The `flare codegen` bin does not watch.
