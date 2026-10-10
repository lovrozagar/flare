Progress for flare-perf-fixes-p8 created on 2026-03-13 13:15

<!-- session: pending -->
<!-- spec: .claude/specs/perf-fixes-p8.md -->

## Log

- Task 1: `Array.from().some()` in server-handler deferred check → `for...of` with early break
- Task 2: `Array.from().flatMap()` in ndjson-server + ssr/index.tsx → nested `for...of` into single array
- Task 3: `lines.map().join()` in ndjson-server (2 locations) → single loop string concatenation
- Task 4: `Object.keys().some()` for cache-control check → `for...in` with early break
- Final: 328 test files, 6804 tests, 0 TSC errors

## Files

- src/server-handler/index.ts
- src/ndjson-server/index.ts
- src/ssr/index.tsx
- src/loader-pipeline/index.ts
