# Flare TSC Error Cleanup

## Status: In Progress

## Scope: 90 TSC errors across 23 files → 0 errors

---

## Classification Summary

| Category                   | Errors     | Files  | Action                      |
| -------------------------- | ---------- | ------ | --------------------------- |
| Source bugs                | 3          | 2      | Fix source types            |
| Vite 7 API drift           | 12         | 4      | Update plugin types/hooks   |
| Test drift (stale API)     | 22         | 3      | Update test fixtures        |
| Test type safety           | 17         | 6      | Add annotations/fix mocks   |
| Intentional negative tests | 8          | 3      | No action (expected errors) |
| Null narrowing             | 3          | 1      | Add assertion               |
| **Total actionable**       | **57**     | **17** |                             |
| **Intentional (skip)**     | **8**      | **3**  |                             |
| **Net target**             | **82 → 8** |        | 8 intentional remain        |

---

## Group A: Source Bugs (3 errors, 2 files)

### A1. PathSegmentBuilder type conflict

**File:** `src/route-builder/create-path-segment.ts:12`
**Error:** TS2430 — `PathSegmentBuilderInitial` extends `PathSegmentResult` but redefines `cache` from property (`CacheConfig<TPath>`) to method (`(config) => PathSegmentResult`)
**Root cause:** Result type and builder type conflated. `create-page.ts` and `create-layout.ts` correctly separate these.
**Fix:** Split into `PathSegmentBuilderAfterCache` (terminal, no `cache` method) and `PathSegmentBuilderInitial` (extends after-cache, adds `cache()` method). Remove `extends PathSegmentResult` from builder.

```typescript
/* Before */
interface PathSegmentBuilderInitial<TPath extends string> extends PathSegmentResult<TPath> {
	cache(config: CacheConfig<TPath>): PathSegmentResult<TPath>
}

/* After */
interface PathSegmentBuilderInitial<TPath extends string> {
	_type: "layout"
	cache(config: CacheConfig<TPath>): PathSegmentResult<TPath>
	render: (props: { children: unknown }) => unknown
	virtualPath: TPath
	[BUILDER_MARKER]: true
}
```

### A2. `this.resolve()` removed in Vite 7

**File:** `src/plugins/dev-dashboard/plugin.ts:276,333`
**Error:** TS2551 — `this.resolve()` doesn't exist on `VitePlugin`
**Root cause:** Vite 7 removed `this.resolve()` from plugin context. Used to locate `flare/plugins` package path.
**Fix:** Resolve path statically via `import.meta.resolve` or `createRequire` at module scope, not inside hook context.

```typescript
/* Before (inside buildStart) */
const resolved = await this.resolve("flare/plugins")

/* After (module scope) */
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const pluginsDir = dirname(require.resolve("flare/plugins"))
```

---

## Group B: Vite 7 API Drift (12 errors, 4 files)

### B1. VitePlugin interface divergence

**File:** `src/plugins/index.ts:131-156`
**Errors:** TS2352 ×5 — config hook type, casts fail
**Root cause:** Custom `VitePlugin` interface doesn't match Vite 7's `Plugin` type. `config` hook can be `ObjectHook<fn>`.
**Fix:** Update `VitePlugin` interface to match Vite 7 signatures:

- `load()` returns `string | null` (not `undefined`)
- `resolveId()` returns `string | null` (not `undefined`)
- `config()` signature matches Vite 7's `ConfigHook`

### B2. Dashboard plugin hook signatures

**File:** `src/plugins/dev-dashboard/plugin.ts:329,349`
**Errors:** TS2322 ×2 — `load()` returns `undefined`, `resolveId()` returns `undefined`
**Fix:** Return `null` instead of implicit `undefined` for unhandled cases:

```typescript
/* Before */
resolveId(id: string) {
  if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
}

/* After */
resolveId(id: string) {
  if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
  return null
}
```

### B3. Dev-prerender module typing

**File:** `src/plugins/dev-prerender.ts:89`
**Error:** TS2339 — `handler` not on `{}`
**Root cause:** `ssrRunner.import()` returns `Record<string, unknown>` but accessed without narrowing.
**Fix:** The `SsrEnvironment.runner.import` already returns `Promise<Record<string, unknown>>`. Access via bracket notation:

```typescript
const mod = await ssrRunner.import("./src/server")
const exported =
	mod["handler"] ?? (mod["default"] as Record<string, unknown> | undefined)?.["handler"]
const handler = exported as ServerHandler | undefined
```

### B4. Purge test config hook casts

