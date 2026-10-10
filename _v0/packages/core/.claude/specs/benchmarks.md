# Flare Benchmarks

## Goal

Add vitest bench infrastructure for hot-path functions optimized in P1-P9. Enables regression detection and validates perf work.

## Scope

- In: Micro-benchmarks for key hot-path functions (cookie parsing, nonce replacement, etag matching, stable stringify, deferred resolution check, NDJSON serialization, head injection, URL path resolution)
- In: `bun run bench` script in package.json
- In: Reasonable iteration counts — must not exhaust memory or CPU
- Out: E2E/integration benchmarks, full SSR pipeline benchmarks, CI integration

## Constraints

- Use `vitest bench` (already have vitest)
- Keep warmup/iterations conservative (100-1000 range, not millions)
- Benchmarks import actual source functions — no copies
- One bench file per domain area
- No heavy object allocation in hot loops (GC pressure → unstable results)

## Decisions

## Discovered

## Rejected
