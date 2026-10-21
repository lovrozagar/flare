# Features

Each feature is imported from its subpath. Core does not load it until the app imports it. A property not listed here does not exist.

View transitions are not a feature module: `navigate.md` covers `viewTransition` and `ViewTransitionBoundary`, and `router.md` covers `viewTransitions`.

## Cross-tab

Theme, direction, and locale tell other open tabs through one `BroadcastChannel`, named `flare.sync`. The module is `client/sync`. `localStorage` still holds theme and direction. The channel does not store them. Nothing listens for a `storage` event.

`post` opens a channel of that name, sends one message, and closes it. `subscribe` opens one channel and returns a function that closes it. The module keeps no module-scope `let`. The object that sent a message does not receive it. Every other subscriber on that name does, including a subscriber in the sending tab. A receiver applies the message and does not post, and it does not write `localStorage` (`client/sync/channel.test.ts` `posts`, `applies`).

`flare({ broadcast })` defaults to `true` (`plugin.md`). Omitted and `true` are the same. `false` replaces `client/sync/enabled.ts` in the client environment, in dev and in the client build, with `export const broadcastEnabled = false`. The server copy stays `true`. The server never posts, because `BroadcastChannel` is absent there, so `post` and `subscribe` do nothing. On the client, `false` and a missing `BroadcastChannel` are the same no-op. This tab still writes theme and direction to `localStorage`, and `setLocale` still navigates. Other tabs then read theme and direction from `localStorage` on the next load. They learn a locale change only when they navigate (`channel.test.ts` `off`, `missing`).

| type | message | when it is posted | what the other tab does | test |
| --- | --- | --- | --- | --- |
| `theme` | `{ type: "theme", value }` with `value` `"light"`, `"dark"`, or `"system"` | after `setTheme` has updated this tab, including when the storage write threw | sets `theme()`, the attribute, and `colorScheme` when `value` is in `themes` and is not already `theme()`. `"system"` uses this tab's media query. Any other value is ignored | `features/theme/shared/provider.test.tsx` `theme channel`, `theme channel bad`, `theme channel system`, `theme channel throw` |
| `direction` | `{ type: "direction", value }` with `value` `"ltr"`, `"rtl"`, or `null` | after `setDirection` has updated this tab, including when the storage write threw. `null` means the key was removed | sets `direction()` and the attribute when that dir is not already showing. `null` clears the in-memory override and applies `dirOf(locale)`. Any other value is ignored | `features/direction/shared/provider.test.tsx` `direction channel`, `direction channel same` |
| `locale` | `{ type: "locale", tag }` | after `setLocale`'s navigation commits. A navigation that does not commit posts nothing | navigates to that tag on its own current route, keeping the query exactly as the URL holds it and the hash, with `replace` (BUGS.md 441). A route with no locale param is not followed (BUGS.md 439). On an optional segment the default tag drops the segment. On a required `[locale]` the default tag stays. That navigation does not post. The tag already showing, a tag outside `locales`, or a message without this shape is ignored | `features/i18n/shared/provider.test.tsx` `locale channel`, `locale channel replace`, `locale channel same`, `locale channel search`, `locale channel required`, `locale channel quiet`, `locale channel fail` |

A message is a plain object with exactly the keys in that row. `value` and `tag` are strings, except direction `null`. An extra key, an unknown `type`, and a `storage` event are ignored (`provider.test.tsx` `theme channel bad`, `direction channel`).

The provider subscribes after hydration commits and closes that subscription when it unmounts. SSR, the hydration render, and the before-paint script do not subscribe. `subscribe` returns a function in every case, including the no-op (`channel.test.ts` `closes`). A provider that is not mounted hears nothing (`provider.test.tsx` `theme channel mount`).

A receiver does not call `setTheme`, `setDirection`, or `setLocale`. A value that is already showing is ignored, so the sending tab's own subscriber does nothing with the echo (`provider.test.tsx` `theme channel`, `direction channel same`). A theme change inserts the same transition style as `setTheme` when `disableTransitionOnChange` is true and the resolved value changes. A direction `null` drops the in-memory override and applies `dirOf` of this tab's locale. The locale URL is the one `setLocale` would build on this tab. A locale navigation that does not commit leaves the screen as it is (`provider.test.tsx` `locale channel search`, `locale channel fail`).

The channel name is fixed. It is not a prop, and it is origin-wide. Another app on the same origin shares it. A theme value outside this app's `themes`, and a locale tag outside this app's `locales`, are ignored. Renaming `storageKey` does not rename the channel.

There is no theme cookie and no direction cookie. Shared HTML does not vary by theme or direction, and the before-paint script reads `localStorage`. The locale cookie stays `flare.locale` with the rules in i18n below.

The v0 provider `broadcast` flag does not exist. `flare({ broadcast })` is this switch. `createBroadcastSignal`, `useBroadcast`, and `navigate({ broadcast })` do not exist (B4, D43).

## Theme

`createRouter({ theme })` stores the resolved config on the router context (`router.md`). The components read it there. Passing `theme: {}` fills the defaults below. Omitting `theme` leaves the field absent.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `defaultTheme` | no | `"system"` | `"light"`, `"dark"`, `"system"` | used when storage is absent, throws, or holds a value outside `themes`. It must be a member of `themes` | a value outside `themes` throws at `createRouter` | `features/theme/shared/script.ssr.test.ts` `system`; `shared/router/create-router.test.ts` `theme themes` |
| `attribute` | no | `"data-theme"` | `data-` then lowercase letters and digits, in words joined by single hyphens | set on `<html>` before paint | `class`, `style`, `id`, `dir`, and any other name outside that pattern, such as `data-Theme`, `data-x_y`, or `data-`, throw at `createRouter` | `script.ssr.test.ts` `before paint`; `create-router.test.ts` `theme attribute` |
| `storageKey` | no | `"flare.theme"` | a non-empty string | `localStorage` key. `setTheme` is the only writer | an empty string throws at `createRouter`. A throw from `localStorage` is an absent value on read and is ignored on write | `script.ssr.test.ts` `explicit`; `create-router.test.ts` `theme storage` |
| `themes` | no | `["light", "dark", "system"]` | a non-empty subset of those three strings, no duplicates | a stored value outside this list is replaced with `defaultTheme`, then resolved | an empty list, a duplicate, or any other string throws at `createRouter` | `script.ssr.test.ts` `unknown stored`; `create-router.test.ts` `theme themes` |
| `disableTransitionOnChange` | no | `true` | boolean | on a resolved change after the post-hydrate apply, inserts `<style nonce={nonce()}>*{transition:none!important}</style>`, sets the attribute and `colorScheme`, reads a computed style so the browser resolves the new theme's styles under that rule at once, and removes the style on the next animation frame. No CSS transition runs. Without the read, the style pass ran after the frame's callbacks had removed the rule, so every transition ran (BUGS.md 437) | the post-hydrate read does not insert the style. `false` sets the attribute and inserts no style | `provider.test.tsx` `no transition`, `transition kept`; `tests/integration/features-client.test.ts` `theme no transition` |