**File:** `tests/unit/plugins/purge-integration.test.ts:79,94,121,136,149`
**Errors:** TS2352 ×5 — cast `plugin.config` as function but Vite 7 wraps in `ObjectHook`
**Fix:** Extract handler from ObjectHook pattern:

```typescript
/* Before */
const configHook = plugin?.config as (cfg, env) => Record<string, unknown> | undefined

/* After */
function getConfigHook(plugin: Plugin | undefined) {
	const raw = plugin?.config
	if (typeof raw === "function") return raw
	if (raw && typeof raw === "object" && "handler" in raw) {
		return (raw as { handler: (...args: unknown[]) => unknown }).handler
	}
	return undefined
}
```

---

## Group C: Test Drift — Stale API (22 errors, 3 files)

### C1. Static params type mismatch

**File:** `tests/unit/server-handler/validate-static-params.test.ts`
**Errors:** TS2353 ×20 — `params`/`dynamicParams` not on cache config
**Root cause:** `SsgCacheConfig<TPath>` and `IsrCacheConfig<TPath>` use conditional types — `params`/`dynamicParams` only exist when `HasDynamicSegments<TPath>` is `true`. But `ResolvedRoute` uses the builder's `CacheConfig` type, while the test uses the generator's `ExtractedCacheConfig`-like flat shape.
**Analysis:** The test's `makeRoute()` creates mock `ResolvedRoute` objects with `cache` property. The `cache` field on `ResolvedRoute` uses `CacheConfig<string>` which resolves `HasDynamicSegments<string>` to `false`, making the `params` branch `never`.
**Fix:** The `makeRoute` helper should use a literal path type. Change the mock to use the actual path:

```typescript
/* Before */
function makeRoute(overrides: Partial<ResolvedRoute> = {}): ResolvedRoute {
  return { ..., variablePath: "_root_/[slug]" } as ResolvedRoute
}

/* After — use specific path generic */
function makeRoute<TPath extends string = "_root_/[slug]">(
  overrides: Partial<ResolvedRoute<TPath>> = {},
): ResolvedRoute<TPath> {
  return { ..., variablePath: "_root_/[slug]" as TPath } as ResolvedRoute<TPath>
}
```

