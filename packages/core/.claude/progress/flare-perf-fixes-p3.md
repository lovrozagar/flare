Progress for flare-perf-fixes-p3 created on 2026-03-13 12:35

<!-- session: pending -->
<!-- spec: .claude/specs/perf-fixes-p3.md -->

## Log

- Task 1: Hoisted cache key above try block — eliminates duplicate `JSON.stringify(ir.validatedParams)` per cached loader
- Task 2: Pre-merged `baseHelpers = { ...throwHelpers, ...urlHelpers, ...logHelpers }` — 1 spread instead of 3 per route per phase
- Task 3: Inlined `hasLocaleLikeSegment` using already-extracted `firstSegment` — removed dead function
- Final: 328 test files, 6804 tests, 0 TSC errors

## Files

- src/loader-pipeline/index.ts
- src/middleware-builtins/index.ts
