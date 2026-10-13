# Bit 13 — Features

Creates every `P13` row. Features do not import each other. The core pipeline does not import them. `src/exports/vite.ts` is the file that composes their vite factories, and only when the app passed the matching `flare({ ... })` option.

A component's rows run on the Solid build they are about. Rows that render on the server, such as a nonce, an escape, or `server pure`, live in a sibling `*.ssr.test.ts`. It runs in the node project on Solid's server build with a jsdom document, so a before-paint script can also run there. Rows that mount, hydrate, or post stay in the `.test.tsx`, which runs on the client build. A table names both files.

## Extends

`tests/types/app` gains the rows bit 07 could not hold: `query options input`, `query options void`, and `query client present` in `checks.ts`, plus the fixture's `src/query.ts` importing `@lovrozagar/flare/query`, and `app.test.ts` asserts the generated `hasQueryClient` is `true`. Bit 13 is not done until `app.test.ts` is green with them.

`tests/integration/nonce.test.ts` gains `features`: `ThemeScript`, `DirectionScript`, `LocaleScript`, and `FontCSS` each carry the CSP header nonce.

`shared/router/create-router.test.ts` gains the theme and direction rows. The outcomes are `dx/features.md`.

`vite/plugin/options.test.ts` gains `broadcast on` and `broadcast off`. The outcomes are `dx/plugin.md`.

`packages/core/lint/boundaries.test.ts` gains `sync import`: the three provider files named in `00-rules.md` may import `client/sync/index.ts`. Any other file under `features/*/shared` that imports `client/` fails.

| test | case | result |
| --- | --- | --- |
| `theme stored` | `theme: {}` | `defaultTheme` `"system"`, `attribute` `"data-theme"`, `storageKey` `"flare.theme"`, `themes` `["light", "dark", "system"]`, `disableTransitionOnChange` true |
| `theme absent` | the field omitted | `router.theme` is absent |
| `theme themes` | `themes: []`, a duplicate, `"blue"`, or `defaultTheme` outside `themes` | throw at `createRouter` |
| `theme attribute` | `attribute` `"class"` | throw |
| `theme storage` | `storageKey` `""` | throw |
| `direction stored` | `direction: {}` | `defaultDir` `"ltr"`, `attribute` `"dir"`, `storageKey` `"flare.dir"` |
| `direction attribute` | `attribute` `"class"` | throw |
| `direction storage` | `storageKey` `""` | throw |

## Theme

### `features/theme/shared/script.test.tsx` and `script.ssr.test.ts`

| test | case | result |
| --- | --- | --- |
| `before paint` | `ThemeScript` in the document head | the script sets `data-theme` before the body is shown |
| `nonce` | a request nonce | the script tag carries that nonce, the same value as the CSP header |
| `system` | no stored value and the media query is dark | the attribute is `dark`, and `colorScheme` is `dark` |
| `explicit` | stored `light`, media query dark | the attribute is `light`. The media query is ignored |
| `stored system` | stored `system`, media query dark | the attribute is `dark` |
| `unknown stored` | a stored value outside `themes`, default `system`, media query dark | the attribute is `dark` |
| `no config` | `theme` absent | throw |
| `no props` | a `config` prop | does not type-check |
| `once` | the component renders twice on the client | one script tag |
| `escape` | `storageKey` contains `</script>` | the HTML has no raw `</script>` |

The attribute is `"light"` or `"dark"`. The string `"system"` is never written. Values the app may store are `light`, `dark`, and `system`.

### `provider.test.tsx` and `provider.ssr.test.ts`

