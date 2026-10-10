# Performance Fixes P3

## Goal

Fix 3 hot-path performance issues found in P3 audit.

## Scope

- In: 3 issues below
- Out: addSecurityHeaders Response clone (risk of immutable headers from user response handlers), SSR regex literals (V8 caches these at parse time)

## Tasks

### Task 1: Duplicate cache key computation in loader pipeline

- **File**: `src/loader-pipeline/index.ts` lines 458-460 and 518-520
- **Problem**: `JSON.stringify(ir.validatedParams)` computed identically twice — once for cache read, once for cache write
- **Fix**: Hoist cache key computation above the try block, reuse for both get and set
- **Impact**: HIGH — every SSR-cached loader execution

### Task 2: Pre-merge helper objects in loader pipeline

- **File**: `src/loader-pipeline/index.ts` lines 232-245, spread at 311-313, 364-366, 495-497
- **Problem**: `...throwHelpers, ...urlHelpers, ...logHelpers` spread 3× per route per phase (preloader, authorize, loader) = 9 spreads per route
- **Fix**: Create `baseHelpers = { ...throwHelpers, ...urlHelpers, ...logHelpers }` once before the loop, spread 1 object instead of 3
- **Impact**: MEDIUM — every route in every request

### Task 3: Duplicate first-segment extraction in i18n middleware

- **File**: `src/middleware-builtins/index.ts` line 177
- **Problem**: `hasLocaleLikeSegment(pathname)` re-extracts first segment + re-tests LOCALE_LIKE_RE, but both were already computed at lines 157-159
- **Fix**: Inline the check using already-extracted `firstSegment`
- **Impact**: LOW-MEDIUM — every i18n-enabled request

## Decisions

- Rejected addSecurityHeaders mutation: user response handlers may return immutable Response objects
- Rejected SSR escapeAttr/escapeHtml regex hoisting: V8/JSC/SpiderMonkey cache regex literals at parse time

## Discovered

## Rejected
