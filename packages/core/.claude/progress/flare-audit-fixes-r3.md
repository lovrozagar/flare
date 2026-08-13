Progress for flare-audit-fixes-r3 created on 2026-03-13 01:35

<!-- session: pending -->
<!-- spec: .claude/specs/audit-fixes-r3.md -->

## Log

- Task 1: startsWith boundary in dev-dashboard — trailing slash normalization (+3 tests)
- Task 2: startsWith boundary in preview assets — trailing slash normalization (6 tests)
- Task 3: Cookie locale missing .trim() — add .trim() before .toLowerCase() (9 tests)
- Task 4: formData parse error returns 400 — try-catch wrapping (3 tests)
- Final: 321 test files, 6769 tests, 0 TSC errors

## Files

- src/plugins/dev-dashboard/plugin.ts
- src/plugins/index.ts
- src/middleware/builtins/i18n.ts
- src/server-handler/index.ts
- tests/unit/plugins/dev-dashboard-editor.test.ts
- tests/unit/plugins/preview-static-boundary.test.ts
- tests/unit/middleware/i18n-cookie-trim.test.ts
- tests/unit/server-handler/formdata-parse-error.test.ts
