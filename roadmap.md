<!-- MANAGED by workerc — edit content freely but keep the format conventions intact.
     workerc parses step IDs (1.a.1), statuses ([ ] / [x] / [!]), phase/track headers,
     and the metadata lines. /workerc:done marks steps [x], /workerc:status reads progress. -->

# roadmap — flare

  milestone  standalone-ready
  active     4.a.1
  updated    2026-08-13

## Phase 1 — Standalone workspace
  goal    This directory is a bun workspace that typechecks on TypeScript 7 and installs without the parent monorepo
  status  complete

### Track 1.a — Extract                            [sequential]
  [x] 1.a.1   Scaffold root (package.json, bunfig, tsconfig.base, gitignore, LICENSE, README)
  [x] 1.a.2   Move core/cli to packages/*, publish name `flare`
  [x] 1.a.3   Remap `flare` → `flare` and relative `../core` plugin imports
  [x] 1.a.4   `bun install` + `bun run typecheck` on TypeScript 7.0.2
  [x] 1.a.5   `bun run test` (core vitest) is green, or each fail is triaged

## Phase 2 — Consumers
  goal    Examples import `flare` over `workspace:*` the way a real app would
  status  complete

### Track 2.a — Workspace members                  [sequential]
  [x] 2.a.1   e2e, real-world, consumer/*, benchmark resolve `flare` from the workspace
  [x] 2.a.2   `bun run typecheck:consumers` on e2e + real-world + a representative consumer
  [x] 2.a.3   `@flare/cli` installs and its unit tests run

## Phase 3 — Playwright e2e
  goal    `bun run test:e2e` proves the current product through a Honey-shaped consumer
  status  complete

### Track 3.a — Suites                             [sequential]
  [x] 3.a.1   Make the extract Playwright suite green or skip-with-reason (now `e2e-archive`)
  [x] 3.a.2   Honey-shaped `e2e/app` + `e2e/node`; new suite is the default proof
  [ ] 3.a.3   Add bun / workers harnesses when those runtimes need proof

## Phase 4 — UI kit
  goal    `flare-ui` is honest about its Base UI dependency and is in or out of this repo
  status  pending

### Track 4.a — solidports                         [sequential]
  [ ] 4.a.1   Decide: publish `@solidports/base-ui`, switch to `@msviderok/base-ui-solid`, or keep UI parked
  [ ] 4.a.2   Wire `flare-ui` + ui-consumer once the dependency is installable here

## Phase 5 — Ship the extract
  goal    Parked — iterate on the product, not git/npm, until the default suite is honest
  status  parked

### Track 5.a — Git + npm                          [sequential]
  [ ] 5.a.1   Commit remaining standalone-ready work
  [ ] 5.a.2   Push `origin/main` (parked until 1.a.5)
  [ ] 5.a.3   npm publish `flare` (parked)
