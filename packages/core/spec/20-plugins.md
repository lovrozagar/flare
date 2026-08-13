# Plugins

Layer 7. Tooling. Depends on generators (generateRoutes, generateRouteTypes), config (FlareBuildConfig).

Vite plugins for build, development, and code transformation.

## Exports

```ts
flare(config: FlareBuildConfig): Plugin[]
```

Returns an array of Vite plugins. Single entry point for all Flare build integration.

## Plugin Array

`flare(config)` returns 5 plugins:

### 1. `flare:resolver`

**Enforce: pre**

Resolves `flare` imports to environment-specific builds.

```ts
/* SSR context */
import { renderToStream } from "flare/ssr"
→ resolves to dist/ssr/ssr.js

/* Client context */
import { Link } from "flare/link"
→ resolves to dist/client/link.js

import { hydrate } from "flare/hydrate"
→ resolves to dist/client/hydrate.js
```

Uses Vite's `this.environment.name` to determine resolution:

- `"ssr"` → SSR build paths
- `"client"` → client build paths

### 2. `flare:generate`

**Core generator plugin.**

**`buildStart()`**: runs generators on build start.

```ts
generateRoutes({
	ignorePrefix: config.ignorePrefix ?? "_",
	outputPath: config.generated?.routesFilePath ?? "src/_gen/routes.gen.ts",
	rootDir: process.cwd(),
	srcDir: "src",
})

generateRouteTypes({
	outputPath: config.generated?.typesFilePath ?? "src/_gen/types.gen.d.ts",
	serverEntryPath: config.serverEntryFilePath ?? "src/server.ts",
	srcDir: "src",
})
```

**`configureServer()`**: sets up watch mode in dev.

- Watches `src/` recursively
- Ignores: `_gen/`, `*.gen.ts`, `*.gen.tsx`
- Debounce: 100ms
- On file change: re-runs both generators

### 3. `flare:ssr-build`

**Build configuration for dual-environment output.**

Configures Vite's `environments`:

```ts
environments: {
  client: {
    build: {
      outDir: "dist/client",
      rollupOptions: {
        output: {
          assetFileNames: "assets/[hash].[ext]",
          chunkFileNames: "assets/[hash].js",
          entryFileNames: "assets/client-[hash].js",
        },
      },
    },
  },
  ssr: {
    build: {
      outDir: "dist/ssr",
      rollupOptions: {
        output: {
          assetFileNames: "assets/[hash].[ext]",
          chunkFileNames: "assets/[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
        },
      },
    },
  },
}
```

Additional config:

```ts
optimizeDeps: {
  include: ["solid-js", "solid-js/web", "solid-js/store"],
},
resolve: {
  dedupe: ["solid-js", "solid-js/web", "solid-js/store"],
},
ssr: {
  noExternal: ["solid-js", "flare"],
}
```

