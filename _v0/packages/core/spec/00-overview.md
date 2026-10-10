# Flare v2: Spec Overview

Full rewrite. TDD. `renderToStream()` from day 1. NDJSON only. Server-driven.

## Dependency Graph

```
Layer 0 (pure, no deps)
├── router-primitives   — tree types, matching, layout derivation, param extraction
├── errors              — NotFoundError, UnauthenticatedError, UnauthorizedError, RedirectResponse
├── url                 — buildUrl, search params
├── preload             — fire-and-forget module preloading, retry, load/preload/reset
└── styles              — styles() API, scoped CSS, state selectors, CSS variables

Layer 0.5 (pure, no Flare deps — optional utilities)
├── theme               — theme signal, flash-prevention script, system preference
└── direction           — LTR/RTL signal, flash-prevention script, locale detection

Layer 1 (depends on L0)
├── server-context      — AsyncLocalStorage request context
├── route-builder       — createPage, createLayout, createRootLayout, chain API
└── dedupe              — per-request fn/fetch deduplication via serverRequestContext

Layer 2 (depends on L1)
├── loader-pipeline     — authenticate → authorize → preloaders → loaders
├── defer               — defer context, stream/await control
├── middleware           — FlareMiddleware, middlewareNext/Respond/Bypass, onResponse
├── server-fn           — createServerFn builder, handleServerFnRequest, RPC endpoint
└── ssr                 — renderToStream, flare state serialization, head/headers chain

Layer 3 (depends on L2)
├── ndjson-server       — NDJSON response generation (t:"l", t:"c", t:"r", t:"h", t:"d", etc.)
├── boundaries          — error/notFound/unauthorized/streaming boundary rendering
├── server-handler      — createServerHandler, request flow, SSR/NDJSON routing, security
├── router-config       — createRouter, RouterConfig, FlareState shape, ContextState, server→client flow
└── middleware-builtins  — apiProxy, cdnProxy, htmlCache, i18n, staticAssets

Layer 4 (client, depends on L0 + L3 protocol)
├── state-parser        — parseFlareState from self.flare
├── caches              — matchCache, prefetchCache
├── ndjson-client       — NDJSON consumption, deferred chunk handling
├── hydration           — loadRouteModules, solidHydrate(document)
├── lazy                — lazy(), clientLazy(), SSR-safe pending alignment
├── head-client         — per-route head tracking, applyPerRouteHeads, applyHeadConfig
├── history             — HistoryState, scroll store, pushHistoryState, replaceHistoryState
└── query-client        — TanStack Query integration, useQuery, useSuspenseQuery, SSR streaming

Layer 5 (depends on L4)
├── navigation          — navigate(), popstate, history, scroll restoration, view transitions
├── link                — <Link> component, prefetch strategies (hover/viewport)
└── outlet              — <Outlet>, layout persistence, match rendering

Layer 6 (cross-cutting, depends on L2 + L4)
└── registry            — createRegistry, withRegistryTracking, registerRegistry, scanStringsForPreload, dk

Layer 7 (tooling)
├── generators          — route generation, route-types generation
├── plugins             — Vite plugins (flare, css-scope, server-fn, styles-transform)
├── config              — FlareBuildConfig, globalBoundaries
└── testing             — FlarePage playwright page object, E2E fixtures

Layer 8 (assembled components, depends on L2 + L4)
└── components          — Await, ThemeScript, DirectionScript, ResetCSS, ViewTransitionCSS, DevErrorOverlay, ssr-context (spec 37)
```

## Entry Points

Three files define a Flare app. `router.ts` is isomorphic — imported by both server and client.

```ts
/* src/router.ts — isomorphic config (spec 25) */
import { createRouter } from "@lovrozagar/flare";
import { layouts, routeTree } from "./_gen/routes.gen";

export const router = createRouter({
	layouts,
	routeTree,
	prefetch: "intent",
	staleTime: 30_000,
	viewTransitions: true,
});
```

```ts
/* src/server.ts — server entry (spec 24) */
import { createServerHandler } from "@lovrozagar/flare/server";
import { router } from "./router";

export default createServerHandler({
	router,
	authenticateFn: async ({ env, request }) => {
		/* ... */
	},
});
```

```ts
/* src/client.ts — client entry (spec 14) */
import { hydrate } from "@lovrozagar/flare/client";
import { router } from "./router";

hydrate(router);
```

`createRouter` is the single source of truth — `routeTree`, `layouts`, `queryClientGetter`, and all runtime defaults (cache timing, prefetch, scroll restoration, URL behavior). Server-only config (`authenticateFn`, `csp`, `middlewares`) stays on `createServerHandler`. Build-time config (`globalBoundaries`, `css`, `serverFn`) stays on `createFlareBuild` (spec 21).

