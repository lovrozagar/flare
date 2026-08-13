# Debug: Nitro dev-server integration tests fail — spy never called

## Current Focus

hypothesis: CONFIRMED — req.socket is undefined in mock, causes TypeError before fetch is reached
test: verified via node REPL and code tracing
next: report findings

## Symptoms

expected: mockFetch / namedFetch spies called at least once
actual: spies never called, tests fail with "expected spy to be called at least once"
errors: AssertionError at lines 1179 and 1237
reproduction: `bunx vitest run tests/unit/plugins/plugins.test.ts -t "Nitro integration"`

## Eliminated

(none needed — root cause found on first hypothesis)

## Evidence

- src/plugins/index.ts:480 accesses `(req.socket as ...).encrypted`: mock req has no `socket` property, so this throws TypeError
- TypeError is caught by catch block at line 520-525, which calls `next(e)` — fetch is never reached
- Confirmed via `node -e` that `undefined.encrypted` throws "Cannot read properties of undefined"

## Log

- [x] (2026-03-12) (debug) read test file, identified mock objects
- [x] (2026-03-12) (debug) read src/plugins/index.ts createDevServerPlugin
- [x] (2026-03-12) (debug) traced execution: runner.import -> handler assignment -> URL construction -> CRASH
- [x] (2026-03-12) (debug) confirmed req.socket undefined causes TypeError

## Files

- tests/unit/plugins/plugins.test.ts (lines 1125-1239)
- src/plugins/index.ts (lines 441-531, specifically line 480)
