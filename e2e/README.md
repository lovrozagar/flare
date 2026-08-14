# e2e

Honey-shaped. Every **app** lives under `apps/`. You pick an **env**; all apps run on it.

```
e2e/
  apps/product      # full framework surface
  apps/demo         # locale / i18n
  apps/fs-routes    # fsVirtualPaths
  apps/tauri        # desktop vite shell
  node/ bun/ workers/ deno/
  playwright-app.ts
  run-env.ts
```

```bash
bun run test:e2e                      # all apps × node
bun run test:e2e:workers              # all apps × workers
bun run test:e2e -- --app product
bun run test:all                      # unit + all apps × node
bun run test:all -- --env bun
```
