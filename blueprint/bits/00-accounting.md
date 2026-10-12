# Bit 00 — Accounting

Creates every `files.tsv` row whose phase is `P0`. Moves the current packages to `_v0/` and leaves that tree out of workspaces, lint, format, and CI.

No framework behavior exists at the end of this bit. The gates in `00-rules.md` run, and they pass on an empty `src/`.

## Move

One commit. `git mv` of `packages/core`, `packages/cli`, `e2e`, and `benchmark` into `_v0/`. `_v0/README.md` says the archive runs from a worktree of tag `v0.9.23`. Root workspaces become `packages/*` and `packages/core/tests/e2e/apps/*`.

## Cases

### `scripts/check-tree.test.ts`

| test | case | result |
| --- | --- | --- |
| `missing row fails` | a file on disk is not in the tsv | non-zero, path named |
| `missing file fails` | a tsv row has no file | non-zero, path named |
| `index with a statement fails` | an `index.ts` contains anything but a re-export | non-zero |
| `src without a sibling test fails` | a `kind=src` row has no test row | non-zero |
| `generated pattern matches keys` | a fixture registry of two families | exactly those two generated modules |
| `tooling scripts skipped` | `scripts/tool.mjs` and an extensionless `scripts/scrub-text` with no tsv row | zero. A `scripts/*.ts` file with no row still fails. Framework scripts are TypeScript; anything else under `scripts/` is agent tooling and not in the tsv |
| `complete phase` | `checkTree(root, tsv, { complete: "P1" })` while P1 is the highest phase present and a later phase is listed | non-zero, each missing P1 path named. Without `complete` the same tree passes, because only the phases below the highest one present are held complete. An unknown phase throws. The CLI flag is `--complete <phase>` or `--complete=<phase>`, and a bit's Done runs `bun scripts/check-tree.ts --complete P<n>` in the fresh worktree |

The generated-pattern case uses a temp directory. The real font registry does not exist until bit 14.

### `packages/core/lint/*.test.ts`

Each rule is run through oxlint on a fixture.

| rule | offender | clean file |
| --- | --- | --- |
| `boundaries` | `shared/` imports `node:fs`; a feature imports another feature | `server/` imports `shared/` |
| `no-module-side-effects` | a top-level call | the same call with `/* @__PURE__ */` |
| `no-module-state` | `let n = 0` at module scope | a `const` and a `let` carrying `// per-process-constant: build id` |

`no-module-side-effects` guards library code, which must stay tree-shakeable. It does not run on `packages/core/tests/e2e/apps/**`: an app's client entry calls `createClient(router)` at module top (`dx/client.md`), and that call exists for its side effect. Marking it `/* @__PURE__ */` would let a bundler drop it.
| `no-v8-ignore` | a `v8 ignore` comment | a file with no such comment |

### Coverage proof

`packages/core/vitest.config.ts` is configured with per-file thresholds of 100. A one-off source file with an uncovered branch is created, `bun run test` is run, the failure is observed, and the file is not committed. The commit message records that failure.

## Done

`bun run typecheck`, `bun run lint`, `bun run test`, and `bun run scripts/check-tree.ts` pass. `src/` has no files yet.
