# Changelog

## 0.9.13

- Layouts stay mounted when navigation changes only params their own path does not declare (/blog/a → /blog/b keeps the (blog) layout); a [locale] layout still remounts on a locale switch, and pages still remount on any param change.
- `Form` runs a consumer `onSubmit` before the server call, and preventing its default cancels the call. It used to replace the handler, so client validation composed onto the form (Base UI Form through `render`) never ran and an invalid form still posted.

## 0.9.12

- Font fallbacks match the font's width. `size-adjust` was the ratio of line heights, so fallback text re-wrapped when the real font swapped in (Inter's fallback was 95.04%; width-matched it is 107.12%, as next/font ships). All 199 registry fonts are recomputed from Capsize's average character width; InterDisplay, which Capsize lacks, is measured from its own file.
- Fallback faces load on Linux. They named only `local("Arial")` (or Times New Roman / Courier New), which Linux lacks, and Chromium matches `local()` by name, so the face was empty there. They now also list the metric-compatible Liberation and Croscore clones.

## 0.9.11

0.9.10 was tagged but not published (a timing-dependent unit test failed its release run); 0.9.11 ships its changes with that test fixed.

## 0.9.10

- `clientLazy` components render on the server. Solid's SSR compiler captured the type parameter in `{...(props as P)}` as a runtime value, so every `clientLazy` threw "P is not defined" during SSR, the server sent the error boundary, and hydration missed its keys.
- `FontCSS` follows reactive props. It read `font`, `subsets` and `preload` once, so a font chosen from loader data or search params never updated after navigation.
- Apps typecheck without the optional `@tanstack/query-broadcast-client-experimental`. Flare ships TypeScript source, and `tsc` failed on its dynamic import in query-client when the peer was not installed. `typecheck:consumer-strict` now also checks an app without feature peers.

## 0.9.9

- Client navigation never paints a page before its loader data. A viewport prefetch warms only a route's modules but marked it visited, so the click painted a cached shell; with just the shared layout cached (hydration seeds it), the page mounted with null loader data, threw into the root error boundary or showed raw i18n keys, then recovered when the data landed. The shell now paints only when every route module is cached; otherwise navigation waits for the data as on a first visit.
- Classes keyed in a class object compile (`class={["p-2", { "bg-accent/10": on() }]}`). Flare's extraction skipped object keys, so those utilities reached the DOM with no CSS.
- **Breaking:** theme is opt-in. Without `theme` in `createRouter`, Flare emits no theme script or `color-scheme` style and never sets `data-theme`. Before, every app defaulted to `system`, so a light-only site turned dark for dark-mode visitors. Apps with dark mode set `theme: { defaultTheme: "system" }`.
- Sources added to the CSP `style-src` also allow stylesheets. Flare puts its style nonce on `style-src-elem`, which browsers then use alone for `<style>` and `<link>`, so a widget's stylesheet host in `style-src` was blocked. Unless the app sets `style-src-elem` itself, its `style-src` sources are copied there.

## 0.9.8

- `vite preview` works with `--configLoader runner` (needed to preview on Node, since Flare ships TypeScript). The preview server and prerender imported the built server bundle with `import()` in module source, which the config's module runner rewrote; Vite closes that runner after loading the config, so the first request failed with "Vite module runner has been closed".
- A rebuilt server bundle is loaded fresh under Bun. The `?t=` cache-buster never worked there (Bun keys its module cache by path) and could collide on Node within one millisecond. Flare now imports a uniquely named copy of the bundle next to it and removes the copy afterwards.

## 0.9.7

- Utilities that style other elements compile. `space-x-*`, `space-y-*`, `divide-*` and the `*:` and `**:` child variants wrap the utility's class in a selector (`:where(.space-x-2 > :not(:last-child))`), which Flare's extraction skipped, so they shipped no CSS and `sx.strict` rejected them. They now compile to a rule nested on the utility, keeping Tailwind's selector and specificity.

## 0.9.6

0.9.5 was tagged but not published (its CI test run failed on Bun 1.3); 0.9.6 ships its changes with the fix.

- Dev and preview servers stop streaming to a client that left. They kept reading the SSR body and writing after a disconnect (closed tab, aborted navigation), so abandoned renders ran to completion; under Bun, the write to the closed response threw and could take `vite preview` down. A departed client (detected on the response and its socket; Bun 1.3 closes only the socket) now cancels the body, and an error after the headers are sent drops the connection instead of reaching the error handler. Tests run `vite preview` under Bun, abandon three streams mid-body and assert each is cancelled and the server keeps serving, and check keep-alive sockets don't accumulate listeners.
- `flare font` is registered in the CLI. The command existed and was documented but unreachable; a test now checks every command module is wired.

## 0.9.4

- The first-paint `color-scheme` follows the default theme. The head prefix pinned an unlayered `html{color-scheme:light}`, so before the theme script ran, or with JavaScript off, a `system`-default app rendered light for dark-mode users and overrode the app's own `color-scheme: light dark`. It now emits `light dark` for a `system` default and the fixed scheme for a `light` or `dark` default, plus rules for both attribute values.

