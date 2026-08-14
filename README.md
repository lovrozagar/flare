# Flare

Solid meta-framework. Server-driven, NDJSON streaming, `renderToStream`.

This repo is the source of the `flare` npm package.

## Layout

```
packages/core     published package (flare)
packages/cli      flare CLI
e2e/apps/*        Playwright apps (product, demo, fs-routes, tauri)
e2e/node|bun|workers|deno   env adapters
benchmark         flare vs Next vs TanStack
ui                design system — parked
v0                archived previous major
```

## Develop

Requires [Bun](https://bun.sh) 1.3+ and TypeScript 7.

```bash
bun install
bun run test                 # core unit
bun run test:all             # unit + all e2e apps on node
bun run test:all -- --env bun
bun run typecheck
bun run typecheck:consumers  # e2e apps
```

```bash
bun run test:e2e             # all apps × node
bun run test:e2e:bun
bun run test:e2e:workers
bun run test:e2e:deno
bun run test:e2e -- --app product
bun run test:cli
```