```tsx
<ThemeScript />
<ThemeProvider>{children}</ThemeProvider>
```

| component | props | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `ThemeScript` | none | one inline script, under Solid `NoHydration`. Its nonce is the request nonce (`server.md`). A client render does not insert a second script | a prop does not type-check. Rendering it when `theme` is absent throws | `script.ssr.test.ts` `no props`, `no config`, `nonce`; `script.test.tsx` `once` |
| `ThemeProvider` | `children`, required | the subtree, and the context `useTheme` reads | no other prop type-checks. When `theme` is absent it still renders `children`, and `useTheme` throws | `provider.test.tsx` `no config`; `provider.ssr.test.ts` `outside` |

The script runs before paint and does the following, in order. A `localStorage` throw is an absent value.

1. Read `storageKey`.
2. If the value is not in `themes`, use `defaultTheme`.
3. If that value is `"system"`, use `"dark"` when `matchMedia("(prefers-color-scheme: dark)")` matches, otherwise `"light"`.
4. Set `attribute` to that `"light"` or `"dark"`. The string `"system"` is never written.
5. Set `document.documentElement.style.colorScheme` to the same value. A throw is ignored.

Nothing stored means `defaultTheme` (`script.ssr.test.ts` `system`). A stored `"light"` or `"dark"` is written as itself and the media query is ignored (`script.ssr.test.ts` `explicit`). A stored value outside `themes` is `defaultTheme`, then step 3 runs (`script.ssr.test.ts` `unknown stored`). A stored `"system"` follows the media query (`script.ssr.test.ts` `stored system`). A `storageKey` or attribute that contains `</script>` is escaped, and the HTML has no raw `</script>` (`script.ssr.test.ts` `escape`).

`useTheme()` throws outside `ThemeProvider`, including when `theme` was absent (`provider.ssr.test.ts` `outside`; `provider.test.tsx` `no config`). It returns `{ theme, resolvedTheme, setTheme }`. `theme` and `resolvedTheme` are accessors.

| field | outcome | pitfall | test |
| --- | --- | --- | --- |
| `theme()` | `"light"`, `"dark"`, or `"system"` | during SSR and during the hydration render this is `defaultTheme`. Storage is not read until after hydration commits | `provider.test.tsx` `hydrate` |
| `resolvedTheme()` | `"light"` or `"dark"`. `"system"` follows the media query. A media change updates this value and the attribute, and `theme()` stays `"system"` | during SSR and during the hydration render, the media query is not read, so `"system"` resolves to `"light"` until hydration commits. A media change while `theme()` is `"light"` or `"dark"` does nothing | `provider.test.tsx` `media`, `media ignored` |
| `setTheme(next)` | `next` must be a member of `themes`. Writes `storageKey`, then sets the attribute and `colorScheme` from `resolvedTheme()`. A storage throw is ignored and the attribute still updates | any other argument throws, and storage is unchanged. Calling it on the server throws. `setTheme()` and `setTheme(undefined)` throw | `provider.test.tsx` `set theme`, `set theme rejects`; `provider.ssr.test.ts` `server set` |

After hydration commits, a stored member of `themes` replaces `theme()`. That write is a client `onSettled` callback. The server render passes `defaultTheme` to `createSignal` and does not call the setter. A `SERVER_WRITE` during that render fails `provider.ssr.test.ts` `server pure` (B90). The provider does not set the attribute during the hydration render. The script owns the attribute until that commit. CSS reads the attribute. `setTheme` then posts `{ type: "theme", value }` on `flare.sync`. The provider does not listen for a `storage` event. There is no theme cookie. The channel rules are Cross-tab (`provider.test.tsx` `theme channel`, `theme channel bad`, `theme channel quiet`).

`toggleTheme` does not exist. A `config` prop does not exist.

## Direction

`createRouter({ direction })` stores the resolved config on the router context. The locale is per request, so it is a prop. This feature does not import i18n, does not read `useLocale`, and does not read the locale cookie.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `defaultDir` | no | `"ltr"` | `"ltr"`, `"rtl"` | the dir when `locale` is omitted, `""`, or `Intl.Locale` throws | a tag that parses does not use this value. `und` parses | `features/direction/shared/script-of.test.ts` `absent`, `throws`, `no text info`, `unknown` |
| `attribute` | no | `"dir"` | `"dir"`, or `data-` then lowercase letters and digits in words joined by single hyphens | `"dir"` sets the HTML `dir` attribute once. A `data-*` name sets that attribute and also sets `dir` to the same value | `class`, `style`, `id`, and any other name outside that pattern, such as `data-Dir` or `data-`, throw at `createRouter` | `script.ssr.test.ts` `attr`, `data attr`; `create-router.test.ts` `direction attribute` |
| `storageKey` | no | `"flare.dir"` | a non-empty string | `localStorage` key. A value of exactly `"ltr"` or `"rtl"` beats the locale. Any other value, and a throw on read, is absent. `setDirection("ltr")` and `setDirection("rtl")` are the only writers. `setDirection()` removes the key | an empty string throws at `createRouter`. A locale change does not write the key | `script.ssr.test.ts` `stored wins`; `provider.test.tsx` `clear`; `create-router.test.ts` `direction storage` |