## Build Order

Start bottom-up. Each layer is TDD'd before moving up.

| Order | Domain                | Why first                                                      |
| ----- | --------------------- | -------------------------------------------------------------- |
| 1     | `router-primitives`   | Pure functions, zero deps, foundation for everything           |
| 2     | `errors`              | Simple classes, used everywhere                                |
| 3     | `url`                 | Pure, used by router + client                                  |
| 4     | `preload`             | Pure, no deps, fire-and-forget module loading                  |
| 5     | `styles`              | Pure, scoped CSS system                                        |
| 6     | `route-builder`       | Chain API, depends on router primitives + errors               |
| 7     | `server-context`      | AsyncLocalStorage, needed by loader pipeline                   |
| 8     | `dedupe`              | Per-request dedup, depends on server-context                   |
| 9     | `theme`               | Theme signal + flash-prevention script                         |
| 10    | `direction`           | Direction signal + flash-prevention script                     |
| 11    | `loader-pipeline`     | Core server logic                                              |
| 12    | `defer`               | Streaming control                                              |
| 13    | `ssr`                 | renderToStream integration                                     |
| 14    | `middleware`          | Request middleware chain                                       |
| 15    | `server-fn`           | Server function runtime (L2, no L3+ dependents)                |
| 16    | `ndjson-server`       | Server response format                                         |
| 17    | `boundaries`          | Error rendering                                                |
| 18    | `router-config`       | createRouter, RouterConfig, FlareState shape                   |
| 19    | `middleware-builtins` | apiProxy, cdnProxy, htmlCache, i18n, staticAssets              |
| 20    | `server-handler`      | Top-level request orchestrator                                 |
| 21    | `state-parser`        | Client bootstrap                                               |
| 22    | `caches`              | matchCache, prefetchCache                                      |
| 23    | `ndjson-client`       | Client NDJSON consumption                                      |
| 24    | `hydration`           | Client mount                                                   |
| 25    | `lazy`                | lazy/clientLazy, SSR-safe code splitting                       |
| 26    | `head-client`         | Per-route head tracking + cleanup                              |
| 27    | `history`             | History state, scroll store, direction detection               |
| 28    | `query-client`        | TanStack Query hooks, SSR streaming                            |
| 29    | `navigation`          | CSR nav                                                        |
| 30    | `link`                | Prefetch component                                             |
| 31    | `outlet`              | Render tree                                                    |
| 32    | `registry`            | Dynamic components (cross-cutting)                             |
| 33    | `components`          | Await, ThemeScript, DirectionScript, ResetCSS, DevErrorOverlay |
| 34    | `generators`          | Code generation                                                |
| 35    | `plugins`             | Vite integration                                               |
| 36    | `config`              | Build config                                                   |
| 37    | `testing`             | Playwright E2E fixtures                                        |

## Spec Files

Each spec defines:

- **What** — behavior, not implementation
- **Public API** — exports, types
- **Test cases** — acceptance criteria for TDD
- **Dependencies** — what it imports from other domains
- **Edge cases** — failure modes, concurrent access, streaming timing

| Spec | Domain                   | Layer |
| ---- | ------------------------ | ----- |
| 01   | router-primitives        | 0     |
| 02   | errors                   | 0     |
| 03   | url                      | 0     |
| 04   | route-builder            | 1     |
| 05   | server-context           | 1     |
| 06   | loader-pipeline          | 2     |
| 07   | defer                    | 2     |
| 08   | ssr                      | 2     |
| 09   | ndjson-server            | 3     |
| 10   | boundaries               | 3     |
| 11   | state-parser             | 4     |
| 12   | caches                   | 4     |
| 13   | ndjson-client            | 4     |
| 14   | hydration                | 4     |
| 15   | navigation               | 5     |
| 16   | link                     | 5     |
| 17   | outlet                   | 5     |
| 18   | registry                 | 6     |
| 19   | generators               | 7     |
| 20   | plugins                  | 7     |
| 21   | config                   | 7     |
| 22   | middleware               | 2     |
| 23   | server-fn                | 2     |
| 24   | server-handler           | 3     |
| 25   | router-config            | 3     |
| 26   | history                  | 4     |
| 27   | head-client              | 4     |
| 28   | theme                    | 0.5   |
| 29   | direction                | 0.5   |
| 30   | styles                   | 0     |
| 31   | preload                  | 0     |
| 32   | dedupe                   | 1     |
| 33   | query-client             | 4     |
| 34   | lazy                     | 4     |
| 35   | testing                  | 7     |
| 36   | middleware-builtins      | 3     |
| 37   | components + ssr-context | 8     |