| test | case | result |
| --- | --- | --- |
| `no transition` | `setTheme("dark")` with the default flag | one style tag `*{transition:none!important}` carrying `nonce()`, then that tag is gone on the next animation frame. The attribute is `dark` |
| `transition kept` | the flag is `false` | `setTheme` sets the attribute and inserts no style tag |
| `set theme` | `setTheme("dark")` | `theme()` is `"dark"`, `resolvedTheme()` is `"dark"`, storage is `"dark"`, the attribute is `dark` |
| `set theme rejects` | `setTheme("blue")` | throw. Storage is unchanged |
| `server set` | `setTheme` during SSR | throw |
| `server pure` | an SSR render of `ThemeProvider` | `OBSERVE.diagnostics` reports no `SERVER_WRITE`. The signal is seeded with `defaultTheme` |
| `outside` | `useTheme` with no provider | throw |
| `no config` | the provider renders and `theme` is absent | the children render. `useTheme` throws |
| `hydrate` | stored `dark`, `defaultTheme` `"system"`, during the hydration render | `theme()` is `"system"`. After hydration commits, `theme()` is `"dark"` |
| `media` | `theme()` is `"system"` and the query becomes dark | `resolvedTheme()` and the attribute become `dark`. `theme()` stays `"system"` |
| `media ignored` | `theme()` is `"light"` and the query becomes dark | the attribute stays `light` |
| `theme channel` | another tab posts `{ type: "theme", value: "dark" }` on `flare.sync`, then posts `dark` again. The flag `disableTransitionOnChange` is at its default | `theme()` is `"dark"`, the attribute is `dark`, `colorScheme` is `dark`, and one transition style is inserted. The repeat inserts nothing. This tab does not write `localStorage` |
| `theme channel system` | the message value is `system` and this tab's media query is dark | `theme()` is `"system"`, the attribute is `dark`, and `colorScheme` is `dark` |
| `theme channel bad` | a value outside `themes`, then `{ type: "theme", value: "dark", extra: 1 }`, then `{ type: "other" }`, then a `storage` event that sets the key to `dark` | `theme()` stays as it was |
| `theme channel throw` | `setItem` throws and `setTheme("dark")` runs | the attribute is `dark` and `{ type: "theme", value: "dark" }` is posted |
| `theme channel mount` | a message during the hydration render, one after commit, and one after the provider unmounts | only the message after commit changes `theme()` |
| `theme channel quiet` | `broadcastEnabled` is false, or `BroadcastChannel` is absent | `setTheme` still writes storage. Nothing is posted |
| `no toggle` | the return value | `toggleTheme` is absent |

## Direction

### `features/direction/shared/script-of.test.ts`

| test | case | result |
| --- | --- | --- |
| `latin` | `en` | `ltr` |
| `arabic` | `ar` | `rtl` |
| `script data` | `xx-Arab` | `rtl` |
| `unknown` | `und` | `ltr` |
| `absent` | no locale, `defaultDir` `"rtl"` | `rtl` |
| `throws` | `en_US`, `defaultDir` `"rtl"` | `rtl` |
| `text info` | `getTextInfo` throws, `defaultDir` `"rtl"` | `rtl` |

The function is `new Intl.Locale(tag).getTextInfo().direction`. The module contains no array of language codes. A throw from the constructor or from `getTextInfo`, and a direction other than `ltr` or `rtl`, returns `defaultDir`. `und` parses, so it does not use `defaultDir`.

### `script.test.tsx` and `script.ssr.test.ts`

| test | case | result |
| --- | --- | --- |
| `attr` | locale `ar`, storage empty | `dir` is `rtl`, and the script's nonce is the request nonce. The script text does not contain `Intl` |
| `stored wins` | storage `ltr`, locale `ar` | `dir` is `ltr` |
| `data attr` | `attribute` `"data-dir"`, locale `ar` | `data-dir` is `rtl` and `dir` is `rtl` |
| `no config` | `direction` absent | throw |
| `escape` | `storageKey` contains `</script>` | the HTML has no raw `</script>` |
| `once` | two client renders | one script tag |

### `provider.test.tsx` and `provider.ssr.test.ts`

