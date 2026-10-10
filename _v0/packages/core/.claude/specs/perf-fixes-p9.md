# Performance Fixes P9

## Goal

Fix 4 remaining hot-path allocation/iteration patterns.

## Scope

- In: 4 issues below
- Out: outlet .find() (3-5 items, Map overhead > linear scan), link new URL() (Solid memo — runs only on dep change)

## Tasks

### Task 1: Defensive array copy in defer entries()

- **File**: `src/defer/index.ts` line 73
- **Problem**: `entries: () => [...entryList]` copies the array on every call. All 3 callers (server-handler length check, ndjson-server iteration, ssr/index iteration) only read — none mutate
- **Fix**: Return `entryList` directly: `entries: () => entryList`
- **Impact**: MEDIUM — eliminates array allocation per defer context per SSR request

### Task 2: new Set from .map() intermediate array in navigation

- **File**: `src/navigation/index.ts` lines 949, 959
- **Problem**: `new Set(matches.map(m => m.matchId))` creates intermediate array just to feed Set constructor
- **Fix**: `for...of` with `.add()` directly
- **Impact**: MEDIUM — runs per client-side navigation

### Task 3: Object.keys().length > 0 for emptiness check

- **File**: `src/ndjson-server/index.ts` line 59, `src/ssr/index.tsx` line 208
- **Problem**: `Object.keys(preloaderContext).length > 0` allocates key array just to check emptiness
- **Fix**: Helper or inline `for...in` with immediate break
- **Impact**: MEDIUM — per match during SSR streaming/serialization

### Task 4: Double .map() over state.ph in hydration

- **File**: `src/hydration/index.ts` lines 182-191
- **Problem**: `state.ph.map(h => h.matchId)` then `state.ph.map(h => ({ head, matchId }))` — iterates array twice, creates 2 intermediate arrays
- **Fix**: Single loop building both arrays
- **Impact**: LOW-MEDIUM — one-time hydration startup

## Decisions

## Discovered

## Rejected

- outlet/index.tsx .find() — matches array is 3-5 items, Map overhead exceeds linear scan
- link/index.tsx new URL() — inside Solid.js createMemo, only re-evaluates when href signal changes
