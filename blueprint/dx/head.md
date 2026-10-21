# head

`.head((ctx) => config, { replace? })`. `replace` defaults to `false`.

`false` merges with four rules (B83). The child replaces `title`, `description`, `keywords`, `canonical`, and `css`; a child field that is `undefined` keeps the parent's, and so does a child `title` that is `null` or `""` (`shared/head/merge.test.ts` `empty child title`, BUGS.md 447). A child `css` string replaces a parent array. `meta`, `robots`, `openGraph`, `twitter`, `favicons`, and `languages` are shallow-merged and the child key wins; a child key set to `undefined` keeps the parent's (`merge.test.ts` `undefined record key`, BUGS.md 448). `meta.viewport: false` removes a parent viewport and emits no viewport tag. `images` and `jsonLd` concatenate, child after parent. `custom.links`, `custom.meta`, `custom.scripts`, and `custom.styles` concatenate.

`true` makes this route's object the whole head. Omitted keys are absent, including parent keys. Ancestor `h` frames are not applied: the route's `h` frame carries `r: true` and its state match `replace: true`, so the client's merge replaces too, from hydration on (`head.test.ts` `merge`, `replace`, `viewport false`; `tests/integration/builder-render.test.ts` `head`; `tests/integration/builder-client.test.ts` `head replace`; BUGS.md 136).

`ctx` is `{ params, search, loaderData, preloaderContext }`. `params` and `search` are this route's validated types. `loaderData` is this route's loader data, and a deferred field stays `Deferred<T>`. `preloaderContext` is the accumulated context (`dx/types.md`). The function runs on the server for a match the run kept: its loader did not throw, no match above it failed, and the client does not hold it (a match the data request skips runs no `.head()` and sends no `h`). A thrown loader emits no `h` frame and does not call `.head()` or `.headers()` for that match or any below it. A throw from `.head()` omits this match's head, leaves the document status at the loader status, and does not open `errorRender` (B82). A returned value the head cannot write, a `canonical` that is not an absolute `https` URL or a script with both `src` and `children`, fails the same way (`loaders/run.test.ts` `head value bug`, BUGS.md 145). Those two errors read only `canonical` and `src and children`, naming neither the route nor the value. The `h` frame's `d` is this route's own return, not a pre-merged copy. The client merges in route order with the rules above, once per commit. It does not run the function. A match the navigation skipped, as a revalidation of the same match, keeps the head the client holds. A match the response landed, or one that failed or sits under the failure, has the head that response sent or none, as a hard load of that URL: a `.head()` throw or a failed loader keeps no earlier URL's head (`tests/integration/head-client.test.ts` `head after navigation`, BUGS.md 428). Tags the new merge does not contain are removed. Critical CSS, the theme, direction, and locale scripts, and the app stylesheet stay. `document.title` is written once per commit; a merge with no title writes an empty one, as a hard load shows none (BUGS.md 428).

Title and meta tags go through Solid's `useHead`, which writes each with its `data-dh` key and adopts, replaces, and removes them by it. Every link, script, and style, `css`, `canonical`, `languages`, favicons, `meta.manifest`, JSON-LD, and `custom` among them, is Flare's own: the server writes each after the title and meta tags with a `data-fh` key, and the client adopts, inserts, and removes them by that key once the commit is on screen, so a cancelled navigation changes nothing (BUGS.md 460). A served script is adopted at hydration and never runs again. A script is inserted again only when its `src` or body changes, since its key names them; removing a script does not undo what it ran, while removing a stylesheet or a link takes effect. A kept link or style takes the new merge's attributes in place, its nonce aside, which the browser hid once the element was in the document. An inserted inline script or style carries the request nonce. An inserted external script keeps document order, as on a hard load: unless the merge asks for `async`, the tags after it wait until it loads or fails, and a newer navigation drops what waited. Pitfall: an external script that never loads holds the tags after it until the browser gives up on it, as a parser-blocking script holds the rest of a page on a hard load; give such a script `async` when the tags after it do not need it. Two live elements with one key keep the first (`client/head/owned.test.ts` `adopt`, `reconcile`, `insert`; `tests/integration/head-client.test.ts` `custom tags owned`; `client/head/apply.test.ts` `slot order`, `keep`, `script changed`).

