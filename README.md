# Flare

Solid meta-framework. Server-driven, NDJSON streaming, `renderToStream`.

This repo is the source of the `flare` npm package.

## Layout

```
packages/core     published package (flare)
packages/cli      flare CLI (workspace, not published yet)
consumer/*        platform consumers (node, bun, cf-workers, …)
e2e/app           shared Playwright consumer (current product)
e2e/node          node harness — default `test:e2e`
e2e-archive       parked historical suite (guide, not deleted)
real-world        small production-shaped app
benchmark         flare vs Next vs TanStack
ui                design system — parked until Base UI is installable here
v0                archived previous major
```

`packages/core` is the published workspace. Consumers import `flare` over `workspace:*` the way a real app would.

## Develop

Requires [Bun](https://bun.sh) 1.3+ and TypeScript 7.

```bash
bun install
bun run test            # core unit + in-process integration (default CI)
bun run typecheck       # core src (TypeScript 7)
bun run typecheck:consumers  # e2e/app + real-world + flare-node
```

Opt-in:

```bash
bun run test:e2e          # Playwright against e2e/app via the node harness
bun run test:e2e:archive  # parked historical suite
bun run test:cli          # CLI unit tests
```

## Package

Consumers import `flare` and its subpath exports (`/client`, `/server`, `/plugins`, `/router`, …).

```ts
import { createPage } from "flare/page"
import { createRouter } from "flare/router"
import { flare } from "flare/plugins"
```

## License

MIT