## 0.9.3

- Dev server-rendered pages carry all their CSS. Dev SSR read the sx stylesheet from a module the server runner cached after its first import, so classes from routes and packages loaded later reached the page only once JavaScript ran (a flash of unstyled content on every route but the first). Each server-transformed module now registers its rules as it runs, and SSR composes the stylesheet at render with the same code production output uses. Tests cover a route's first render, a route rendered after another, and a page edit.
- `<head>` keeps Solid's render order. The head hoist moved component regions (`ThemeScript`, `DirectionScript`) ahead of static `<meta>` and `<title>`, so hydration met the wrong first child and warned about a structure mismatch, in dev and production. SSR no longer reorders the head; in dev, only the tags Vite prepends move after Solid's head children.

## 0.9.2

- Dev hydration works when Flare is installed from npm. Flare ships TSX source, and Vite's dependency optimizer pre-bundled it from `node_modules` without the Solid JSX transform, so dev pages failed at hydration with `React is not defined` (and event handlers never attached). The plugin now excludes `@lovrozagar/flare` from `optimizeDeps`, so it's served as source like a linked package. Workspace-linked apps never hit this, so a new test installs a real copy into a consumer app's `node_modules` and asserts Flare isn't pre-bundled.

## 0.9.1

- Variants Tailwind emits as a suffix on a utility's own selector keep the whole suffix. Tailwind 4.3.3 flattens attribute variants (`.u[aria-pressed="true"]`, `.u[data-open]`), and Flare dropped them as unknown selectors, so `aria-pressed:` and `data-[x]:` classes shipped no CSS. Chained pseudo-classes (`focus-visible:disabled:`) also lost every pseudo but the last.
- The workspace is on Tailwind 4.3.3, so CI exercises the flattened output consumers get.

## 0.9.0

- **`cn` merges with the app's theme.** With `sx.twCssPath`, the plugin compiles `cn` tables from that stylesheet and its imports, and serves them in place of the default ones. The compile-time static merge uses the same tables, on client and server.
  - Before, custom scale names didn't merge: `cn("rounded-control", "rounded-lg")` kept both. Worse, a custom font size was read as a color, so `cn("text-body", "text-muted")` dropped `text-body`.
  - In dev, editing the theme rebuilds the CSS and the tables.
- **Tailwind's element-local vars stay live.** Flare used to inline every `--tw-*` value it had seen, so one utility could carry another's output: `ring-1` shipped `shadow-sm`'s shadow, and shadow, ring, transform and filter stacks didn't compose. `--tw-*` vars are no longer inlined, and the `@property` rules they need ship, together with Tailwind's `@layer properties` fallback.
- **Imports and plugins resolve from the stylesheet.** The Tailwind entry's relative and package `@import`s resolve from the importing file, and `@plugin` loads relative and installed plugins. A Tailwind init failure fails the build; before, it warned and shipped class tokens with no CSS.
- **`sx.strict`** fails the module when an app-layer class literal compiles to no CSS, with `allow` for non-Tailwind names and `deny` patterns for utilities to reject. The error names the file, line and token.
- **`sx.themeVars: "reference"`** keeps theme `var()` references and emits exactly the theme vars they use, for runtime theme editing. The default, `"inline"`, is unchanged.
- **A characterization build test (`ui-contract`) pins the CSS contract design systems build on:** layers, inlined `light-dark()` chains, logical and state variants, and which class literals compile.

## 0.8.0

- `withFetchDedupe(target)` from `@lovrozagar/flare/fetch-dedupe` gives a fetch that is not `globalThis.fetch` the same request-scoped `GET` / `HEAD` dedupe, such as an SDK over a Workers service binding. Pass the binding itself: wrappers over the same target share one cache, so an SDK built per request still dedupes, and the binding is called as a method so `this` stays intact. Before, only `globalThis.fetch` was patched, so SDK calls over a binding in an authenticate, preloader, and loader of one request each went upstream.
- Deduped responses no longer leave an unread clone branch. Each fetch kept its original response unread and handed out clones, so every SSR `GET` buffered its whole body (the workerd "did not read the body of both clones" warning) and a large streamed response could run a worker out of memory. One branch now streams to the first caller and the other is read into a replay buffer. Bodies over `maxBytes` (default 1 MiB) and `text/event-stream` responses still stream to every waiting caller but are not reused later, and a large body keeps backpressure.
- A caller's `AbortSignal` cancels only that caller. Before, every caller shared the first caller's signal, so one SDK timeout or navigation abort failed every other caller of the same `GET`. The upstream fetch is aborted once every caller has aborted.
- Any other method (`POST`, `PATCH`, …) drops the request's memoized responses, so a `GET` after a mutation goes upstream. Cache keys now include `redirect` and the other request mode fields, and URLs and header names are normalized.
- A new e2e route checks all of this against real network fetches on node, bun, deno, and workerd (dev and prod), including a real service binding on workers.

