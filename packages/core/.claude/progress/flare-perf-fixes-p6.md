Progress for flare-perf-fixes-p6 created on 2026-03-13 13:00

<!-- session: pending -->
<!-- spec: .claude/specs/perf-fixes-p6.md -->

## Log

- Task 1: Cached `escapedNonce = escapeAttr(config.nonce)` in `buildScriptTags` and `injectHeadContent` — saves 2 redundant escapeAttr calls (8 string replaces) per SSR
- Task 2: Merged hyInit injection into `injectHeadContent` via `extraSuffix` param — eliminates second `</head>` buffer scan in streaming
- Task 3: perRouteHeads `filter().map()` → single `for...of` loop with conditional push
- Final: 328 test files, 6804 tests, 0 TSC errors

## Files

- src/ssr/index.tsx
