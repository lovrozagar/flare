Progress for flare-audit-fixes-r5 created on 2026-03-13 02:05

<!-- session: pending -->
<!-- spec: .claude/specs/audit-fixes-r5.md -->

## Log

- Task 1: `.catch()` → `.catch(() => {})` in query-client broadcast import (3 tests)
- Task 2: `buildCookieHeader` CRLF/null/semicolon sanitization in middleware-builtins (7 tests)
- Final: 324 test files, 6782 tests, 0 TSC errors

## Files

- src/query-client/index.tsx
- src/middleware-builtins/index.ts
- tests/unit/query-client/catch-suppression.test.ts
- tests/unit/middleware-builtins/cookie-header-sanitization.test.ts
