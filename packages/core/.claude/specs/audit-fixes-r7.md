# Audit Fixes Round 7

## Goal

Fix 1 verified bug from R7 deep audit.

## Scope

- In: 1 bug below
- Out: everything else

## Tasks

### Task 1: Service worker hook missing cleanup for async-registered listeners

- **File**: `src/service-worker-hook/index.ts`
- **Bug**: `statechange` (line 33) and `updatefound` (line 44) listeners registered inside `sw.ready.then()` are never cleaned up. Solid's `onCleanup()` must be called synchronously — can't be called inside async `.then()`. If component unmounts, these listeners leak.
- **Fix**: Track listener refs in outer scope, remove them in the existing `onCleanup`
- **TDD**: RED test proving listeners accumulate without cleanup, GREEN after fix

## Decisions

## Discovered

## Rejected
