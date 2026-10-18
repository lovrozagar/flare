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
| `_root_/(app)/projects/projects.page.tsx` | `/app/projects?q=&status=&sort=&dir=&page=&from=&to=` | `.input({ searchParams })` validating a list, a number, and two dates with defaults (`src/search.ts`), `.effects` `loaderDeps` over the search and `shouldRefetch` on revalidation, a loader that prefetches the page into `ctx.queryClient`, `useSuspenseQuery` under `<Loading>` keyed by the search, sort header Links with `scroll={false}`, a Next Link with `prefetch={{ data: "intent" }}`, a filter form that navigates with `replace`, an optimistic quick add (`useMutation` with rollback), and Archive through a server function then `invalidate()` |
| `_root_/(app)/projects/[id]/project.page.tsx` | `/app/projects/:id` | `.intercept({ from: [projects] })` into the shell's `InterceptOutlet`, `.input({ params })` reading the id as a number, `notFound()` for an id the workspace lacks, a prefetched detail query, and a rename that invalidates the detail and every table page |
| `_root_/(app)/projects/new/new.page.tsx` | `/app/projects/new` | a form whose server function names each refused field, or answers with `redirect()` to the table, newest first |
| `_root_/(app)/settings/billing/billing.page.tsx` | `/app/settings/billing` | `.authorize()` for the owner, no `unauthorizedRender` on the chain, so a member gets the built-in 403 |
| `_root_/(app)/settings/settings.layout.tsx` | group under `/app/settings` | a loader reading the role, tabs: Team for an admin, Billing for the owner |
| `_root_/(app)/settings/profile/profile.page.tsx` | `/app/settings/profile` | a form whose `useBlocker` asks while it holds a change; the `saveProfile` server function answers `redirect()` to the profile |
| `_root_/(app)/settings/team/team.page.tsx` | `/app/settings/team` | `.authorize()` for an admin or the owner and its own `unauthorizedRender`; `invite` and `changeRole` server functions |
| `_root_/(app)/overview/overview.page.tsx` | `/app/overview?incidents=` | four `defer`s of different latency read by `useDeferred`, one in its own `<Errored>`; a `.stream()` server function feed; a `Link` to the outage search |
| `_root_/(app)/reports/export.csv/export.page.tsx` | `/app/reports/export.csv` | `.response()` streaming the workspace's CSV under the session |
| `_root_/status/status.page.tsx` | `/app/status` | public, `cache({ ssr: { ttl, staleTime, tags: ["status"] } })` in the memory store |
| `_root_/api/revalidate/revalidate.page.tsx` | `POST /app/api/revalidate` | dx/cache.md "Purge from a webhook", the secret read with `e2e.ts` `secretFrom` (the Node and Bun listeners pass no env) |
| `_root_/api/webhooks/billing/billing.page.tsx` | `POST /app/api/webhooks/billing` | `.response(fn, { methods: ["POST"], crossOrigin: true })`, an HMAC-signed body that sets the workspace's plan |

The query client comes from `createQueryClientGetter()` (`src/query.ts`), provided in the root layout. The server has `site`, `authenticate` (async, Web Crypto), one `createMemoryStore()`, `documentResponseDefer: "buffer"`, a CSP with `frame-src 'none'` and `form-action 'self'`, and a middleware that logs the boot's capture line once.

## `tests/e2e/dashboard-auth.test.ts` (every project)

| case | result |
| --- | --- |
| `login redirects back` | `/app/projects?page=2&status=active` signed out is a 401 document; the client replaces it with `/app/login?returnTo=<that URL>`; signing in lands on that exact URL, search included, signed in as the new user |
| `wrong password` | the password field's message is `Wrong email or password`, the field has focus, the URL stays, and no `dash.session` cookie is set; nothing but the call's failed resource is logged |
| `logout clears held data` | after Billing then sign-out, Back lands on sign-in with `returnTo=/app/projects`, the page shows none of the user's data, and the cookie is gone |
| `expired session mid navigation` | with the session ended on the server, a sidebar click to Billing lands on sign-in with `returnTo=/app/settings/billing` |
| `session in another tab` | sign-out in one tab sends the other tab's next navigation to sign-in |
| `role gate` | the owner sees the plan; as a member the document is 403, the page slot reads `Access denied` under the shell and the settings tabs, which show Profile only, and the sidebar has no Billing link |

## `tests/e2e/dashboard-table.test.ts` (every project)

| case | result |
| --- | --- |
| `sort and page in the url` | the Name header and Next move the URL's `sort`, `dir`, and `page` and the rows (sorted by name; page 2 after page 1's last name); Back, Back, and Forward walk the same rows; no document load |
| `typed search round trip` | `?status=active&status=paused&page=2&from=2026-09-20` reaches the page as a list, a number, and a Date, on the document and after a reload; the filter form writes `status=active`, the from date, and a to date back, as Dates, with no document load |
| `filter replaces history` | applying `q=atlas` shows the three Atlas rows and leaves `history.length` unchanged |
| `invalid search` | `?page=abc&sort=bogus&dir=up&from=yesterday` answers 200 with page 1 in the default order |
| `next page prefetched` | hovering Next sends one data prefetch; the click lands on page 2 with no data request |
| `scroll kept on sort` | at a 420 px viewport scrolled to the bottom, the Budget header orders the table and the scroll does not move |

