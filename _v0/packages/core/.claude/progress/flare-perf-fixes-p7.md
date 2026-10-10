Progress for flare-perf-fixes-p7 created on 2026-03-13 13:10

<!-- session: pending -->
<!-- spec: .claude/specs/perf-fixes-p7.md -->

## Log

- Task 1: `getLocaleFromCookie` in exported i18n — `new RegExp()` per call → string splitting (same P1 fix, wrong file was fixed before)
- Task 2: Per-request `new Set()`/array allocations → closure-cached with reference equality check on `locales`
- Task 3: Dead `hasLocaleLikeSegment` function removed, call site inlined using already-extracted `firstSegment`
- Task 4: `[...entry.keys.values()].every()` → `for...of` with early break on PENDING
- Discovery: P1-P3 fixes were applied to orphaned `src/middleware-builtins/index.ts`, while the actually exported `src/middleware/builtins/i18n.ts` had all 3 bugs
- Final: 328 test files, 6804 tests, 0 TSC errors

## Files

- src/middleware/builtins/i18n.ts
- src/caches/index.ts
