# Bit 16 — The 18-project grid and Workers dev

Creates every `P16` row. The e2e grid is `{node,bun,workers}-{dev,prod}-{chromium,firefox,webkit}` (B70): Bun dev runs `vite dev` under the Bun runtime, Workers dev runs it in workerd through `@cloudflare/vite-plugin` (B95), and every engine comes from the pinned Playwright image locally (B97). Every dev runtime renders the dev document itself (B95 (b)), so the Node and Bun dev handler no longer buffers HTML.

## `vite/plugin/workers-dev.test.ts`

| test | case | result |
| --- | --- | --- |
| `cloudflare options` | the options `workersDev: true` composes the Cloudflare plugin with | `viteEnvironment: { name: "worker" }` and `config: { main: "virtual:flare/worker" }`, so the app's `wrangler.jsonc` needs no `main` and flare's build-info module serves the worker environment (B95 (a)) |
| `peer missing` | the peer cannot be resolved | the error names `@cloudflare/vite-plugin` and the install command |
| `hooks missing` | the peer resolves, and the runtime's `node:module` has no `registerHooks` (injected) | throws when the plugin is created: `flare({ workersDev: true }) runs Vite on Node 22.15 or later`, with the runtime's name and version; the peer is not loaded (B95, CI run 38493113436 on Bun 1.4.3) |

`vite/plugin/flare.test.ts` `workers dev` (the Cloudflare plugins come before flare's own, and `workersDev: false` or absent composes none) and `workers dev missing peer` (`flare({ workersDev: true })` throws when the plugin is created) are the `workersDev` rows of `dx/plugin.md`. On a runtime without `registerHooks` (the Bun run), `workers dev` asserts the `hooks missing` error instead of the composition.

## `vite/dev/dev-head.test.ts`

| test | case | result |
| --- | --- | --- |
| `empty document` | a dev server with a plugin whose `transformIndexHtml` adds a tag | `devHead` is exactly what `transformIndexHtml` adds to an empty document: Vite's client and that tag, in Vite's order |
| `no app scripts` | the app's inline scripts | never pass through `transformIndexHtml`, so none is rewritten into an `html-proxy` module and none needs peeling |
| `restart recomputes` | a second dev server after a config change adds a plugin | its `devHead` holds the new tag. A URL-dependent `transformIndexHtml` is not supported, and `dx/plugin.md` says so (B95 (b)) |

## `server/render/dev-document.test.ts`

| test | case | result |
| --- | --- | --- |
| `dev tags` | a dev document with a nonce policy and a request without a tab token | `devHead` is the last thing in `<head>`, then the `csp-nonce` meta carrying the request's own nonce, then the `flare-dev-tab` meta with a minted token |
| `chunks` | `</head>` split across chunks, and a multibyte character split across the chunk that holds it | the tags go in before `</head>` and the character arrives whole: every chunk goes through one decoder (BUGS.md B8) |
| `request token` | a dev request that names a tab token | the meta carries that token, so the tab keeps its routing (B42) |
| `no nonce` | a dev document with no nonce policy | no `csp-nonce` meta |
| `production` | a production render | none of the three is written |
| `dev styles` | a dev document for a route whose chain imports `app.css` (root) and a CSS module (page), with nonce `n` | `head` holds one `<style data-vite-dev-id>` per module, root first, each with the module's served CSS and nonce `n`, in `<Stylesheet />`'s place. A route that imports no CSS module gets only the root's. On a browser load the first paint is styled, and after the client runs there is still one style per module id (B104, BUGS.md B59) |

## `vite/dev/dev-styles.test.ts` (B104)

| test | case | result |
| --- | --- | --- |
| `chain styles` | a `flare:styles` request for the docs chain over a fake module graph, then the worker environment's for an unknown route | the client entry's own CSS imports first (flare's reset), then the chain's CSS modules in import order, root first and once each, each read with `?direct` (`&direct` after a query); the entry's other imports are not walked |
| `cache` | the same chain twice, then a watched file change, then again | one walk and one read per module until the change; then they run again |
| `bad request` | a malformed request, then a read that rejects, then one that answers nothing | no answer; no styles and no cache entry; empty CSS |

## `server/render/dev-styles.test.ts` (B104)

| test | case | result |
| --- | --- | --- |
| `round trip` | two requests, then replies out of order, a reply for no request, and a non-reply | each request gets its own reply's styles, numbered from 0; a malformed style is dropped |
| `bounded wait` | no reply within 2 s | the document gets no styles and the dev server logs one warning; a late reply changes nothing |

## `shared/protocol/dev-styles.test.ts`

| test | case | result |
| --- | --- | --- |
| `shapes` | well-formed and malformed requests and replies | only the well-formed parts are read |

## `shared/protocol/dev-tab.test.ts`

| test | case | result |
| --- | --- | --- |
| `token` | a minted token, a token-shaped header, a header with markup | a fresh UUID each time; a header outside the token shape is not a token and is never written into a page; the meta is `<meta name="flare-dev-tab" content>` (B42) |

## `vite/dev/handler.test.ts` (B95 (b), (c))

| test | case | result |
| --- | --- | --- |
| `document passes through` | an HTML response from the app, streamed in chunks | the client gets the app's bytes unchanged: no buffering through `</head>`, no `transformIndexHtml` call, no peeled scripts |
| `worker errors` | a `flare:error` the worker environment sends with a tab token | reaches that tab's overlay through the tab hub, as the ssr environment's does |

The dev error page for a server module that failed to load and the tab hub keep their rows in `bits/12-vite.md`.

## `tests/e2e/boot.test.ts`

| test | case | result |
| --- | --- | --- |
| `bun dev` | `minimal` booted as `vite dev` under the Bun runtime | GET `/` answers 200 and the document's `flare-build` is `dev` |
| `workers dev` | `minimal` booted with `workersDev: true` | GET `/` answers 200 from workerd. It runs where the test runtime has `registerHooks`; under the Bun run (`test:bun`) the child Vite is Bun too, so the case is skipped there by that feature check, and the skip names B95 |

## `scripts/browser-server.test.ts` (B97)

| test | case | result |
| --- | --- | --- |
| `endpoint env` | `FLARE_BROWSER_WS` set | that endpoint, and no container is started |
| `container` | Docker present and no endpoint | the pinned image's run-server on `127.0.0.1:3333`, started or reused |
| `local engines` | no Docker, every engine installed | Playwright's local engines |
| `none` | no endpoint, no Docker, an engine missing | one error that names all three options |

The hydrate harness (`bits/15-docs.md`) and the e2e global setup both take their browsers from this script.

## `tests/structure/grid.test.ts`

| test | case | result |
| --- | --- | --- |
| `grid projects` | `playwright.config.ts` with no `--project` | all 18 projects on any machine, Linux or macOS (B70: the browsers come from the pinned image, so the OS does not choose them). CI's `e2e-mac` job names the 6 webkit projects with `--project`, as the Safari-engine check |
| `crash fails` | the docs fixture | a page `crash` event fails the test that owned the page (plan 14 leaf 4.6) |
