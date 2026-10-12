# Route files

Routes are files under `src/routes`. There is no virtual route table (B21). Codegen writes the id. The runtime matches the pattern in the generated record. A file whose `createPage`, `createLayout`, `createRootLayout`, or `createPathSegment` string disagrees with that id is a build error (`vite/codegen/id-string.test.ts` `mismatch fails`).

The id is the directory path under `src/routes`. The filename is not a segment. A root's home page is the one exception: `home.page.tsx` placed directly in `_root_` has id `_root_/` and serves `/`, because the root layout in that folder already has id `_root_`. The same holds for every root, so `[locale]/_root_/` and `_admin_/` are home page ids. Every id is unique across pages, layouts, root layouts, and segments (`vite/codegen/routes.test.ts` `filename`).

Each route file exports its builder record as the named export `route`: `export const route = createPage("_root_/about")…`. The same holds for `createLayout`, `createRootLayout`, and `createPathSegment`. There is no default export. Codegen imports `{ route as routeN }` and sets `module: routeN`. A route file with no `route` export is a build error that names the file (`routes.test.ts` `one route`, `missing route export`). The file may export other names. The boundary transform strips the server methods from `route` on the client graph (B8).

A folder holds at most one file of each suffix. Two `*.page.tsx` files in one folder are a build error (`two pages`). A `*.layout.tsx` wraps the pages in its child folders. It has no URL of its own. A layout lives in its own folder, usually a group such as `(blog)`. A `*.layout.tsx` beside a `*.page.tsx` or a `*.segment.ts` in one folder is a build error that names both files, because they would share one id (`layout beside page`). Only a root folder holds both its root layout and its home page. A `*.root-layout.tsx` is the document for that root. A `*.segment.ts` is `createPathSegment` for that folder.

## File, id, URL

| file | id | URL | params |
| --- | --- | --- | --- |
| `src/routes/_root_/root.root-layout.tsx` | `_root_` | none. The document for `_root_` | |
| `src/routes/_root_/home.page.tsx` | `_root_/` | `/` | |
| `src/routes/_root_/about/about.page.tsx` | `_root_/about` | `/about` | |
| `src/routes/_root_/(blog)/blog.layout.tsx` | `_root_/(blog)` | none. `(blog)` adds no segment | |
| `src/routes/_root_/(blog)/post/post.page.tsx` | `_root_/(blog)/post` | `/post` | |
| `src/routes/_root_/users/[id]/user.page.tsx` | `_root_/users/[id]` | `/users/[id]` | `id: string` |
| `src/routes/_root_/files/[...path]/files.page.tsx` | `_root_/files/[...path]` | `/files/[...path]` | `path: string[]` |
| `src/routes/_root_/optional-locale/[[locale]]/opt.page.tsx` | `_root_/optional-locale/[[locale]]` | `/optional-locale` and `/optional-locale/<tag>` | `locale: string \| undefined` |
| `src/routes/_root_/files/[[...rest]]/files.page.tsx` | `_root_/files/[[...rest]]` | `/files` and `/files/<rest>` | `rest: string[] \| undefined` |
| `src/routes/_admin_/dashboard/dash.page.tsx` | `_admin_/dashboard` | `/dashboard` | |
| `src/routes/[locale]/_root_/about/about.page.tsx` | `[locale]/_root_/about` | `/[locale]/about` | `locale: string` |
| `src/routes/_root_/[_]id]/page.page.tsx` | `_root_/[_]id]` | `/[id]`, a static segment | |

Tests: `vite/codegen/routes.test.ts` (`about`, `group`, `param`, `catch-all`, `optional`, `optional catch-all`, `admin root`, `locale root`, `literal brackets`).

## How the URL is built

Take the id, split on `/`:

1. The root marker is the segment that starts with `_`, ends with `_`, and is at least three characters (`_root_`, `_admin_`). It is removed. The name is not part of the URL.
2. A non-param segment before that marker is removed. A param segment before it stays, which is why `[locale]/_root_` still has `locale` in the URL.
3. A group, a segment that starts with `(` and ends with `)`, is removed.
4. An empty segment is removed.