| test | case | result |
| --- | --- | --- |
| `change` | storage empty, locale moves from `en` to `ar` | `dir` becomes `rtl`. Storage is still empty |
| `stored wins` | storage `ltr`, locale moves from `en` to `ar` | `dir` stays `ltr` |
| `set` | `setDirection("rtl")` | storage is `rtl` and `dir` is `rtl` |
| `clear` | `setDirection()` while storage is `ltr` and locale is `ar` | the key is gone and `dir` is `rtl` |
| `bad set` | `setDirection("auto")` | throw. Storage is unchanged |
| `server set` | `setDirection` during SSR | throw |
| `server pure` | an SSR render of `DirectionProvider` | `OBSERVE.diagnostics` reports no `SERVER_WRITE`. The signal is seeded with the default dir |
| `outside` | `useDirection` with no provider | throw |
| `no config` | `direction` absent | children render. `useDirection` throws |
| `hydrate` | storage `rtl`, locale `en`, during the hydration render | `direction()` is `ltr`. After hydration commits it is `rtl` |
| `direction channel` | another tab posts `{ type: "direction", value: "rtl" }`, then `{ type: "direction", value: null }`, locale `en`. A `storage` event also sets the key | `direction()` becomes `rtl`, then `ltr`. This tab does not write the key. The `storage` event changes nothing |
| `direction channel same` | `direction()` is already `rtl`, and a post repeats `rtl` | the attribute stays `rtl`. This tab does not write the key |
| `direction channel quiet` | `broadcastEnabled` is false, or `BroadcastChannel` is absent | `setDirection` still writes storage. Nothing is posted |
| `no toggle` | the return value | `toggleDirection` and `getDirFromLocale` are absent |

## Query

### `features/query/shared/options.test.ts`

| test | case | result |
| --- | --- | --- |
| `query` | `serverFnQueryOptions(fn, { queryKey, input })` | `queryFn` calls `fn` with that input and returns its `data` |
| `query void` | a server function with no `.input()`, and no `input` argument | `queryFn` calls `fn` with no argument |
| `mutation` | `serverFnMutationOptions(fn, { mutationKey })` | `onSuccess` calls `setQueryData` with that key and the returned data |
| `mutation no key` | `serverFnMutationOptions(fn)` | the result has `mutationFn` and no `onSuccess` |
| `no side channel` | the server envelope from bit 07 | it has no `queries` field, and this module does not read one |

### `features/query/client/getter.test.ts` and `use-suspense-query.test.ts`

| test | case | result |
| --- | --- | --- |
| `one client` | two calls on the client | the same client |
| `per request` | two calls during one server request | the same client. A second request gets another |
| `outside` | a server call with no request | throw |
| `suspense` | a query that has not resolved | the hook suspends |
| `resolved` | a query that has resolved | the data is returned |
| `loading swap` | the hook is under `<Loading fallback={<p>Loading query</p>}>` | the fallback is shown, then the data, and the fallback is gone |

## i18n

### `features/i18n/shared/translate.test.ts`

| test | case | result |
| --- | --- | --- |
| `hit` | key `hello` | the message |
| `miss` | an unknown key | the key itself |
| `proto` | key `__proto__` | the key itself, not `Object.prototype` |
| `null proto` | the map | `Object.getPrototypeOf(map)` is null |

### `features/i18n/shared/format.test.ts`

| test | case | result |
| --- | --- | --- |
| `placeholder left` | `{name}` and no value, or a `null` value | the output still contains `{name}` |
| `number` | a number value and locale `de` | `Intl.NumberFormat("de")` |
| `plural locale` | a plural message and locale `ar` | the category comes from `Intl.PluralRules` for `ar` |
| `locale omitted` | called during render inside `LocaleProvider` with no locale argument | the provider tag |
| `locale outside` | called with no locale and no provider | throw |
| `bad tag` | locale `"en_US"` | throw |
| `ordinal` | a `selectordinal` message | the category comes from `Intl.PluralRules`. An exact `=N` branch wins over it |
| `exact` | a message with `=1` and a `#` | the `=1` branch is used and `#` is the number. A missing value leaves the original token |

