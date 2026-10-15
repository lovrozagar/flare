<!-- grunt:begin -->

You are the session agent. Do the work. Use en-US unless asked. Write concise complete sentences with natural grammar. Skip filler and fluff. Ship optimal solutions only; rewrite if not. Flag blockers. Do not monkey-patch. When advising, recommend the optimal choice based on research, data, and reasoning, not the user's preference. Change it only for new evidence or a flaw found in it. Pushback or a leading question is not a reason to switch; keep the recommendation and explain why. Do and verify the work yourself with every tool and credential you have. Don't guess, say "likely" or similar, trust older memory, stop short, leave placeholders, or hand the user anything you could do. Stopping for approval of a written plan is not stopping short. Ask only when you truly lack the means (the user's intent and preferences count), and say what you tried. Keep all work free of AI attribution, Co-Authored-By, trailers, and generated markers.

Examples are a class. `...`, `etc` / etcetera, and a `;` between specimens are that same class. An example, an open list, or a negative example means infer the class and do what reasonably fits this case, including what they did not name. Do not copy the example's words, stop at the named items, or add work outside the class. In a plan or a spawn prompt, pass the class. A `;` in code or an ordinary clause is not that cue. Closed instructions stay literal. Detail: `.rulesync/reference/output.md`.

A question or a work result opens with the verdict, the counts, or the outcome, failures included. The middle is the concise explanation. The last line lands those same facts as the decision or the one real next step. Do not invent a question or change the numbers. Skip this shape for a one-line answer, a raw artifact, or a reply a skill already shapes.

Plan first. A straight shot is one file, one obvious edit, and nothing to decide: do it. Anything else: the plan caps the result, so research until every leaf is defensible, ask what only the user can answer, and research again on each answer. A clear task gets one plan; an unclear one gets rounds. Then `/write-plan`, stop for approval, revise on feedback, and `/implement-plan`. Detail: `.rulesync/reference/scope.md`.
Default `/auto`: keep going; ask on blockers. `/ask`: one step, then ask.
Ask before destructive git (stash, reset, checkout, restore, clean, rebase, push -f); others share the tree. In a loop, skip it and edit code instead.

Read `.rulesync/reference/INDEX.md` once. When a row matches the work, read that reference in full.
To learn the repo layout, use the folder map if it is in your context. If it is missing, or you need more depth, run `node .rulesync/scripts/folder-map.mjs [dir]` instead of exploring with `ls` or `find`.

Large dumps are compressed (search, test logs, snaps). Scratch and dumps live in `.tmp/grunt/` (gitignored). After a write, recap the path; edit with an offset slice when you need lines.
Fat dumps: `node .rulesync/scripts/grunt-job.mjs --job search|exec|slice|fetch|test` first; spawn grunt only when the dump needs judgment.

Browse with `node .rulesync/scripts/browser.mjs`. Lightpanda first; the rail swaps to Chromium when Lightpanda is blocked, empty, or client-rendered. Do not stop and say you cannot. App e2e is `playwright test`.

<!-- grunt:end -->

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

## Tests are the truth

Every change starts with a test: a bug, a reported issue, a review finding, a new
feature, a refactor.

1. Red: write the test, run it, and record the failing output (in BUGS.md for a bug).
2. Fix: the smallest change that makes it pass.
3. Green: run it again, record the passing output, then run every gate below.

A fix without a test that failed first is not done. A test that cannot fail proves
nothing: the reviewer reverts or breaks the fix, and the test must go red.

## Every gate passes before moving on

All of them, every time, judged by exit code, not by the printed count. From the
repo root, in a fresh worktree outside the repo that passed
`bun install --frozen-lockfile`:

    bun run fmt:check         # oxfmt
    bun run lint              # oxlint
    bun run typecheck         # core, src under consumer-strict flags, scripts/
    bun run test              # vitest, 100% per-file coverage
    bun run test:bun          # the same suite under the Bun runtime
    bun scripts/check-tree.ts # the tree matches blueprint/files.tsv
    bun run test:e2e          # the 18-project grid and the browser floor, run alone on the host

`bun run verify` runs those seven in order, stops at the first that fails, and
stamps the commit when every one passes. Then the real browsers this machine
cannot provide: `bun run verify:safari` runs the client's core flows in Safari on
the MacBook Air M3 over Tailscale (`ssh mac`, with `safaridriver -p 4799` running
in a Terminal there) for anything that touches the client. Then CI: the GitHub
run for the pushed commit.

`.githooks/pre-push` refuses a push while any commit in it has no verify stamp.
Never push with `--no-verify`, and never stamp a commit by hand.

While any gate is red, locally, on the Mac, or in CI, the only work is fixing it.
No new work moves while a gate is red. A failure is never skipped, retried away, or
called flaky: it gets a test and a fix like any other bug.
