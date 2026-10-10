# Performance Fixes P7

## Goal

Fix 4 hot-path issues — 3 are the P1-P3 bugs still present in the actively exported i18n file, 1 is a new Map spread in deferred resolution.

## Scope

- In: 4 issues below
- Out: orphaned `src/middleware-builtins/index.ts` cleanup (separate task)

## Tasks

### Task 1: getLocaleFromCookie new RegExp per call

- **File**: `src/middleware/builtins/i18n.ts` lines 38-40
- **Problem**: `new RegExp()` compiled per cookie lookup — 4 string replace ops for escaping + regex compilation per request
- **Fix**: Rewrite to string splitting (same as P1 fix applied to wrong file)
- **Impact**: HIGH — runs on every i18n request

### Task 2: Per-request Set/array allocations in i18n closure

- **File**: `src/middleware/builtins/i18n.ts` lines 103-104
- **Problem**: `new Set(locales.map(...))` and `["/_flare/server-fn/", ...skip]` allocated every request despite locale config being static
- **Fix**: Cache in closure outside the returned middleware function (same as P2 fix)
- **Impact**: HIGH — Set + array allocation per request

### Task 3: Dead hasLocaleLikeSegment + redundant segment extraction

- **File**: `src/middleware/builtins/i18n.ts` lines 71-75, 154
- **Problem**: `hasLocaleLikeSegment(pathname)` re-extracts first segment that's already computed at line 134. Function also dead at line 136 (inline already).
- **Fix**: Replace line 154 call with `firstSegment !== "" && LOCALE_LIKE_RE.test(firstSegment)`, remove dead function
- **Impact**: LOW — avoids redundant string ops

### Task 4: Map values spread in deferred resolution

- **File**: `src/caches/index.ts` line 337
- **Problem**: `[...entry.keys.values()].every()` spreads Map values into array just to check if all resolved
- **Fix**: `for...of` loop with early return on first PENDING
- **Impact**: MEDIUM — runs on every deferred value resolution in streaming

## Decisions

## Discovered

## Rejected