- `optimizeDeps.include`: pre-bundle Solid for faster dev startup
- `resolve.dedupe`: prevent duplicate Solid instances (breaks reactivity)
- `ssr.noExternal`: bundle Solid into SSR output (required for Solid's SSR compilation)

### 4. `flare:virtual`

**Virtual module provider.**

Provides `virtual:flare-config` module with build-time config:

```ts
import config from "virtual:flare-config"
/* config = serialized FlareBuildConfig subset needed at runtime */
```

Also provides `virtual:client-manifest`:

```ts
import clientEntry from "virtual:client-manifest"
/* clientEntry = "/assets/client-abc123.js" (prod) or "/src/client.ts" (dev) */
```

Client manifest resolution:

1. Production: reads `dist/client/.vite/manifest.json`, finds entry with `isEntry: true`
2. Development: uses source path directly (`config.clientEntryFilePath`)

### 5. Solid Plugin

Wraps `vite-plugin-solid`:

```ts
solid({
	extensions: [".tsx", ".jsx"],
	solid: { hydratable: true },
	ssr: true,
})
```

- `hydratable: true` — generates hydration keys for SSR ↔ client matching
- `ssr: true` — enables SSR compilation mode
- Solid plugin uses `options.ssr` from transform hooks to compile for correct target

## CSS Scope Plugin

Separate from `flare()` array. Optional, enabled by `config.css !== false`.

**Transform**: `css=` JSX attribute → `data-c={registerCSS(expr)}`:

```tsx
/* Input */
<div css="color: red; font-size: 2rem">

/* Output */
<div data-c={__flare_registerCSS__("color: red; font-size: 2rem")}>
```

**Runtime** (`registerCSS`):

- Returns hash ID string
- Server: registers in per-request `Map`, collected by `getScopedStyles()` for `<style>` injection
- Client: injects `<style>` tag into `<head>` with `data-c` selector

```ts
registerCSS(css: string): string
getScopedStyles(): string       /* SSR: returns all registered CSS as <style> content */
clearScopedStyles(): void       /* SSR: clear between requests */
```

## Server Function Plugin

Separate from `flare()` array. Optional, enabled by `config.serverFn !== false`.

**Transform**: injects unique IDs into `createServerFn()` calls:

```ts
/* Input */
const myFn = createServerFn({ name: "myFn" })

/* Output */
const myFn = createServerFn({ name: "myFn", __id: "a1b2c3d4" })
```

ID computed from file hash + function name. Deterministic across builds.

**Build secret**: generates `randomBytes(32).toString("hex")` at build time. Available via:

```ts
import secret from "virtual:flare-server-fn-secret"
```

Used for HMAC signing of server function RPC calls.

## CSS Transform Plugin

Transforms Tailwind v4 specific syntax:

```css
/* Input */
@theme { --color-primary: #007bff; }
@layer base { ... }

/* Output */
:root { --color-primary: #007bff; }
/* @layer removed */
```

## Test Cases

```
flare:resolver:
  SSR import → resolves to dist/ssr/ path
  Client import → resolves to dist/client/ path
  Non-flare import → not resolved (pass through)
  Enforce pre → runs before other resolvers

flare:generate:
  buildStart → generateRoutes + generateRouteTypes called
  Dev server → watch mode enabled
  File change in src/ → generators re-run
  Change in _gen/ → ignored
  Change in *.gen.ts → ignored
  Debounce: rapid changes → single regeneration

flare:ssr-build:
  Client output → dist/client/
  SSR output → dist/ssr/
  Client chunks → assets/[hash].js
  SSR chunks → assets/[hash].js
  Client entry → assets/client-[hash].js
  Solid deduplicated in resolve.dedupe
  Solid in ssr.noExternal

flare:virtual:
  virtual:flare-config → serialized config
  virtual:client-manifest (prod) → hashed entry path from manifest.json
  virtual:client-manifest (dev) → source path

Solid plugin:
  hydratable: true configured
  ssr: true configured
  .tsx and .jsx extensions

CSS scope:
  css= attribute → transformed to data-c + registerCSS call
  No css= → file unchanged
  Already transformed → skipped
  registerCSS returns hash string
  getScopedStyles collects all registered CSS (SSR)
  clearScopedStyles resets between requests

Server function:
  createServerFn → __id injected
  ID deterministic (file hash + name)
  Build secret generated once per build
  virtual:flare-server-fn-secret → secret string

CSS transform:
  @theme → :root
  @layer → removed
```

## Notes

- `flare()` returns an array — spread into Vite config's `plugins` array
- Plugin order matters: resolver (pre) → generate → ssr-build → virtual → solid
- CSS scope and server function plugins are separate — conditionally included based on config
- Solid plugin MUST have `hydratable: true` — without it, SSR and client hydration keys don't match
- `resolve.dedupe` for Solid is critical — duplicate Solid instances break reactivity completely
- Virtual modules use `\0` prefix convention for Vite virtual module IDs
- Client manifest resolution has production (manifest.json) and dev (source path) modes
- Server function build secret rotates per build — invalidates old signed RPC calls
