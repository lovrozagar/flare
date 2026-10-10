# Flare Core Audit Fixes

## Goal

Fix all remaining bugs, memory leaks, and security gaps found in the post-TSC audit.
Every fix uses strict TDD: write failing test (red), implement fix (green), run ALL tests.

## Approach

- **Unit tests**: `bun run --cwd /home/ecomet/Development/monorepo/public/flare test`
- **E2E tests**: `cd /home/ecomet/Development/monorepo/public/flare-e2e && bunx playwright test`
- **Prod E2E**: `cd /home/ecomet/Development/monorepo/public/flare-e2e && TEST_MODE=prod bunx playwright test`
- Every task: write unit tests first (red) -> fix source (green) -> write E2E tests if applicable -> run ALL unit + E2E tests
- If any existing test breaks: fix immediately before proceeding
- Zero tolerance for false positives

## Scope

### In scope (ordered by priority)

---

### ~~Task 1: `stripHandlerBodies` cursor off-by-one~~ FALSE POSITIVE

`cursor = i` is correct — the `)` gets included via the next `code.slice(cursor, ...)`. Changing to `i + 1` would LOSE the closing paren. Verified by tracing single-handler and multi-handler cases.

---

### Task 2: Unbounded `paramsCache` memory leak

**Source**: `src/server-handler/validate-static-params.ts` line 57
**Bug**: `paramsCache` Map grows without limit. In production with varied URL params, memory grows indefinitely. No max size, no TTL, no eviction.

**Unit tests** (`tests/unit/server-handler/params-cache-bounds.test.ts`):

- Cache stores result on first call
- Cache returns cached result on subsequent calls (existing behavior confirmed)
- Cache evicts oldest entries when exceeding max size (LRU-style)
- Cache size never exceeds bound (e.g. 500 entries)
- `clearParamsCache()` still works
- Dev mode skips cache (existing behavior confirmed)
- Concurrent calls with same key don't duplicate entries

**E2E tests**: Not directly testable (internal cache), covered by `ssg-param-validation.test.ts` existing tests.

**Fix**: Add `MAX_CACHE_SIZE` constant. Before inserting, check `paramsCache.size >= MAX_CACHE_SIZE` and delete oldest entry (first key via `paramsCache.keys().next().value`). Simple FIFO eviction.

---

### Task 3: Async CDN middleware not awaited

**Source**: `src/plugins/dev-cdn-cache.ts` line 211
**Bug**: `handleCdnRequest(req, res, next, store, revalidating)` is async but not awaited inside a sync callback. The `next()` call inside `handleCdnRequest` may execute after the outer middleware chain has already proceeded.

**Unit tests** (`tests/unit/plugins/dev-cdn-cache-async.test.ts`):

- Middleware awaits async handler before calling next
- If handler throws, error propagates to middleware error handler
- Response headers set by handler are present before next() runs
- Concurrent requests don't interleave handler execution unsafely

**E2E tests** (`e2e/deep-cdn-cache-async.test.ts`):

- CDN-cached route returns correct Cache-Control header on first hit
- CDN-cached route returns stale-while-revalidate response correctly
- Two rapid requests to same CDN route don't produce corrupted headers

**Fix**: Make the middleware callback `async` and `await handleCdnRequest(...)`.

---

### Task 4: Streaming generator cleanup race

**Source**: `src/server-fn/index.ts` lines 465, 473, 482
**Bug**: `void iterator.return(undefined)` — fire-and-forget cleanup. If `cancel()` fires while `pull()` is mid-execution, `iterator.return()` can be called twice. Also, if `return()` throws, rejection is unhandled.

**Unit tests** (`tests/unit/server-fn/stream-cleanup.test.ts`):

- Generator cleanup awaited on normal stream completion
- Generator cleanup awaited on stream cancellation
- Concurrent cancel during pull doesn't call return() twice
- Generator return() rejection is caught (not unhandled)
- Generator that throws in return() doesn't crash the stream
- AbortController.abort() fires before iterator cleanup

**E2E tests** (`e2e/deep-stream-cleanup.test.ts`):

- Streaming server function completes full response
- Client-side navigation abort during stream doesn't cause page error
- Rapid navigation away during active stream doesn't leak resources
- Stream error mid-flight shows error state correctly

**Fix**: Track cleanup state with `let cleaned = false` flag. Guard both `cancel()` and error paths. `await iterator.return(undefined).catch(() => {})` instead of `void`.

---

### Task 5: i18n locale cookie header injection

**Source**: `src/middleware/builtins/i18n.ts` lines 138-191
**Bug**: Cookie `Set-Cookie` header built from user-provided locale string. If locale contains `\r\n` or `;`, attacker can inject arbitrary headers or cookie attributes.

**Unit tests** (`tests/unit/middleware/i18n-header-injection.test.ts`):

- Valid locale passes through: "en", "hr", "fr"
- Locale with `\r\n` is rejected/sanitized
- Locale with `;` is rejected/sanitized
- Locale with `%0d%0a` (encoded CRLF) is rejected/sanitized
- Locale with null byte is rejected/sanitized
- Locale not in allowed list is rejected (falls back to default)
- Cookie value matches exactly the sanitized locale
- Multiple Set-Cookie headers not injected from single locale

**E2E tests** (`e2e/deep-i18n-injection.test.ts`):

- Normal locale switch sets correct cookie
- Request with CRLF in locale path segment returns 404 (not reflected)
- Request with semicolon in locale returns 404
- Cookie value for valid locale is correctly formatted
- No extra Set-Cookie headers appear for crafted locales

**Fix**: Validate locale against the configured `locales` array before use in cookie. If locale not in allowed list, use `defaultLocale`. Additionally, strip any `\r`, `\n`, `;`, `\0` from locale as defense-in-depth.

