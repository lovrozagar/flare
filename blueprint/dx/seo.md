# SEO submitters

Imported from `@lovrozagar/flare/seo`. None of them are loaded by `createServer` (B58). A key or a private key never appears in a thrown error or a log line.

## sitemap

Written by `flare({ prerender: { sitemap } })`. Also callable:

```ts
sitemap({ additionalEntries?, changefreq?, exclude?, priority?, robotsTxt? })
```

The origin is `createServer({ site })`. A page is included when it is not a `.response()` route and its effective auth is not required. Optional auth is included. A URL with no param segment is one entry. A URL with a param segment is one entry per param set prerender already resolved: every `ssg` set, and the sets an `isr` page's `params` built. A dynamic `ssr` page, and an `isr` slug that was not built, enter only through `additionalEntries`. Prerender's resolved sets are reused, never computed again for the sitemap. Entries are deduplicated by `loc`, the first kept. `loc` is `site` plus that URL. A hint that says public while the module requires auth fails the prerender (`sitemap.test.ts` `hint checked`, `public only`, `optional included`, `param omitted`, `response omitted`).

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `additionalEntries` | no | `[]` | `{ loc, lastmod?, changefreq?, priority? }[]` | appended | `loc` must be `https` on `site`. Anything else throws | `sitemap.test.ts` `extra loc` |
| `changefreq` | no | absent | one of `always`, `hourly`, `daily`, `weekly`, `monthly`, `yearly`, `never`, or a record of route id to one of those | the `<changefreq>` | a record key that is not a route id throws | `sitemap.test.ts` `changefreq` |
| `priority` | no | absent | a number `0`–`1`, or a record of route id to that | the `<priority>` | `1.1` throws | `sitemap.test.ts` `priority` |
| `exclude` | no | `[]` | route ids | omitted, no error | an excluded public route is simply absent | `sitemap.test.ts` `exclude` |
| `robotsTxt` | no | `false` | `true` or a string | `true` writes one line, `Sitemap: ${site}/sitemap.xml`. A string keeps its other lines, drops every `Sitemap:` line, and appends that one line | a string that names a different host does not keep that host. The appended line uses `site` | `sitemap.test.ts` `robots host`, `robots true` |
| `lastmod` on an entry | no | absent | an ISO date | the parsed instant as UTC `YYYY-MM-DD` | a value that does not parse throws | `sitemap.test.ts` `lastmod` |

There is no `origin` field. v0 had one, and it drifted from `site`.

The file is one `sitemap.xml` at the root of the client static output. It is served at `/sitemap.xml`. The public URL is `site` + `/sitemap.xml`. The document is an XML declaration plus one `urlset` in the namespace `http://www.sitemaps.org/schemas/sitemap/0.9`. `&`, `<`, `>`, `"`, and `'` are escaped. There is no sitemap index and no second file (`sitemap.test.ts` `file`, `escape`). `robotsTxt: false` writes no `robots.txt`.

## indexNow

```ts
indexNow({ host, key, urls, keyLocation? }): Promise<{ ok: boolean }>
indexNow.file(key): Middleware
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `host` | yes | — | a hostname, no scheme, no path | the IndexNow `host` | `"https://example.com"` throws | `features/seo/server/index-now.test.ts` `host` |
| `key` | yes | — | `[A-Za-z0-9-]{8,128}` | posted, and never logged | a shorter key throws | `index-now.test.ts` `no key in errors` |
| `urls` | yes | — | absolute `https` URLs on `host` | the `urlList` | an off-host URL throws | `index-now.test.ts` `posts the url` |
| `keyLocation` | no | absent | an absolute `https` URL | sent when set | | `index-now.test.ts` `key location` |

`indexNow.file(key)` is a middleware. `GET /<key>.txt` returns the key as `text/plain`. Every other request calls `next()`. The key is checked with the same token rule, so the path cannot contain `..`. The test is `index-now.test.ts` `key file`.

The request is `POST https://api.indexnow.org/indexnow` with JSON `{ host, key, urlList, keyLocation? }`. A non-2xx returns `{ ok: false }`. It does not throw, and `error` does not contain the key.

## googleIndexing

```ts
googleIndexing({ credentials, sitemap }): Promise<{ ok: boolean }>
googleIndexing({ credentials, urls, concurrency? }): Promise<{ ok: boolean }>
```

Exactly one of `sitemap` and `urls`. Both, or neither, throws (`google.test.ts` `one mode`).

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `credentials.clientEmail` | yes | — | string | the JWT `iss` | | `google.test.ts` `jwt` |
| `credentials.privateKey` | yes | — | a PEM string | signed with WebCrypto | the PEM is not logged when signing throws | `google.test.ts` `no log` |
| `sitemap.siteUrl` | with `sitemap` | — | absolute `https` origin | the Search Console site | | `google.test.ts` `sitemap` |
| `sitemap.sitemapUrl` | with `sitemap` | — | absolute `https` URL | the sitemap resource | | same |
| `urls` | with the notify form | — | `{ url, type }[]`. `type` is `"URL_UPDATED"` or `"URL_DELETED"` | one notification each | | `google.test.ts` `notify` |
| `concurrency` | no | `1` | integer `≥ 1` | how many notifications are in flight | | `google.test.ts` `concurrency` |

The token is RS256 (`RSASSA-PKCS1-v1_5` with SHA-256). The header is `{"alg":"RS256","typ":"JWT"}`. Claims are `iss` equal to `clientEmail`, `aud` equal to `https://oauth2.googleapis.com/token`, `iat`, and `exp` equal to `iat` plus 3600 seconds. Sitemap mode uses scope `https://www.googleapis.com/auth/webmasters`. Notify mode uses scope `https://www.googleapis.com/auth/indexing`. One scope per mode. The exchange is `POST` of that token URL with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` and `assertion`. Later calls send `Authorization: Bearer`. The PEM and the access token are not in the result and not in the log (`google.test.ts` `jwt`).

Sitemap submission is `PUT https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`. A notification is `POST https://indexing.googleapis.com/v3/urlNotifications:publish` with JSON `{ url, type }`.

A signing failure, a token failure, and a non-2xx return `{ ok: false }`. The function does not throw. The PEM and the access token are not in the result and not in a log (`google.test.ts` `token fails`, `publish fails`). An empty `urls` throws. More than 100 URLs throws before any request (`google.test.ts` `empty`, `over cap`). One failure among the notifications makes the result `{ ok: false }` after the in-flight requests finish.

## bingIndexing

```ts
bingIndexing({ apiKey, siteUrl, urls }): Promise<{ ok: boolean }>
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `apiKey` | yes | — | string | the `apikey` query param | the key is not in the body and not in the error | `features/seo/server/bing.test.ts` `no key in errors` |
| `siteUrl` | yes | — | absolute `https` origin | | | `bing.test.ts` `bing query` |
| `urls` | yes | — | absolute `https` URLs | the `urlList` | | same |

The request is `POST https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=<key>` with JSON `{ siteUrl, urlList }`. A non-2xx returns `{ ok: false }` and does not throw.
