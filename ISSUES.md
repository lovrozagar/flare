# Issues

Local tracker. Filed after Solid 2 landed; fix on `main`.

Hover-prefetch 401/500 on product (`/dashboard`, `/authorize-fail`, `/validated/abc`, …) is fixture behavior, not listed here.

## Dev HTTP + redirects

- [x] Turn off CSP `upgrade-insecure-requests` in dev. The product app is `http://localhost:4101`; redirected prefetch/nav becomes `https://localhost:4101/...` → `net::ERR_SSL_PROTOCOL_ERROR`.
- [x] Preloader `throw redirect()` escapes `runPipeline` and returns raw HTTP 3xx even for `x-d: 1` / prefetch. `fetch()` follows the 3xx; with the CSP directive above that is the `https://localhost:4101/redirect-target` failure. Data/prefetch redirects should be NDJSON `t:"x"` the same way loader redirects (`/chain-a`) already are.

## Server-Timing

- [x] Span names like `flare.pipeline.preloader:_root_/...` contain `:`, which is not a Server-Timing token. Chrome logs `ServerTiming: Extraneous trailing characters`.

## Product e2e fixtures

- [x] `/head-full` emits `/icon.svg`, `/icons/icon-96.png`, `/icons/icon-192.png`, `/icons/icon-512.png`, and apple-touch-icon. Those files are not in `e2e/apps/product/public/`; the browser 404s. Tests only assert the `href` attributes.
