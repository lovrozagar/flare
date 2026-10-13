# Bit 02 — Routing

Creates every `P2` row. Canonical paths, redirects, validation, match ids, path segments, and the base-path app.

## Extends

`server/lifecycle/classify.test.ts` is unchanged. `shared/route-tree/match.test.ts` gains the encoded-compare cases below if they were not already covered.

## Cases

### `shared/url/canonical.test.ts`

Corpus-driven. Each line of `canonical.corpus.txt` is one assertion.

| test | case | result |
| --- | --- | --- |
| `empty segments` | `/a//b` | canonical `/a/b` |
| `trailing slash preserve` | `/a/` with `preserve` | unchanged |
| `trailing slash never` | `/a/` with `never` | `/a` |
| `case fold` | `/About` with `caseSensitive: false`, matched by the static route `/about` | `/about`. `canonicalPath` alone does not fold case. The fold uses the matched route (`canonical-redirect.test.ts` `param case kept`, `static case`) |
| `scheme-relative` | `//evil.com/a` | hostile |
| `backslash` | `/\\evil` | hostile |
| `encoded slashes` | `/%2f%2fevil` | hostile |
| `dot dot` | `/a/../b` | canonical `/b` only when the `..` is a real segment; `%2e%2e` is hostile |
| `control and NUL` | a byte below 0x20 | hostile |
| `base path` | base `/app`, path `/app` | the index, not a miss |

### `shared/url/prefix.test.ts`

| test | case | result |
| --- | --- | --- |
| `boundary` | prefix `/admin`, path `/admin/x` | true |
| `not a prefix` | prefix `/admin`, path `/administrator` | false |
| `not a prefix slash-slash` | prefix `/admin`, path `//admin` | false, and the path is hostile before this function when it came from ingress |
| `case fold` | prefix `/admin`, path `/Admin/x` | true when folding |

### `shared/url/href.test.ts`

| test | case | result |
| --- | --- | --- |
| `relative` | `/about` | accepted |
| `javascript` | `javascript:alert(1)` | rejected |
| `whitespace scheme` | ` java\\tscript:alert(1)` | rejected |
| `data` | `data:text/html,hi` | rejected |
| `control prefix` | a leading byte below 0x20 | rejected |
| `missing param` | `buildUrl` for a route with `[id]` and no `params` | throw |
| `raw slash` | a param value `a/b` or `a\b` | throw. `Link`, `navigate`, and `redirect` throw the same way |
| `bad percent` | a param value `%ZZ`, a trailing `%`, or `%2` | throw |
| `no double encode` | a param value that already contains `%2F` | the URL contains `%2F` once |

### `shared/duration/parse.test.ts`

| test | case | result |
| --- | --- | --- |
| `seconds` | `30s` | 30000 |
| `compound` | `1m30s` | 90000 |
| `garbage` | `soon` | throw |

Accepted units are `ms`, `s`, `m`, `h`, `d`. Anything else throws. No silent zero.

### `shared/validation/schema.test.ts` and `issues.test.ts`

| test | case | result |
| --- | --- | --- |
| `standard schema failure` | a validator that returns issues | `{ issues, fieldErrors }` |
| `fieldErrors is top-level` | an issue path `["user", "name"]` | `fieldErrors.user` is `["required"]`. Two issues for `user` are both in that array. An empty path stays only in `issues`. `issues` keeps the full path |
| `function validator` | `(raw) => raw` | the raw value |
| `throwing validator` | a validator that throws | 400, the message is generic in production |

### `shared/route-tree/match-id.test.ts`

| test | case | result |
| --- | --- | --- |
| `raw both sides` | params `{ id: "042" }`, search `a=1` | the id contains `042` and `a=1`, not a coerced number |
| `same id` | the server and a client fixture with the same raw values | equal strings |

### `shared/route-builder/segment.test.ts`

| test | case | result |
| --- | --- | --- |
| `identity render` | a segment | `render` returns `children` |
| `cache only` | `.cache({ cdn: { maxAge: "1m" } })` | the record stores that config |
| `no loader` | the method list | `loader` is absent |

### `server/redirect/target.test.ts`

| test | case | result |
| --- | --- | --- |
| `internal` | `/about?x=1` | accepted |
| `scheme-relative before URL` | `//evil/x` | rejected. The test spies that `new URL` is not the function that accepted it |
| `backslash` | `/\\evil` | rejected |
| `absolute` | `to` is `https://evil/` | rejected. `to` is a route id |
| `href https` | `redirect({ href: "https://example.com/a" })` | accepted. A document is a full page load of that URL. A data response is HTTP 200 and an `x` frame whose `u` is that URL |
| `href bad` | `href` is `javascript:alert(1)` | throw at the call |
| `status` | `status: 300` | throw at the call. `301`, `302`, `303`, `307`, and `308` are accepted |
| `control` | a leading control character | rejected |
| `replace default` | `redirect({ to })` with no `replace` | `replace` is `true` |

### `server/redirect/builder.test.ts`

| test | case | result |
| --- | --- | --- |
| `GET canonical` | GET, path needs a slash fold | 301 |
| `POST canonical` | POST, the same | 308, method preserved |
| `hostile is 400` | `//evil` | 400, no `Location` |
| `always` | `trailingSlash: "always"`, GET `/about` | 301 to `/about/` |
| `preserve both` | `trailingSlash: "preserve"`, GET `/about` and GET `/about/` | both are 200. Neither form redirects |
| `no double slash` | `trailingSlash: "always"`, GET `/` | 200, the path is `/`. Internal empty segments collapse in that same redirect and the result is never `//` |

