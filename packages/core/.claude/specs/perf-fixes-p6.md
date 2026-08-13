# Performance Fixes P6

## Goal

Fix 3 remaining SSR/streaming performance issues.

## Scope

- In: 3 issues below
- Out: Client-side Link memo URL dedup (Solid.js memo semantics make this tricky)

## Tasks

### Task 1: Cache escapedNonce in buildScriptTags and injectHeadContent

- **File**: `src/ssr/index.tsx` lines 305, 311 (buildScriptTags) and 541, 556 (injectHeadContent)
- **Problem**: `escapeAttr(config.nonce)` called 2x in each function — each call runs 4 sequential `.replace()` operations
- **Fix**: Cache `const escapedNonce = escapeAttr(config.nonce)` once per function, reuse
- **Impact**: MEDIUM — saves 8 string replace ops per SSR render

### Task 2: Merge hyInit into injectHeadContent to avoid double scan

- **File**: `src/ssr/index.tsx` lines 672-683
- **Problem**: `injectHeadContent()` scans buffer for `</head>`, then line 682 scans AGAIN for `</head>` to inject hyInit
- **Fix**: Pass hyInit as optional suffix param to `injectHeadContent`, merge into single `</head>` replacement
- **Impact**: MEDIUM — eliminates one full buffer scan per SSR render

### Task 3: perRouteHeads filter+map → single loop

- **File**: `src/ssr/index.tsx` lines 234-236
- **Problem**: `.filter(m => m.headConfig).map(...)` creates intermediate filtered array
- **Fix**: Single loop with conditional push
- **Impact**: LOW — 3-5 items typical

## Decisions

## Discovered

## Rejected
