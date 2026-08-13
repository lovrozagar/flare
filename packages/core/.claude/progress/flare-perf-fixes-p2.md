Progress for flare-perf-fixes-p2 created on 2026-03-13 12:25

<!-- session: pending -->
<!-- spec: .claude/specs/perf-fixes-p2.md -->

## Log

- Task 1: i18n per-request Set/array → closure-cached with reference check (lines 100-130)
- Task 2: resolvePathParams `new RegExp()` + while loop → single pre-compiled `.replace()` (lines 63-71 → 1 line)
- Task 3: weakMatch closure + unconditional split → inlined normalize + single-value fast path
- Final: 328 test files, 6804 tests, 0 TSC errors

## Files

- src/middleware-builtins/index.ts
- src/url/index.ts
- src/server-handler/etag.ts