**Alternative (if ResolvedRoute isn't generic):** The `cache` objects in tests should match the runtime shape used by `validateStaticParams`. If the function operates on the flat `ExtractedCacheConfig` shape (from generators), update the mock to use that type. If it operates on `CacheConfig`, the function signature may need updating to accept the flat shape it actually receives at runtime.

**Investigation needed:** Check what type `validateStaticParams` actually expects and whether `ResolvedRoute.cache` is typed as `CacheConfig<TPath>` or `ExtractedCacheConfig`.

### C2. isrFallback obsolete property

**File:** `tests/unit/plugins/dev-prerender-deep.test.ts:140`
**Error:** TS2353 — `isrFallback` not on `ExtractedCacheConfig`
**Root cause:** `ExtractedCacheConfig` has `isrDynamicParams` not `isrFallback`. Property was renamed.
**Fix:** Replace `isrFallback: false` with `isrDynamicParams: false`.

### C3. LogLevel missing "debug"

**File:** `tests/unit/plugins/plugins.test.ts:199 (line ~549 in full)`
**Error:** TS2322 — `"debug"` not assignable to `LogLevel`
**Root cause:** `LogLevel = "error" | "silent" | "verbose" | "warn"`. No `"debug"` level.
**Fix:** Either add `"debug"` to `LogLevel` (if intentional) or change test to `"verbose"`.

---

## Group D: Test Type Safety (17 errors, 6 files)

### D1. Server `ctx` implicit any

**Files:** `tests/unit/server/create-server.test.ts` (7), `create-server-types.test.ts` (3), `waituntil-wiring.test.ts` (2)
**Errors:** TS7006 ×13 — `ctx` implicitly `any`
**Root cause:** `.use()` accepts `FlareMiddleware | PathMatcher | string` union. When passing inline `async (ctx) => ...`, TS can't infer `ctx` from the union.
**Fix:** Annotate callbacks:

```typescript
import type { MiddlewareContext } from "../../../src/middleware"

/* Before */
.use(async (ctx) => ctx.next())

/* After */
.use(async (ctx: MiddlewareContext) => ctx.next())
```

### D2. Locale config missing `paramName`

**File:** `tests/unit/locale/router-locale-sync.test.ts:84`
**Error:** TS2339 — `paramName` not on inline config object
**Root cause:** Config created as `{ defaultLocale, locales }` without optional `paramName`. TypeScript infers narrow literal type.
**Fix:** Add `paramName?: string` to the inline type or type the config:

```typescript
const config: { defaultLocale: string; locales: readonly string[]; paramName?: string } = {
	defaultLocale: "en",
	locales: ["en", "hr"] as const,
}
```

### D3. i18n cookie cycle mock context

**File:** `tests/unit/locale/i18n-cookie-cycle.test.ts:15-27`
**Error:** TS2352 — mock `MiddlewareContext` missing `bypass`/`next`/`respond`
**Root cause:** `makeCtx()` creates partial context cast `as MiddlewareContext`. Missing required methods.
**Fix:** The `runMiddlewares` function signature already accepts partial ctx (see `middleware/index.ts:55`). Use `Omit<MiddlewareContext, "bypass" | "next" | "respond">` as return type, then let `runMiddlewares` handle the rest. Or add stub methods to the mock.

### D4. Form mock fn type

**File:** `tests/unit/form/form.test.tsx:15`
**Error:** TS2322 — `async (ctx) => ctx.input` not assignable to stream fn type
**Root cause:** `ServerFnRegistration = ServerFnHandlerRegistration | ServerFnStreamRegistration`. The `fn` field is a union of handler (returns value) and stream (returns AsyncGenerator). The mock uses handler style but TS can't narrow.
**Fix:** Explicitly type the overrides to match `ServerFnHandlerRegistration`:

```typescript
fn._registration = {
	authenticate: false,
	fn: async (ctx: { input: unknown }) => ctx.input,
	id: "test-fn-id",
	method: "post",
	name: "testFn",
	stream: false as const,
	...overrides,
} satisfies ServerFnHandlerRegistration
```

### D5. Outlet retry test casts

**File:** `tests/unit/outlet/outlet-retry.test.tsx:302,318`
**Errors:** TS2352 ×2, TS2493 ×1 — unsafe cast to `Record<string, unknown>`, tuple access
**Root cause:** Test accesses private `_setNavigate` via `(ctx as Record<string, unknown>)._setNavigate`. `FlareProviderContext` doesn't expose this.
**Fix:** Since `_setNavigate` is defined via `Object.defineProperty` (outlet/index.tsx:163), create a type helper:

```typescript
type CtxWithInternals = FlareProviderContext & {
	_setNavigate?: (fn: unknown) => void
}
```

---

## Group E: Broadcast Null Narrowing (3 errors, 1 file)

### E1. Registry null check

**File:** `tests/unit/broadcast/hooks.test.tsx:541,569,575`
**Error:** TS18047 — `registry` possibly null
**Root cause:** `_getRegistryForTest()` returns `typeof registry | null`. Safe at runtime in test env but TS can't prove it.
**Fix:** Assert non-null after call:

```typescript
const registry = _getRegistryForTest()
if (!registry) throw new Error("expected registry in test env")
expect(registry.has("cart")).toBe(true)
```

---

## Group F: Intentional Negative Tests (8 errors, 3 files) — NO ACTION

| File                                        | Count | Purpose                           |
| ------------------------------------------- | ----- | --------------------------------- |
| `tests/unit/i18n/type-safety.test.ts`       | 4     | Invalid translation keys rejected |
| `tests/unit/i18n/type-check.ts`             | 2     | Namespace/key validation          |
| `tests/unit/i18n/create-translator.test.ts` | 2     | `@ts-expect-error` guards         |

These use `@ts-expect-error` annotations and are correct. They should continue producing errors — that's the test.

---

## Execution Order

TDD not applicable — these are type fixes, not behavioral changes. All 6648 tests must remain passing.

1. **A1** — PathSegmentBuilder (1 error, source)
2. **A2 + B2** — Dashboard plugin `this.resolve()` + hook returns (5 errors, source)
3. **B1** — VitePlugin interface (5 errors, source)
4. **B3** — Dev-prerender typing (2 errors, source)
5. **C1** — Static params test fixtures (20 errors, test)
6. **C2** — isrFallback rename (1 error, test)
7. **C3** — LogLevel "debug" (1 error, test)
8. **D1** — Server ctx annotations (13 errors, test)
9. **D2** — Locale paramName (1 error, test)
10. **D3** — i18n cookie mock (1 error, test)
11. **D4** — Form mock fn (1 error, test)
12. **D5** — Outlet retry casts (3 errors, test)
13. **E1** — Broadcast null (3 errors, test)
14. **B4** — Purge test config hook (5 errors, test)

**Validation after each step:**

- `bun run test` — all 6648 tests pass
- `bunx tsc --noEmit 2>&1 | grep "error TS" | wc -l` — error count decreasing
- `bunx biome check --write <changed files>`