`dirOf(locale)` is the pure function in `script-of.ts`. Omitted locale, `""`, or a thrown `Intl.Locale` returns `defaultDir`. Otherwise the result is `"rtl"` when `new Intl.Locale(locale).maximize().script` is one of the Unicode right-to-left scripts (Adlm, Arab, Aran, Armi, Avst, Chrs, Cprt, Elym, Hatr, Hebr, Hung, Khar, Lydi, Mand, Mani, Mend, Merc, Mero, Narb, Nbat, Nkoo, Orkh, Ougr, Palm, Phli, Phlp, Phnx, Prti, Rohg, Samr, Sarb, Sogd, Sogo, Syrc, Thaa, Yezi), and `"ltr"` for any other script. It does not call `getTextInfo`: Firefox 151 has no `Intl.Locale.prototype.getTextInfo`, so a result that depends on it would differ between the server and a Firefox client after a client-side locale change. `maximize()` is in every target runtime, so the server and every browser compute the same value. The module holds that script set and no array of language codes. `en` is `ltr`, `ar` is `rtl`, `xx-Arab` is `rtl`, `aran` is `rtl`, and `und` is `ltr` (`script-of.test.ts` `latin`, `arabic`, `script data`, `aran`, `unknown`, `no text info`). A tag a runtime's ICU maximizes to no script goes through a small alias table: Bun's ICU leaves Dari, `prs`, with no script, and gives `prs` for `drw` and `tnf` too, where Node and every browser give `fa-Arab-AF`. `prs` reads as `fa-AF`, so Dari is `rtl` on the server and the client alike (`script-of.test.ts` `dari`, `no likely script`, BUGS.md 433).

```tsx
<DirectionScript locale={tag} />
<DirectionProvider locale={tag}>{children}</DirectionProvider>
```

`tag` is the same value passed to `LocaleProvider` as `initial`: the route param when it is a string, omitted when the param is absent. `locale={undefined}` is omission.

| component | props | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `DirectionScript` | `locale`, optional | one inline script, under Solid `NoHydration`, nonce from `nonce()`. The script does not call `Intl`. It reads `storageKey` and uses that value when it is `"ltr"` or `"rtl"`. Otherwise it uses the `dirOf(locale)` literal this render computed. It sets `attribute` as the table above describes | a prop other than `locale` does not type-check. Rendering it when `direction` is absent throws. A `storageKey` containing `</script>` is escaped | `script.ssr.test.ts` `attr`, `stored wins`, `no config`, `escape`; `script.test.tsx` `once` |
| `DirectionProvider` | `children`, required. `locale`, optional | the subtree, and the context `useDirection` reads. A new `locale` recomputes `dirOf`. While storage holds `"ltr"` or `"rtl"`, the attribute stays on that stored value | no `config` prop. When `direction` is absent it renders `children` and `useDirection` throws. A locale change does not write storage | `provider.test.tsx` `change`, `stored wins`, `no config` |

`useDirection()` throws outside `DirectionProvider` (`provider.ssr.test.ts` `outside`). It returns `{ direction, setDirection }`. `direction` is an accessor and returns the applied dir, `"ltr"` or `"rtl"`.

| call | outcome | pitfall | test |
| --- | --- | --- | --- |
| `direction()` | the stored `"ltr"` or `"rtl"` when storage holds one, otherwise `dirOf(locale)` | during SSR and during the hydration render, storage is not read, so this is `dirOf(locale)`. The script owns the attribute until hydration commits. After that commit, a stored `"ltr"` or `"rtl"` replaces it. The provider does not set the attribute during the hydration render | `provider.test.tsx` `hydrate` |
| `setDirection("ltr")` or `setDirection("rtl")` | writes that value to `storageKey` and sets the attribute. A storage throw is ignored and the attribute still updates. Later locale changes do not move the attribute | the server throws. A locale tag is not a legal argument | `provider.test.tsx` `set`; `provider.ssr.test.ts` `server set` |
| `setDirection()` | removes the key and sets the attribute to `dirOf(locale)`. `setDirection(undefined)` is the same call | any other argument throws, and storage is unchanged | `provider.test.tsx` `clear`, `bad set` |

`setDirection` then posts `{ type: "direction", value }` on `flare.sync`. `setDirection()` posts `null`. The provider does not listen for a `storage` event. There is no direction cookie. The channel rules are Cross-tab (`provider.test.tsx` `direction channel`, `direction channel quiet`).

`toggleDirection` does not exist. `getDirFromLocale` is not a return field and not a public export. `rtlLocales` does not exist. v0 had that list. A hardcoded language list was wrong for scripts the list forgot.

## Optional peers

i18n, Image, and Query each need packages an app that skips the feature never installs: `@formatjs/intl-localematcher`, `isbot`, and `negotiator` for `@lovrozagar/flare/i18n/server`; `sharp` for `flare({ image })`; `@tanstack/solid-query` for `@lovrozagar/flare/query`. Used without them, a build and the dev server fail with one line per missing peer of the feature, `flare: <feature> needs <peer>. Install it: npm install <peer>@"<range>"`, the range the package declares (`vite/plugin/peers.ts`, `peers.test.ts`; consumer cells `i18n without peers`, `i18n without peers, dev`, `image without sharp`, `query without solid-query`). `flare({ image })` needs `sharp` whether or not an image is imported. A built server bundles the i18n peers, so a deploy that drops them after the build still answers (`i18n peers removed after build`, BUGS.md 300).

## i18n

Peers `@formatjs/intl-localematcher`, `isbot`, and `negotiator` (Optional peers).

```ts
createRouter({ locale: { locales, defaultLocale, paramName?, cookieName? } })
createServer({ router, locale: i18n({ botDetection? }) })
```

