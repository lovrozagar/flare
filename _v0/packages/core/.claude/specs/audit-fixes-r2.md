# Flare Core Audit Fixes — Round 2

## Goal

Fix all remaining bugs and security gaps found in the second post-TSC audit.
Every fix uses strict TDD: write failing test (red), implement fix (green), run ALL tests.

## Approach

- **Unit tests**: `bun run --cwd /home/ecomet/Development/monorepo/public/flare test`
- Every task: write unit tests first (red) -> fix source (green) -> run ALL unit tests
- If any existing test breaks: fix immediately before proceeding
- Zero tolerance for false positives

## Scope

### In scope (ordered by priority)

---

### Task 1: Shell injection in dev-dashboard open-editor

**Source**: `src/plugins/dev-dashboard/plugin.ts` lines 300-310
**Bug**: `exec(\`code --goto "${filePath}"\`)`passes user-controlled`file`query param through`exec()`with string interpolation. Attacker can inject shell commands via`"; malicious_cmd; echo "`. Also: no path validation that resolved path stays within project root, no error handling on exec/import, unhandled promise rejection on dynamic import.

**Unit tests** (`tests/unit/plugins/dev-dashboard-editor.test.ts`):

- Normal file path opens correctly (e.g. `src/app.ts`)
- Path with shell metacharacters (`"; rm -rf /; echo "`) does NOT execute injection
- Path with backticks does NOT execute injection
- Path with `$()` does NOT execute injection
- Path traversal (`../../etc/passwd`) is rejected (stays within root)
- Missing file param returns 204 without exec
- exec error does not crash server (error handled)

**Fix**: Replace `exec()` with `execFile("code", ["--goto", filePath])` which does not use shell. Validate `filePath` starts with `root` after `join()` + `resolve()`. Add `.catch()` on dynamic import promise.

---

### Task 2: Unhandled URL construction in rewrite functions

**Source**: `src/rewrite/index.ts` lines 11, 18
**Bug**: `new URL(result, url)` throws `TypeError` if user rewrite function returns malformed URL string. No try-catch. Crashes the entire request.

**Unit tests** (`tests/unit/rewrite/rewrite-url-safety.test.ts`):

- Valid rewrite string (relative path) works: `/new-path` -> URL with correct pathname
- Valid rewrite string (full URL) works: `https://example.com/path`
- Invalid rewrite string returns original URL (no throw): `not a url!!!`
- Rewrite function that throws returns original URL (no crash)
- Rewrite function returning `null`/`undefined` returns original URL
- Input rewrite and output rewrite both guarded
- `composeRewrites` chains handle errors in input and output independently

**Fix**: Wrap `new URL(result, url)` in try-catch in both `executeRewriteInput` and `executeRewriteOutput`. On failure, return the original `url` unchanged. Also wrap the entire rewrite function call in try-catch to handle user function throws.

---

### Task 3: Unhandled exceptions in api-proxy middleware

**Source**: `src/middleware/builtins/api-proxy.ts` lines 39, 44-47
**Bug**: Two unhandled exception sources:

1. `new URL(targetPath, ctx.url.origin)` throws if `config.rewrite()` returns invalid path
2. `config.headers()` user function can throw, crashing middleware chain

**Unit tests** (`tests/unit/middleware/api-proxy-safety.test.ts`):

- Normal proxy request works (valid rewrite + headers)
- `config.rewrite()` returning malformed path returns 502 (not crash)
- `config.rewrite()` throwing returns 502 (not crash)
- `config.headers()` throwing returns 502 (not crash)
- Missing config.headers (undefined) works fine
- Target fetch failure returns 502
- Non-matching path prefix passes to next()

**Fix**: Wrap the entire proxy logic in try-catch. On error, return 502 Bad Gateway response via `ctx.bypass()`.

---

### Task 4: Global state trampling in deferred resolvers

**Source**: `src/state-parser/index.ts` lines 156-176
**Bug**: `globalThis.__flare_r`, `__flare_re`, `__flare_defer` overwritten unconditionally. If multiple Flare app instances hydrate on the same page, the second instance's resolver overwrites the first, breaking deferred data resolution for instance 1.

**Unit tests** (`tests/unit/state-parser/deferred-multi-instance.test.ts`):

- Single instance: resolvers installed and work correctly
- Single instance: cleanup removes globals after all resolved
- Two instances: both resolvers receive their respective entries
- Two instances: first instance's entries still resolve after second installs
- Late-arriving push (via `__flare_defer.push`) routes to correct resolver
- Cleanup only removes globals when ALL instances are drained

**Fix**: Instead of overwriting globals, compose resolvers. Store previous `__flare_r`/`__flare_re` before overwriting. In the new resolver, call through to the previous one if the key doesn't match any pending resolver in the current instance. Track instance count; only delete globals when all instances have cleaned up.

---

### Task 5: Unvalidated staleTime in query cache resolver

**Source**: `src/state-parser/index.ts` lines 195-203
**Bug**: `e.staleTime` from SSR streamed data is cast and passed to `setQueryDefaults()` without validation. NaN, Infinity, negative numbers, or non-number types could corrupt query client behavior.

**Unit tests** (`tests/unit/state-parser/query-cache-staletime.test.ts`):

- Valid positive staleTime applied: `5000` -> sets query defaults
- Zero staleTime applied: `0` -> sets query defaults
- `undefined` staleTime skipped (no setQueryDefaults call)
- `null` staleTime skipped
- `NaN` staleTime skipped (not applied)
- `Infinity` staleTime skipped
- Negative staleTime skipped
- Non-number staleTime (string "5000") skipped
- Valid entry with staleTime + data both applied correctly

**Fix**: Add validation before `setQueryDefaults`: `if (typeof e.staleTime === "number" && Number.isFinite(e.staleTime) && e.staleTime >= 0)`.

---

## Out of scope

- Vary header dedup casing (verified: toLowerCase comparison is correct)
- static-assets.ts error handling (standard middleware propagation, caught by server-handler)
- filesystem store JSON.parse (correctly returns null on parse failure)
- File watcher cleanup (httpServer always exists in Vite dev mode, `?.` is defensive)
- Silent .catch() on broadcast import (intentional, non-critical)
- console.error in keepalive (style issue, not a bug)
- View transition .ready rejection swallow (intentional WebKit workaround)
- Broadcast registry refCount (theoretical, requires Solid cleanup failure)
- NONCE_PLACEHOLDER regex efficiency (performance, not correctness)
- Numeric meta fields in head.ts (type-constrained, user-defined, NaN impossible in practice)

## Execution Order

1. Task 1 (shell injection) — critical security fix, isolated to dev-dashboard
2. Task 2 (rewrite URL safety) — high-impact crash fix, isolated module
3. Task 3 (api-proxy safety) — high-impact crash fix, isolated middleware
4. Task 4 (deferred multi-instance) — medium, requires careful composition
5. Task 5 (staleTime validation) — medium, simple validation

## Validation Protocol (EVERY task)

1. Write unit tests -> `bun run --cwd /home/ecomet/Development/monorepo/public/flare test` -> confirm RED (new tests fail)
2. Implement fix -> same command -> confirm GREEN (all tests pass)
3. Run ALL unit tests -> confirm 0 failures
4. `bunx tsc --noEmit` -> 0 errors
5. `bunx biome check --write <changed files>`