### `features/i18n/shared/plural.test.ts`

| test | case | result |
| --- | --- | --- |
| `cardinal` | English `1` and `2` | `one` and `other` |
| `ordinal` | English `1`, `2`, `3` | `one`, `two`, `few` |
| `select` | a select with no match | the `other` branch |

### `features/i18n/shared/rich.test.ts`

| test | case | result |
| --- | --- | --- |
| `tag` | `{link}` with a provided component | the component is called |
| `proto tag` | `{toString}` and no such component was provided | the text is left as text, `Object.prototype.toString` is not called |
| `escape` | a message containing `<script>` | the text is escaped unless it is inside a provided component |
| `placeholder wins` | a placeholder and a component share a name | ICU runs first. The placeholder wins. Paired `{tag}...{/tag}` runs only when `tag` is a component key |

### `features/i18n/server/match.test.ts`

| test | case | result |
| --- | --- | --- |
| `path first` | path locale `hr`, cookie `en`, header `de` | `hr` |
| `cookie next` | no path locale, cookie `en` | `en` |
| `cookie bad` | no path locale, cookie `fr`, `fr` not configured, no `Accept-Language`, default `en` | locale `en`, no redirect, no `Set-Cookie` |
| `cookie case` | no path locale, cookie `EN`, configured `en` | the cookie is absent. The case is not rewritten |
| `cookie junk` | no path locale, cookie value `en\r\nX: y` | the cookie is absent. The response does not contain that value |
| `cookie ignored on path` | path `hr`, cookie `nope` | locale `hr`, no `Set-Cookie` |
| `header` | neither, `Accept-Language: de, hr;q=0.5` and `hr` is configured | `hr` |
| `cap` | a header with 20 tags | only the first 8 are parsed |
| `casing` | path `EN`, configured `en` | the matcher reports a redirect to `en` |
| `bot path` | a bot user agent, path `/hr`, cookie `en`, `Accept-Language: en` | locale `hr`, no redirect, no `Set-Cookie` |
| `bot root` | a bot, path `/`, `Accept-Language: hr`, `hr` configured | locale is `defaultLocale`, no redirect, no `Set-Cookie` |
| `bot off` | `botDetection: false`, path `/`, `Accept-Language: hr` | the header negotiation runs |
| `bcp47` | `locales` includes `zh-Hant-TW`. `i18n()` is also called with `""` and with `"en_US"` | the configured tag is accepted. Both rejected tags throw at `i18n()` |
| `static wins` | a static route at a path `Intl.Locale` accepts | that route is served. No redirect |
| `optional strip` | an optional locale param whose segment is not a configured tag | 302, `no-store`, to the same path with the segment removed |
| `required keeps` | a required `[locale]` whose segment is not a configured tag | 302, `no-store`, to the same path with `defaultLocale` in the segment |
| `language en` | `Accept-Language: en-US`, and only `en` is configured | `en` |
| `language both` | `Accept-Language: en-US`, and both `en` and `en-US` are configured | `en-US` |
| `language spelling` | the header's tag differs in case from the configured tag | the result is the configured spelling |
| `bot unconfigured` | a bot, an optional unconfigured locale-like segment | the segment is removed. No `Set-Cookie` |

### `features/i18n/server/middleware.test.ts`