The app stylesheet is `<Stylesheet />` from `@lovrozagar/flare`, rendered once in the root layout's `<head>`. In production it preloads the one built stylesheet and its request-nonced script adds a `<link rel="stylesheet">` for it right after itself, which takes the preloaded response; the preload is never changed (BUGS.md 87). Chromium and Firefox paint the critical CSS first and do not wait for that link; WebKit waits for it before its first paint. Flare keeps that: adding the link after the first frame makes WebKit paint early, but the layout shifts when the sheet lands, and every normal load paints and styles later (BUGS.md 92). A `<noscript>` link covers no script. Under a CSP with no nonce it writes one plain stylesheet link. Dev writes one `<style data-vite-dev-id>` per CSS module the matched route chain and the root import, with the request's nonce, so a hard load is styled on first paint; Vite's client adopts those styles for HMR (B104). An edit of a stylesheet while the dev server first compiles it is the page's CSS update, not a full reload: the dev styles enter the served module unanalyzed (`vite/dev/dev-styles.test.ts` `edit mid compile`, BUGS.md 111). The root's imports are the client entry's own CSS imports, flare's reset and any global CSS the entry imports, and they come first. The dev server answers each chain once, from its module graph, over the server environment's hot channel, so Workers dev gets the same. It finds a chain's route files by their paths and reads none, so a route file that does not parse leaves every other page its styles (`dev-styles.test.ts` `broken sibling route`; `tests/e2e/dev-recovery.test.ts` `broken sibling route`, a Playwright spec, plan 21 11.6); a document that gets no answer within 2 s renders without them and the dev server logs a warning. The reset resolves to `virtual:flare/reset.css`, with no NUL prefix, because a NUL cannot be written into the `data-vite-dev-id` attribute the client keys it by. In production the stylesheet markup comes right after `#flare-critical`, so the stylesheet always wins over the critical subset (B103). Hydration leaves its markup as the server wrote it. Route `css` links come after it (bits/11, `stylesheet.test.tsx`).

Attribute values are HTML-escaped. Script, style, and JSON-LD text are not entity-escaped. A case-insensitive `</script` or `</style` inside those three is rewritten to `<\/` in its own spelling, so it does not close the tag and a JSON-LD value or a JS string reads back exactly; every other `<` is written as is (`head.test.ts` `jsonld escape`, `script close`, `custom style`; BUGS.md 143). In script and JSON-LD text, `<!--` is rewritten too: followed by `<script`, it sends the HTML parser into a state where the element's own `</script>` no longer closes it, and the rest of the document is swallowed. How depends on the script's `type`, as its reader parses the text. A JavaScript script (no type, `""`, `module`, or a JavaScript MIME type as HTML lists them, without parameters) gets `<\x21--`, which reads as `<!--` in a string, a template literal, and a regex with or without the `u` or `v` flag. JSON-LD and a JSON script (`application/json`, any `+json` type, `importmap`, `speculationrules`) get `\u003c!--`, since JSON has no `\x`. A script of any other type is a data block whose syntax Flare cannot escape: one holding `<!--` throws at render, naming the type (`shared/head/script-text.test.ts` `js types`, `json types`, `data types`). `<script` alone is left as written, so a regex literal keeps its meaning (`tests/integration/head.test.ts` `comment open`, BUGS.md 427). An attribute name that starts with `on`, in any case, is dropped (`head.test.ts` `custom on dropped`).

Pitfall: the rewrite reads the text as JavaScript source. Code that builds `<!--` at run time, from parts or through `String.raw`, is outside it, and so is a `<!--` an inline script writes into the document; keeping those out of the page is the app's.

