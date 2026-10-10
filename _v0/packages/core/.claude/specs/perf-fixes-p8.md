# Performance Fixes P8

## Goal

Fix 4 hot-path Array.from/map+join patterns in SSR streaming and request handling.

## Scope

- In: 4 issues below
- Out: map+join on small arrays (timing header, srcset, i18n tokens — <=5 items, negligible)

## Tasks

### Task 1: Array.from().some() in server-handler deferred check

- **File**: `src/server-handler/index.ts` lines 1453-1455
- **Problem**: `Array.from(pipelineResult.deferContexts.values()).some(...)` materializes entire Map into array just to check if any context has entries
- **Fix**: `for...of` over `.values()` with early return
- **Impact**: MEDIUM — runs per SSR request with deferred data

### Task 2: Array.from().flatMap() in ndjson-server and ssr/index.tsx

- **File**: `src/ndjson-server/index.ts` line 240, `src/ssr/index.tsx` line 742
- **Problem**: `Array.from(deferContexts.values()).flatMap(ctx => ctx.entries())` — double allocation (array from Map, then flatMap intermediate)
- **Fix**: `for...of` with push into single array
- **Impact**: MEDIUM — streaming response generation

### Task 3: lines.map().join() in ndjson-server

- **File**: `src/ndjson-server/index.ts` lines 191, 275
- **Problem**: `lines.map(l => l + "\n").join("")` creates intermediate string array
- **Fix**: Single loop string concatenation with `\n`
- **Impact**: LOW-MEDIUM — per NDJSON response (both static and redirect)

### Task 4: Object.keys().some() for cache-control check

- **File**: `src/loader-pipeline/index.ts` line 631
- **Problem**: `Object.keys(routeHeaders).some(k => k.toLowerCase() === "cache-control")` allocates key array to find one property
- **Fix**: `for...in` with early return
- **Impact**: LOW — small header objects but runs per-route

## Decisions

## Discovered

## Rejected
