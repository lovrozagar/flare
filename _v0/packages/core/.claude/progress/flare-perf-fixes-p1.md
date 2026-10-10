Progress for flare-perf-fixes-p1 created on 2026-03-13 03:00

<!-- session: pending -->
<!-- spec: .claude/specs/perf-fixes-p1.md -->

## Log

- Task 1: nonce RegExp → `.replaceAll()` on lines 1284, 1306 — eliminates regex compilation per cached response
- Task 2: cookie regex → string split in `getLocaleFromCookie` — eliminates both `cookieName.replace()` + `new RegExp()` per request
- Task 3: double tree traversal → resolver map size delta — eliminates `containsDeferredMarkers()` call in non-prefetch path
- Final: 328 test files, 6804 tests, 0 TSC errors

## Files

- src/server-handler/index.ts
- src/middleware-builtins/index.ts
- src/ndjson-client/index.ts