---

### Task 6: CDN proxy path traversal hardening

**Source**: `src/middleware/builtins/cdn-proxy.ts` lines 36-37
**Bug**: Only checks for `..` and null bytes. Missing: unicode normalization attacks, double-encoding, backslash variants.

**Unit tests** (`tests/unit/middleware/cdn-proxy-traversal.test.ts`):

- `../` blocked
- `..%2f` (encoded slash) blocked
- `..%5c` (encoded backslash) blocked
- `%2e%2e/` (encoded dots) blocked
- `....//` (double dots) blocked
- `\0` (null byte) blocked
- Normal paths pass through: `/assets/image.png`, `/css/style.css`
- Paths with valid dots: `/file.name.ext`, `/.well-known/`
- Unicode normalization: `%c0%ae%c0%ae/` blocked
- Path with backslash `..\\` blocked

**E2E tests** (`e2e/deep-cdn-proxy-traversal.test.ts`):

- Normal static asset request succeeds
- Request with `../` in path returns 400
- Request with encoded traversal returns 400
- Request with null byte returns 400

**Fix**: After decoding, normalize the path and check `resolved.startsWith(root)`. Also reject any path containing `\0`, `\r`, `\n`. Use `decodeURIComponent` in a try-catch (reject on decode failure).

---

### Task 7: CSRF origin validation for GET server functions

**Source**: `src/server-fn/index.ts` lines 311-319
**Bug**: `validateOrigin()` returns `true` for all GET requests. GET server functions that perform mutations (if any exist) are vulnerable to CSRF. Standard CSRF protection should at minimum validate the Origin header for state-changing operations regardless of HTTP method.

**Unit tests** (`tests/unit/server-fn/csrf-get.test.ts`):

- GET request with matching origin passes
- GET request with no origin header passes (same-origin browser behavior)
- GET request with mismatched origin is rejected
- POST request with mismatched origin is rejected (existing behavior)
- GET request from different origin returns 403
- Referer header used as fallback when Origin missing

**E2E tests** (`e2e/deep-csrf-get.test.ts`):

- GET server function with valid origin succeeds
- GET server function with cross-origin header fails with 403
- POST server function CSRF still works (regression check)

**Fix**: Remove the early `if (method === "GET") return true` bypass. Apply origin validation to all methods. If no Origin header, fall back to Referer check. If neither present, allow (same-origin requests from some browsers omit Origin on GET).

---

### Task 8: Link prefetch listener accumulation

**Source**: `src/link/index.tsx` lines 267-302
**Bug**: When `prefetch` prop changes, `setupPrefetchBehavior` re-runs but old event listeners (hover, intersection observer) are not removed before new ones are added. Leads to duplicate prefetch triggers.

**Unit tests** (`tests/unit/link/prefetch-listener-cleanup.test.ts`):

- Initial prefetch="hover" adds mouseenter listener
- Changing to prefetch="viewport" removes mouseenter, adds IntersectionObserver
- Changing to prefetch="none" removes all listeners
- Changing back to "hover" only has one listener (not accumulated)
- Component unmount cleans up all listeners

**E2E tests** (`e2e/deep-prefetch-cleanup.test.ts`):

- Link with prefetch="hover" prefetches on hover
- Dynamic prefetch prop change doesn't double-prefetch
- Navigation after prefetch prop change works correctly

**Fix**: Store cleanup function from previous `setupPrefetchBehavior` call. Call it before setting up new strategy. Use Solid's `onCleanup` properly within the effect.

---

### Task 9: Navigation `setupNavigation` handler accumulation

**Source**: `src/navigation/index.ts` lines 294, 318
**Bug**: Multiple `setupNavigation()` calls (e.g., hot reload) stack GC intervals and visibility event handlers without clearing previous ones.

**Unit tests** (`tests/unit/navigation/setup-idempotent.test.ts`):

- First setup creates GC interval
- Second setup clears previous GC interval before creating new one
- Visibility handler not duplicated after re-setup
- `resetNavigationState()` clears everything

**E2E tests**: Covered by existing navigation tests (no new routes needed, just verify no console errors on HMR).

**Fix**: Store interval/handler references in module scope. Clear them at the start of `setupNavigation()` before creating new ones.

---

## Out of scope

- `as unknown as` casts in route builder (necessary for builder pattern, tracked for future)
- `JSON.parse` without zod in plugins (manifest shape is controlled, not user input)
- VitePlugin interface completeness (intentional subset, not a real-world issue)
- Font file formatting (generated code)
- Layout/root-layout boundary exclusion parity (no failing tests, cosmetic type issue)
- `HasDynamicSegments` pattern for bare `[id]` (not a valid Flare path pattern)

## Execution Order

1. Task 1 (stripHandlerBodies) — isolated parser bug, no dependencies
2. Task 2 (paramsCache) — isolated memory fix
3. Task 3 (CDN middleware await) — simple async fix
4. Task 4 (stream cleanup) — server-fn fix
5. Task 5 (i18n injection) — security fix
6. Task 6 (CDN proxy traversal) — security hardening
7. Task 7 (CSRF GET) — security fix
8. Task 8 (prefetch listeners) — client-side fix
9. Task 9 (navigation setup) — client-side fix

## Validation Protocol (EVERY task)

1. Write unit tests -> `bun run --cwd /home/ecomet/Development/monorepo/public/flare test` -> confirm RED (new tests fail)
2. Implement fix -> same command -> confirm GREEN (all tests pass)
3. Write E2E tests if applicable -> `bunx playwright test` -> confirm GREEN
4. Run ALL unit tests -> confirm 0 failures
5. Run ALL E2E tests -> confirm 0 failures
6. `bunx tsc --noEmit` -> 0 errors
7. `bunx biome check --write <changed files>`
