# Error Message DX

## Goal

Improve all weak error messages in flare runtime to include actionable context: what went wrong, which entity, and how to fix it.

## Scope

- In: 30 error messages across runtime source files that lack diagnostic context
- Out: generators/, dev-dashboard/, cli/ (cold path / build-time), test files

## Categories

### A. Provider/hook context errors (7 instances)

Add which provider to wrap and where.

| File                         | Line    | Current                                                                           | Fix                                                                                                                     |
| ---------------------------- | ------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| outlet/index.tsx             | 257     | `useRouterContext() called outside FlareProvider`                                 | append `Ensure FlareProvider wraps your app root.`                                                                      |
| locale/index.tsx             | 116     | `useLocale must be used within LocaleProvider`                                    | append `Ensure LocaleProvider wraps components using locale hooks.`                                                     |
| direction/index.tsx          | 167     | `useDirection must be used within DirectionProvider`                              | append `Wrap your app with <DirectionProvider>.`                                                                        |
| theme/index.tsx              | 193     | `useTheme must be used within ThemeProvider`                                      | append `Wrap your app with <ThemeProvider>.`                                                                            |
| components/locale-script.tsx | 14      | `LocaleScript requires a config prop or locale in SSRContext`                     | append `Pass <LocaleScript config={...} /> or ensure locale is set via router.locale().`                                |
| server-context/index.ts      | 40      | `Called outside request context`                                                  | prefix with function name: `getServerContext() called outside request context. Must be called during request handling.` |
| navigation/index.ts          | 535-536 | `setupNavigation() must be called before navigate()` / `loadRouteModules not set` | add setup hint                                                                                                          |

### B. Configuration / setup errors (6 instances)

Add what to configure and how.

| File                         | Line | Current                                                                | Fix                                                                  |
| ---------------------------- | ---- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| middleware-builtins/index.ts | 105  | `i18n() middleware requires locale config on the router`               | append `Use router.locale({ locales: [...], defaultLocale: "..." })` |
| middleware/builtins/i18n.ts  | 102  | same                                                                   | same fix                                                             |
| revalidation/index.ts        | 33   | `Revalidation tier 'ssr' not configured — no FlareStore provided`      | append `Provide via createRevalidateFn({ store: ... })`              |
| revalidation/index.ts        | 49   | `Revalidation tier 'cdn' not configured — no CdnPurgeAdapter provided` | append `Provide via createRevalidateFn({ cdnPurgeAdapter: ... })`    |
| plugins/index.ts             | 1294 | `tailwindcss compile function not found`                               | append `Ensure tailwindcss ^4.0 is installed`                        |
| plugins/index.ts             | 1345 | `tailwindcss init failed: ${e.message}`                                | append `Check tailwind.config.ts for syntax errors.`                 |

### C. Redirect loop errors (2 instances)

Add URL chain / redirect count.

| File                    | Line | Current                  | Fix                   |
| ----------------------- | ---- | ------------------------ | --------------------- |
| navigation/index.ts     | 1045 | `Redirect loop detected` | add count + last URLs |
| server-handler/index.ts | 1392 | `Redirect loop detected` | add count + last URLs |

### D. Server function errors (6 instances)

Add function name / endpoint context.

| File               | Line     | Current                                                                           | Fix                                                     |
| ------------------ | -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| server-fn-query.ts | 73, 137  | `${errMsg}` (bare)                                                                | prefix `Server function request failed:`                |
| server-fn/index.ts | 610, 682 | `${errMsg}` (bare)                                                                | prefix with fn name if available                        |
| env-fn/index.ts    | 17, 35   | `Server-only function called on client` / `Client-only function called on server` | no fn name available in stubs — leave as-is or add hint |

### E. Hydration / route errors (2 instances)

| File              | Line    | Current                                         | Fix                                                    |
| ----------------- | ------- | ----------------------------------------------- | ------------------------------------------------------ |
| hydrate/index.tsx | 319     | `No route modules found for ${pathname}`        | append `Verify route file exists and build completed.` |
| testing/index.ts  | 220-241 | `Console errors: ...` / `Hydration errors: ...` | prefix with `Test failed:` + count                     |

## Decisions

- Keep messages concise — one sentence of context, not paragraphs
- Use backtick-wrapped identifiers in messages for clarity
- No error codes (overkill for framework errors)

## Discovered

## Rejected

- env-fn stubs: function name not available at stub generation time — would require codegen changes
