# Flare v1 blueprint

This is the rewrite from v0 to v1. v0 was validated: the reviews executed the real builds, the real renderer, workerd, and a browser, and the findings are in `TODO_V4.md`. v1 is not a patch on those files. It is the optimal framework written from zero. The work is whatever that optimality takes.

Every behavior is test-driven. The test is written first and seen failing. Then the code is written. Then the test is green. A behavior with no named test does not exist. A prop, field, or mode that `dx/` does not list does not exist. An agent does not add one because v0 had something like it, and does not drop one because a bit forgot to repeat it. `dx/` is the user contract. The bits say when the code is born. When a bit and `dx/` disagree, `dx/` wins and the bit is updated in the same change.

v1 source stays easy to read. A file does one job, stays under the limits in `00-rules.md`, and is split before it becomes a pile of branches. v0's long files are not a pattern to copy. A comment says why, or names a pitfall. It does not narrate the next line.

Historical evidence stays where it is: `TODO_V4.md` (finding ids M-\*, N-\*, N3-\*, decisions D1–D52), `TODO_V1_REVIEW.md`, `TODO-REVIEW-v2.md`, `TODO-REVIEW-v3.md`, `TODO_V5.md`, `TODO.md`. When this directory and those files disagree, this directory wins. Decisions that revise an older D id say so in `01-decisions.md`.

Nothing in `packages/` has been moved or rewritten by this directory. `_v0/` does not exist yet. Bit 00 is the first construction act.

## Reading order

| file | what it settles |
| --- | --- |
| `00-rules.md` | How code is written: TDD, colocated tests, 100% coverage, limits, environments |
| `01-decisions.md` | Every product decision, including the ones the old plan left open |
| `02-system.md` | What the running system does, in order, and who owns each part |
| `03-surface.md` | Every public export and the app shape |
| `dx/` | Every value a user passes. Required, default, outcome, pitfall, test |
| `04-tree.md` | What each directory is for. The exhaustive file list is `files.tsv` |
| `files.tsv` | Every file. Normative. |
| `bits/00-accounting.md` | Move to `_v0/`. Tree check, lint rules, coverage gate |
| `bits/01-skeleton.md` | One page, SSR, hydrate, Node adapter |
| `bits/02-routing.md` | Canonical paths, redirects, validation, match ids |
| `bits/03-ingress.md` | Security headers, Bun, Workers |
| `bits/04-auth.md` | Effective auth, loader phases, request context |
| `bits/05-render.md` | Error projector, abort race |
| `bits/06-navigation.md` | NDJSON data requests, history, prefetch |
| `bits/07-server-fn.md` | Server functions, oxc strip, tripwire |
| `bits/08-middleware.md` | Middleware, mounts, proxy |
| `bits/09-cacheability.md` | shared / private / no-store |
| `bits/10-cache.md` | ISR, stores, purge |
| `bits/11-css.md` | Stylesheet delivery. No compiler |
| `bits/12-vite.md` | Dev guard, prerender, codegen bin |
| `bits/13-features.md` | Theme, direction, query, i18n, image, fonts, seo |
| `bits/14-release.md` | Packager, font catalog, golden install |
| `bits/15-docs.md` | The docs app: every feature on one viewable site (B94) |

## Rules for changing the blueprint

- Add a file by adding a row to `files.tsv` and a case to the bit that creates it, in the same change, before the file exists on disk.
- Do not add a behavior in a bit without a test name and the file that holds the test.
- Do not leave an open item. A question that blocks a file is a decision in `01-decisions.md`.
- Bits are sequential. Bit N may add cases to a file born in an earlier bit. It does not create a second copy of that file.
