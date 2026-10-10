# Performance Fixes P1

## Goal

Fix 3 hot-path performance issues found in P1 audit.

## Scope

- In: 3 issues below
- Out: SSR buffer strategy (large refactor), client-side issues (separate round)

## Tasks

### Task 1: Nonce RegExp compilation on every cached response

- **File**: `src/server-handler/index.ts` lines 1284, 1306
- **Problem**: `new RegExp(NONCE_PLACEHOLDER, "g")` compiled per header + per HTML body on every ISR/SSG cache hit
- **Fix**: `.replaceAll(NONCE_PLACEHOLDER, nonce)` — no regex needed, NONCE_PLACEHOLDER is a plain string
- **Impact**: HIGH — every cached response

### Task 2: Cookie regex compilation in i18n middleware

- **File**: `src/middleware-builtins/index.ts` lines 42-46
- **Problem**: `cookieName.replace(regex)` + `new RegExp(...)` compiled on every request
- **Fix**: Pre-compile regex in middleware closure (once at setup, not per-request)
- **Impact**: MEDIUM — every i18n-enabled request

### Task 3: Redundant tree traversal in NDJSON client

- **File**: `src/ndjson-client/index.ts` lines 178-179
- **Problem**: `containsDeferredMarkers()` walks entire data tree, then `hydrateLoaderData()` walks it again
- **Fix**: Have `hydrateLoaderData` return `{data, foundDeferred}` to combine both passes
- **Impact**: HIGH — every NDJSON navigation with loader data

## Decisions

## Discovered

## Rejected