| test | case | result |
| --- | --- | --- |
| `slot` | the object is passed as `createServer({ locale })` | it runs between rewrite and middleware |
| `not a middleware` | the return type | it is not assignable to the middleware list |
| `redirect is a route` | the folded locale target does not match a route | 404, no redirect |
| `cookie on redirect` | a 301 to the locale path | `Set-Cookie` is present and the response is `no-store` |
| `cookie on shared` | a shared 200 | no `Set-Cookie` |
| `cookie on private` | a private 200 | `Set-Cookie` is allowed |
| `cookie attrs` | a response that sets the cookie | `Path=/`, `SameSite=Lax`, no `Domain`, `Max-Age` of one year, `Secure` only on https |
| `cookie replaced` | the incoming cookie is `nope` and the response sets the cookie | the `Set-Cookie` value is the resolved tag. `nope` is not in the response |
| `negotiate 302` | a document at `/` with a cookie or `Accept-Language` that chooses `hr`, and `hr` is not the default | 302, `no-store`, `Location` keeps the query, and the path shows `hr` |
| `data cookie` | a private data response whose URL does not show the chosen tag | no redirect. `Set-Cookie` may be set |
| `prefetch quiet` | a prefetch of a URL that does not show the chosen tag | no redirect and no `Set-Cookie` |
| `default missing` | `defaultLocale` is not in `locales` | throw when `i18n()` is called |

### `tests/e2e/i18n.test.ts`

This file calls `boot({ app: "i18n", runtime, mode })` (B70). The project name selects `runtime`, `mode`, and the browser. `boot` receives `runtime` and `mode`. The app is born with `wrangler.jsonc` so `workers-prod` can boot it. The locale slot stays on this app. `minimal` does not gain it.

| test | case | result |
| --- | --- | --- |
| `prefix` | open `/hr` | the Croatian message |
| `shared cookie` | a public page | the response has no `Set-Cookie` |
| `unknown locale` | `/fr` when `fr` is not configured | the default locale, via a redirect that is `no-store` |
| `theme no flash` | `localStorage` holds `dark`, then a document load of a page under `ThemeScript` and `ThemeProvider` | the theme attribute is `dark` on `<html>` in the first paint (read before any module script runs), the page hydrates with no console error or hydration warning, and `useTheme().theme()` is `dark` after hydrate |
| `tabs sync` | two pages in one browser context; `setTheme("light")`, `setDir("rtl")`, and `setLocale("hr")` in the first | the second page shows each value without a reload. A `storage` event alone, from writing `localStorage` in the second page, changes nothing there |

### `features/i18n/shared/provider.test.tsx`, `script.test.tsx`, `hooks.test.ts`

| test | case | result |
| --- | --- | --- |
| `initial` | `initial` is a configured tag | that tag is the locale. `locale` is a memo of `initial`, not a setter copy |
| `server pure` | an SSR render of `LocaleProvider` | `OBSERVE.diagnostics` reports no `SERVER_WRITE` |
| `param` | `initial` is `"hr"`, then a render that omits `initial` | the locale is `hr`, then `defaultLocale`. The provider does not read `useParams`, the cookie, or `Accept-Language` |
| `initial changes` | `initial` changes from `en` to `hr` | `locale()` becomes `hr` and `lang` becomes `hr` |
| `set locale` | `setLocale` of another configured tag | a navigation to that tag. No cookie is written here |
| `no cookie` | the provider renders and `setLocale` runs | `document.cookie` is not written |
| `locale channel` | `setLocale("hr")` commits | `{ type: "locale", tag: "hr" }` is posted on `BroadcastChannel` `"flare.sync"` |
| `locale channel replace` | another tab receives that message while showing `en` | it navigates to `hr` on its current route with `replace`, and posts nothing |
| `locale channel same` | the message tag is the tag already showing, the tag is outside `locales`, or the message has another shape | no navigation |
| `locale channel search` | this tab is `/pricing?x=1#y` and the segment is optional. The message tag is `hr`, then the default tag | the URL is `/hr/pricing?x=1#y`, then `/pricing?x=1#y`. Both use `replace` |
| `locale channel required` | a required `[locale]`, and the message tag is the default | the default tag stays in the path. `replace` is used |
| `locale channel fail` | the navigation does not commit | the screen stays, and nothing is posted |
| `locale channel quiet` | `BroadcastChannel` is absent, or `broadcastEnabled` is false | this tab still navigates, and nothing is posted |
| `config` | the `i18n()` object | the provider renders the children |
| `outside` | `useLoaderT` during render | throw |
| `locale outside` | `useLocale` with no provider | throw |
| `lang` | `LocaleScript` inside the provider, tag `hr` | `lang` is `hr`, including when the element already had another lang. The script nonce equals the request nonce |
| `script outside` | `LocaleScript` with no provider | throw |
| `once` | two client renders of `LocaleScript` | one script tag |
| `no props` | a prop on `LocaleScript` | does not type-check |

