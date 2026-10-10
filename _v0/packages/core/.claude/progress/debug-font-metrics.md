# Debug: 107 failing font fallback metrics tests

<!-- session: font-metrics-slug-bug -->

## Current Focus

hypothesis: CONFIRMED - populate-fonts.ts uses wrong slug format for @capsizecss/metrics lookup
test: compared slug outputs, verified capsizecss rejects lowercase slugs
next: fix getFallbackMetrics slug computation in populate-fonts.ts, re-run script

## Symptoms

expected: all 167+ fonts should have fallbackMetrics in their generated .ts files
actual: 108 font files missing fallbackMetrics entirely, causing 107 test failures
errors: `expected '@font-face...' to contain 'src: local("Arial")'` (no fallback @font-face emitted because no metrics)
reproduction: `bunx vitest run tests/unit/fonts/all-fonts-metrics.test.ts`

## Root Cause

`scripts/populate-fonts.ts` line 380-382, `getFallbackMetrics()` computes the capsizecss slug as:

```
family.toLowerCase().replace(/\s+/g, "")
```

This produces `abeezee`, `abrilfatface`, `ibmplexmono`, etc.

But `@capsizecss/metrics` expects **camelCase** slugs: `aBeeZee`, `abrilFatface`, `iBMPlexMono`.

The correct slug format (which the test itself uses correctly) is:

```
const noSpaces = family.replace(/ /g, "")
return noSpaces[0].toLowerCase() + noSpaces.slice(1)
```

This preserves internal capitalization (`ABeeZee` -> `aBeeZee`) instead of lowercasing everything.

Fonts where the family name has no internal capitals (e.g., `Abel` -> `abel`, `Inter` -> `inter`) work fine with either approach, which is why 95 fonts DO have metrics.

## Evidence

- `@capsizecss/metrics/abeezee` -> module not found
- `@capsizecss/metrics/aBeeZee` -> OK (unitsPerEm: 1000)
- `@capsizecss/metrics/timesnewroman` -> module not found
- `@capsizecss/metrics/timesNewRoman` -> OK (unitsPerEm: 2048)
- 92 of 167 fonts in FONTS array fail lookup with lowercase slug
- abel.ts HAS fallbackMetrics (name has no internal caps -> both slugs identical)
- abeezee.ts MISSING fallbackMetrics (name has internal caps -> slug diverges)

## Fix

Single line change in `scripts/populate-fonts.ts` line 380-382:
Change `family.toLowerCase().replace(/\s+/g, "")` to preserve casing like the test does.
Then re-run `bun run scripts/populate-fonts.ts` to regenerate all font files.

## Log

- [x] (2026-03-08) (debug) ran test: 107 failed, 228 passed
- [x] (2026-03-08) (debug) read test file: uses camelCase slug for capsizecss lookup
- [x] (2026-03-08) (debug) read abeezee.ts (failing): no fallbackMetrics property
- [x] (2026-03-08) (debug) read abel.ts (passing): has fallbackMetrics property
- [x] (2026-03-08) (debug) read populate-fonts.ts: getFallbackMetrics uses .toLowerCase()
- [x] (2026-03-08) (debug) verified capsizecss requires camelCase, rejects lowercase
- [x] (2026-03-08) (debug) confirmed 92/167 fonts fail lookup with wrong slug

## Files

- scripts/populate-fonts.ts (line 380-382: the bug)
- tests/unit/fonts/all-fonts-metrics.test.ts (the test)
- src/fonts/create-registry-font.ts (factory, optional fallbackMetrics)
