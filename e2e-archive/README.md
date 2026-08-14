# e2e-archive

Parked historical Playwright suite from the extract. Do not delete.

This tree grew with Flare during rapid development. Many use cases describe older
APIs (`tw=`, 302 redirects, giant route matrices). The current consumer proof lives
in `e2e/app` plus runtime harnesses (`e2e/node`, later bun / workers).

Use this archive as a guide when adding a new test: copy the assertion style
from `e2e/helpers.ts` and the route pattern from `src/routes`, then write a
small case against the current product.

```bash
bun run --filter @flare/e2e-archive test
```