The router's `locale` is the one source of the tags, the default, the param name, and the cookie name: `i18n()` reads them from it. `locales`, `defaultLocale`, `paramName`, and `cookieName` may still be passed to `i18n()`, and each one passed must equal the router's, or `createServer` throws naming the field; a server with a locale slot and a router with no `locale` throws too (`server/lifecycle/locale-slot.test.ts` `router locale`, `tests/integration/i18n.test.ts` `router config`, BUGS.md 185).

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `locales` | no | the router's | non-empty string array, the tags the app uses | only a configured tag, in any case, is a locale segment. Given here, it must equal the router's `locales`. Any other segment is an ordinary path segment: `/pricing/x` under `[[locale]]/[topic]` is the router's 404, never a locale redirect or a locale cookie. A static route at that path wins. A wrong-case configured tag 301s to the configured spelling | a tag the app does not list is a 404 unless a route matches it as an ordinary segment | `features/i18n/server/match.test.ts` `casing`, `static wins`, `unconfigured tag`; `tests/integration/i18n.test.ts` `locales`; `server/lifecycle/locale-slot.test.ts` `router locale` |
| `defaultLocale` | no | the router's | one of `locales` | an optional segment omits this tag. A required `[locale]` keeps it in the path | a default that is not in `locales` throws | `middleware.test.ts` `default missing`; `match.test.ts` `casing` |
| `cookieName` | no | the router's, `"flare.locale"` by default | a cookie token | set on the negotiation 302 and on private responses, including a private data response. A wrong-case path tag's 301 is the router's case fold, which runs before the locale slot, so it carries no cookie. `setLocale` writes the same cookie on the client after its navigation commits, under the router's `cookieName`, which defaults to the same name. A document whose URL does not already show the chosen tag is 302, `no-store`, and the query is kept. Only documents redirect. Prefetch never sets the cookie and never redirects | a shared 200 never sets it. A 301 for this negotiation would stick in the browser. A wrong-case path tag stays a 301 | `middleware.test.ts` `cookie on shared`, `negotiate 302`, `prefetch quiet` |
| `paramName` | no | the router's, `"locale"` by default | a param name | the segment that holds the tag | | `match.test.ts` `path first` |
| `botDetection` | no | `true` | `boolean` | `true` treats an `isbot` user agent as a bot. A bot does not follow the cookie, does not follow `Accept-Language`, and does not get a locale `Set-Cookie`. A configured path tag is the locale. No path tag stays on that URL with `defaultLocale` and no redirect. `false` uses the same negotiation as a browser | a missing `User-Agent` is `""`. Wrong casing still 301s. An unconfigured locale-like segment follows the same static, optional, and required rules as a browser | `match.test.ts` `bot path`, `bot root`, `bot off`, `unconfigured tag` |

Messages:

| API | outcome | pitfall | test |
| --- | --- | --- | --- |
| `createTranslations({ en: { hello: "Hi" } })` | a null-prototype map | a `__proto__` key returns the key | `translate.test.ts` `proto` |
| `t("hello")` | the string. A missing key is itself run through `formatMessage`, so `t("Hello {name}", { name: "x" })` with no such key gives `Hello x` | | `translate.test.ts` `miss` |
| plural | `Intl.PluralRules`, cardinal and ordinal, with an `other` branch required. The value is a number | a missing `other` throws when the translations are created. A value that is not a number, a numeric string included, leaves the token as written | `plural.test.ts` |
| select | for a string value, the matching branch, else `other` | a value that is not a string leaves the token as written: `{g, select, a {A} other {O}}` with `g: 1` gives the token, not `O` | `plural.test.ts` `select` |
| `t.rich(key, components)` | on `useT`'s `t` only. ICU runs first. Then paired `{tag}...{/tag}` only when `tag` is a key of `components`. Text outside a matched tag is escaped. A placeholder name wins over a component of the same name | `{toString}` with no component stays escaped text | `rich.test.ts` `proto tag`, `placeholder wins` |
| `formatMessage(message, values?, locale?)` | substitutes `{name}`. A number uses `Intl.NumberFormat(locale)`. Plural, select, and `selectordinal` use `Intl.PluralRules` for that tag. An exact `=N` branch wins. `#` is replaced with the number. A missing value leaves the original token, and so does a value of the wrong type: `{n, number}`, plural, and `selectordinal` take a number, and select takes a string. Digits follow the runtime's CLDR data for the tag; Flare pins no numbering system, so they match every other `Intl` call on the page. A tag with `-u-nu-` (`ar-u-nu-arab`, `ar-u-nu-latn`) fixes them on every runtime and every CLDR version. CLDR 46 changed `ar`'s default to Latin digits while `ar-EG` and `ar-SA` keep Arabic-Indic, so a server and a client whose ICU versions straddle that change can differ for a bare `ar` (BUGS.md B29) | a missing, `null`, or `undefined` value leaves `{name}`. Omitted `values` leaves every placeholder. Omitted `locale` during render inside `LocaleProvider` is that provider's tag. Outside the provider, omitted `locale` throws. A tag `Intl.Locale` rejects throws at the call. `t`, `useLoaderT`, and `usePreloaderT` pass the tag they are bound to. Numbers follow the Intl data of the runtime that renders: dev and production under Bun on macOS use the system's ICU, whose `ar` formats Arabic-Indic digits (`١٤`) where Node, and Bun on Linux, format `14`; the plural category is the same on each (BUGS.md 179) | `features/i18n/shared/format.test.ts` `placeholder left`, `number`, `plural locale`, `ordinal`, `exact`, `locale omitted`, `locale outside`, `bad tag`, `numbering from tag` |

`locales` takes canonical BCP 47 tags, each one equal to `Intl.getCanonicalLocales(tag)[0]`: `en`, `en-US`, `zh-Hant`, `zh-Hant-TW`, `sr-Latn`, and `pt-BR`. Any other spelling throws `locale.locales <tag>` at `createRouter`, and at `i18n()` when passed there: `en-us`, `zh-hant`, `pt-br`, `EN`, `iw`, and `sh`, which `Intl.Locale` accepts, as well as `""` and `"en_US"`, which it rejects (`match.test.ts` `bcp47`).

`Accept-Language` is read up to 8 tags, after the path and the cookie. `negotiator` parses those tags. One `@formatjs/intl-localematcher` `match()` runs against the configured list. `en-US` matches `en` when `en` is the closest configured tag. If the app lists both `en` and `en-US`, `en-US` wins for `en-US`. The result is the configured spelling (`match.test.ts` `header`, `language en`, `language both`, `language spelling`). A bot skips the cookie and the header.

A segment of `paramName`, after `basePath`, is a locale only when it is a configured tag, in any case; any other segment is an ordinary path segment, with no locale redirect and no locale cookie (B73, BUGS.md 184). A static route at that path wins and is not redirected (`match.test.ts` `static wins`). A wrong-case path tag stays a 301 to the configured spelling (`casing`).

