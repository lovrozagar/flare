# head

`.head((ctx) => config, { replace? })`. `replace` defaults to `false`.

`false` merges with four rules (B83). The child replaces `title`, `description`, `keywords`, `canonical`, and `css`. A child `css` string replaces a parent array. `meta`, `robots`, `openGraph`, `twitter`, `favicons`, and `languages` are shallow-merged and the child key wins. `meta.viewport: false` removes a parent viewport and emits no viewport tag. `images` and `jsonLd` concatenate, child after parent. `custom.links`, `custom.meta`, `custom.scripts`, and `custom.styles` concatenate.

`true` makes this route's object the whole head. Omitted keys are absent, including parent keys. Ancestor `h` frames are not applied (`head.test.ts` `merge`, `replace`, `viewport false`).

`ctx` is `{ params, search, loaderData, preloaderContext }`. `params` and `search` are this route's validated types. `loaderData` is this route's loader data, and a deferred field stays `Deferred<T>`. `preloaderContext` is the accumulated context (`dx/types.md`). The function runs on the server for a match whose loader did not throw. A thrown loader emits no `h` frame and does not call `.head()` or `.headers()` for that match. A throw from `.head()` omits this match's head, leaves the document status at the loader status, and does not open `errorRender` (B82). The `h` frame's `d` is this route's own return, not a pre-merged copy. The client merges in route order with the rules above and calls `useHead` once per commit. It does not run the function. A current match that sends no new `h` keeps its previous head. Tags the new merge does not contain are removed. Critical CSS, the theme, direction, and locale scripts, and the app stylesheet stay. `document.title` is written once. If the merge has no title, the root title remains. A custom script is inserted again only when its `src` or body changes (`client/head/apply.test.ts` `slot order`, `keep`, `script changed`).

The app stylesheet is `<Stylesheet />` from `@lovrozagar/flare`, rendered once in the root layout's `<head>`. In production it preloads the one built stylesheet and its request-nonced script adds a `<link rel="stylesheet">` for it right after itself, which takes the preloaded response; the preload is never changed (BUGS.md 87). A `<noscript>` link covers no script. Under a CSP with no nonce it writes one plain stylesheet link. Dev writes one `<style data-vite-dev-id>` per CSS module the matched route chain and the root import, with the request's nonce, so a hard load is styled on first paint; Vite's client adopts those styles for HMR (B104). The root's imports are the client entry's own CSS imports, flare's reset and any global CSS the entry imports, and they come first. The dev server answers each chain once, from its module graph, over the server environment's hot channel, so Workers dev gets the same; a document that gets no answer within 2 s renders without them and the dev server logs a warning. The reset resolves to `virtual:flare/reset.css`, with no NUL prefix, because a NUL cannot be written into the `data-vite-dev-id` attribute the client keys it by. In production the stylesheet markup comes right after `#flare-critical`, so the stylesheet always wins over the critical subset (B103). Hydration leaves its markup as the server wrote it. Route `css` links come after it (bits/11, `stylesheet.test.tsx`).

Attribute values are HTML-escaped. Script, style, and JSON-LD text are not entity-escaped. A case-insensitive `</script` or `</style` inside those three is rewritten so it does not close the tag (`head.test.ts` `jsonld escape`, `script close`). An attribute name that starts with `on`, in any case, is dropped (`head.test.ts` `custom on dropped`).

Every field is optional. An omitted `head()` emits nothing for that route.

| field | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `title` | string | `<title>` | `null` is omitted, not the string `"null"` | `server/render/projector.test.ts` `null title` |
| `description` | string | `<meta name="description">` | | `server/render/head.test.ts` `description` |
| `canonical` | an absolute `https` URL | `<link rel="canonical">` | a relative value throws | `head.test.ts` `canonical` |
| `keywords` | string | `<meta name="keywords">` | | `head.test.ts` `keywords` |
| `css` | string or string[] | stylesheet links, after the app stylesheet | a `javascript:` URL is dropped | `head.test.ts` `css url` |
| `languages` | `Record<locale, absolute URL>` | `<link rel="alternate" hreflang>` | | `head.test.ts` `hreflang` |
| `jsonLd` | array of objects | one `<script type="application/ld+json">` each, escaped, with the request nonce | a `</script>` inside a string does not close the tag | `head.test.ts` `jsonld escape`, `jsonld nonce` |
| `images` | `SeoImage[]` | `og:image*` in array order, before `openGraph.images`. No `twitter:image`. No dedupe | | `head.test.ts` `images` |
| `favicons` | the object below | the matching `<link>` tags | | `head.test.ts` `favicons` |
| `robots` | the object below | one `robots` meta | | `head.test.ts` `robots` |
| `openGraph` | the object below | `og:*` metas | | `head.test.ts` `og` |
| `twitter` | the object below | `twitter:*` metas | | `head.test.ts` `twitter` |
| `meta` | the object below | the named metas | | `head.test.ts` `meta` |
| `custom` | the object below | raw tags, escaped | an inline script or style is emitted only with the request nonce (`server.md`) | `head.test.ts` `custom nonce` |

