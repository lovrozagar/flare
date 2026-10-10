# e2e

Honey-shaped. Every **app** lives under `apps/`. You pick an **env**; all apps run on it.

```
e2e/
  apps/product      # full framework surface
  apps/demo         # locale / i18n
  apps/fs-routes    # fsVirtualPaths
  apps/tauri        # desktop vite shell
  node/ bun/ workers/ deno/
  apps/builds.ts    # build registry: app × deploy target × artifacts
  playwright-app.ts
  run-env.ts
  run-build.ts
```

```bash
bun run test:e2e                      # all apps × node
bun run test:e2e:workers              # all apps × workers
bun run test:e2e -- --app product
bun run test:all                      # unit + build + all apps × node (dev then prod)
bun run test:all -- --env bun
bun run test:e2e                      # Playwright, Vite dev
bun run test:e2e:prod                 # same tests, `vite preview` after build
# traces: e2e/<env>/test-results/<env>-<dev|prod>-<app>/
# FLARE_E2E_RETRIES=0 skips Playwright retries (CI default is 1)
```

## Build tier

Cheaper than e2e and answers a different question: does a Flare app still
_build_ for every deploy target, on every runtime a user might build with.
No browser, no server boot — the build must exit 0 and emit the artifacts
its spec in `apps/builds.ts` names.

```bash
bun run test:build                    # every target, built on node (~10s)
bun run test:build:bun                # built under bun
bun run test:build:deno               # built under deno
bun run test:build:all                # node + bun + deno (~25s)
bun run e2e/run-build.ts --target workers
bun run e2e/run-build.ts --app product --verbose
bun run e2e/run-build.ts --check-generated   # what CI runs
```

`--check-generated` fails a target whose build rewrote a checked-in file —
`src/_gen/routes.gen.ts` is committed, so a build must reproduce it byte for
byte on every runtime. Files already dirty before the build are ignored, so
this stays usable with route edits in flight; CI runs it on a clean
checkout, where a rewrite means the committed file is stale or codegen has
gone non-deterministic.

Targets today: `product`, `demo`, `fs-routes` × (node, workers) and `tauri`
× nitro. Workers targets are node-only — `@cloudflare/vite-plugin` does not
load under bun (`node:module` `registerHooks`) or deno; those combinations
report `skip`, not `FAIL`.

Adding an app or a deploy target means adding a spec to `apps/builds.ts`.
The runner refuses to start if a spec points at an app that no longer
exists.