The head's order is Solid's title and meta tags in `headTags` order (title, description, keywords, `images`, `openGraph`, `twitter`, `robots`, `meta`, then `custom.meta`), Solid's capture script, the route chunks' preloads, then Flare's links, scripts, and styles in that same order (canonical, css, languages, favicons, manifest, JSON-LD, then `custom` links, scripts, and styles). Within one list the merge order holds: a parent's entries before a child's. No other order between fields is promised.

Link and media URLs are written as given. Only `canonical` is checked, and only `css` and `SeoImage.url` drop a `javascript:` URL: `languages`, `openGraph.url`, `meta.manifest`, the twitter image and the og audio and video URLs, and a relative or `http` `SeoImage.url` are written unchanged, so the app keeps them absolute `https`.

Every field is optional. An omitted `head()` emits nothing for that route.

| field | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `title` | string | `<title>` | `null` is omitted, not the string `"null"`. A `null` or `""` child title keeps the parent's | `server/render/projector.test.ts` `null title`; `shared/head/merge.test.ts` `empty child title` |
| `description` | string | `<meta name="description">` | | `server/render/head.test.ts` `description` |
| `canonical` | an absolute `https` URL, its scheme in any case | `<link rel="canonical">`, the URL as `URL` parses it | anything else, a relative value, `https://` alone, or `""`, fails as a `.head()` throw does (BUGS.md 449) | `head.test.ts` `canonical`; `shared/head/tags.test.ts` `canonical parsed` |
| `keywords` | string | `<meta name="keywords">` | | `head.test.ts` `keywords` |
| `css` | string or string[] | stylesheet links in array order, after the app stylesheet, each href trimmed | a `javascript:` URL is dropped, and so is an empty or blank href, which would fetch the page as CSS (BUGS.md 450) | `head.test.ts` `css url`; `tags.test.ts` `css hrefs` |
| `languages` | `Record<locale, absolute URL>` | `<link rel="alternate" hreflang>` | the URL is not checked | `head.test.ts` `hreflang` |
| `jsonLd` | array of objects | one `<script type="application/ld+json">` each, escaped, with the request nonce when there is one | a `</script>` or `<!--` inside a string does not close the tag | `head.test.ts` `jsonld escape`, `jsonld nonce` |
| `images` | `SeoImage[]` | `og:image*` in array order, before `openGraph.images`. No `twitter:image`. No dedupe | | `head.test.ts` `images` |
| `favicons` | the object below | the matching `<link>` tags | | `head.test.ts` `favicons` |
| `robots` | the object below | one `robots` meta | values are not checked at run time | `head.test.ts` `robots` |
| `openGraph` | the object below | `og:*` metas | | `head.test.ts` `og` |
| `twitter` | the object below | `twitter:*` metas | | `head.test.ts` `twitter` |
| `meta` | the object below | the named metas | | `head.test.ts` `meta` |
| `custom` | the object below | raw tags, escaped | an inline script or style carries the request nonce when the CSP has one; under a string CSP or `csp: false` it is written without one (`server.md`) | `head.test.ts` `custom nonce` |

## Nested objects

A field not in these tables is not emitted. Each row is one case in `server/render/head.test.ts`, named in the test column.

### SeoImage

| prop | required | default | accepts | outcome | test |
| --- | --- | --- | --- | --- | --- |
| `url` | yes | — | an absolute `https` URL, not checked | the `og:image` content | `head.test.ts` `image url` |
| `alt` | no | omitted | string | `og:image:alt`; `""` writes none | `head.test.ts` `image alt` |
| `width` | no | omitted | number | `og:image:width` | `head.test.ts` `image width` |
| `height` | no | omitted | number | `og:image:height` | `head.test.ts` `image height` |
| `type` | no | omitted | a mime type | `og:image:type` | `head.test.ts` `image type` |

A `javascript:` URL is dropped (`head.test.ts` `image scheme`).