The outcomes are the rows in `dx/features.md`.

### `client/sync/enabled.test.ts`

| test | case | result |
| --- | --- | --- |
| `on` | the source module | `broadcastEnabled` is `true` |

### `client/sync/channel.test.ts`

| test | case | result |
| --- | --- | --- |
| `posts` | `post` of `{ type: "theme", value: "dark" }` | a second subscriber receives it on the name `flare.sync`. The sending object does not |
| `applies` | `post` of `{ type: "direction", value: null }` and `{ type: "locale", tag: "hr" }` | the subscriber receives each object unchanged |
| `off` | `broadcastEnabled` is false | `BroadcastChannel` is not constructed. `post` returns, and `subscribe` returns a function |
| `missing` | `BroadcastChannel` is absent | `post` returns, and `subscribe` returns a function |
| `closes` | the function from `subscribe` is called, then a message is posted | the listener is not called |

`post` opens a channel, sends, and closes it. `subscribe` opens one channel and returns a function that closes it. The module has no module-scope `let`.

`shared/router/create-router.test.ts` gains `locale types`: `createRouter({ locale })` accepts `{ locales, defaultLocale, paramName? }` and does not accept `cookieName` or `botDetection`.

## Image

### `features/image/shared/image.test.tsx`

| test | case | result |
| --- | --- | --- |
| `srcset` | widths `320` and `640` | the srcset lists those two and no others |
| `alt required` | no alt | the type of the props requires `alt` |
| `sizes` | `sizes` set | the attribute is passed through |
| `priority` | `priority` | `loading="eager"`, `decoding="sync"`, and `fetchpriority="high"`. The default is `loading="lazy"` and `decoding="async"` |
| `blur missing` | `placeholder="blur"` and no `blurDataURL` | throw |
| `blur until load` | `placeholder="blur"` and a `data:` URL | the background is `cover` until load, then removed |
| `blur scheme` | `blurDataURL` is not `data:` | the URL is dropped |
| `fill` | `fill` | no width or height attribute. The inline style is `position: absolute; inset: 0; object-fit: cover` plus the aspect ratio. The srcset is every generated width as `Nw`, uncapped |
| `fixed` | `fixed` without `width` | throw. With `width` and `height`, those pixel styles and attributes are set |
| `fixed 2x` | `fixed`, `width` 640, and 1280 is in the plugin set | srcset is `<url> 1x, <url> 2x`. When 1280 is absent the srcset is `1x` only |
| `responsive` | `maxWidth` | inline style `width: 100%` and that max width, and an aspect ratio from `maxHeight` or `aspectRatio`. The srcset is capped by that width |
| `two modes` | `fill` and `maxWidth` | throw |

### `features/image/vite/optimize.test.ts`

| test | case | result |
| --- | --- | --- |
| `configured` | width 320, and 320 is configured | a resized file |
| `other width` | width 321 | build error |
| `svg` | an `.svg` import | the original URL. The file is not converted to webp |
| `gif` | a `.gif` import | the original URL. The file is not converted to webp |
| `prod name` | a png at width 640 | the emitted name is `<stem>-640-<8 hex sha256 of the webp bytes>.webp` under `assetsBase` |
| `dev url` | the same image in dev, quality left at the plugin default | `/_flare/image?src=<path>&w=640`. A quality other than the default adds `&q=` |
| `quality` | `quality: 0` | throw at plugin creation. `75` is the default |
| `exclude` | a path the regexp matches | that file is copied unchanged |
| `binding` | an optimized import | the binding is `{ src, width, height, variants }` at the intrinsic pixel size. There is no generated blur. Only configured widths that fit are generated. The intrinsic width is not an extra variant. Production `src` is the largest variant. Component `quality` does not change those bytes |
| `webp` | a `.webp` source | re-encoded at the plugin quality |
| `missing` | a path inside the project with no file | 404. A bad `q`, an unknown width, or a path outside the project is 400 |
| `dev q` | component `quality` differs from the plugin default | the dev URL adds `&q=`. Production bytes stay the plugin quality |