The remaining segments are the URL. `/` joins them, with a leading `/`.

`Link`, `navigate`, `redirect`, and `buildUrl` take a page id (`_root_/about`), including a `.response()` page. They do not take the public URL, a layout id, the root id, or a segment id. `from` on the data hooks is any route id (`dx/types.md`). `intercept({ from })` is ids as well (`dx/builder.md`).

## Brackets

| folder | meaning | param |
| --- | --- | --- |
| `[id]` | one segment | `string` |
| `[...path]` | the rest of the path | `string[]` |
| `[[locale]]` | the segment may be absent | `string \| undefined` |
| `[[...rest]]` | the rest may be absent | `string[] \| undefined` |
| `[_]id]` | the static text `[id]` | none |
| `(blog)` | a group | none |

The pattern parser is `shared/route-tree/segments.test.ts` (`param`, `catch-all`, `optional`, `literal brackets`, `group is not a segment`). A param name matches `[A-Za-z_][A-Za-z0-9_]*`. Only the four forms above are params. `[_]text]` with no `]` inside `text` is the static segment `[text]`. Any other folder that starts with `[` is a build error, including `[user-id]` and `[_]blog` (`segments.test.ts` `bad brackets`). A repeated param name in one id is a build error (`routes.test.ts` `repeated param`).

A param value stays percent-encoded (`params.test.ts` `raw param`). A valid `%HH` is uppercased and is not decoded (`%2f` is stored as `%2F`). `%ZZ`, a trailing `%`, and `%2` match as those characters (`encoded upper`, `invalid percent`). `buildUrl`, `Link`, `navigate`, and `redirect` throw when a param value contains `/`, `\`, or a `%` that is not two hex digits, and they do not double-encode an existing `%HH` (`href.test.ts` `raw slash`, `bad percent`, `no double encode`).

Rank, most specific first: a static segment, a required param, an optional param, a required catch-all that still has one segment, an optional catch-all. One folder of each param kind per parent (`routes.test.ts` `two params`). A required catch-all with no remaining segment does not match. An optional catch-all with none is `undefined`, not `[]` (`match.test.ts` `optional catch-all empty`). A second param name does not reuse a slot.

Search is a null-prototype record (`shared/url/search.test.ts` `proto`). The keys `__proto__`, `constructor`, and `prototype` are dropped. `""` is kept. `null`, `undefined`, and an empty array are omitted. Other arrays repeat in appearance order. Keys are sorted on write. Keys and values use `encodeURIComponent`. An empty search omits `?`. An empty hash omits `#` (`search.test.ts` `empty`, `sort`, `repeat`, `empty hash`).

A folder named `index` is not special. `src/routes/_root_/index/home.page.tsx` has id `_root_/index` and URL `/index` (`routes.test.ts` `index folder`).

## What is not a route

A folder that starts with `_` and does not end with `_` is ignored. `src/routes/_root_/_parts/widget.tsx` is not a route (`routes.test.ts` `ignored`). `_root_` and `_admin_` are roots because they end with `_`.

## Build errors

| case | result | test |
| --- | --- | --- |
| two files compute to the same URL, including `_root_/dashboard` and `_admin_/dashboard` | build error, both files named | `routes.test.ts` `duplicate url` |
| a catch-all and a static sibling under the same parent | build error. The catch-all would swallow the sibling | `routes.test.ts` `shadow` |
| two `*.page.tsx` files in one folder | build error | `routes.test.ts` `two pages` |
| the id string in the file disagrees with the path | build error | `id-string.test.ts` `mismatch fails` |
| a page tree has no `*.root-layout.tsx` | build error, the page files named | `routes.test.ts` `no root` |
| a folder starts with `[` and is not one of the four param forms | build error | `segments.test.ts` `bad brackets` |
| the same param name appears twice in one id | build error | `routes.test.ts` `repeated param` |

## More than one root

Each `*.root-layout.tsx` is its own document. A navigation from one root to another is a full document load (`client/navigation/navigate.test.ts` `other root`). It is not a data request. Two roots that compute to the same URL are the duplicate-url error above.
