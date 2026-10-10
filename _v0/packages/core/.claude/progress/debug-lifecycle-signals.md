# Debug: lifecycle-signals test failures

## Current Focus

hypothesis: Tests expect `onIdle` and `onInteraction` methods on createClient builder, but these methods were never implemented
test: Compare test expectations vs actual ClientBuilder interface and implementation
next: Report findings, await user decision on fix approach

## Symptoms

expected: `createClient(router).onIdle(fn).onIdle(fn)` chains successfully; `createClient(router).onInteraction(fn)` chains; mixed chaining works
actual: `TypeError: createClient(...).onIdle is not a function` / `createClient(...).onInteraction is not a function`
errors: 3 failing tests in "multiple callbacks via createClient" describe block
reproduction: `cd /home/ecomet/Development/monorepo/public/flare && bunx vitest run tests/unit/client/lifecycle-signals.test.ts`

## Eliminated

(none yet)

## Evidence

- `src/client/index.ts`: `ClientBuilder` interface only has `onHydrated` and `onReady`. No `onIdle`, no `onInteraction`.
- `src/client/index.ts`: `createClient` impl object only has `onHydrated` and `onReady` methods.
- `src/hydrate/index.tsx`: `HydrateOptions` has `onHydrated` and `onContextReady`. No `onIdle`, no `onInteraction`.
- Tests line 136-142 (HydrateOptions shape): pass because they only check TS type conformance at runtime with assigned object literals -- the `onIdle`/`onInteraction` keys exist as plain object properties regardless of the interface.
- Tests lines 155-178: fail because they call `.onIdle()` and `.onInteraction()` as chained methods on the builder, which doesn't have them.
- The `ClientBuilder` type uses an exclusion pattern (TExcluded) to make methods callable only once. Tests expect `onIdle` to be callable multiple times (no exclusion).

## Log

- [ ] (2026-03-08) (debug) Ran tests: 3 failed, 7 passed
- [ ] (2026-03-08) (debug) Read test file and source, identified root cause

## Files

- tests/unit/client/lifecycle-signals.test.ts
- src/client/index.ts
- src/hydrate/index.tsx
