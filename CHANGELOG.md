# Changelog

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