A document whose URL does not already show the tag chosen by the cookie or `Accept-Language` is a 302, `no-store`, and the query is kept (`middleware.test.ts` `negotiate 302`). A `.response()` route is not a rendered document: it is never negotiated. It gets no cookie- or `Accept-Language`-driven 302, no locale `Set-Cookie`, and no `negotiated` private downgrade, and it keeps its own `Cache-Control`; its locale is the URL's tag, or `defaultLocale` when untagged. The URL-shape rules still apply to it: a wrong-case tag 301s and an unknown optional tag is stripped (`middleware.test.ts` `response route`, `response route tagged`; BUGS.md B23). A document whose URL shows no tag, under an optional locale param with more than one configured locale, depended on the cookie and `Accept-Language` even when it did not redirect. It keeps its shared decision for the Flare store, which sits behind the locale slot, and leaves `private, no-store`, because a CDN copy would answer without the slot (`negotiated private`). An app that wants every locale cached at the CDN uses a required `[locale]` segment. Only documents redirect. A private data response may set the cookie and does not redirect (`data cookie`). Prefetch never sets the cookie and never redirects (`prefetch quiet`). A required `[locale]` keeps `defaultLocale` in the path.

The cookie, when it is set, is `Path=/`, `SameSite=Lax`, `Secure` on https, no `Domain`, `Max-Age` one year. Those attributes are not options (`middleware.test.ts` `cookie attrs`). The locale redirect sets no `Vary` header (`server/cacheability/variant.test.ts` `no vary`).

The slot reads `cookieName` through Solid's cookie API, which trims, unquotes, and percent-decodes a value and, for a name sent twice, keeps the last one: `flare.locale= hr`, `flare.locale="hr"`, and `flare.locale=h%72` each read as `hr`. Flare does not split the `Cookie` header. The string that API returns is followed only when `locales` contains it exactly, in the configured casing. Flare adds no trim and no case fold of its own. An empty string, the wrong case, a tag the app did not list, and any other string are the same as no cookie. The request then continues with `Accept-Language`, then `defaultLocale`. A path tag still wins, including when the cookie is bad (`match.test.ts` `cookie bad`, `cookie case`, `cookie junk`, `cookie ignored on path`).

A bad cookie does not redirect by itself and is not cleared on a shared response. `Location` and `Set-Cookie` are built from the resolved tag in `locales`, never from the raw cookie string. A redirect or a private response that sets the cookie replaces the stored value with that tag (`middleware.test.ts` `cookie replaced`).

```tsx
const tag = useParams({ from: "[locale]/_root_" }).locale;

<LocaleProvider initial={tag}>
  <html>
    <head>
      <LocaleScript />
    </head>
    <body>{children}</body>
  </html>
</LocaleProvider>
```

`paramName` defaults to `"locale"`. `useParams({ from })` returns that route's params (`dx/types.md`). `from` is the layout's route id. A string is the tag the server resolved. On an optional segment, a non-default tag is on the path and the default tag has no segment. On a required `[locale]`, `defaultLocale` stays in the path. `undefined` omits `initial`, and omission means `defaultLocale`. `initial={undefined}` is that omission. The layout does not read the cookie and does not read `Accept-Language`. `useRequestLocale` does not exist.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `config` | no | the router's `locale` | any of `locales`, `defaultLocale`, `paramName`, and `cookieName` | the provider reads all four from the router it runs under, so a renamed `paramName` or `cookieName` works with no prop. Each field `config` names must equal the router's (BUGS.md 440) | a field that differs throws at mount, naming the field and both values, such as `LocaleProvider: config.paramName "lang" is not the router's "locale"`. Under a router with no `locale` option, `config` must name `locales` and `defaultLocale`, or it throws. The provider does not read the URL, the cookie, or `Accept-Language` | `features/i18n/shared/provider.test.tsx` `config`, `router locale config` |
| `initial` | no | `defaultLocale` | a string tag, or omitted | the current locale. A new string replaces it | a tag not in `locales` throws. The layout passes the route param, not `defaultLocale`, when the param is a string | `provider.test.tsx` `initial`, `initial changes` |
| `children` | yes | — | JSX | the subtree. `LocaleScript` reads the locale only inside this subtree | | `provider.test.tsx` `config` |

`useLocale()` throws outside `LocaleProvider` (`provider.test.tsx` `locale outside`). It returns `{ locale, locales, defaultLocale, setLocale }`. `locale` is an accessor and returns the tag. `locales` and `defaultLocale` are the config values, not accessors. `setLocale(tag)` navigates to that tag on the current route. On an optional segment the default tag drops the segment. On a required `[locale]` the default tag stays in the path. The query stays exactly as the URL holds it, its order and every key, and so does the hash; a key a page's search drops, such as `constructor`, stays in the URL and is still dropped when the page reads its search. Only Flare's reserved pairs, `_flare` and `_flare_stale`, leave it, as from any navigation (`provider.test.tsx` `query as written`, `shared/url/href.test.ts` `raw query`, `client/navigation/target.test.ts` `raw query`, BUGS.md 322, 441). History is pushed. On a route with no `paramName` param, which has no place for a tag, `setLocale` rejects with `setLocale: <route id> has no <paramName> param` and does not navigate (`provider.test.tsx` `no locale param`, BUGS.md 439). Once that navigation commits, it writes `document.cookie` with the config's `cookieName` and the server's attributes (`features/i18n/shared/cookie.ts`), so a shared page, whose answer cannot carry the cookie, still keeps the choice. It does not write `localStorage`. A navigation that does not commit writes nothing. A tag outside `locales` throws (`provider.test.tsx` `set locale`). Rendering `LocaleProvider` writes no cookie (`provider.test.tsx` `no cookie`).

After that navigation commits, the provider posts `{ type: "locale", tag }` on `flare.sync`. The channel rules are Cross-tab (`provider.test.tsx` `locale channel`, `locale channel replace`, `locale channel same`, `locale channel quiet`).

`LocaleScript` takes no props. A prop does not type-check. Rendered outside `LocaleProvider`, it throws. Inside, it emits one inline script under Solid `NoHydration`. The script sets `document.documentElement.lang` to the current tag, replacing any lang that was already there. Its nonce is the request nonce (`server.md`). A client navigation does not insert a second script. The provider sets `lang` when `locale()` changes (`script.ssr.test.ts` `lang`, `script outside`; `script.test.tsx` `once`).

