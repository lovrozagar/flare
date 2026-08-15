# Flare Core Audit Fixes — Round 3

## Goal

Fix remaining bugs found in the third post-TSC audit.
Every fix uses strict TDD: write failing test (red), implement fix (green), run ALL tests.

## Approach

- **Unit tests**: `bun run --cwd /home/ecomet/Development/monorepo/public/flare test`
- Every task: write unit tests first (red) -> fix source (green) -> run ALL unit tests
- If any existing test breaks: fix immediately before proceeding
- Zero tolerance for false positives

## Scope

### In scope (ordered by priority)

---

### Task 1: startsWith path boundary bypass in dev-dashboard

**Source**: `src/plugins/dev-dashboard/plugin.ts` line 303
**Bug**: `filePath.startsWith(root)` without trailing slash check. If `root = "/home/user"`, then `filePath = "/home/user2/file.ts"` passes the check because `"/home/user2/file.ts".startsWith("/home/user")` is true. This is an incomplete fix from R2 Task 1 — the execFile + resolve were added but the boundary check is insufficient.

**Unit tests** (`tests/unit/plugins/dev-dashboard-editor.test.ts` — extend existing):

- Path to sibling directory (`../user2/secret`) is rejected
- Root directory without trailing slash still works for valid paths
- Root directory with trailing slash works for valid paths

**Fix**: Normalize root to always end with `/` before the `startsWith` check:

```typescript
const rootWithSlash = root.endsWith("/") ? root : `${root}/`
if (filePath === root || filePath.startsWith(rootWithSlash)) {
```

---

### Task 2: startsWith path boundary bypass in preview static assets

**Source**: `src/plugins/index.ts` line 698
**Bug**: Same boundary issue: `filePath.startsWith(clientDir)` without trailing slash. `/app/assets-evil/file.js` passes if `clientDir = "/app/assets"`.

**Unit tests** (`tests/unit/plugins/preview-static-boundary.test.ts`):

- Valid asset path within clientDir is served
- Path to sibling directory is rejected (returns next())
- URL-encoded traversal is rejected
- Normal asset requests with extensions work correctly

**Fix**: Same pattern — normalize clientDir with trailing slash before startsWith check.

---

### Task 3: Cookie locale value missing .trim()

**Source**: `src/middleware/builtins/i18n.ts` line 41
**Bug**: `match?.[1]?.toLowerCase()` without `.trim()`. Cookie values with trailing whitespace (e.g. `flare.locale=en ` from certain cookie setters) will fail the `localeSet.has()` lookup, causing the middleware to ignore a valid locale cookie.

**Unit tests** (`tests/unit/middleware/i18n-cookie-trim.test.ts`):

- Cookie value `en` matches correctly
- Cookie value `en ` (trailing space) matches correctly
- Cookie value `en` (both sides) matches correctly
- Cookie value `EN` matches (case-insensitive)
- Cookie value with tab character matches
- Invalid locale still returns null

**Fix**: Add `.trim()` after regex extraction:

```typescript
const locale = match?.[1]?.trim().toLowerCase();
```

---

### Task 4: formData parsing error returns 500 instead of 400

**Source**: `src/server-handler/index.ts` line 971
**Bug**: `await request.formData()` is outside the inner try-catch (line 995). If the form body is malformed (corrupt multipart, incomplete boundary), the exception propagates to the outer catch (line 1580) which returns a generic 500 error. A malformed request body should return 400 Bad Request.

**Unit tests** (`tests/unit/server-handler/formdata-parse-error.test.ts`):

- Valid form POST with \_\_flare_fn processes correctly (existing behavior)
- Malformed form body returns 400, not 500
- Missing content-type boundary returns 400
- Empty form body returns 400

**Fix**: Wrap the `await request.formData()` call in its own try-catch that returns a 400 response:

```typescript
let formData: FormData;
try {
	formData = await request.formData();
} catch {
	return addSecurityHeaders(new Response("Bad Request", { status: 400 }), secHeaders);
}
```

---

## Out of scope

- CSS head client maps (verified: properly cleaned via refCount + delete)
- SSR stream reader hang on pipeTo failure (Streams spec guarantees readable cancellation)
- SSRF in apiProxy rewrite (developer callback, not user-controlled input)
- Regex lastIndex in purge.ts (.replace() resets lastIndex internally)
- staticAssets ASSETS.fetch error handling (standard middleware, caught by server-handler)
- console.error in keepalive (style issue, not a bug)
- i18n .replace() first occurrence only (correct — locale is always first segment)
- Service worker silent .catch() (intentional, non-critical)
- Broadcast registry refCount (theoretical, requires Solid cleanup failure)
- visitedRoutes Set unbounded (finite route IDs in practice, not large objects)
- Deferred GC only on track() (entries resolve within ms during SSR streaming)
- Query client race in NDJSON (dynamic import resolves from cache, not network)
- formData error classification in server-fn (already inside try-catch, returns 500)
- Nonce placeholder collision (placeholder is unique, collision impossible in practice)

## Execution Order

1. Task 1 (dev-dashboard boundary) — security fix, extends existing test file
2. Task 2 (preview static boundary) — security fix, new test file
3. Task 3 (cookie locale trim) — correctness fix, new test file
4. Task 4 (formData 400 response) — correctness fix, new test file

## Validation Protocol (EVERY task)

1. Write unit tests -> `bun run --cwd /home/ecomet/Development/monorepo/public/flare test` -> confirm RED (new tests fail)
2. Implement fix -> same command -> confirm GREEN (all tests pass)
3. Run ALL unit tests -> confirm 0 failures
4. `bunx tsc --noEmit` -> 0 errors
5. `bunx biome check --write <changed files>`