## Nested objects

A field not in these tables is not emitted. Each row is one case in `server/render/head.test.ts`, named in the test column.

### SeoImage

| prop | required | default | accepts | outcome | test |
| --- | --- | --- | --- | --- | --- |
| `url` | yes | — | an absolute `https` URL | the `og:image` content | `head.test.ts` `image url` |
| `alt` | no | omitted | string | `og:image:alt` | `head.test.ts` `image alt` |
| `width` | no | omitted | number | `og:image:width` | `head.test.ts` `image width` |
| `height` | no | omitted | number | `og:image:height` | `head.test.ts` `image height` |
| `type` | no | omitted | a mime type | `og:image:type` | `head.test.ts` `image type` |

A `javascript:` URL is dropped (`head.test.ts` `image scheme`).

### favicons

Every key is optional. A set key emits one `<link>`.

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

The content is those tokens, comma-separated, in this row order.

### openGraph

| prop | required | default | accepts | outcome | test |
| --- | --- | --- | --- | --- | --- |
| `type` | no | `"website"` when `openGraph` is present | `"website"`, `"article"`, `"profile"`, `"product"` | `og:type` | `head.test.ts` `og type default` |
| `title` | no | omitted | string | `og:title` | `head.test.ts` `og title` |
| `description` | no | omitted | string | `og:description` | `head.test.ts` `og description` |
| `url` | no | omitted | absolute `https` URL | `og:url` | `head.test.ts` `og url` |
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
| `images` | no | omitted | `{ url, alt? }[]`. `url` is required | `twitter:image`, and `twitter:image:alt` when `alt` is set | `head.test.ts` `twitter image` |

### meta

| prop | required | default | accepts | outcome | test |
| --- | --- | --- | --- | --- | --- |
| `charset` | no | omitted | string | `<meta charset>` | `head.test.ts` `meta charset` |
| `viewport` | no | omitted | string, or `false` | `false` emits nothing | `head.test.ts` `meta viewport` |
| `applicationName` | no | omitted | string | `<meta name="application-name">` | `head.test.ts` `meta application` |
| `author` | no | omitted | string | `<meta name="author">` | `head.test.ts` `meta author` |
| `creator` | no | omitted | string | `<meta name="creator">` | `head.test.ts` `meta creator` |
| `publisher` | no | omitted | string | `<meta name="publisher">` | `head.test.ts` `meta publisher` |
| `generator` | no | omitted | string | `<meta name="generator">` | `head.test.ts` `meta generator` |
| `manifest` | no | omitted | URL | `<link rel="manifest">` | `head.test.ts` `meta manifest` |
| `appleMobileWebAppCapable` | no | omitted | `"yes"`, `"no"` | `<meta name="apple-mobile-web-app-capable">` | `head.test.ts` `meta apple capable` |
| `appleMobileWebAppTitle` | no | omitted | string | `<meta name="apple-mobile-web-app-title">` | `head.test.ts` `meta apple title` |
| `appleMobileWebAppStatusBarStyle` | no | omitted | `"default"`, `"black"`, `"black-translucent"` | `<meta name="apple-mobile-web-app-status-bar-style">` | `head.test.ts` `meta apple bar` |
| `mobileWebAppCapable` | no | omitted | `"yes"`, `"no"` | `<meta name="mobile-web-app-capable">` | `head.test.ts` `meta mobile` |

### custom

| prop | required | default | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- |
| `links` | no | `[]` | one `<link>` per record. Keys are attribute names | an attribute name must match `^[a-zA-Z][a-zA-Z-]*$` or `^data-[a-zA-Z][a-zA-Z0-9-]*$`. `http-equiv` matches the first pattern. A name that starts with `on`, any case, is dropped. Any other name is dropped | `head.test.ts` `custom key dropped`, `custom on dropped` |
| `meta` | no | `[]` | one `<meta>` per record | the same name rule | same |
| `scripts` | no | `[]` | one of `src` or `children`, plus optional `type`, `async`, `extra` | inline `children` are escaped and the tag gets the request nonce. An external `src` is emitted without a nonce attribute. A script with neither `src` nor `children` is dropped. Both `src` and `children` throw | `head.test.ts` `custom nonce`, `custom both` |
| `styles` | no | `[]` | `{ children }` required. Escaped. The tag gets the request nonce | | `head.test.ts` `custom style` |

`extra` values are attributes. `nonce` in `extra` is ignored. The nonce that is written is `nonce()` for this request, the same string the CSP header carries (`server.md`).