`useT(translations)` in a render gives `t` and `t.rich`, bound to `useLocale().locale()` each time one is called, so a locale change reads through. It needs `LocaleProvider` above it, as `useLocale` does. `t.rich`'s text outside a matched tag is text on the page, escaped on the server (`tests/integration/i18n.test.ts` `render t`, in dev and a production build; BUGS.md 142).

`useLoaderT(translations)` and `usePreloaderT(translations)` take the map `createTranslations` returns and give a text-only `t`, with no `t.rich`: JSX cannot travel in loader data, and a loader runs outside any render. A `t.rich` there is a type error. Each is bound to the locale of the loader or preloader running now: the route's `paramName` param when it is a configured tag, otherwise `defaultLocale`, from the router's locale config. They are called inside the `.loader()` or `.preloader()` callback. The core runs each such call under a child of the request event, which inherits the request (`serverCtx()` included) and carries `{ kind, params, locale }`. Solid's async-local storage keeps each call's scope apart across awaits, and the request event is the parent again once the call returns (`server/loaders/scope.test.ts` `loader scope`). In a render, a server function, the other hook's function, or outside a request they throw. Without `createRouter({ locale })` they throw. Loaders and preloaders run only on the server (B8), so the client has no such scope (`features/i18n/shared/hooks.test.ts` `outside`).

These v0 fields do not exist: the provider `broadcast` flag, `skip`, `syncDirection`, `cookie.maxAge`, `cookie.secure`. `flare({ broadcast })` is the Cross-tab switch, not that flag. `createBroadcastSignal`, `useBroadcast`, and `navigate({ broadcast })` do not exist. Direction does not read the locale on its own (`rtlLocales` is gone). The app passes the same tag as `initial` and as `locale`.

## Image

Peer `sharp`, which `flare({ image })` needs (Optional peers).

`<Image />`. Widths come from `flare({ image: { widths, quality? } })` in the Vite config. A component width outside that set is a render error in dev and in production, naming the width and the set: `Image width 500 is not one of the plugin widths (640, 750, 828, 1080, 1200, 1920)`. A build does not read component props, so it does not catch one (BUGS.md 446). The dev endpoint answers such a width 400.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `alt` | yes | — | string | the attribute | an empty string is allowed and means decorative | `features/image/shared/image.test.tsx` `alt required` |
| `src` | yes | — | the binding of a `?image` import of `.avif`, `.jpg`, `.jpeg`, `.png`, `.tiff`, or `.webp`, or a URL string | a binding writes its variants. A string is the `src` attribute as given: no resolution, no escape check, and no srcset. It still gets the `fixed` width and `widths` checks against the widths the app configured (BUGS.md 442); without `flare({ image })` there are none, so a remote image's widths are its own (`image.test.tsx` `string src without the plugin`) | a `?image` import outside the project root is a build error naming the file (BUGS.md 455). The dev endpoint answers a `src` that leaves the root 400 | `optimize.test.ts` `exclude`; `dev-endpoint.test.ts` `escape`; `image.test.tsx` `string src checks` |
| `widths` | no | the plugin's `widths` | integers from the plugin set | the srcset | a number the plugin did not list throws at render, naming it and the set | `optimize.test.ts` `other width`; `image.test.tsx` `string src checks` |
| `sizes` | no | — | string | passed through on the attribute | | `image.test.tsx` `sizes` |
| `quality` | no | the plugin, else `75` | integer `1`–`100` | adds `&q=` on the dev URL only. Production bytes stay the plugin quality | any other value throws at render, in dev and production alike: `Image quality 0 is not an integer from 1 to 100` (BUGS.md 444) | `optimize.test.ts` `quality`, `dev q`; `image.test.tsx` `quality range` |
| `priority` | no | `false` | boolean | `true` sets `loading="eager"`, `decoding="sync"`, and `fetchpriority="high"`. The default is `loading="lazy"` and `decoding="async"` | | `image.test.tsx` `priority` |
| `placeholder` | no | `"none"` | `"none"` or `"blur"` | `"blur"` uses `blurDataURL` as a cover background until load, then removes it. A client-rendered image takes its `src`, `srcset`, and `sizes` once it is on the page, so Chromium never keeps it (BUGS.md 246); a server-rendered one has them as rendered | `"blur"` without `blurDataURL` throws | `image.test.tsx` `blur missing`, `blur until load` |
| `blurDataURL` | when `placeholder` is `"blur"` | — | a `data:` URL, its scheme in any case | the background image | any other scheme is dropped. `DATA:` is `data:` (BUGS.md 445) | `image.test.tsx` `blur scheme` |
| `fill` | the fill mode | — | `true` | inline style `position: absolute; inset: 0; object-fit: cover` plus the aspect ratio. The srcset is every generated width as `Nw`, uncapped | `width` or `height` with `fill` throws | `image.test.tsx` `fill` |
| `fixed` | no | `false` | boolean | `true` requires `width` and `height` and sets those pixel styles and attributes. The srcset is density: the variant at `width` is `1x`, and the variant at `width * 2` is `2x` when that width is in the plugin set. Otherwise the srcset is `1x` only | `true` with `fill` or `maxWidth` throws. A `width` outside the plugin set throws. A missing `2x` width is omitted. It is not labeled with another width | `image.test.tsx` `fixed`, `fixed 2x` |
| `width` | the fixed mode | — | a number, one of the plugin widths | required together with `height` when `fixed` is `true` | | `image.test.tsx` `fixed` |
| `height` | the fixed mode | — | a number | the same | | same |
| `maxWidth` | the responsive mode | — | a number | inline style `width: 100%` and that max width. The srcset stops above `maxWidth * 2` | | `image.test.tsx` `responsive` |
| `maxHeight` | no | — | a number, with `maxWidth` | caps the box and supplies the aspect ratio when `aspectRatio` is omitted | without `maxWidth` it does not type-check, and a JavaScript caller's throws `Image maxHeight and aspectRatio need maxWidth` (BUGS.md 443) | `image.test.tsx` `responsive`, `responsive needs maxWidth` |
| `aspectRatio` | no | — | a number, with `maxWidth` | the box ratio when one dimension is missing | the same | same |

