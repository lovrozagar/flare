# Debug: E2E Test Failures

<!-- session: e2e-failures-2026-03-08 -->

## Current Focus

hypothesis: CONFIRMED - 3 distinct root causes found
test: all failing tests analyzed and root causes verified
next: implement fixes

## Symptoms

expected: all listed E2E tests pass
actual: multiple test failures across 6 test files
errors: see Evidence section for each category
reproduction: `bunx playwright test <test-file>`

## Root Causes Found

### RC1: i18n middleware LOCALE_LIKE_RE too greedy (ISR + env-fn + i18n-cookie failures)

**Regex**: `/^[a-z]{2,3}(-[a-z]{2,4}){0,2}$/i`
**Problem**: Matches route paths that look like locale segments:

- `isr-test` -> `isr` (3) + `-test` (4) = matches
- `env-fn-test` -> `env` (3) + `-fn` (2) + `-test` (4) = matches

The middleware's "Invalid/unsupported locale-like segment" handler (line 157) strips these segments and 302-redirects to `/`, so the server returns the home page content.

**Affected tests**:

- `deep-isr.test.ts` - 5 failures (requests to /isr-test get redirected to /)
- `deep-isr-combos.test.ts:147` - regex match on /isr-test
- `deep-bug-fixes.test.ts:324` - regex match on /isr-test
- `deep-env-fn.test.ts` - all 5 tests fail (requests to /env-fn-test get redirected to /)
- `deep-i18n-cookie.test.ts:24` - "SSR /about: cookie=fr -> Set-Cookie: en" fails because middleware redirects to /fr/about instead of overriding cookie

**Fix**: The LOCALE_LIKE_RE is doing double duty. It should NOT strip segments that are actual route paths. Options:

1. Check if the segment matches a known route before treating it as an invalid locale
2. Make the regex more restrictive (only match actual BCP-47 patterns, not generic word-hyphen-word)
3. The middleware should consult the route tree before deciding a path is an invalid locale

### RC2: Lifecycle signals not implemented (lifecycle-signals failures)

**Problem**: `createClient()` API only has `onHydrated` and `onReady` methods. Tests expect `window.__flareInteracted` and `window.__flareIdled` globals.

- `HydrateOptions` only has `devOverlay`, `onContextReady`, `onHydrated` - missing `onIdle` and `onInteraction`
- `createClient` builder only has `onHydrated` and `onReady` - missing `onIdle` and `onInteraction`
- No code anywhere in flare source sets `window.__flareInteracted` or `window.__flareIdled`
- The unit test file `lifecycle-signals.test.ts` references `onIdle`/`onInteraction` on createClient but these don't exist

**Affected tests**: all 5 in `deep-lifecycle-signals.test.ts`

**Fix**: Implement lifecycle signals in createClient/hydrate:

1. Add `onIdle` and `onInteraction` to `HydrateOptions` and `ClientBuilder`
2. Wire up interaction events (mousemove, touchstart, scroll, keydown) in hydrate
3. Wire up requestIdleCallback in hydrate
4. Expose `window.__flareInteracted` and `window.__flareIdled` in client.tsx

### RC3: i18n cookie test expectation vs actual middleware behavior

**Specific test**: `deep-i18n-cookie.test.ts:24` - "SSR /about: cookie=fr -> Set-Cookie: en"
**What happens**: When requesting `/about` with `cookie: flare.locale=fr` (non-data request), the middleware redirects to `/fr/about` (302) because of the "cookie-respect redirect" at line 213. Playwright follows the redirect, landing on `/fr/about` which sets `Set-Cookie: flare.locale=fr`.
**Test expects**: Set-Cookie: flare.locale=en (the test assumes no redirect)
**This is actually RC1-adjacent**: the test expectation conflicts with the redirect behavior

## Evidence

- `node -e "..."` confirmed isr-test and env-fn-test match LOCALE_LIKE_RE
- ISR test HTML response contains `data-testid="home"` and `"p":"/"` confirming redirect to /
- env-fn test shows `<element(s) not found>` confirming page content never rendered
- `window.__flareInteracted` evaluates to `undefined` in all lifecycle tests
- `window.__flareIdled` times out (never becomes truthy)
- i18n cookie test: received `flare.locale=fr` instead of expected `flare.locale=en`

## Files

- `/home/ecomet/Development/monorepo/public/flare/src/middleware-builtins/index.ts` - LOCALE_LIKE_RE at line 15, invalid locale redirect at line 157
- `/home/ecomet/Development/monorepo/public/flare/src/client/index.ts` - missing onIdle/onInteraction
- `/home/ecomet/Development/monorepo/public/flare/src/hydrate/index.tsx` - HydrateOptions missing onIdle/onInteraction
- `/home/ecomet/Development/monorepo/public/flare-e2e/src/client.tsx` - doesn't expose lifecycle globals
