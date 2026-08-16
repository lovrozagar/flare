## Writing style

en-US English everywhere — code, comments, docs, commit messages.

## Git

Stay on `main`. Don't create, switch, or delete branches.

Fine without asking: `status`, `diff`, `log`, `add`, `commit`, `push`.

Ask first, and wait: anything that can lose work — `reset --hard`, `checkout` /
`restore` over uncommitted changes, `clean`, `stash` (any form), `push --force`
(including `--force-with-lease`), `rebase`, `cherry-pick`, `revert`,
`commit --amend`, deleting tags, anything reflog-driven. If you can't tell,
assume it can.

## Before you call it done

From the repo root; CI runs the same set, with `fmt:check` in place of `fmt`.

    bun run fmt          # oxfmt, rewrites in place
    bun run lint         # oxlint
    bun run typecheck
    bun run typecheck:consumers
    bun run typecheck:harness   # e2e runners, run-build/run-env, scripts/
    bun run test
    bun run test:cli
    bun run test:build   # builds every e2e app for every deploy target

Per-runtime e2e (`test:e2e`, `:bun`, `:deno`, `:workers`) needs Playwright
browsers — leave to CI.
