# @flare/e2e-app

Shared Flare consumer for Playwright. Runtime harnesses live next to this
package (`e2e/node`, `e2e/bun`, `e2e/workers`, `e2e/deno`) the same way Honey splits
`e2e/app` from `e2e/bun`.

Write tests in `e2e/`. Add a route only when a test needs one. The parked
suite in `e2e-archive/` is a guide, not the source of truth.
