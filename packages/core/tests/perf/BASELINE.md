# Performance baseline: v0.9.23 against v1

Plan 21 15.6. The same page, `/posts/building-web-frameworks` (one post, its author and body, 3 comments deferred
500 ms, a Like button), in v0.9.23's own benchmark app and its 1:1 v1 port (`apps/wire`), each built for production
and served on Node. `baseline.ts` drives it and `measure.ts` measures it; `baseline.json` holds the budgets the
nightly checks.

## Run

- Date: 2026-10-21.
- v1: 0893ab73 (batch C on batch D), `apps/wire` as committed with this file.
- v0: tag v0.9.23 (fb9b1f7) with one change: its benchmark app imports `createRouter` from `@lovrozagar/flare/router`,
  since the tag's root export no longer has it.
- Machine: MacBook Air M3, macOS 14.6, Node 24.21.0, Playwright's Chromium headless shell 1248.
- Counts: 20 network runs per side after one warm-up (medians), 20 browser loads per side, CPU 3000 sequential
  in-process requests, 3 repeats per side in fresh processes, alternating v0 and v1 (median of repeats).
- The CPU cases are the post list, /about, and the list's navigation data, not the post: v0.9.23 holds the post's
  document until the comments settle, which is wall time, not CPU.

## Results

| Metric                                           | v0.9.23 | v1     | v1 / v0 |
| ------------------------------------------------ | ------- | ------ | ------- |
| TTFB, first body byte (ms)                       | 505.84  | 8.29   | 0.016   |
| TTFB, whole body (ms)                            | 506.10  | 505.85 | 1.00    |
| Document, raw (B)                                | 7,237   | 12,146 | 1.68    |
| Document, gzip (B)                               | 1,968   | 3,738  | 1.90    |
| State script tag (B)                             | 3,289   | 3,201  | 0.97    |
| Document without state (B)                       | 3,948   | 8,945  | 2.27    |
| Navigation data, raw (B)                         | 2,885   | 3,164  | 1.10    |
| Navigation data, gzip (B)                        | 1,151   | 1,259  | 1.09    |
| FCP (ms)                                         | 532     | 36     | 0.07    |
| LCP (ms)                                         | 532     | 36     | 0.07    |
| CLS, median and max                              | 0.0014  | 0.0014 | 1.00    |
| Initial JS, gzip (B)                             | 69,475  | 67,491 | 0.97    |
| JS after load: prefetch and navigation, gzip (B) | 1,622   | 1,183  | 0.73    |
| CPU, post list document (µs)                     | 192.72  | 273.77 | 1.42    |
| CPU, /about document (µs)                        | 201.24  | 183.50 | 0.91    |
| CPU, list navigation data (µs)                   | 47.04   | 77.11  | 1.64    |

v1 sends the shell at once and paints at 36 ms where v0.9.23 held both until the comments settled (B92). v1 is
behind on document bytes, mostly Solid's inline streaming runtime and the dev-free client entry handler (BUGS.md
352): the post document was 9,542 B on 2026-10-16 and is 12,146 B now. It is behind on the list page's CPU and its
navigation data's CPU. These are round 3's decisions (plan 21 15.6's evidence); this file records them, and the budgets
hold v1 where it is.

## Budgets (`baseline.json`)

- Bytes are deterministic for a lockfile: each is v1's value with about 3% room. A growth past one is a decision with
  its cause, as the bundle budgets are (bits/01).
- Timing is a ratio of v1 to v0.9.23 measured in the same run on the same machine, so a runner class cancels out:
  v1's ratio with 1.5x room. TTFB to the first byte is held under 0.1 of v0's (the shell does not wait for data).
- CLS is held under 0.01 on both sides, v0's own budget.
- A budget moves with a new measurement recorded here, never by editing `baseline.json` alone.
