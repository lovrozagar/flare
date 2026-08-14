---
title: Debug: Anyrow landing zero styles
session: anyrow-styles-2026-04-21
spec: None
status: done
---

## Current Focus

hypothesis: CONFIRMED ROOT CAUSE
test: completed
next: report findings

## Symptoms

expected: styled landing page with Tailwind utilities applied
actual: zero utility styles in dev; prod fully styled
errors: none (silent failure)
reproduction: bun dev -> visit any page

## Eliminated

- transformIndexHtml not firing: it IS called for CF Workers responses via vite.transformIndexHtml in dev-server.ts:168
- Tailwind compiler broken: confirmed working — returns correct CSS for all tokens including custom ones (bg-accent, text-ink)
- rewriteModule not running: it runs but returns null for class="..." only files

## Evidence

- dev HTML: 5 style tags (fonts + reset + view-transitions + color-scheme), zero flare-sx-dev, zero link stylesheets
- /src/routes/.../featured-on.tsx served: NO __sx_el__ injection snippet in output
- Playwright dev: flex="block" (should be "flex"), px-4 paddingLeft="0px" — BROKEN
- Playwright prod: flex="flex" (correct), 137 CSS rules in BrRg_6Iv.css — WORKING
- flare-global.css in prod: 38KB, full utility CSS present
- Tailwind compiler: extractDeclarations returns correct bodies for all tested tokens

## ROOT CAUSE

sx-ast/index.ts line 266: `if (result === null) return null`

rewriteModule() returns null when no structural AST rewrites are needed.
For files with ONLY plain `class="..."` string literals (no sx=, no dynamic, no array, no spread):
- compileTwFromString fires -> cssEmit -> moduleRules populated
- BUT changed=false in rewriteModule -> returns null
- result===null -> transform returns null at line 266
- The dev injection snippet (lines 284-301) is NEVER reached
- moduleRules collected during cssEmit are silently discarded

The injection code at line 284 is gated behind the `result === null` guard.
All class="..." only files produce CSS rules that get collected then thrown away.

## Log

- [x] (2026-04-21) (debug) started dev server, inspected HTML — no flare CSS IDs
- [x] (2026-04-21) (debug) tested Tailwind compiler — works correctly
- [x] (2026-04-21) (debug) traced rewriteModule control flow — confirmed null return path
- [x] (2026-04-21) (debug) Playwright dev: flex=block (broken), prod: flex=flex (working)
- [x] (2026-04-21) (debug) ROOT CAUSE CONFIRMED

## Files

- /home/ecomet/Development/monorepo/public/flare/core/src/plugins/sx-ast/index.ts (lines 228-305)
