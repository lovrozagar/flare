# Testing helpers

Imported from `@lovrozagar/flare/testing`. These are for the app's tests. They are not a second server config. Framework e2e apps, and which runtime boots them, are B70. This module does not boot `packages/core/tests/e2e/apps`.

## createTestServer

```ts
createTestServer(router): { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> }
```

`router` is required. There is no second argument. The helper calls `createServer({ router })`. A test that needs `site`, `store`, `authenticate`, or `locale` constructs `createServer` itself and calls `fetch`. The helper does not listen on a port (`testing/harness.test.ts` `boots`).

## flarePage

```ts
flarePage(page): { load, consoleErrors, state }
```

`page` is a Playwright `Page`. The methods are:

| method | args | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `load` | `path = "/"` | `goto` that path and resolves when `<html data-flare-hydrated>` is set | it does not wait for a deferred `c` frame. A `stream` defer is still a placeholder here | `testing/playwright.test.ts` `hydrated` |
| `consoleErrors` | none | console errors and page errors, minus hydration-mismatch messages the allowlist names | an `Error` is still returned. The allowlist is the mismatch text only | `playwright.test.ts` `console filter` |
| `state` | none | `self.flare` from the document | the v0 shape `{ p, r, c }` is not what this checks. The fields are `build`, `nonce`, `matches`, and `queries`. A match is `{ id, params, search, data, preloader, head, error }` (B83) | `playwright.test.ts` `state` |

These v0 methods do not exist: `wasClientNavigation`, `setNavigationMarker`, `navigateNdjson`, `assertFlareStateValid`. Client navigation is asserted by the URL and the DOM, which the e2e already does.
