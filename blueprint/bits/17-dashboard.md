# Bit 17 — The dashboard app

Creates every `P17` row (B146). `packages/core/tests/e2e/apps/dashboard` is a SaaS dashboard on Flare's public surface, served under `/app`: sign in, an authenticated shell, projects, settings, and the flows a signed-in team runs. It takes the option values the docs app (bit 15) does not: `basePath: "/app"`, `notFoundMode: "root"`, `documentResponseDefer: "buffer"`, the router's default prefetch, no view transitions, and `createMemoryStore` on every runtime. A person runs it with `bun run dashboard:dev`.

Each case signs in as a fresh user (`dashboard.fixture.ts` `signedIn`), whose first sign-in creates a workspace with 24 seeded projects in server memory, so cases that share the worker-scoped boot never share rows. Every password is `flare-demo`. The session is the HMAC-signed `dash.session` cookie (`src/session.ts`), path `/app`. The e2e-only server functions (`expireSession`, `assignRole`) answer only under the boot's `FLARE_E2E`.

Defects the app finds in `packages/core/src` go to the root `BUGS.md` and are fixed red-first before the spec that shows them lands. The app is not changed to hide a defect. No pixel snapshots: the DOM, statuses, headers, and the network assert.

## Route map

| file under `src/routes` | URL | what it runs |
| --- | --- | --- |
| `_root_/root.root-layout.tsx` | document | `Stylesheet`, `.head()`; reads no identity, so a public page stays public |
| `_root_/home.page.tsx` | `/app` | `authenticateOptional`, a loader `redirect()` to projects or sign-in |
| `_root_/login/login.page.tsx` | `/app/login?returnTo=` | `.input({ searchParams })` keeping only an in-app `returnTo`, `authenticateOptional`, the `signIn` server function returning a `Response` with the cookie, field errors from the validator, a safe error for a wrong password |
| `_root_/(app)/app.layout.tsx` | group, no segment | `.authenticate()`, the shell (sidebar `Link` with `activeClass`, sign-out through a server function's returned `Response`, B133), `unauthenticatedRender` that replaces the entry with sign-in carrying `useLocation()` |
| `_root_/(app)/projects/projects.page.tsx` | `/app/projects` | the workspace's projects, keyed `<For>` |
| `_root_/(app)/settings/billing/billing.page.tsx` | `/app/settings/billing` | `.authorize()` for the owner, no `unauthorizedRender` on the chain, so a member gets the built-in 403 |

The server has `site`, `authenticate` (async, Web Crypto), one `createMemoryStore()`, `documentResponseDefer: "buffer"`, a CSP with `frame-src 'none'` and `form-action 'self'`, and a middleware that logs the boot's capture line once.

## `tests/e2e/dashboard-auth.test.ts` (every project)

| case | result |
| --- | --- |
| `login redirects back` | `/app/projects?page=2&status=active` signed out is a 401 document; the client replaces it with `/app/login?returnTo=<that URL>`; signing in lands on that exact URL, search included, signed in as the new user |
| `wrong password` | the password field's message is `Wrong email or password`, the field has focus, the URL stays, and no `dash.session` cookie is set; nothing but the call's failed resource is logged |
| `logout clears held data` | after Billing then sign-out, Back lands on sign-in with `returnTo=/app/projects`, the page shows none of the user's data, and the cookie is gone |
| `expired session mid navigation` | with the session ended on the server, a sidebar click to Billing lands on sign-in with `returnTo=/app/settings/billing` |
| `session in another tab` | sign-out in one tab sends the other tab's next navigation to sign-in |
| `role gate` | the owner sees the plan; as a member the document is 403, the page slot reads `Access denied` under the shell, and the sidebar has no Billing link |