### `server/lifecycle/canonical-redirect.test.ts`

| test | case | result |
| --- | --- | --- |
| `once` | `/A/` with case fold and `trailingSlash: "never"` | one redirect to `/a`, not a chain |
| `rewrite recanonical` | rewrite returns `/A/` | one redirect, then stop |
| `path string` | rewrite is called | the argument is the pathname `/old`, and a returned location object does not type-check |
| `search kept` | `/About?q=1&q=2` with case fold | one redirect, `Location` is `/about?q=1&q=2`, and the hash is absent |
| `param case kept` | route `/users/[id]`, GET `/users/AbC123` | 200 with `id` `AbC123`. No redirect: folding never touches a segment a param consumed |
| `static case` | route `/users/[id]`, GET `/Users/AbC123` | one 301 to `/users/AbC123`. Only the static segment takes the route's spelling |
| `hex kept` | route `/[slug]`, GET `/%C4%8D` | 200, no redirect. Folding never lowercases a percent-escape (B81 uppercases them) |
| `unmatched case` | GET `/NOWHERE` with no such route | 404, not a redirect. Case is folded only toward a matched route |
| `locale case` | locales `en-US`, `hr`, a route `/[[locale]]/pricing`, GET `/EN-us/Pricing`, then GET `/en-us/pricing` | each is one 301 to `/en-US/pricing`, then 200. A locale param that case-insensitively equals a configured tag takes that tag's spelling, so the canonical and locale casing rules cannot loop |
| `mount case` | mount `/api`, GET `/API/Users?x=1` | one 301 to `/api/Users?x=1`, then the mount's answer. A mount prefix folds like a static segment, before the route fold, and the rest of the path stays as sent. `/APIX` is not that mount |
| `mount case` | mount `/api`, GET `/API/Users?x=1` | one 301 to `/api/Users?x=1`, then the mount's answer. A mount prefix folds like a static segment, and the rest of the path stays as sent |

### `vite/codegen/id-string.test.ts`

| test | case | result |
| --- | --- | --- |
| `writes the key` | a new `home.page.tsx` | the string in `createPage` equals the generated id |
| `rewrites on move` | the file moves from `home.page.tsx` to `about.page.tsx` | the string is rewritten |
| `mismatch fails` | the string is hand-edited | build error, the file path is named |

### `packages/core/lint/path-prefix.test.ts` and `location-only-in-redirect.test.ts`

| test | case | result |
| --- | --- | --- |
| `startsWith banned` | `pathname.startsWith("/admin")` | lint error |
| `helper allowed` | `hasPathPrefix(pathname, "/admin")` | no error |
| `Location outside redirect` | `headers.set("Location", url)` in `server/loaders` | lint error |
| `Location inside builder` | the same call in `server/redirect/builder.ts` | no error |

### `tests/e2e/apps/basepath`

| test | case | result |
| --- | --- | --- |
| `base is the index` | `basePath: "/app"`, GET `/app` | 200 |
| `root is not the app` | GET `/` | 404 |

The basepath e2e is `packages/core/tests/e2e/minimal.test.ts` run a second time against this app. Add the case `base path serves /app` to that file rather than a new test file. The tsv does not gain a test-file row. The second `beforeAll` calls `boot` with `app: "basepath"` and the `runtime` and `mode` from the project name (B70). Bit 02's projects are `node-dev-chromium`, `node-dev-firefox`, and `node-dev-webkit`. `boot.test.ts` gains `basepath`: `{ app: "basepath", runtime: "node", mode: "dev" }` returns an origin, and `close` stops it.

### `shared/route-tree/segments.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `bad brackets` | a folder `[user-id]` or `[_]blog` | build error. `[_]text]` with no `]` in `text` stays the static segment `[text]` |

### `shared/route-tree/params.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `encoded upper` | path `/users/%2f` | the param is `%2F`, not decoded |
| `invalid percent` | `%ZZ`, a trailing `%`, and `%2` | each matches as those characters |

### `shared/route-tree/match.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `optional catch-all empty` | `[[...rest]]` and no remaining segment | the param is `undefined`, not `[]`. A required catch-all with no remaining segment does not match |

### `vite/codegen/routes.test.ts` (extended)

| test | case | result |
| --- | --- | --- |
| `repeated param` | the same param name twice in one id | build error |
| `two params` | two folders of the same param kind under one parent | build error. One folder of each kind is allowed |
| `index folder` | `_root_/index/home.page.tsx` | id `_root_/index`, URL `/index` |
| `no root` | page files and no `*.root-layout.tsx` | build error, and the message names those page files |

### `shared/url/search.test.ts`

| test | case | result |
| --- | --- | --- |
| `proto` | keys `__proto__`, `constructor`, and `prototype` | dropped. `Object.getPrototypeOf` of the record is null |
| `empty` | a value `""`, and values `null`, `undefined`, and `[]` | `""` is kept. The other three are omitted. An empty search omits `?` |
| `sort` | keys written as `b` then `a` | the search is `a` then `b`. Both sides use `encodeURIComponent` |
| `repeat` | one key with two values | the key is repeated, in appearance order |
| `empty hash` | hash `""` | the URL has no `#` |

## Done

Every hostile row in the three corpora fails closed. A POST to a non-canonical path is 308. The basepath app serves `/app`.
