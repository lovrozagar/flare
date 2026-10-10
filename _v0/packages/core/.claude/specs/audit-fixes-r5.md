# Audit Fixes Round 5

## Goal

Fix 2 verified bugs from R5 deep audit.

## Scope

- In: 2 bugs below
- Out: everything else

## Tasks

### Task 1: `.catch()` with no argument does not suppress errors

- **File**: `src/query-client/index.tsx` line ~119
- **Bug**: `.catch()` with no callback does NOT suppress unhandled promise rejection
- **Fix**: `.catch(() => {})`
- **TDD**: Write test proving `.catch()` vs `.catch(() => {})` behavior

### Task 2: `buildCookieHeader` missing CRLF/null sanitization

- **File**: `src/middleware-builtins/index.ts` line ~87-89
- **Bug**: Set-Cookie header constructed without sanitizing `\r\n;\0` — allows header injection
- **Fix**: `.replace(/[\r\n;\0]/g, "")` on cookie value before constructing header
- **TDD**: Write test proving unsanitized values pass through vs sanitized

## Decisions

## Discovered

## Rejected
