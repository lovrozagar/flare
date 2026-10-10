Progress for flare-perf-fixes-p9 created on 2026-03-13 13:25

<!-- session: pending -->
<!-- spec: .claude/specs/perf-fixes-p9.md -->

## Log

- Task 1: `entries: () => [...entryList]` → `entries: () => entryList` — all 3 callers only read, defensive copy unnecessary
- Task 2: `new Set(array.map())` at 2 locations in navigation → `for...of` with `.add()` — eliminates intermediate array
- Task 3: `Object.keys().length > 0` in ndjson-server + ssr/index.tsx → `for...in` with immediate break — avoids key array allocation
- Task 4: Double `.map()` over `state.ph` in hydration → single `for...of` building both arrays
- Final: 328 test files, 6804 tests, 0 TSC errors

## Files

- src/defer/index.ts
- src/navigation/index.ts
- src/ndjson-server/index.ts
- src/ssr/index.tsx
- src/hydration/index.ts
