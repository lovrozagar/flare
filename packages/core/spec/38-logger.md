# Logger

Layer 0 (pure, no deps). Internal logging system with build-time configurable log levels via Vite plugin.

## Types

```ts
type LogLevel = "error" | "silent" | "verbose" | "warn"
```

Priority: `silent(0) < error(1) < warn(2) < verbose(3)`. A function fires only if `currentLevel >= functionLevel`.

## Exports

```ts
type LogLevel = "error" | "silent" | "verbose" | "warn"

warn(tag: string, msg: string, data?: unknown): void     /* fires at level >= 2 (warn) */
error(tag: string, msg: string, data?: unknown): void     /* fires at level >= 1 (error) */
verbose(tag: string, msg: string, data?: unknown): void   /* fires at level >= 3 (verbose) */
```

## Behavior

### Log Level

Resolved at build time via `virtual:flare-log-level` virtual module. The Vite plugin picks the level from `FlarePluginConfig.console` based on build mode:

- **Dev default (`"warn"`)**: `error()` and `warn()` fire, `verbose()` suppressed
- **Prod default (`"error"`)**: only `error()` fires, `warn()` and `verbose()` suppressed
- **`"silent"`**: nothing fires
- **`"verbose"`**: everything fires

### Plugin Config

```ts
interface ConsoleConfig {
	logLevel?: LogLevel
	strip?: ("log" | "warn")[] | boolean
}

interface FlarePluginConfig {
	console?: { dev?: ConsoleConfig; prod?: ConsoleConfig }
}
```

- `console.dev.logLevel` — flare logger level for dev builds (default: `"warn"`)
- `console.prod.logLevel` — flare logger level for prod builds (default: `"error"`)
- `console.prod.strip` — remove `console.*` calls via esbuild pure (prod only, opt-in)
  - `true` → strips `console.log` and `console.warn`
  - `["log"]` → only strips `console.log`

### Output Format

```
[flare:TAG] msg data
```

- `warn()` → `console.warn`
- `error()` → `console.error`
- `verbose()` → `console.log`
- `data` arg omitted from console call when `undefined`

### Build-Time Stripping

`FlarePluginConfig.console.prod.strip` removes console calls at build time:

- `true` → `esbuild.pure: ["console.log", "console.warn"]` in prod
- `["log"]` → only strips `console.log`
- Dev mode → ignored

## Test Cases

```
defaults:
  Dev → level is "warn" (via virtual module)
  Prod → level is "error" (via virtual module)

warn():
  Fires at "warn" and "verbose" levels
  Silent at "error" and "silent" levels

error():
  Fires at "error", "warn", "verbose" levels
  Silent at "silent" level

verbose():
  Fires only at "verbose" level
  Silent at "warn", "error", "silent" levels

output format:
  Outputs [flare:TAG] msg data
  Omits data arg when undefined
  verbose uses console.log with same format

plugin config:
  console.prod.strip: true → esbuild.pure in prod
  console.prod.strip: ["log"] → only console.log stripped
  console omitted → no strip plugin
  dev mode → strip ignored
  console.dev.logLevel overrides dev default
  console.prod.logLevel overrides prod default
```

## Notes

- Log level is now a build-time constant via `virtual:flare-log-level` — no runtime mutation
- `setLogLevel`/`getLogLevel` removed — no longer needed
- `RouterConfig.logLevel` removed — was a footgun (e.g. csvme setting `logLevel: "error"` killed dev warnings)
- `LogLevel` type exported from `logger.ts` only (removed re-export from `router-config`)