The modes `fill`, `fixed`, and responsive (`maxWidth`) are mutually exclusive. Two of them throw (`image.test.tsx` `two modes`). With none of them the image is plain: no layout style, and the srcset is every variant as `Nw`, only those in `widths` when it is given. The plugin `widths` default, when the app sets `image: {}`, is `[640, 750, 828, 1080, 1200, 1920]`. `2048` and `3840` are not in the default.

A responsive srcset is `<url> <width>w`, ascending, comma-separated. Widths above `maxWidth * 2` are left out when `maxWidth` is set. A built variant's URL names its file percent-encoded, so `%`, whitespace, and a comma, which a srcset would split at, read back as that file: `my photo.png` is `my%20photo-640-<hash>.webp` and `50%.png` is `50%25-640-<hash>.webp` (`optimize.test.ts` `prod url names`, `image.test.tsx` `srcset file names`, BUGS.md 432).

An optimized import opts in with `?image`: `import photo from "./a.png?image"`. A plain `./a.png`, and any other query, stay Vite's URL string, so an app keeps `vite/client` in its `types`. The `./vite` entry carries the `?image` module types. The optimized import binding is `{ src, width, height, variants }` at the intrinsic pixel size. There is no generated blur on that binding. Only configured widths that fit the bitmap are generated. An image narrower than every configured width is one webp variant at its own width, so a small `.png` ships as webp and a `.tiff`, which browsers do not display, displays. Its dev URL names that width, which the endpoint takes for that file only, so a component `quality` works on it too (`optimize.test.ts` `no variant`, BUGS.md 454). A `.webp` source is re-encoded at the plugin quality. Production `src` is the largest generated variant. A bad `q`, a width that is neither configured nor that file's own width below every configured one, or a path outside the project is 400. A missing file inside the project is 404 (`optimize.test.ts` `binding`, `webp`, `missing`).

Production files are `<assetsBase>/<stem>-<width>-<8 hex sha256 of the webp bytes>.webp`. Quality is in those bytes, so a different plugin quality is a different hash. Component `quality` does not change those bytes. The dev URL is `GET /_flare/image?src=<project path>&w=<width>`, each path segment percent-encoded, so `+`, `&`, and `#` in a file name reach the endpoint as written (`optimize.test.ts` `dev url names`, BUGS.md 456). `&q=<quality>` is added only when that quality differs from the plugin default (`optimize.test.ts` `prod name`, `dev url`). The endpoint serves a file under the project only: a path that leaves it, or a symlink that resolves outside it, to a file or through a directory, is 400 before any file is read (`dev-endpoint.test.ts` `escape`, `symlink escape`, BUGS.md 164). Leaving is `..` itself or `..` followed by a separator; a name that only starts with `..`, such as `..hero.png`, is in the project (`dev-endpoint.test.ts` `dot names`, BUGS.md 457).

Optimized extensions are `.avif`, `.jpeg`, `.jpg`, `.png`, `.tiff`, and `.webp`. `.svg` and `.gif` keep the URL the app imported and are not converted to webp, with or without `?image` (`optimize.test.ts` `svg`, `gif`). The dev endpoint refuses a path that leaves the project after decoding and a file that is not an optimized image, before reading any file (`dev-endpoint.test.ts` `endpoint refuses`). `configureImage` does not exist. A `loader` option does not exist (`src/vite/plugin/options.test.ts` `unknown`).

## Fonts

```ts
const font = createFont({ family, src, category, weights?, style?, fallbackMetrics? })
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `family` | yes | — | string | escaped into `@font-face` | `</style>` in the name is escaped | `features/fonts/shared/css.test.ts` `escape family` |
| `src` | yes | — | a URL path the app serves, or a registry file | the `url()`. Each face is written `format("woff2")` and preloaded as `type="font/woff2"`, so `src` is meant to be a woff2 file | a `src` with `..` throws. Another format may still load, under that label | `css.test.ts` `escape url` |
| `category` | yes | — | `"serif"`, `"sans-serif"`, `"monospace"`, `"display"`, `"handwriting"` | the stack is `"<family>", <generic>`. `serif` is `serif`, `sans-serif` is `sans-serif`, `monospace` is `monospace`, `display` is `sans-serif`, `handwriting` is `cursive`. With `fallbackMetrics` the stack is `"<family>", "<family> Fallback", <generic>` | | `create-font.test.ts` `stack` |
| `weights` | no | `"400"` | `"400"` or a non-empty number array, each from 1 to 1000 | one `@font-face` per listed weight, each `font-display: swap`, each pointing at `src`. `createFont` emits no `unicode-range`. Two weights are two faces that share `src` | v0 emitted the first weight only. v1 emits every listed weight. An empty list throws `createFont: weights lists no weight, so no face would load`, and a weight outside 1 to 1000 throws `font weight "1001" is not valid` (BUGS.md 438) | `create-font.test.ts` `weights`, `no unicode range`, `self-served checks` |
| `style` | no | `"normal"` | `"normal"`, `"italic"` | `font-style` on each face | | same |
| `fallbackMetrics` | no | absent | `{ ascentOverride, descentOverride, lineGapOverride, sizeAdjust, fallbackFont }`, the first four percentages such as `"90%"`, `fallbackFont` a font name | a second `@font-face` whose family is `"<family> Fallback"`, with `size-adjust`, `ascent-override`, `descent-override`, and `line-gap-override`. `src` is `local()` of the fallback name. `Arial`, `Courier New`, and `Times New Roman` also list their metric-compatible names: Arial, ArialMT, Liberation Sans, LiberationSans-Regular, Arimo; Courier New, CourierNewPSMT, Liberation Mono, LiberationMono-Regular, Cousine; Times New Roman, TimesNewRomanPSMT, Liberation Serif, LiberationSerif-Regular, Tinos | a partial object throws. An override that is not a percentage throws: `ascentOverride: "90"` is `font ascent-override "90" is not valid` | `create-font.test.ts` `partial metrics`, `fallback face` |

```tsx
<FontCSS font={font} />
<FontCSS font={font} preload={false} subsets={["latin"]} />
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `font` | yes | — | the object `createFont` returns, or a registry font | the escaped CSS in a style tag that carries the request nonce | | `features/fonts/shared/font-css.test.tsx` `nonce` |
| `preload` | no | `"latin"` on a registry font. A `createFont` result preloads its `src` | a subset name, or `false` | a `<link rel="preload" as="font" type="font/woff2" crossorigin>`: for a registry font, the normal-style files of that subset; for a `createFont` result, its own `src`, whatever its `style`. `false` emits no preload | on a registry font, a subset it does not list throws when the component renders. A `createFont` result is one file, so a name changes nothing and is never checked (BUGS.md 438). A registry font with no `latin` files emits no link when `preload` is omitted | `font-css.test.tsx` `preload`, `preload off`, `unknown subset`, `no latin`; `create-font.test.ts` `self-served checks` |
| `subsets` | no | the font's own subset list | `string[]` | passed to `font.css`. A `createFont` result has one file, so this list does not change its CSS | on a registry font, a name it does not list throws when the component renders. A `createFont` result checks no name (BUGS.md 438) | `font-css.test.tsx` `subsets`; `create-font.test.ts` `self-served checks` |

