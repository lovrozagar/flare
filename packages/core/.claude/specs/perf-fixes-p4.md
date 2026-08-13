# Performance Fixes P4

## Goal

Fix 3 hot-path performance issues found in P4 audit.

## Scope

- In: 3 issues below
- Out: SSR regex literals (V8 caches), addSecurityHeaders clone (immutable response risk), CSP array clones (tiny arrays)

## Tasks

### Task 1: replaceNonce compiles new RegExp per call

- **File**: `src/prerender/index.ts` line 81
- **Problem**: `new RegExp(escapeRegExp(nonce), "g")` compiled on every call — called 2+N times per prerender/ISR (html + each header)
- **Fix**: `.replaceAll(nonce, NONCE_PLACEHOLDER)` — nonce is a plain string, no regex needed
- **Impact**: HIGH — every prerender + ISR background revalidation (7+ regex compilations per operation)

### Task 2: URLSearchParams iterator-to-array for empty check

- **File**: `src/server-fn/index.ts` line 416
- **Problem**: `[...params.keys()].length > 0` converts iterator to array just to check non-empty
- **Fix**: Remove guard, iterate directly — empty params produces zero loop iterations
- **Impact**: MEDIUM — every GET server function call

### Task 3: formDataToObject called identically in both branches

- **File**: `src/server-handler/index.ts` lines 1032, 1043
- **Problem**: `formDataToObject(formData)` traverses FormData twice in both branches of if/else
- **Fix**: Extract before the conditional, reuse in both branches
- **Impact**: LOW — form validation error path only

## Decisions

## Discovered

## Rejected
