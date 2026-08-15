# Flare Framework — Iteration 6

## Context

Iterations 1-5 addressed security, perf, bugs, dead code, validation, and function extraction. This iteration focuses on TSC error elimination and a real bug fix.

## Items

1. **Bug: `serverFnMutationOptions` ignores registration method** — hardcodes POST, should check `reg?.method`
2. **Deduplicate `mergeResponseHeaders`** — two implementations in ssr + pipeline
3. **Fix `ParamsValidator` type** — too narrow, doesn't accept `string[]` for catch-all params
4. **Fix test TSC errors** — server-fn integration tests missing `id`, server-handler-deep missing `id`, server-fn unit test `TInput` inference, state-parser callback narrowing
5. **Fix `query-client` TSC errors** — observer callback type, TError bounds
6. **Fix navigate() formatting** — misindented redirect call

## Execution order

1. Bug fix (mutation method)
2. Deduplicate mergeResponseHeaders
3. Fix ParamsValidator type (removes source casts)
4. Fix test TSC errors
5. Fix query-client TSC errors
6. Fix formatting
7. Full test suite verification
