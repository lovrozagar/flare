# Performance Fixes P2

## Goal

Fix 3 hot-path performance issues found in P2 audit.

## Scope

- In: 3 issues below
- Out: addSecurityHeaders Response cloning (risky), loader-pipeline object spreads (necessary pattern)

## Tasks

### Task 1: i18n per-request Set + array allocation

- **File**: `src/middleware-builtins/index.ts` lines 111-112
- **Problem**: `new Set(locales.map(l => l.toLowerCase()))` and `["/_fn/", ...skip]` allocated on every request despite stable config
- **Fix**: Cache in closure variables, rebuild only when locales reference changes
- **Impact**: HIGH — every i18n-enabled request

### Task 2: resolvePathParams regex recompilation + while loop

- **File**: `src/url/index.ts` lines 63-71
- **Problem**: `new RegExp(OPTIONAL_SINGLE_RE.source, "g")` compiled per call, then iterative exec/replace loop with lastIndex resets
- **Fix**: Pre-compiled module-level regex `OPTIONAL_SINGLE_CLEANUP_RE`, single `.replace()` call
- **Impact**: HIGH — every URL resolution (navigation, link building)

### Task 3: weakMatch per-call function allocation + unconditional split

- **File**: `src/server-handler/etag.ts` lines 23-30
- **Problem**: `normalize` closure created per call, `.split(",")` array even for single ETag value
- **Fix**: Inline normalize, fast-path for single value (no comma)
- **Impact**: MEDIUM — every conditional request (304 checks)

## Decisions

## Discovered

## Rejected

- addSecurityHeaders Response clone — mutating headers on freshly-created Response works but changes contract for user response handlers
- loader-pipeline object spreads — necessary for creating per-route context objects
