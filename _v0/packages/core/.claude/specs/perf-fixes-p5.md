# Performance Fixes P5

## Goal

Fix 3 remaining hot-path performance issues. Diminishing returns — these are smaller wins.

## Scope

- In: 3 issues below
- Out: Object.keys() → for...in micro-optimizations (negligible on small objects), addSecurityHeaders clone (immutable response risk)

## Tasks

### Task 1: Head rendering filter+map chains → single loop

- **File**: `src/ssr/head.ts` lines 241-244 and 250-253
- **Problem**: `Object.entries().filter().map().join()` creates 3 intermediate arrays per custom link/meta element
- **Fix**: Single loop building attrs string directly
- **Impact**: MEDIUM — per SSR render with custom head elements

### Task 2: stableStringify intermediate arrays → direct string build

- **File**: `src/router-primitives/match-id.ts` lines 25 and 28
- **Problem**: `.map().join()` creates intermediate arrays for object entries and array values
- **Fix**: Build string directly in a for loop
- **Impact**: LOW-MEDIUM — per matchId computation (every navigation/request)

### Task 3: Duplicate authFn closure → hoist once

- **File**: `src/server-handler/index.ts` lines 949-957 and 994-1002
- **Problem**: Identical closure wrapping `config.authenticateFn` created twice in same request path
- **Fix**: Create once before both branches, reuse
- **Impact**: LOW — DRY + closure dedup on server-fn/form paths

## Decisions

## Discovered

## Rejected

- sortedParams removal: needed for deterministic JSON.stringify key ordering
- isSafeAttrName toLowerCase removal: mixed-case "On..." still needs catching
