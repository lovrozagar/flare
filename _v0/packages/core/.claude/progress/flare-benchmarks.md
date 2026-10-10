Progress for flare-benchmarks created on 2026-03-13 14:30

<!-- session: complete -->
<!-- spec: .claude/specs/benchmarks.md -->

## Log

- Created 6 bench files covering P1-P9 optimized hot paths
- Added `bun run bench` script to package.json
- Fixed bench data (catch-all params must be arrays, buildUrl uses `to` not `path`)
- All 13 bench suites pass, ~50s total runtime, no memory/CPU issues
- Tests still 328/328, 6804/6804

## Files

- bench/etag.bench.ts
- bench/url.bench.ts
- bench/match-id.bench.ts
- bench/ndjson.bench.ts
- bench/prerender.bench.ts
- bench/head.bench.ts
- package.json
