# Testing helpers

Imported from `@lovrozagar/flare/testing`. These are for the app's tests. They are not a second server config. Framework e2e apps, and which runtime boots them, are B70. This module does not boot `packages/core/tests/e2e/apps`.

## createTestServer

```ts
createTestServer(router, options?): { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> }
```

`router` is required. `options` is `{ serverContext }` and nothing else: required when `FlareRegister` declares `serverContext`, and optional otherwise, because without it the app's loaders cannot call `serverCtx()` (revised 2026-10-13, BUGS.md B25). Any other key does not type-check and throws. The helper calls `createServer({ router, serverContext })`. A test that needs `site`, `store`, `authenticate`, or `locale` constructs `createServer` itself and calls `fetch`. The helper does not listen on a port (`testing/harness.test.ts` `boots`).

## flarePage

```ts
flarePage(page): { load, consoleErrors, state }
```

`page` is a Playwright `Page`. The methods are:

| method | args | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `load` | `path = "/"` | `goto` that path and resolves when `<html data-flare-hydrated>` is set. It listens on two channels, so a reply Playwright's Firefox driver loses cannot hang it (BUGS.md 107): a binding the page calls when the attribute appears, and a locator `waitFor` query sent again every 5 s under a timer of its own. The query returns no element handle, so one still in flight when the case ends leaves nothing to bind. Each query sent again logs one `console.warn`. A page that has not hydrated in 25 s throws `The page never hydrated` | it does not wait for a deferred `c` frame. A `stream` defer is still a placeholder here. It adds one binding, named `__flare_hydrated_` plus 32 random hex digits, and one init script to the page, once per page: a second `load` reuses them | `testing/playwright.test.ts` `hydrated`, `lost reply`, `reissue`, `never hydrated`, `binding once`, `reissue warns`, `page script`; `tests/integration/flare-page.test.ts` `helper on a real page`; e2e `docs-smoke.test.ts` `never hydrated` |
| `consoleErrors` | none | every console error and page error since the helper was created, hydration mismatches included | there is no allowlist. A test that expects a message asserts it | `playwright.test.ts` `console all`; `tests/integration/flare-page.test.ts` `helper on a real page` |
| `state` | none | `self.flare` from the document | the v0 shape `{ p, r, c }` is not what this checks. The fields are `build`, `nonce`, `matches`, and `queries`. A match is `{ id, params, search, data, preloader, head, error }` (B83) | `playwright.test.ts` `state`; `tests/integration/flare-page.test.ts` `helper on a real page`; e2e `docs-features.test.ts` `page state` |

These v0 methods do not exist: `wasClientNavigation`, `setNavigationMarker`, `navigateNdjson`, `assertFlareStateValid`. Client navigation is asserted by the URL and the DOM, which the e2e already does.

## The framework's e2e grid

For contributors to Flare itself, not an app's tests. `bun run test:e2e` runs the 18 projects of B70 against the apps under `packages/core/tests/e2e/apps`, and the browser floor's `node-prod-floor` (B123): the production docs app in Chromium with every API newer than Chrome 111, Firefox 114, and Safari 16.4 deleted before the page runs (`tests/e2e/floor.ts`), on the specs that drive the client. `tests/structure/browser-floor.test.ts` checks every client-reachable source's browser APIs against `@mdn/browser-compat-data` at that floor. The browsers come from the pinned Playwright image (B97): `scripts/browser-server.ts` answers `FLARE_BROWSER_WS` when set, else the image's run-server in the `flare-browsers` container when a Docker daemon answers the shell, else Playwright's installed engines. A user outside the `docker` group adds it once (`sudo usermod -aG docker "$USER"`, then a new login) or sets `FLARE_BROWSER_WS`. One project is `bun run test:e2e -- --project <name>`; a run that names its projects runs the deep specs on each of them (`scripts/browser-server.test.ts`, `tests/structure/grid.test.ts`).
