# Selective Test Coverage — Gap Filling

## Goal

Fill highest-priority test coverage gaps identified in the survey.

## Scope

- In:
  - Form: handleSubmit error paths (validation error, non-validation error, network error), concurrent submission guard, registerFormActionContextGetter SSR bridge
  - Query Client: createQueryClientGetter server/client behavior, createTrackedQueryClient drain/tracking, hydrateQueryCache edge cases (staleTime, empty)
  - Prerender: loadPrerenderArtifacts (disk I/O mock, store.set, missing manifest, malformed manifest)
- Out:
  - Service worker (already 68+ tests)
  - Image module (lower priority)
  - Styles module (lower priority)
  - Plugin splitting (separate task)

## Decisions

- Use vitest mocks for fetch, filesystem, window checks
- No Solid.js component rendering tests (too heavy for unit) — test pure logic only

## Test Files

1. `tests/unit/form/form-submit.test.ts` — handleSubmit error paths + concurrent guard
2. `tests/unit/form/form-action-context.test.ts` — registerFormActionContextGetter SSR bridge
3. `tests/unit/query-client/create-query-client-getter.test.ts` — server/client factory
4. `tests/unit/query-client/tracked-query-client.test.ts` — createTrackedQueryClient
5. `tests/unit/query-client/hydrate-query-cache.test.ts` — hydrateQueryCache
6. `tests/unit/prerender/load-prerender-artifacts.test.ts` — loadPrerenderArtifacts
