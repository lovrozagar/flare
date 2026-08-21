# Solid 2 client attach — execution plan

Branch: `solid-v2`. Merge when **dev and prod** e2e are green. Do not rewrite Flare loaders/defer/NDJSON onto Solid async memos. Do not enable `@solidjs/vite-plugin` `start: true`.

## Loop (every checkbox)

1. Change the smallest surface that could be the cause.
2. Prove it with a **short** test, not product e2e:
   ```bash
   FLARE_E2E_APP=demo bun run --filter @flare/e2e-node test -- e2e/apps/demo/tests/e2e/i18n.test.ts
   ```
   For SPA: the `SPA locale switcher` tests in that file. They wait on `html[data-hydrated]`.
3. `bun run --filter @lovrozagar/flare test` after core edits.
4. Only after demo hydrate + one SPA click pass: `bun run test:e2e -- --app demo`, then fs-routes, tauri, **then** product. Prod last: `TEST_MODE=prod bun run test:e2e -- --app demo`.

Do not run full product (2500 tests) until `html[data-hydrated]` is set on a hard nav. That suite is wait-bound: each miss is 15s + retry 15s.

---

## 0. Harness (do first, does not fix hydrate)

- [x] Playwright `outputDir` (and HTML report dir) keyed by `env` + `TEST_MODE` + `FLARE_E2E_APP` so demo/fs-routes/product/tauri and dev/prod do not wipe each others' traces. Today `e2e/node/test-results/` is cleared on every Playwright start.
- [x] Keep `workers: 16` on node/bun (already set). Leave deno + Cloudflare workers env at 1.
- [x] Local iterate: `retries: 0` via env (e.g. `FLARE_E2E_RETRIES`) without changing CI default `retries: 1`.
- [x] Finish or revert the dirty leftover-API edits on the tree (`link`, `lazy`, `await`, `theme`, specs) so hydrate work is not mixed with a half-applied STRICT_READ pass. Commit them as their own commit or restore to `origin/solid-v2` before step 1.

---

## 1. Diagnose why `data-hydrated` is never set

`hydrate()` in `packages/core/src/hydrate/index.tsx` sets the attribute **only at the end** of the success path (after `solidHydrate`, after `await ctxReady`). If that promise never resolves, Playwright waits 10–15s forever.

`ctxReady` is resolved from `FlareProvider` `onContextReady`, which runs in `onSettled`. Solid 2 `onSettled` may not fire during hydration the way 1.x `onMount` did.

- [x] Open demo `/` in the browser (Vite dev). Confirm SSR HTML has `self.flare` / FlareState. Confirm the client bundle loads. Read console for Solid 2 diagnostics and uncaught errors.
- [x] Confirm whether `hydrate()` is entered (`parseFlareState` non-null) and whether it hangs on `await ctxReady` vs throwing vs returning early at `if (!raw) return`.
- [x] Confirm `FlareProvider` `onSettled` / `onContextReady` actually runs under `solidHydrate`. If not, that is the first code fix: resolve context without waiting for settle (e.g. call `onContextReady` from the provider body, or `createEffect` compute/apply, or a microtask after `solidHydrate` returns).
- [x] Confirm Solid 2 `hydrate()` from `@solidjs/web` returns (or throws). Log mismatches. SSR currently injects `_$HY` unconditionally; Solid 2 may still expect different hydration IDs (`data-hk` was missing in SSR HTML on this branch).
- [x] Compare SSR tree vs client tree in `hydrate/index.tsx` comments (`Hydration` vs `Dummy`, Theme/Direction/Broadcast/FlareProvider/Outlet). Depth or provider mismatch aborts hydrate in Solid 2.
- [x] One passing hard-nav: `document.documentElement.hasAttribute("data-hydrated") === true` on demo `/`.

**Done when:** demo `/` sets `data-hydrated` in **dev**. HTTP-only tests already pass; this is the missing client finish.

---

## 2. Solid 2 hydration IDs / `_$HY`

Only if step 1 still mismatches after `ctxReady` is fixed.

- [x] Read current `@solidjs/web` `hydrate` / `renderToStream` for the hydration marker format (not Solid 1 `data-hk` assumptions).
- [x] Align Flare SSR (`packages/core/src/ssr/index.tsx`) `_$HY` init and any hydration wrappers (`<Hydration>`, `<NoHydration>`, Dummy) with that format.
- [ ] Re-check a streamed page (`defer` + `<Await>`) and a sync page. Both must hydrate.
- [x] Re-check prod preview (`TEST_MODE=prod` demo `/`) — hashed client graph, not Vite transform.

**Done when:** demo `/` hydrates in **dev and prod**.

---

## 3. SPA after hydrate

Demo SPA locale switcher and nav links currently time out because they wait for hydrate first. After step 1 they should be attempted.

- [x] Click locale switcher en→hr. URL, `lang`, cookie, and content update without a full reload.
- [x] Link click `/` → `/about` (demo). Product `clickAndAssertSPA` is plan §5, not this landing.
- [ ] `FlareProvider` match updates still reset `<Errored>` (existing `createEffect` on `virtualPath`). Confirm SPA error → success does not stick on the fallback.
- [x] NDJSON `x-d: 1` still returns 200 + NDJSON on SPA data fetches (already true on the server; confirm the **client** consumes it after hydrate).

**Done when:** demo SPA locale tests pass in dev. Then fs-routes SPA, then a handful of product navigation tests — not the whole matrix.

---

## 4. Leftover Solid 2 API/runtime (only what still breaks)

Do not mass-rewrite tests. Fix production reads that drop reactivity or hang.

- [ ] `STRICT_READ_UNTRACKED` in **src** (ThemeProvider body `resolvedTheme()`, Await effect apply reading `props.promise`, Show children that call accessors under `untrack`, `ThrowError` in lazy). Tests that use IIFE children can wait.
- [ ] `onSettled` vs `onMount` semantics anywhere else that must run during hydrate (theme, locale, direction, lazy).
- [ ] Keep Flare `<Await>` as the defer UI. Do not move page data onto `createMemo` + `<Loading>` in this landing.

**Done when:** `bun run --filter @lovrozagar/flare test` stays green and demo has no hydrate-blocking diagnostics in the console.

---

## 5. Widen the gate

- [x] `bun run test:e2e -- --app demo` (dev)
- [x] `bun run test:e2e -- --app fs-routes`
- [x] `bun run test:e2e -- --app tauri`
- [x] `TEST_MODE=prod bun run test:e2e -- --app demo`
- [ ] `bun run test:e2e -- --app product` (dev) — 16 workers; expect hours only if hydrate still misses
- [ ] `TEST_MODE=prod bun run test:e2e -- --app product`
- [ ] `bun run test:all` (now includes e2e-dev then e2e-prod)

**Done when:** `test:all` env=node is green on `solid-v2`. Then merge.

---

## Out of scope for this landing

- Solid `"use server"` / plugin `start: true`
- Rewriting `defer` + `<Await>` onto async memos / `<Loading>`
- bun as Playwright runner, Lightpanda, worker-count experiments beyond 16
- Full bun/deno/workers/firefox e2e matrices (CI already lists them; land node first)
