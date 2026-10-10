# 04 — The tree

`files.tsv` is the list of files. One row per file. `scripts/check-tree.ts` fails when the disk and the tsv disagree. `scripts/check-tree.ts` fails when the two disagree. This file says what the directories are and which v0 modules are absent on purpose.

A row's `phase` is the bit that creates the file. A later bit may add cases to that file. It does not add a second file for the same job.

`kind` is `src`, `test`, `types`, `index`, `lint`, `script`, `config`, `corpus`, `app`, `template`, or `generated`.

- `index` and `types` have no sibling test.
- `src`, `lint`, and `script` have a sibling `*.test.ts` or `*.test.tsx`.
- `generated` is the pattern `packages/core/src/features/fonts/shared/generated/*.ts`. The generator's test fails when the directory is not exactly one module per `registry.json` key (B78).
- `app` files are covered by the e2e or golden test named in their bit, except `packages/core/tests/types/app/`, which `app.test.ts` covers. v1 has no `template` rows (B75).

An `index.ts` born in an early bit gains `export { ... } from` lines in later bits as those modules appear. `src/exports/server.ts` is the one that grows this way: bit 01 publishes `createServer`, and bits 04, 08, and 10 add the re-exports those bits create. The file is still one row.

## Directories

```
scripts/                         check-tree (bit 00), release (bit 14)
packages/core/
  lint/                          the eight flare oxlint rules
  src/
    exports/                     one re-export file per public subpath
    shared/
      url/ duration/ errors/ validation/ cache/ csp/ css/ env/
      route-tree/ route-builder/ protocol/ router/ components/
    server/
      redirect/ lifecycle/ security/ context/ auth/ loaders/
      render/ navigation/ server-fn/ middleware/ mount/ proxy/
      cacheability/ cache/
    client/
      boot/ navigation/ history/ head/ view-transition/ server-fn/ router/ sync/
    adapters/
      node/ bun/ workers/ stores/fs/ stores/cache-api/
    vite/
      route-meta/ codegen/ boundary/ plugin/ dev/ prerender/ css/ bin/
    features/
      theme/shared/
      direction/shared/
      query/shared/  query/client/
      i18n/shared/   i18n/server/
      image/shared/  image/vite/
      fonts/shared/  fonts/shared/generated/  fonts/vite/
      seo/server/
    testing/
  tests/
    structure/  size/  integration/  workerd/  e2e/  types/
```

## `tests/types`

`propagation.test.ts` is the matrix in `dx/types.md` (bit 01). The core typecheck includes it. `app.test.ts` runs `tsc --noEmit` on `app/` (bit 07). `app/` is not a Playwright app. Adding it does not change B70. A fourth e2e app is still a change to B70.

## `tests/e2e`

The split is B70. This directory holds the Playwright files, `playwright.config.ts`, `boot.ts`, and `apps/`. A new file inside `apps/minimal`, `apps/basepath`, or `apps/i18n` does not add a directory here. A fourth app is a change to B70. The Playwright config is `kind = config` and has no sibling test. `boot.ts` is `kind = script` and has `boot.test.ts`.

## Repo around the packages

Bit 00 moves the current tree to `_v0/` and leaves it out of workspaces, lint, and CI. `_v0/` is not in `files.tsv`. It is an archive. The blueprint files, `TODO*.md`, and the new `packages/` are the repo.

`_v0/` contains today's `packages/core`, `packages/cli`, `e2e`, and `benchmark`. `_v0/e2e` stays in the archive. B70 replaces it. The product, demo, fs-routes, and tauri apps are not copied back, and the `node`, `bun`, `workers`, and `deno` env packages are not copied back.

## Modules that do not come back

These exist under today's `packages/core/src` and have no row in `files.tsv`.

| gone | why |
| --- | --- |
| `await.ts`, `components/await.tsx` | Solid `<Loading>` and `createMemo(async () => deferred.promise)` (B80). No `<Await>`, no skeleton component |
| `broadcast/` | D43. The generic bus stays gone. Live updates post from `client/sync` on `BroadcastChannel` `"flare.sync"` (B72) |
| `form/` | D50 |
| `lazy/` | Solid `lazy` |
| `hydrate/`, `hydration/`, `state-parser/` | Solid `hydrate` and the serializer. Flare reads one state script |
| `server-context/` | Solid request event, wrapped by `server/context/ctx.ts` |
| `head-client/` | Solid `useHead`, wrapped by `client/head/apply.ts` |
| `errors/` boundaries, `boundaries/` | Solid `<Errored>` for a slot. The route walks `errorRender`, `notFoundRender`, `unauthenticatedRender`, and `unauthorizedRender` stay (B77, B80) |
| `tracing/` | Solid trace context |
| `styles/`, `plugins/sx-ast/`, `plugins/css-transform.ts`, `reset-css.ts`, `ssr/critical-css.ts` | B14. The compiler, the `<ResetCSS />` component, and the sx-manifest scanner. Reset is `flare({ css: { reset: true } })`. Critical CSS reads the built stylesheet (B15) |
| `plugins/purge.ts` | B10 |
| `plugins/dev-dashboard/`, `plugins/dev-cdn-cache.ts`, `plugins/retain-assets.ts` | D35, D37, D36. A dev runtime bug opens Vite's overlay. Flare ships no overlay (B76) |
| `service-worker/` | D38 |
| `navigation-progress/` | D44. The styled bar. The primitive is `client/navigation/progress.ts` |
| `dedupe/` the wrapper, and the `globalThis.fetch` patch | D40, B71. Request-scoped fetch dedupe is `withFetchDedupe` only. `globalThis.fetch` is not patched |
| `onPage`, `onServerFn`, `virtualPath` | B21, B71. A page-only or server-function-only middleware is an `exact` or `prefix` filter. Virtual routes do not exist |
| `POST /_flare/revalidate`, `revalidateSecret` | B71. The app calls `revalidate()` from a route it writes |
| `create-isomorphic-fn.ts`, `create-server-only-fn.ts`, `create-client-only-fn.ts`, `env-fn/` | B9. The v0 re-exports, the `indexOf` scanner, and `envFn`. The helpers are `shared/env/`. There is no `/env-fn/` path exemption |
| `middleware/builtins/api-proxy.ts`, `cdn-proxy.ts`, `markdown-negotiation.ts`, `keepalive.ts`, `static-assets.ts` | B11, B12, B13, D41 |
| `registry/` | no callers |
| `module-graph/` | Solid asset manifest |
| `prerender/` as a hand-called API | `vite/prerender` |
| `search-engine/` inside core's server entry | `features/seo`, subpath `./seo` |
| `fonts/*.ts` the 211 family modules in core's root | `features/fonts/shared/generated/<id>.ts`, import `@lovrozagar/flare/fonts/<id>` (B78). `@lovrozagar/flare-fonts` does not exist |
| `plugins/server-fn.ts` the regex strip, including `transformEnvFns` | `vite/boundary` and `vite/route-meta`, oxc |
| Babel parse plus a regex scan of the builder chain | `vite/codegen/scan.ts`, one `oxc-parser` walk (B75) |

## How a bit uses the tsv

The bit lists every `src` row of its phase and the cases the sibling test must contain. Cases added to an older file are listed as extensions. A case with no test name is not a case. A test name that is not in the bit is not added.