## `tests/e2e/dashboard-overlay.test.ts` (every project)

| case | result |
| --- | --- |
| `row opens overlay` | a row's link opens the dialog at `/app/projects/<id>` with that project, labeled `project-dialog` over `/app/projects`; the table stays; focus moves into the dialog; no document load |
| `deep link is a page` | the project's URL as a document is its page with its title, and no dialog |
| `back closes overlay` | Back closes the dialog with no document load, and focus returns to the row's link |
| `reload keeps detail` | a reload of an open dialog's URL renders the project's page |
| `rename revalidates list` | a rename shows in the dialog and in the row behind it, and stays after the dialog closes; no document load |
| `missing project` | `/app/projects/9999` is 404 with `Page not found` in the page slot under the shell; `/app/no-such-page` is 404 with the root's `Page not found` and no shell |

## `tests/e2e/dashboard-mutations.test.ts` (every project)

| case | result |
| --- | --- |
| `create shows field errors` | a one-letter name and a negative budget come back under each field, and the form keeps both values and its URL |
| `create then list` | the server function's redirect lands on `/app/projects?dir=desc&page=1&sort=updated` with the new project first and the rest as before; no document load |
| `optimistic insert rolls back` | a quick add of a taken name shows its optimistic row while the answer is held, then removes it and shows `A project named "Atlas 1" exists`; the rows are as before |
| `optimistic insert lands` | an accepted quick add leaves the server's row first, with a real id, and clears the field |
| `concurrent renames` | two renames in flight, the first one's answer held after the server applied it: once both settle, the dialog and the row show the second name |
| `mutation during navigation` | a quick add whose answer is held while the page moves to Billing lands, and the table shows it first on the way back |
| `archive invalidates` | Archive, then `invalidate()`, shows the row archived with no Archive button and no document load |

## `tests/e2e/dashboard-settings.test.ts` (every project)

| case | result |
| --- | --- |
| `unsaved changes block a link` | with the name changed, a sidebar link raises one `confirm`; dismissed, the form stays with the change; accepted, the projects page shows |
| `back is not asked` | with the name changed, Back leaves with no dialog: the blocker is not asked for a Back step (dx/navigate.md) |
| `unsaved changes block a close` | with the name changed, a tab close raises `beforeunload`; dismissed, the page stays with the change |
| `save redirects` | the state reads `Saving…` while the save is in flight; its redirect lands on the profile with the new name, `Saved`; a link then leaves with no dialog and no document load; the next document has the name (BUGS.md 369) |
| `invite and change a role` | an invited email joins as a member, then admin; the list takes each answer, and a reload shows admin |
| `demoted admin loses the team` | an invited admin in their own browser has the team page; demoted by the owner, their next client navigation drops the Team tab with no document load, and the team document is 403 with the page's own `Admins only` under the tabs |

## `tests/e2e/dashboard-widgets.test.ts` (every project)

| case | result |
| --- | --- |
| `buffered document` | the served document has every widget's value and no skeleton; hydrated, the values read `$606000`, `12`, `0 open`, `free`, with nothing logged |
| `rejected value stays in its widget` | `?incidents=fail` as a held document is 200 and `private, no-store`; once hydrated the incidents widget's own `<Errored>` names the outage and the other widgets keep their values (BUGS.md 373) |
| `client navigation streams widgets` | a client navigation shows the values in latency order, revenue, active, incidents, plan, with no document load |
| `failed widget stays in its boundary` | on a client navigation the rejected widget's own `<Errored>` reads `The incidents service is down` and the others render; no document load |
| `feed stops on leave` | the feed's stream request runs while the overview shows and ends once a navigation leaves it |
| `progress bar` | `#progress` is pending while the overview's data is held, and gone once the page lands |
| `home rewrites to overview` | `/app/home?from=bookmark` is 301 to `/app/overview?from=bookmark` |

## `tests/e2e/dashboard-api.test.ts` (every project)

| case | result |
| --- | --- |
| `csv export` | the `download` link saves `projects.csv`, a header and the workspace's 24 ids; the answer is `text/csv; charset=utf-8`, `private, no-store` |
| `csv needs a session` | without a session the export is 401 and no CSV |
| `webhook purge` | the status page's stored render holds across hits; a missing, wrong, partial, or prefix-less secret is 401 and purges nothing; the right one is 204 and the next request is a new render, stored again |
| `purge refuses another site` | the right secret from another site's Origin is 403 on the route without `crossOrigin`, and nothing is purged |
| `billing webhook` | a bad signature is 401; the signed POST from another site is 200 and the owner's billing page reads `pro`; a GET is 405 with `Allow` naming POST |

Not run: `proxy()`. Its upstream must be an absolute `https` URL (dx/server.md proxy), and no grid project has an `https` origin to proxy to; `server-proxy.test.ts` covers it.
