# 00 — Construction rules

## What "done" means for a file

A source file is done when all of the following hold:

1. Its row is in `files.tsv`, with the bit that gave birth to it.
2. Its sibling test exists, was written first, and was seen failing before the source satisfied it.
3. The bit lists every case the test covers.
4. Coverage for that file is 100% lines, branches, functions, and statements.
5. The file respects the limits and the environment rules below.

The commit that adds the source also adds the test. `main` stays green. The failing run happens in the working tree before the source is written, and the person who writes it records that run in the commit message (`red: <test name>`). There is no tool that copies tests onto the parent commit.

## Where tests live

Unit tests sit next to the file they exercise.

```
src/server/lifecycle/finalize.ts
src/server/lifecycle/finalize.test.ts
```

`files.tsv` lists both. A `src` or `lint` or `script` row with no sibling test row is a blueprint error.

These files have no sibling test, and coverage excludes them:

- `kind = index` — the folder's `index.ts` or an `src/exports/*.ts`. The file contains only `export { ... } from "./..."`. A structure test fails the build if any other statement appears.
- `kind = types` — `import type` and `export type` only. A value export moves the file to `kind = src` and adds a test.
- `kind = app` — exercised by the e2e or golden test named in the bit, not by a unit sibling. v1 has no `template` rows (B75).
- `kind = corpus` — data read by the sibling test of the module.

Tests that boot a server, a browser, or workerd span many files. They live under `packages/core/tests/` and are rows of `kind = test`. They do not replace unit siblings. How many e2e apps exist, and which runtime boots them, is B70. A new app directory is a change to that decision.

## Coverage

Vitest, `@vitest/coverage-v8`.

- Include: `packages/core/src/**`, `packages/core/lint/**`.
- Exclude: `**/*.test.ts`, `**/*.test.tsx`, `**/*.d.ts`, `**/index.ts`, `src/exports/**`, `packages/core/src/features/fonts/shared/generated/**`.
- Thresholds, per file: lines 100, branches 100, functions 100, statements 100.
- `v8 ignore` is forbidden. The lint rule `flare/no-v8-ignore` rejects the comment. Uncovered code is deleted or given a case.
- A branch that can run only inside workerd is written so the decision function is pure and covered under Node. The workerd test proves the adapter calls that function. No file depends on workerd for its coverage number.

Oxlintrc turns on the vitest rules that reject a test with no assertion, a conditional assertion, and a focused or skipped test.

## TDD inside one file

For each case in the bit, in the order the bit lists them:

1. Add the `it(...)` to the sibling test.
2. Run that test. It fails on an assertion, or on a missing export the first time the file is created.
3. Write the smallest source that makes it pass.
4. Re-run the file's tests.

A case that is not in the bit is not added. A branch that exists only to satisfy coverage, with no case in the bit, is not added. When a real case appears later, the later bit names it.

## How a file is shaped

A file has one reason to exist, and that reason is the responsibility column in `files.tsv`. When a second reason appears, the blueprint gains a new row and the code goes in the new file.

A reader should be able to hold the file in their head. The limits below are the stop. Hitting a limit means the design is wrong, not that the limit should move. Nesting, flags that change the meaning of the rest of the function, and a function that both decides and performs I/O are the shapes that made v0 hard to read. Split the decision into a pure function with a table of cases, and let the caller perform the I/O.

Comments are for a constraint that the code cannot show: a security reason, a platform bug, a pitfall called out in `dx/`. A comment that restates the next line is deleted.

## File limits

| | |
| --- | --- |
| Source file | 300 lines |
| Test file | 500 lines |
| Function | 60 lines |
| Cyclomatic complexity | 15 |
| Parameters | 3, plus one `ctx` object when a function needs more |
| Nesting depth | 4 |

A file that would pass a limit by growing is split in the blueprint first: new row, new sibling test, then code.

Names are kebab-case files, camelCase functions, PascalCase components and errors. No file named `utils`, `helpers`, or `misc`. No barrel `export *`.

## Environments

| folder | may use | must not use |
| --- | --- | --- |
| `shared/`, `features/*/shared/` | ECMAScript, `Intl`, `URL`, `TextEncoder`, `crypto.subtle`, Solid and `@solidjs/web` isomorphic exports | DOM globals, `process`, `Buffer`, `node:*`, `Bun`, `caches` |
| `client/`, `features/*/client/` | the above, plus DOM | `process`, `Buffer`, `node:*`, `Bun` |
| `server/`, `features/*/server/` | the above minus DOM, plus Fetch, streams, WebCrypto | DOM globals, `process`, `node:*`, `Bun`, `caches`. Env arrives as `fetch(request, env, ctx)` |
| `adapters/<runtime>/` | server, plus that runtime | any other runtime's builtins |
| `adapters/stores/fs/` | server, plus Node | any other runtime's builtins |
| `adapters/stores/cache-api/` | server, plus `caches` | `node:*`, `Bun` |
| `vite/`, `features/*/vite/` | Node | imported from a runtime entry |