A registry `@font-face` copies `font-weight` and `unicode-range` as stored and takes `font-style` from the entry (`features/fonts/shared/css.test.ts` `unicode range`, `variable weight`). `createFont` does not emit `unicode-range`.

A registry font is the default export of `@lovrozagar/flare/fonts/<id>` (B78). `<id>` is a key of `features/fonts/registry.json`. `import inter from "@lovrozagar/flare/fonts/inter"`. A hyphenated id stays hyphenated in the path: `@lovrozagar/flare/fonts/open-sans`. `@lovrozagar/flare/fonts` does not resolve. The root entry's `createFont` and `FontCSS` do not import a generated module. An id that is not a key does not resolve.

## Query

Peer `@tanstack/solid-query` (Optional peers).

Known issue, upstream: with `@solidjs/signals` 2.0.0-rc.16, a query that fails, read in an element child (`<span>{query.data}</span>`, or a `Dynamic`'s children), never reaches its `<Errored>` or the route's `errorRender`, and the slot stays empty (solidjs/solid#4189, from Solid's fb6006eb). A read returned directly as a `<Loading>`'s child is not affected. Flare's `solid-js` and `@solidjs/web` peers stay below rc.16, but `solid-js` rc.15 depends on `@solidjs/signals ^2.0.0-rc.15`, so a fresh install resolves signals rc.16 and has the issue; a lockfile that resolves `@solidjs/signals` 2.0.0-rc.15 does not (BUGS.md 426).

| API | required args | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `createQueryClientGetter()` | none | one client per document on the client. On the server, one client per request, on the request event's `locals`, which a loader's scope shares. A second call in that request returns it. A call outside a request throws. The getter registers once per process, and a second `createQueryClientGetter()` returns the registered one. A loader's `ctx.queryClient` is that request's client, and with no getter registered it throws `call createQueryClientGetter() in a module your router imports`. The document state's `queries` is the request's cache taken after the shell rendered, each query's data a wire value (B145), so a Date, a Map, or a Set a query holds is that value on the client, as a server function's answer is (`getter.ssr.test.ts` `dehydrate wire values`, `getter.test.ts` `wire values`, BUGS.md 364). The client's first call hydrates its client from it before hydrate, so a query the shell resolved, such as one a loader prefetched through `ctx.queryClient`, does not run again. With TanStack's default `staleTime` of 0 a mounted query still refetches; a `staleTime` keeps the server's value. A client navigation's data answer carries the request's query cache too, and the client hydrates it when the navigation commits, so a query a loader prefetched and given a `staleTime` paints with no browser request, on a click and on a hovered prefetch. At TanStack's default `staleTime` of 0 it paints the server's data, then runs its `queryFn` once in the browser: B102's hydration guard does not cover a navigation. A query the client refetched since keeps its newer data (B134, `tests/integration/query-client.test.ts`, `client/navigation/navigate-queries.test.ts`, `getter.test.ts` `hydrate keeps newer`). A query that settles after the shell rides the next data request (B83) | the function takes no options. `broadcast` is not an option. `createRouter` has no query-client field. Core imports `@tanstack/solid-query` only from `./query`. The app passes the getter's client to the TanStack provider. Render and hydrate call this getter | `getter.test.ts` `one client`; `getter.ssr.test.ts` `per request`, `outside` |
| `useSuspenseQuery(options)` | the TanStack options | suspends until the query resolves. The surrounding Solid `<Loading>` shows its fallback, then the children (B80) | Flare does not add a second boundary around the hook | `use-suspense-query.test.ts` `suspense`, `loading swap` |
| `serverFnQueryOptions(fn, { queryKey, input? })` | `queryKey` | `{ queryKey, queryFn, retry }`. `queryFn` calls `fn(input)` and returns the handler's `data`. `retry` is B107's, below. When the server function's input is `void`, `input` is omitted and `queryFn` calls `fn()` | `input` is required when the server function has an input, and it does not type-check when the input is `void`. The helper does not append `input` to `queryKey`. A key that omits the input stores one result for every input. The envelope has no `queries` field | `options.test.ts` `query`, `query void`; `tests/types/app/src/sections/matrix-fns.types.ts` `query options input`, `query options void` |
| `serverFnMutationOptions(fn, { mutationKey? })` | `fn` | `mutationFn(input)` calls `fn(input)` and returns `data`. When `mutationKey` is passed, `onSuccess` calls `setQueryData(mutationKey, data)` on the client from `createQueryClientGetter`. When it is omitted, there is no `onSuccess` | there is no `invalidates` list and no server-side `piggyback`. An `onSuccess` the app passes replaces the helper's | `options.test.ts` `mutation`, `mutation no key` |

The TanStack option fields beyond these wrappers are TanStack's. Flare does not redefine them. `staleTime`, `enabled`, and invalidation stay on the options the app passes to `useSuspenseQuery` or `useMutation`. One default is Flare's: a query the document filled is not run again by any observer that mounts during hydration, whatever its `staleTime` (B102). Another: `serverFnQueryOptions` fails at once on a server-function rejection with a 4xx status and keeps TanStack's retry for network failures and 5xx; the app's own `retry` wins (B107). After hydration, `staleTime` applies as TanStack defines it. A `refetchOnMount` the app sets on the query wins. A server function whose returned `Response` writes a cookie, and `invalidate()`, call `clear()` on the document's client, so a query cached for one visitor never paints for the next (B133, `getter.test.ts` `clear`).
