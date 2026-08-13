# Audit Fixes Round 6

## Goal

Fix 2 verified bugs from R6 deep audit.

## Scope

- In: 2 bugs below
- Out: everything else

## Tasks

### Task 1: Service Worker indexOf for keepalive — should be exact match

- **File**: `src/service-worker/template.ts` line 90
- **Bug**: `url.pathname.indexOf("/_flare/keepalive") !== -1` matches substring anywhere in path
- **Fix**: `url.pathname === "/_flare/keepalive"` (matches middleware handler which uses exact match)
- **TDD**: Test showing indexOf vs === behavior difference

### Task 2: cdnProxy missing CRLF/backslash validation in middleware-builtins

- **File**: `src/middleware-builtins/index.ts` line 374
- **Bug**: Only checks `..` and `\0`, missing `\\`, `\r`, `\n` that `middleware/builtins/cdn-proxy.ts` has
- **Fix**: Add `key.includes("\\") || key.includes("\r") || key.includes("\n")` to match the other version
- **TDD**: Test showing CRLF/backslash keys are rejected

## Decisions

## Discovered

## Rejected