### `features/image/vite/dev-endpoint.test.ts`

| test | case | result |
| --- | --- | --- |
| `inside root` | `src` under the project | 200 |
| `escape` | `src=../../etc/passwd` | 400 |
| `bad width` | a width that is not configured | 400 |
| `guard` | a cross-site request | 403 from the dev guard |

## Fonts

### `features/fonts/shared/css.test.ts`

| test | case | result |
| --- | --- | --- |
| `face` | a family and a woff2 src | an `@font-face` rule |
| `escape family` | family `"</style><script>` | the CSS string contains neither a raw `</style>` nor a raw `<script>` |
| `escape url` | a src containing `)` | the url is escaped |
| `unicode range` | a registry entry with `unicode-range` and `font-weight` | the `@font-face` copies both as stored |
| `variable weight` | a registry entry whose `font-style` is `italic` | the face uses that style |

### `features/fonts/shared/create-font.test.ts` and `font-css.test.tsx`

| test | case | result |
| --- | --- | --- |
| `local src` | `src: "/fonts/a.woff2"` | `css()` returns the escaped rule and `preloadLinks()` points at that file |
| `nonce` | `FontCSS` during a request | the style tag carries the request nonce |
| `preload` | a registry font, `preload` omitted | a preload link for the `latin` normal-style files |
| `preload off` | `preload={false}` | no preload link |
| `unknown subset` | `preload="nope"` and the font has no such subset | throw when the component renders |
| `no latin` | a registry font with no `latin` files, `preload` omitted | no preload link |
| `subsets` | `subsets={["latin"]}` | `css` is called with that list |
| `partial metrics` | `fallbackMetrics` with one field omitted | throw when `createFont` is called |
| `stack` | category `handwriting`, and category `display` | the stack ends in `cursive`, and in `sans-serif` |
| `weights` | `weights: [400, 700]` | two `@font-face` rules, both `font-display: swap`, both the same `src` |
| `no unicode range` | `createFont` with two weights | neither face has `unicode-range` |
| `fallback face` | `fallbackMetrics.fallbackFont` is `Arial` | a second face named `"<family> Fallback"` whose `src` lists `local("Arial")` and `local("Liberation Sans")` |

### `features/fonts/vite/emit.test.ts`

| test | case | result |
| --- | --- | --- |
| `copy` | one registry family whose file is in the fixture | the output contains that woff2 |
| `escape` | a registry url with `..` | the emit throws and copies nothing |

The registry data itself is bit 14. This test uses a two-family fixture.

## SEO

### `features/seo/server/sitemap.test.ts`

| test | case | result |
| --- | --- | --- |
| `public only` | one public route and one required-auth route | the sitemap contains only the public route |
| `optional included` | a route whose auth is optional | the route is included |
| `param omitted` | a route whose URL has a param segment | the route is omitted. `params` are not expanded |
| `response omitted` | a `.response()` route with a static URL and no required auth | the route is omitted |
| `hint checked` | the hint says public and the module requires | the route is omitted and the function returns an error the prerender treats as a failure |
| `site` | `site` is `https://example.com` | every loc starts with that origin |
| `file` | a prerender with `sitemap` | one `sitemap.xml` at the client output root, served at `/sitemap.xml`. An XML declaration plus one `urlset` in `http://www.sitemaps.org/schemas/sitemap/0.9`. No index and no second file. `robotsTxt: false` writes no `robots.txt` |
| `escape` | a loc containing `&`, `<`, `>`, `"`, and `'` | each of those five characters is escaped |
| `extra loc` | an additional entry whose `loc` is off-origin | throw |
| `changefreq` | a record key that is not a route id | throw |
| `priority` | `1.1` | throw |
| `exclude` | a public route id | that route is absent |
| `robots host` | `robotsTxt` is a string naming another host, with other lines and more than one `Sitemap:` line | the other lines stay. Every `Sitemap:` line is dropped. One `Sitemap: ${site}/sitemap.xml` line is appended |
| `robots true` | `robotsTxt: true` | the file is one line, `Sitemap: ${site}/sitemap.xml` |
| `lastmod` | an ISO instant, and a value that does not parse | the instant is UTC `YYYY-MM-DD`. A value that does not parse throws |