Import arrows, and no others, except the three providers named below:

```
shared → shared
client → shared, client
server → shared, server
adapters → shared, server
vite → shared, vite, features/*/vite, and adapters/node from vite/dev/ only: the dev handler hosts the app server through the same Node bridge an app uses
features/F/shared → shared, features/F/shared
features/F/client → shared, client, features/F/shared, features/F/client
features/F/server → shared, server, features/F/shared, features/F/server
features/F/vite → shared, vite, features/F/shared, features/F/vite
src/exports/<entry> → the modules that entry is allowed to publish
```

A feature does not import another feature. A file under `src/` does not import `@lovrozagar/flare`. A cross-module import goes through that module's `index.ts`. `virtual:` imports live only in a `virtual.ts` inside the consuming module. There is no `virtual.ts` in v1; the row exists so one cannot appear without a blueprint change.

Three files may import `client/sync` through `client/sync/index.ts`: `features/theme/shared/provider.tsx`, `features/direction/shared/provider.tsx`, and `features/i18n/shared/provider.tsx`. No other file under `features/*/shared` may import `client/`.

`src/exports/*.ts` may import a feature entry to publish it. No other file may.

## Module state

A module-scope `let`, `map`, or cache is forbidden unless the line carries `// per-process-constant: <reason>` and the reason is one of: build id, the in-flight render map in `server/cache/inflight.ts`. Request data lives on the request context or on Solid's request event.

The only file allowed to call `console` is `server/lifecycle/logger.ts`.

## Dependencies

The published package has no `dependencies` key (B79). A nested copy of Solid, Vite, or a parser is the thing an app then installs twice. A library this package imports is a `peerDependency`, and the same library is a `devDependency` at the exact version this repo tests. The peer range is `>=` that version. A `^`, a `~`, or an exact peer version does not. An app may depend on these libraries. `@lovrozagar/flare` does not.

Required peers:

| package | devDependency | peerDependency |
| --- | --- | --- |
| `solid-js` | `2.0.0-rc.14` | `>=2.0.0-rc.14` |
| `@solidjs/web` | `2.0.0-rc.14` | `>=2.0.0-rc.14` |
| `@solidjs/vite-plugin` | `3.0.0-next.49` | `>=3.0.0-next.49` |
| `vite` | `8.1.4` | `>=8.1.4` |
| `oxc-parser` | `0.139.0` | `>=0.139.0` |
| `magic-string` | `0.30.21` | `>=0.30.21` |

Optional peers have `peerDependenciesMeta.optional` set to true. Each one is imported only from the entry `03-surface.md` names:

| package | devDependency | peerDependency | entry |
| --- | --- | --- | --- |
| `sharp` | `0.35.3` | `>=0.35.3` | `flare({ image })` |
| `@tanstack/solid-query` | `6.0.0-rc.5` | `>=6.0.0-rc.5` | `./query` |
| `negotiator` | `1.0.0` | `>=1.0.0` | `./i18n/server` |
| `isbot` | `5.2.0` | `>=5.2.0` | `./i18n/server` |
| `@formatjs/intl-localematcher` | `0.8.11` | `>=0.8.11` | `./i18n/server` |

These v0 peers do not come back: `@babel/parser`, `tailwindcss`, `oxc-resolver`, `node-html-markdown`, `@tanstack/query-broadcast-client-experimental`, and `@types/negotiator`. Tailwind is the app's plugin (B14). Babel is not a dependency (B75).

Any other devDependency is an exact version too, and it is not a peer. Solid's `serverFunctions` option stays off. Flare's server functions are Flare's.

## Gates that exist from the first source file

`bun run typecheck`, `bun run lint`, `bun run test`, the coverage thresholds, `scripts/check-tree.ts` (the tree matches `files.tsv`), and the boundary lint. `bun run test` does not start Playwright. `bun run test:e2e` runs the projects this OS owns (B70). Linux owns chromium and firefox. macOS owns webkit. CI runs both jobs. Browser e2e is part of the bit that names it. A bit is not complete while one of its named tests is red. A heading is not done while `bun run typecheck` or `bun run lint` is red. The next heading does not start until both are clear. Run both at the end of every heading.

The list, login, download, inbox, and rejected-next-call checks are for a product route that changes data. They do not run on test files. A test file asserts the row in its bit table.