### favicons

Every key is optional. A set key emits one `<link>`. Another key does not type-check, since the head would drop it (`shared/head/tags.test.ts` `favicon keys`, BUGS.md 113).

| key | rel | test |
| --- | --- | --- |
| `ico` | `icon`, sizes `any` | `head.test.ts` `favicon ico` |
| `svg` | `icon`, type `image/svg+xml` | `head.test.ts` `favicon svg` |
| `appleTouchIcon` | `apple-touch-icon` | `head.test.ts` `favicon apple` |
| `"96x96"` | `icon`, type `image/png`, sizes `96x96` | `head.test.ts` `favicon 96` |
| `"192x192"` | `icon`, type `image/png`, sizes `192x192` | `head.test.ts` `favicon 192` |
| `"512x512"` | `icon`, type `image/png`, sizes `512x512` | `head.test.ts` `favicon 512` |

### robots

Present only when `robots` is set. Omitted booleans use the default.

| prop | required | default | accepts | outcome | test |
| --- | --- | --- | --- | --- | --- |
| `index` | no | `true` | boolean | `index`, or `noindex` when `false` | `head.test.ts` `robots index default` |
| `follow` | no | `true` | boolean | `follow`, or `nofollow` when `false` | `head.test.ts` `robots follow default` |
| `noarchive` | no | `false` | boolean | the token `noarchive` when `true`. `false` omits it | `head.test.ts` `robots noarchive` |
| `noimageindex` | no | `false` | boolean | the token `noimageindex` when `true`. `false` omits it | `head.test.ts` `robots noimageindex` |
| `max-image-preview` | no | omitted | `"none"`, `"standard"`, `"large"` | `max-image-preview:<value>` when set | `head.test.ts` `robots preview` |
| `max-snippet` | no | omitted | number | `max-snippet:<value>` when set | `head.test.ts` `robots snippet` |
| `max-video-preview` | no | omitted | number | `max-video-preview:<value>` when set | `head.test.ts` `robots video` |

The content is those tokens, comma-separated, in this row order. Values are written as given: `max-snippet: NaN` writes `max-snippet:NaN`, and a cast `max-image-preview` writes its string.

### openGraph

| prop | required | default | accepts | outcome | test |
| --- | --- | --- | --- | --- | --- |
| `type` | no | `"website"` when `openGraph` is present | `"website"`, `"article"`, `"profile"`, `"product"` | `og:type` | `head.test.ts` `og type default` |
| `title` | no | omitted | string | `og:title` | `head.test.ts` `og title` |
| `description` | no | omitted | string | `og:description` | `head.test.ts` `og description` |
| `url` | no | omitted | absolute `https` URL, not checked | `og:url` | `head.test.ts` `og url` |
| `siteName` | no | omitted | string | `og:site_name` | `head.test.ts` `og site` |
| `locale` | no | omitted | string | `og:locale` | `head.test.ts` `og locale` |
| `alternateLocale` | no | omitted | `string[]` | one `og:locale:alternate` per entry | `head.test.ts` `og alternate` |
| `images` | no | omitted | `SeoImage[]` | the `SeoImage` properties | `head.test.ts` `images` |
| `audio` | no | omitted | `{ url, type?, secureUrl? }[]`. `url` is required | `og:audio`, `og:audio:type`, `og:audio:secure_url` | `head.test.ts` `og audio` |
| `videos` | no | omitted | `{ url, width?, height?, type?, secureUrl? }[]`. `url` is required | `og:video`, `og:video:width`, `og:video:height`, `og:video:type`, `og:video:secure_url` | `head.test.ts` `og video` |

### twitter

