# Flare Framework — Iteration 5

## Context

Iterations 1-4 fixed security vulns, perf issues, dead code, validation gaps, and added ~90 tests. This iteration focuses on function extraction and code organization — the remaining high-value cleanup.

## 1. Outlet void pattern cleanup

**File**: `src/outlet/index.tsx:329-334`

Replace temp variable + void pattern with direct void:

```ts
/* Before */
const _vp = props.match.virtualPath;
const _hasErr = props.match.error;
void _vp;
void _hasErr;

/* After */
void props.match.virtualPath;
void props.match.error;
```

## 2. SSR `buildComponentTree` extraction

**File**: `src/ssr/index.tsx:311-468` (157 lines)

Extract 2 helpers:

| Helper                                    | Responsibility                          |
| ----------------------------------------- | --------------------------------------- |
| `pipelineMatchesToClientMatches(matches)` | Convert PipelineMatch[] → ClientMatch[] |
| `extractRootBoundaries(rootMatch)`        | Root layout → GlobalBoundaries          |

`buildComponentTree` shrinks to ~80 lines of orchestration.

## 3. server-handler `loadRouteModules` type safety

**File**: `src/server-handler/index.ts:236-278`

Replace `...mod.default` spread-cast with explicit property mapping:

```ts
/* Before */
routes.push({
  _type: ...,
  variablePath: key,
  virtualPath: key,
  ...mod.default,
} as ResolvedRoute)

/* After — explicit extraction from module export */
const exported = mod.default as Record<string, unknown>
routes.push({
  _type: ...,
  authenticate: exported.authenticate as ResolvedRoute["authenticate"],
  authorize: exported.authorize as ResolvedRoute["authorize"],
  ...pick typed fields...
})
```

Actually: the spread-cast is a well-known pattern in route module loading (SolidStart, TanStack Router use it too). The exported module IS the route config object. Replacing it with 15+ explicit property assignments adds verbosity without safety (TypeScript still can't validate dynamic imports). Keep the spread-cast but add a comment explaining why.

## 4. runPipeline Phase 1 extraction

**File**: `src/loader-pipeline/index.ts:108-158`

Extract `buildInternalRoutes(routes, config)` — Phase 1 input validation is a self-contained 50-line block.

## 5. Tests for extracted helpers

- Unit tests for `pipelineMatchesToClientMatches()`
- Unit tests for `extractRootBoundaries()`
- Unit tests for `buildInternalRoutes()`

## Execution order

1. Outlet void cleanup (trivial)
2. SSR extraction (pipelineMatchesToClientMatches + extractRootBoundaries)
3. runPipeline Phase 1 extraction
4. Write tests
5. Full suite verification
