# Config

Layer 7. Tooling. No internal deps (consumed by plugins and generators).

Build-time configuration for Flare apps. Defines paths, features, global options, and security defaults.

## Types

```ts
interface FlareBuildConfig {
	/* Entry points */
	clientEntryFilePath?: string /* default: "src/client.ts" */
	serverEntryFilePath?: string /* default: "src/server.ts" */

	/* Generation */
	generated?: {
		routesFilePath?: string /* default: "src/_gen/routes.gen.ts" */
		typesFilePath?: string /* default: "src/_gen/types.gen.d.ts" */
	}
	ignorePrefix?: string /* default: "_" */

	/* Global boundaries */
	globalBoundaries?: GlobalBoundariesConfig

	/* Features */
	css?: CssConfig | false
	serverFn?: ServerFnConfig | false
	viewTransitions?: boolean
}

interface GlobalBoundariesConfig {
	error?: string /* file path to error boundary component */
	notFound?: string /* file path to 404 component */
	unauthorized?: string /* file path to 401/403 component */
}

interface CssConfig {
	scoped?: boolean /* enable css= attribute transform */
}

interface ServerFnConfig {
	exclude?: RegExp
	include?: RegExp
}
```

## Exports

```ts
createFlareBuild(config: FlareBuildConfig): MarkedFlareBuildConfig
isFlareBuildConfig(value: unknown): value is MarkedFlareBuildConfig
```

## Behavior

### `createFlareBuild`

Factory for build config. Marks the config object with a symbol for runtime identification.

```ts
const MARKER = Symbol.for("flare/build-config")

function createFlareBuild(config: FlareBuildConfig): MarkedFlareBuildConfig {
	return { ...config, [MARKER]: true }
}
```

Used in `vite.config.ts`:

```ts
import { flare, createFlareBuild } from "flare/plugins"

const config = createFlareBuild({
	clientEntryFilePath: "./src/client.ts",
	globalBoundaries: {
		error: "./src/boundaries/error.tsx",
		notFound: "./src/boundaries/not-found.tsx",
	},
})

export default defineConfig({
	plugins: [...flare(config)],
})
```

### `isFlareBuildConfig`

Runtime check for marker symbol:

```ts
function isFlareBuildConfig(value: unknown): value is MarkedFlareBuildConfig {
	return value !== null && typeof value === "object" && MARKER in value && value[MARKER] === true
}
```

### Defaults

| Field                      | Default                     | Notes                                         |
| -------------------------- | --------------------------- | --------------------------------------------- |
| `clientEntryFilePath`      | `"src/client.ts"`           | Client bootstrap entry                        |
| `serverEntryFilePath`      | `"src/server.ts"`           | Server handler entry                          |
| `generated.routesFilePath` | `"src/_gen/routes.gen.ts"`  | Route manifest output                         |
| `generated.typesFilePath`  | `"src/_gen/types.gen.d.ts"` | Type declarations output                      |
| `ignorePrefix`             | `"_"`                       | Files starting with this skipped by generator |
| `css`                      | `{ scoped: true }`          | CSS scope transform enabled                   |
| `serverFn`                 | `{}` (enabled)              | Server functions enabled                      |
| `viewTransitions`          | `false`                     | Opt-in view transitions                       |

### Global Boundaries

File paths resolved relative to project root. Generator imports them in the route manifest:

```ts
globalBoundaries: {
  error: "./src/boundaries/error.tsx",
  notFound: "./src/boundaries/not-found.tsx",
  unauthorized: "./src/boundaries/unauthorized.tsx",
}
```

These become the last-resort boundaries when no per-route boundary catches an error (spec 10).

### Security Defaults

Flare provides security header defaults via the server handler (not build config):

```ts
const SECURITY_HEADERS = {
	"Cross-Origin-Opener-Policy": "same-origin-allow-popups",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
}

const CSP_DEFAULTS = {
	"base-uri": ["'self'"],
	"connect-src": ["'self'", "https:"],
	"default-src": ["'self'"],
	"img-src": ["'self'", "data:", "https:"],
	"script-src": ["'self'", "'strict-dynamic'"],
	"style-src": ["'self'", "'unsafe-inline'"],
	"upgrade-insecure-requests": true,
}
```

Nonce added at runtime via `generateNonce()` (spec 05). `'strict-dynamic'` + nonce for scripts.

## Test Cases

```
createFlareBuild:
  Returns config with marker symbol
  Preserves all provided fields
  No mutation of input object

isFlareBuildConfig:
  Marked config → true
  Plain object → false
  null → false
  undefined → false
  Object with wrong marker → false

Defaults:
  No clientEntryFilePath → "src/client.ts"
  No serverEntryFilePath → "src/server.ts"
  No ignorePrefix → "_"
  No css → scoped enabled
  No serverFn → enabled
  No viewTransitions → false

Global boundaries:
  error path → imported in manifest as global error boundary
  notFound path → imported as global notFound boundary
  unauthorized path → imported as global unauthorized boundary
  Missing boundary → framework minimal fallback
  All optional

Route option defaults:
  Moved to createRouter() (spec 25) — single source for runtime defaults
  Per-route .options() overrides specific fields from router config
```

## Notes

- `createFlareBuild` is the entry point for all Flare Vite configuration
- Symbol marker enables runtime type checking without `instanceof`
- Security headers are server-side defaults, not build config — applied by server handler
- CSP nonce injected per-request — `'strict-dynamic'` propagates trust to dynamically loaded scripts
- `ignorePrefix: "_"` means `_utils.ts`, `_helpers/` etc. are invisible to the route generator
- Route option defaults (staleTime, gcTime, prefetch, etc.) live in `createRouter()` (spec 25), not build config
- View transitions are opt-in — not all apps want transition animations
- Generated file paths configurable for monorepo flexibility (non-standard `src/` layouts)