| prop | required | default | accepts | outcome | test |
| --- | --- | --- | --- | --- | --- |
| `card` | no | `"summary"` when `twitter` is present | `"summary"`, `"summary_large_image"`, `"player"`, `"app"` | `twitter:card` | `head.test.ts` `twitter card` |
| `site` | no | omitted | string | `twitter:site` | `head.test.ts` `twitter site` |
| `creator` | no | omitted | string | `twitter:creator` | `head.test.ts` `twitter creator` |
| `title` | no | omitted | string | `twitter:title` | `head.test.ts` `twitter title` |
| `description` | no | omitted | string | `twitter:description` | `head.test.ts` `twitter description` |
| `images` | no | omitted | `{ url, alt? }[]`. `url` is required | `twitter:image`, and `twitter:image:alt` when `alt` is a non-empty string | `head.test.ts` `twitter image` |

### meta

| prop | required | default | accepts | outcome | test |
| --- | --- | --- | --- | --- | --- |
| `charset` | no | omitted | string | `<meta charset>` on the served document only: the client never writes it, so a charset only a client navigation brings is not applied | `head.test.ts` `meta charset`; `client/head/apply.test.ts` `charset shell only` |
| `viewport` | no | omitted | string, or `false` | `false` emits nothing | `head.test.ts` `meta viewport` |
| `applicationName` | no | omitted | string | `<meta name="application-name">` | `head.test.ts` `meta application` |
| `author` | no | omitted | string | `<meta name="author">` | `head.test.ts` `meta author` |
| `creator` | no | omitted | string | `<meta name="creator">` | `head.test.ts` `meta creator` |
| `publisher` | no | omitted | string | `<meta name="publisher">` | `head.test.ts` `meta publisher` |
| `generator` | no | omitted | string | `<meta name="generator">` | `head.test.ts` `meta generator` |
| `manifest` | no | omitted | URL, not checked | `<link rel="manifest">` | `head.test.ts` `meta manifest` |
| `appleMobileWebAppCapable` | no | omitted | `"yes"`, `"no"` | `<meta name="apple-mobile-web-app-capable">` | `head.test.ts` `meta apple capable` |
| `appleMobileWebAppTitle` | no | omitted | string | `<meta name="apple-mobile-web-app-title">` | `head.test.ts` `meta apple title` |
| `appleMobileWebAppStatusBarStyle` | no | omitted | `"default"`, `"black"`, `"black-translucent"` | `<meta name="apple-mobile-web-app-status-bar-style">` | `head.test.ts` `meta apple bar` |
| `mobileWebAppCapable` | no | omitted | `"yes"`, `"no"` | `<meta name="mobile-web-app-capable">` | `head.test.ts` `meta mobile` |

### custom

| prop | required | default | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- |
| `links` | no | `[]` | one `<link>` per record. Keys are attribute names | an attribute name must match `^[a-zA-Z][a-zA-Z-]*$` or `^data-[a-zA-Z][a-zA-Z0-9-]*$`. `http-equiv` matches the first pattern. A name that starts with `on`, any case, is dropped. Any other name is dropped | `head.test.ts` `custom key dropped`, `custom on dropped` |
| `meta` | no | `[]` | one `<meta>` per record | the same name rule | same |
| `scripts` | no | `[]` | one of `src` or `children`, plus optional `type`, `async`, `extra` | inline `children` are escaped and the tag gets the request nonce when there is one. An external `src` is emitted without a nonce attribute. An empty `src` is no source (BUGS.md 451). A script with neither `src` nor `children` is dropped. Both `src` and `children` fail as a `.head()` throw does | `head.test.ts` `custom nonce`, `custom both`; `shared/head/tags.test.ts` `empty src` |
| `styles` | no | `[]` | `{ children }` required. Escaped. The tag gets the request nonce when there is one | | `head.test.ts` `custom style` |

`extra` values are attributes. `nonce`, `src`, and `href` in `extra` are ignored: a script loads only from its own `src`, so head data from a CMS or a loader cannot point a nonced script at another origin (`tests/integration/head.test.ts` `custom extra url`, BUGS.md 160). The nonce that is written is `nonce()` for this request, the same string the CSP header carries (`server.md`).
