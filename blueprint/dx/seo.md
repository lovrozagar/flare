# SEO submitters

Imported from `@lovrozagar/flare/seo`. None of them are loaded by `createServer` (B58): no module of `src/features/seo` is in the import graph of `@lovrozagar/flare/server` (`tests/structure/server-graph.test.ts` `server loads no seo`, which follows relative specifiers, the package's own `@lovrozagar/flare/...` through its `exports`, and a template `import()` with no substitution, BUGS.md 471). A key or a private key never appears in a thrown error or a log line.

## sitemap

Written by `flare({ prerender: { sitemap } })`, which checks the options when the plugin is created: every value, each `additionalEntries` `loc` as an absolute `https` URL, and `robotsTxt`'s type, so a bad option fails before any page renders (`sitemap.test.ts` `options checked early`, BUGS.md 469). Only what needs the app waits for the build: a record key that is no route id, and an extra entry off `site` (`tests/integration/seo.test.ts` `sitemap build errors`). Also callable: `sitemap(options)` checks them and returns the build step prerender runs.

```ts
sitemap({ additionalEntries?, changefreq?, exclude?, priority?, robotsTxt? })
```

The origin is `createServer({ site })`, with its trailing `/`s dropped, so `https://example.com/` and `https://example.com` write the same URLs and robots line (`sitemap.test.ts` `site slash`, BUGS.md 465). A page is included when it is not a `.response()` route, its effective auth is not required, and no match on its chain has `authorize`. Optional auth without `authorize` is included. A chain with `authorize` gates who may see the page, so a crawler may get 403, and prerender refuses it too. A URL with no param segment is one entry, at the URL the app serves: a literal-bracket folder `[_]flare]` is `/[flare]`, never the pattern, and its `loc` carries the brackets percent-encoded, `/%5Bflare%5D`, as RFC 3986 asks of a path; an extra entry's path is encoded the same way, so the two forms of one URL are one entry (`sitemap.test.ts` `brackets encoded`) (`server/cache/prerender.test.ts` `concrete path`, BUGS.md 210). An absent optional param counts as resolved: a page whose every dynamic segment is optional is also one entry at the URL with all of them absent (`[[locale]]/search` is `/search`, `[[...rest]]` is its bare path), whether or not prerender rendered it. When that optional param is the i18n `paramName` of `createServer({ locale })`, the page is also one entry per other configured tag (`/hr/search`, `/ar/search`), so every language a visitor can reach is listed (BUGS.md B10). A URL with a param segment is one entry per param set prerender already resolved: every `ssg` set, and the sets an `isr` page's `params` built. An `ssr` page with a required param, and an `isr` slug that was not built, enter only through `additionalEntries`. Prerender's resolved sets are reused, never computed again for the sitemap. Entries are deduplicated by `loc`, the first kept. `loc` is `site` plus that URL. A codegen auth hint that disagrees with the loaded modules in any way (`public` against `requires`, or against `reads`) fails the build, naming the route. The hint reads the page file only, so a page that re-exports its route from another module is where they can part (`sitemap.test.ts` `hint checked`, `public only`, `optional included`, `param listed`, `response omitted`). Each clause above also runs through a real `vite build`: the locale entries, the literal-bracket URL, an `isr` page's built sets, and a repeated `loc` kept once (`tests/integration/seo.test.ts` `sitemap clauses`), and the hint mismatch (`sitemap build errors`, BUGS.md 470).

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `additionalEntries` | no | `[]` | `{ loc, lastmod?, changefreq?, priority? }[]` | appended | `loc` must be `https` on `site`. A `loc` that is not absolute `https` throws when the plugin is made; one on another origin fails the build | `sitemap.test.ts` `extra loc`, `options checked early` |
| `changefreq` | no | absent | one of `always`, `hourly`, `daily`, `weekly`, `monthly`, `yearly`, `never`, or a record of route id to one of those | the `<changefreq>` | a record key that is not a route id throws | `sitemap.test.ts` `changefreq` |
| `priority` | no | absent | a number `0`–`1`, or a record of route id to that | the `<priority>`, a decimal of at most four places, never exponent form (`1e-7` is `0`) | `1.1` throws | `sitemap.test.ts` `priority`, `priority decimal` (BUGS.md 468) |
| `exclude` | no | `[]` | route ids | omitted, no error | an excluded public route is simply absent | `sitemap.test.ts` `exclude` |
| `robotsTxt` | no | `false` | `true` or a string | `true` writes one line, `Sitemap: ${site}/sitemap.xml`. A string keeps its other lines with CRLF written as LF, drops every `Sitemap:` line and the trailing blank lines, and appends that one line | a string that names a different host does not keep that host. The appended line uses `site`. Any other type throws when the plugin is made | `sitemap.test.ts` `robots host`, `robots true`, `options checked early` |
| `additionalEntries.lastmod` | no | absent | a W3C datetime: `YYYY-MM-DD`, or `YYYY-MM-DDThh:mm` with optional `:ss` and fraction, then `Z` or `±hh:mm` | written as given, its offset and so its author's day kept | the grammar is checked by Flare, not by an engine's `Date.parse`, so every runtime agrees: `T1:2Z` and `T25:00Z` throw. A time with no offset throws (BUGS.md 466). A date the calendar lacks (`2026-02-30`) throws rather than rolling over (BUGS.md 467). Each error names the value and the entry's `loc` | `sitemap.test.ts` `lastmod`, `lastmod checked` |

There is no `origin` field. v0 had one, and it drifted from `site`.

The file is one `sitemap.xml` at the root of the client static output. It is served at `/sitemap.xml`. The public URL is `site` + `/sitemap.xml`. The document is an XML declaration plus one `urlset` in the namespace `http://www.sitemaps.org/schemas/sitemap/0.9`. `&`, `<`, `>`, `"`, and `'` are escaped. There is no sitemap index and no second file (`sitemap.test.ts` `file`, `escape`). The protocol's limits of 50,000 URLs and 50 MB per file are not checked: a larger site gets one file over them. `robotsTxt: false` writes no `robots.txt`.

## indexNow

```ts
indexNow({ host, key, urls, keyLocation? }): Promise<{ ok: true } | { ok: false; error: string }>
indexNow.file(key): Middleware
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `host` | yes | — | a hostname, no scheme, no path | the IndexNow `host` | `"https://example.com"` throws | `features/seo/server/index-now.test.ts` `host` |
| `key` | yes | — | `[A-Za-z0-9-]{8,128}` | posted, and never logged | a shorter key throws | `index-now.test.ts` `no key in errors` |
| `urls` | yes | — | 1 to 10,000 absolute `https` URLs on `host` | the `urlList` | an off-host URL throws, and so do none and more than 10,000 | `index-now.test.ts` `posts the url` |
| `keyLocation` | no | absent | an absolute `https` URL | sent when set | one that is not `https` throws. IndexNow wants it on `host`, which is not checked: another host is posted, and IndexNow decides | `index-now.test.ts` `key location` |

`indexNow.file(key)` is a middleware. `GET /<key>.txt` returns the key as `text/plain`. Every other request calls `next()`, `HEAD /<key>.txt` included. The key is checked with the same token rule, so the path cannot contain `..`. The test is `index-now.test.ts` `key file`.

The request is `POST https://api.indexnow.org/indexnow` with JSON `{ host, key, urlList, keyLocation? }`. A non-2xx returns `{ ok: false }`. It does not throw, and `error` does not contain the key.

## googleIndexing

```ts
googleIndexing({ credentials, sitemap }): Promise<{ ok: true } | { ok: false; error: string }>
googleIndexing({ credentials, urls, concurrency? }): Promise<{ ok: true } | { ok: false; error: string }>
```

Exactly one of `sitemap` and `urls`. Both, or neither, throws (`google.test.ts` `one mode`).

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `credentials.clientEmail` | yes | — | string | the JWT `iss` | | `google.test.ts` `jwt` |
| `credentials.privateKey` | yes | — | a PEM string | signed with WebCrypto | the PEM is not logged when signing throws | `google.test.ts` `no log` |
| `sitemap.siteUrl` | with `sitemap` | — | absolute `https` origin | the Search Console site | anything else throws | `google.test.ts` `sitemap` |
| `sitemap.sitemapUrl` | with `sitemap` | — | absolute `https` URL | the sitemap resource | | same |
| `urls` | with the notify form | — | `{ url, type }[]`. `type` is `"URL_UPDATED"` or `"URL_DELETED"` | one notification each | a `url` that is not absolute `https` throws, and so does another `type` | `google.test.ts` `notify` |
| `concurrency` | no | `1` | integer `≥ 1` | how many notifications are in flight | anything else throws | `google.test.ts` `concurrency` |

The token is RS256 (`RSASSA-PKCS1-v1_5` with SHA-256). The header is `{"alg":"RS256","typ":"JWT"}`. Claims are `iss` equal to `clientEmail`, `aud` equal to `https://oauth2.googleapis.com/token`, `iat`, and `exp` equal to `iat` plus 3600 seconds. Sitemap mode uses scope `https://www.googleapis.com/auth/webmasters`. Notify mode uses scope `https://www.googleapis.com/auth/indexing`. One scope per mode. The exchange is `POST` of that token URL with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` and `assertion`. Later calls send `Authorization: Bearer`. The PEM and the access token are not in the result and not in the log (`google.test.ts` `jwt`).

Sitemap submission is `PUT https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`. A notification is `POST https://indexing.googleapis.com/v3/urlNotifications:publish` with JSON `{ url, type }`.

A signing failure, a token failure, and a non-2xx return `{ ok: false }`. The function does not throw. The PEM and the access token are not in the result and not in a log (`google.test.ts` `token fails`, `publish fails`). An empty `urls` throws. More than 100 URLs throws before any request (`google.test.ts` `empty`, `over cap`). One failure among the notifications makes the result `{ ok: false }` after the in-flight requests finish.

## bingIndexing

```ts
bingIndexing({ apiKey, siteUrl, urls }): Promise<{ ok: true } | { ok: false; error: string }>
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `apiKey` | yes | — | a non-empty string | the `apikey` query param | the key is not in the body and not in the error. An empty key throws | `features/seo/server/bing.test.ts` `no key in errors`, `bing query` |
| `siteUrl` | yes | — | absolute `https` origin | the body's `siteUrl` | anything else throws | `bing.test.ts` `bing query` |
| `urls` | yes | — | absolute `https` URLs | the `urlList` | none throws, and so does one that is not `https`. One off `siteUrl` is not checked: it is posted, and Bing decides | same |

The request is `POST https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=<key>` with JSON `{ siteUrl, urlList }`. A non-2xx returns `{ ok: false }` and does not throw.
