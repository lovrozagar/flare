Progress for flare-perf-fixes-p4 created on 2026-03-13 12:40

<!-- session: pending -->
<!-- spec: .claude/specs/perf-fixes-p4.md -->

## Log

- Task 1: `replaceNonce` `new RegExp(escapeRegExp(nonce), "g")` → `.replaceAll(nonce, NONCE_PLACEHOLDER)` — removed dead `escapeRegExp` function
- Task 2: `[...params.keys()].length > 0` → single-pass iteration with `hasParams` flag — eliminates iterator-to-array conversion
- Task 3: `formDataToObject(formData)` called in both if/else branches → extracted once before conditional
- Final: 328 test files, 6804 tests, 0 TSC errors

## Files

- src/prerender/index.ts
- src/server-fn/index.ts
- src/server-handler/index.ts
