Progress for error-message-dx created on 2026-03-13 14:00

<!-- session: complete -->
<!-- spec: .claude/specs/error-message-dx.md -->

## Log

- Cat A: 7 provider/hook context errors — added provider name + wrapping hint
- Cat B: 6 config/setup errors — added API usage examples
- Cat C: 2 redirect loop errors — added redirect count + last target URL
- Cat D: 4 server function errors — added fn name + HTTP status code
- Cat E: 5 hydration/testing errors — added "Test failed:" prefix + error count
- Updated 11 test files with new assertion substrings
- Final: 328 test files, 6804 tests, 0 TSC errors

## Files

- src/outlet/index.tsx
- src/locale/index.tsx
- src/direction/index.tsx
- src/theme/index.tsx
- src/server-context/index.ts
- src/components/locale-script.tsx
- src/navigation/index.ts
- src/middleware-builtins/index.ts
- src/middleware/builtins/i18n.ts
- src/revalidation/index.ts
- src/plugins/index.ts
- src/server-handler/index.ts
- src/server-fn-query.ts
- src/server-fn/index.ts
- src/hydrate/index.tsx
- src/testing/index.ts
- tests/unit/server-context/server-context-deep.test.ts
- tests/unit/server-context/background.test.ts
- tests/unit/server-context/server-context.test.ts
- tests/unit/direction/direction-deep.test.tsx
- tests/unit/direction/direction.test.ts
- tests/unit/locale/locale-provider.test.ts
- tests/unit/navigation/navigation-error-paths.test.ts
- tests/unit/revalidation/revalidation-edge-cases.test.ts
- tests/unit/theme/theme.test.ts
- tests/unit/theme/theme-deep.test.tsx
- tests/unit/testing/testing.test.ts