## 0.7.1

- A server fn's return type reaches its callers: `.handler()` infers the output, so `await fn(input)` is typed without restating it. Before, the output was fixed to `unknown` when the builder was created and every call site cast. Handler and stream contexts now type `env`, `serverContext`, and (after `.authenticate()`) `auth` from the app's registry (`createServer<Env>(router)`, `.serverContext()`, `.authenticateFn()`), and `.authenticateFn()` / `.security()` receive the `.serverContext()` type. Middleware keeps the open `serverContext` record because built-ins store framework keys there.

## 0.7.0

- A server fn called directly from browser code makes the HTTP call. Before, the client build stubbed the handler and validator, so `await fn(input)` in a component, event handler, or client module threw `Server function called on client`, and only `<Form action>` and the `server-fn-query` helpers reached the server. The client transform now marks each server fn, and calling it sends `POST` (or `GET` for `method: "get"`) to `/_flare/server-fn/{id}/{name}` and resolves with the handler's result. Failures reject the same way the query helpers do, with `ServerFnValidationError` for validation errors. A unit test runs a module through the client transform and calls the export, so the client build and the runtime are tested together.

## 0.5.1

- `createServer<TEnv>(router)` types the worker env. `ctx.env` in `.authenticateFn()`, `.serverContext()`, `.security()`, and every route is `TEnv`. Before, the generated registry read `env` from `fetch`'s `unknown` parameter, so every route's `ctx.env` was `unknown` and an app-side `env` augmentation conflicted with it. Pass the env type once: `createServer<Cloudflare.Env>(router)`. The strict consumer fixture now reads a typed env in a loader and in `authenticateFn`.

## 0.5.0

- Breaking: auth mode is the method name. `.authenticate(...callerData)` is required and `.authenticateOptional(...callerData)` is optional; arguments are only callerData for `authenticateFn`. `.authenticateOptional()` is no longer deprecated.
- Breaking: `.authenticate("optional")` (the 0.4.1 form) is removed. A leading `"optional"` argument does not type-check, throws at route definition, and fails codegen, each with a message naming `.authenticateOptional()`. Codegen reads the mode from the method name and never evaluates an argument, so a variable argument can no longer make the builder and the generated route meta disagree. Migrate `.authenticate("optional", ...x)` to `.authenticateOptional(...x)`.

## 0.4.2

- The published `@types/negotiator` dependency is a version, not `catalog:`. 0.4.1 failed to install outside this workspace. The strict consumer check now packs with `npm pack`, like the release, so an unresolved specifier fails CI.

## 0.4.1

- Flare's source compiles under strict consumer flags (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `allowUnreachableCode: false`). CI and the release workflow typecheck the packed tarball in a strict consumer fixture that imports every export path.
- `.authenticate("optional")` makes a route optional, as documented. Before, it compiled but made the route required, so anonymous visitors got the unauthenticated boundary. Other arguments stay callerData for `authenticateFn` (`.authenticate("optional", "viewer")`). `.authenticateOptional()` is a deprecated alias. The README no longer documents the unimplemented `.authenticate(false)`.
- Generated route meta satisfies `RouteMeta` for optional auth (`authenticate: "optional"` no longer fails TS2322).
- ISR and static store serving skip routes with optional auth, not only required auth, so one visitor's render is never served to another.
- Codegen honors `entry.server` and finds the router through the server entry's `createServer(router)` import, so `hasQueryClient` and the server-derived types work with non-default entry names. Detection resolves against the project root instead of the process cwd, and codegen warns when the server entry does not export its `createServer` chain.
- The generated registry infers `auth` and `serverContext` from `.authenticateFn()` and `.serverContext()`. Before, both resolved to `never` once those methods were called.
- Absolute `entry` paths work (`resolve` instead of `join`).
- `@types/negotiator` ships as a dependency so `@lovrozagar/flare/middleware/i18n` typechecks in consumers. `tailwindcss` is declared as an optional peer and no longer needs to be installed for consumers to typecheck the plugin.

## 0.4.0

- The root layout's head CSS (`custom.styles`, `css`) survives cached back and forward navigation. Before, a cached popstate dropped the root sheet and left the page unstyled until reload.
- Client navigation applies per-route heads in hierarchy order, root first. A route that was not refetched keeps its cached head.

## 0.3.1

- The server (Worker) build emits source maps. `@cloudflare/vite-plugin` then sets `upload_source_maps`, so Cloudflare remaps minified stack traces in Workers Logs and `wrangler tail` to the original files and lines. The client build stays without maps, so no source ships as a static asset.

## 0.3.0

- `cn` resolves Tailwind conflicts. The last utility in a group wins.
- A static `class="px-2 px-4"` compiles to `px-4`. Dynamic class lists keep a runtime `cn` call.
- Runtime `cn` is tree-shaken unless a dynamic class list exists.
- Non-Tailwind tokens are not deduped. Hashed atomics and `group` / `peer` markers stay.