### `features/seo/server/google.test.ts`

| test | case | result |
| --- | --- | --- |
| `jwt` | a fixed fixture key and a fixed `iat` | the signed JWT equals the fixture. Header `{"alg":"RS256","typ":"JWT"}`. Claims are `iss` equal to the client email, `aud` equal to `https://oauth2.googleapis.com/token`, `iat`, and `exp` equal to `iat` plus 3600. Sitemap scope is `https://www.googleapis.com/auth/webmasters`. Notify scope is `https://www.googleapis.com/auth/indexing`. The exchange posts `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`. Later calls send `Authorization: Bearer`. The PEM and the access token are not in the result or the log |
| `no log` | a thrown signing error | the error message does not contain the key |
| `one mode` | both `sitemap` and `urls`, or neither | throw |
| `sitemap` | `sitemap.siteUrl` and `sitemap.sitemapUrl` | one PUT to `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}` |
| `notify` | one `URL_UPDATED` | `POST https://indexing.googleapis.com/v3/urlNotifications:publish` with `{ url, type }` |
| `concurrency` | the default | one notification at a time |
| `token fails` | the token request is non-2xx | `{ ok: false }`. No throw. The PEM is absent from the result and from logs |
| `publish fails` | the publish response is non-2xx | `{ ok: false }`. No throw |
| `empty` | `urls` is `[]` | throw |
| `over cap` | 101 URLs | throw, and no request is sent |

The fixture JWT is produced once, checked by hand against an independent verifier, and committed as `google.fixture.txt`. That file is already a row in `files.tsv`.

### `features/seo/server/index-now.test.ts` and `bing.test.ts`

| test | case | result |
| --- | --- | --- |
| `posts the url` | IndexNow: a URL and a key | `POST https://api.indexnow.org/indexnow`. The body contains the URL and the key |
| `bing query` | Bing: a URL and a key | `POST https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=<key>`. The body is `{ siteUrl, urlList }` and does not contain the key |
| `no key in errors` | the endpoint returns 500 | `{ ok: false }` and the message does not contain the key. The function does not throw |
| `host` | `host` includes a scheme | throw |
| `key location` | `keyLocation` set | the body contains it |
| `key file` | `indexNow.file(key)` and `GET /<key>.txt` | the body is the key. Any other path calls `next()` |

## Testing helpers

### `testing/harness.test.ts`

| test | case | result |
| --- | --- | --- |
| `boots` | `createTestServer` with the minimal router | `fetch("/")` returns the page |
| `no options` | a second argument | throw |

### `testing/playwright.test.ts`

| test | case | result |
| --- | --- | --- |
| `hydrated` | `load("/")` | the helper resolves after `data-flare-hydrated` |
| `console filter` | a hydration-mismatch message and an `Error` | the mismatch is omitted. The `Error` is returned |
| `state` | a document with `self.flare` | `state()` returns `build`, `nonce`, `matches`, and `queries`. A match is `{ id, params, search, data, preloader, head, error }`. A `{ p, r, c }` object is not accepted |

## Done

Each feature's tests pass without importing another feature. The i18n e2e shows a shared page with no `Set-Cookie`. Open tabs hear theme, direction, and locale on `flare.sync`, and a `storage` event updates none of them.
