# Features

Each feature is imported from its subpath. Core does not load it until the app imports it. A property not listed here does not exist.

## Cross-tab

Theme, direction, and locale tell other open tabs through one `BroadcastChannel`, named `flare.sync`. The module is `client/sync`. `localStorage` still holds theme and direction. The channel does not store them. Nothing listens for a `storage` event.

`post` opens a channel of that name, sends one message, and closes it. `subscribe` opens one channel and returns a function that closes it. The module keeps no module-scope `let`. The object that sent a message does not receive it. Every other subscriber on that name does, including a subscriber in the sending tab. A receiver applies the message and does not post, and it does not write `localStorage` (`client/sync/channel.test.ts` `posts`, `applies`).

`flare({ broadcast })` defaults to `true` (`plugin.md`). Omitted and `true` are the same. `false` replaces `client/sync/enabled.ts` in the client environment, in dev and in the client build, with `export const broadcastEnabled = false`. The server copy stays `true`. The server never posts, because `BroadcastChannel` is absent there, so `post` and `subscribe` do nothing. On the client, `false` and a missing `BroadcastChannel` are the same no-op. This tab still writes theme and direction to `localStorage`, and `setLocale` still navigates. Other tabs then read theme and direction from `localStorage` on the next load. They learn a locale change only when they navigate (`channel.test.ts` `off`, `missing`).

| type | message | when it is posted | what the other tab does | test |
| --- | --- | --- | --- | --- |
| `theme` | `{ type: "theme", value }` with `value` `"light"`, `"dark"`, or `"system"` | after `setTheme` has updated this tab, including when the storage write threw | sets `theme()`, the attribute, and `colorScheme` when `value` is in `themes` and is not already `theme()`. `"system"` uses this tab's media query. Any other value is ignored | `features/theme/shared/provider.test.tsx` `theme channel`, `theme channel bad`, `theme channel system`, `theme channel throw` |
| `direction` | `{ type: "direction", value }` with `value` `"ltr"`, `"rtl"`, or `null` | after `setDirection` has updated this tab, including when the storage write threw. `null` means the key was removed | sets `direction()` and the attribute when that dir is not already showing. `null` clears the in-memory override and applies `dirOf(locale)`. Any other value is ignored | `features/direction/shared/provider.test.tsx` `direction channel`, `direction channel same` |
| `locale` | `{ type: "locale", tag }` | after `setLocale`'s navigation commits. A navigation that does not commit posts nothing | navigates to that tag on its own current route, keeping search and hash, with `replace`. On an optional segment the default tag drops the segment. On a required `[locale]` the default tag stays. That navigation does not post. The tag already showing, a tag outside `locales`, or a message without this shape is ignored | `features/i18n/shared/provider.test.tsx` `locale channel`, `locale channel replace`, `locale channel same`, `locale channel search`, `locale channel required`, `locale channel quiet`, `locale channel fail` |

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
| `defaultTheme` | no | `"system"` | `"light"`, `"dark"`, `"system"` | used when storage is absent, throws, or holds a value outside `themes`. It must be a member of `themes` | a value outside `themes` throws at `createRouter` | `features/theme/shared/script.test.tsx` `system`; `shared/router/create-router.test.ts` `theme themes` |
| `attribute` | no | `"data-theme"` | a `data-*` attribute name | set on `<html>` before paint | `class`, `style`, `id`, or `dir` throws at `createRouter` | `script.test.tsx` `before paint`; `create-router.test.ts` `theme attribute` |
| `storageKey` | no | `"flare.theme"` | a non-empty string | `localStorage` key. `setTheme` is the only writer | an empty string throws at `createRouter`. A throw from `localStorage` is an absent value on read and is ignored on write | `script.test.tsx` `explicit`; `create-router.test.ts` `theme storage` |
| `themes` | no | `["light", "dark", "system"]` | a non-empty subset of those three strings, no duplicates | a stored value outside this list is replaced with `defaultTheme`, then resolved | an empty list, a duplicate, or any other string throws at `createRouter` | `script.test.tsx` `unknown stored`; `create-router.test.ts` `theme themes` |
| `disableTransitionOnChange` | no | `true` | boolean | on a resolved change after the post-hydrate apply, inserts `<style nonce={nonce()}>*{transition:none!important}</style>`, sets the attribute, and removes that style on the next animation frame | the post-hydrate read does not insert the style. `false` sets the attribute and inserts no style | `provider.test.tsx` `no transition`, `transition kept` |

```tsx
<ThemeScript />
<ThemeProvider>{children}</ThemeProvider>
```

| component | props | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `ThemeScript` | none | one inline script, under Solid `NoHydration`. Its nonce is the request nonce (`server.md`). A client render does not insert a second script | a prop does not type-check. Rendering it when `theme` is absent throws | `script.test.tsx` `no props`, `no config`, `nonce`, `once` |
| `ThemeProvider` | `children`, required | the subtree, and the context `useTheme` reads | no other prop type-checks. When `theme` is absent it still renders `children`, and `useTheme` throws | `provider.test.tsx` `no config`, `outside` |

The script runs before paint and does the following, in order. A `localStorage` throw is an absent value.

1. Read `storageKey`.
2. If the value is not in `themes`, use `defaultTheme`.
3. If that value is `"system"`, use `"dark"` when `matchMedia("(prefers-color-scheme: dark)")` matches, otherwise `"light"`.
4. Set `attribute` to that `"light"` or `"dark"`. The string `"system"` is never written.
5. Set `document.documentElement.style.colorScheme` to the same value. A throw is ignored.

Nothing stored means `defaultTheme` (`script.test.tsx` `system`). A stored `"light"` or `"dark"` is written as itself and the media query is ignored (`script.test.tsx` `explicit`). A stored value outside `themes` is `defaultTheme`, then step 3 runs (`script.test.tsx` `unknown stored`). A stored `"system"` follows the media query (`script.test.tsx` `stored system`). A `storageKey` or attribute that contains `</script>` is escaped, and the HTML has no raw `</script>` (`script.test.tsx` `escape`).

`useTheme()` throws outside `ThemeProvider`, including when `theme` was absent (`provider.test.tsx` `outside`, `no config`). It returns `{ theme, resolvedTheme, setTheme }`. `theme` and `resolvedTheme` are accessors.

| field | outcome | pitfall | test |
| --- | --- | --- | --- |
| `theme()` | `"light"`, `"dark"`, or `"system"` | during SSR and during the hydration render this is `defaultTheme`. Storage is not read until after hydration commits | `provider.test.tsx` `hydrate` |
| `resolvedTheme()` | `"light"` or `"dark"`. `"system"` follows the media query. A media change updates this value and the attribute, and `theme()` stays `"system"` | a media change while `theme()` is `"light"` or `"dark"` does nothing | `provider.test.tsx` `media`, `media ignored` |
| `setTheme(next)` | `next` must be a member of `themes`. Writes `storageKey`, then sets the attribute and `colorScheme` from `resolvedTheme()`. A storage throw is ignored and the attribute still updates | any other argument throws, and storage is unchanged. Calling it on the server throws. `setTheme()` and `setTheme(undefined)` throw | `provider.test.tsx` `set theme`, `set theme rejects`, `server set` |

After hydration commits, a stored member of `themes` replaces `theme()`. That write is a client `onSettled` callback. The server render passes `defaultTheme` to `createSignal` and does not call the setter. A `SERVER_WRITE` during that render fails `provider.test.tsx` `server pure` (B90). The provider does not set the attribute during the hydration render. The script owns the attribute until that commit. CSS reads the attribute. `setTheme` then posts `{ type: "theme", value }` on `flare.sync`. The provider does not listen for a `storage` event. There is no theme cookie. The channel rules are Cross-tab (`provider.test.tsx` `theme channel`, `theme channel bad`, `theme channel quiet`).

`toggleTheme` does not exist. A `config` prop does not exist.

## Direction

`createRouter({ direction })` stores the resolved config on the router context. The locale is per request, so it is a prop. This feature does not import i18n, does not read `useLocale`, and does not read the locale cookie.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `defaultDir` | no | `"ltr"` | `"ltr"`, `"rtl"` | the dir when `locale` is omitted, `""`, `Intl.Locale` throws, or `getTextInfo` throws | a tag that parses does not use this value. `und` parses | `features/direction/shared/script-of.test.ts` `absent`, `throws`, `text info`, `unknown` |
| `attribute` | no | `"dir"` | `"dir"` or a `data-*` name | `"dir"` sets the HTML `dir` attribute once. A `data-*` name sets that attribute and also sets `dir` to the same value | `class`, `style`, or `id` throws at `createRouter` | `script.test.tsx` `attr`, `data attr`; `create-router.test.ts` `direction attribute` |
| `storageKey` | no | `"flare.dir"` | a non-empty string | `localStorage` key. A value of exactly `"ltr"` or `"rtl"` beats the locale. Any other value, and a throw on read, is absent. `setDirection("ltr")` and `setDirection("rtl")` are the only writers. `setDirection()` removes the key | an empty string throws at `createRouter`. A locale change does not write the key | `script.test.tsx` `stored wins`; `provider.test.tsx` `clear`; `create-router.test.ts` `direction storage` |

`dirOf(locale)` is the pure function in `script-of.ts`. Omitted locale, `""`, or a thrown `Intl.Locale` returns `defaultDir`. Otherwise the result is `"rtl"` when `new Intl.Locale(locale).maximize().script` is one of the Unicode right-to-left scripts (Adlm, Arab, Armi, Avst, Chrs, Cprt, Elym, Hatr, Hebr, Hung, Khar, Lydi, Mand, Mani, Mend, Merc, Mero, Narb, Nbat, Nkoo, Orkh, Ougr, Palm, Phli, Phlp, Phnx, Prti, Rohg, Samr, Sarb, Sogd, Sogo, Syrc, Thaa, Yezi), and `"ltr"` for any other script. It does not call `getTextInfo`: Firefox 151 has no `Intl.Locale.prototype.getTextInfo`, so a result that depends on it would differ between the server and a Firefox client after a client-side locale change. `maximize()` is in every target runtime, so the server and every browser compute the same value. The module holds that script set and no array of language codes. `en` is `ltr`, `ar` is `rtl`, `xx-Arab` is `rtl`, and `und` is `ltr` (`script-of.test.ts` `latin`, `arabic`, `script data`, `unknown`, `no text info`).

```tsx
<DirectionScript locale={tag} />
<DirectionProvider locale={tag}>{children}</DirectionProvider>
```

`tag` is the same value passed to `LocaleProvider` as `initial`: the route param when it is a string, omitted when the param is absent. `locale={undefined}` is omission.

| component | props | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `DirectionScript` | `locale`, optional | one inline script, under Solid `NoHydration`, nonce from `nonce()`. The script does not call `Intl`. It reads `storageKey` and uses that value when it is `"ltr"` or `"rtl"`. Otherwise it uses the `dirOf(locale)` literal this render computed. It sets `attribute` as the table above describes | a prop other than `locale` does not type-check. Rendering it when `direction` is absent throws. A `storageKey` containing `</script>` is escaped | `script.test.tsx` `attr`, `stored wins`, `no config`, `escape`, `once` |
| `DirectionProvider` | `children`, required. `locale`, optional | the subtree, and the context `useDirection` reads. A new `locale` recomputes `dirOf`. While storage holds `"ltr"` or `"rtl"`, the attribute stays on that stored value | no `config` prop. When `direction` is absent it renders `children` and `useDirection` throws. A locale change does not write storage | `provider.test.tsx` `change`, `stored wins`, `no config` |

`useDirection()` throws outside `DirectionProvider` (`provider.test.tsx` `outside`). It returns `{ direction, setDirection }`. `direction` is an accessor and returns the applied dir, `"ltr"` or `"rtl"`.

| call | outcome | pitfall | test |
| --- | --- | --- | --- |
| `direction()` | the stored `"ltr"` or `"rtl"` when storage holds one, otherwise `dirOf(locale)` | during SSR and during the hydration render, storage is not read, so this is `dirOf(locale)`. The script owns the attribute until hydration commits. After that commit, a stored `"ltr"` or `"rtl"` replaces it. The provider does not set the attribute during the hydration render | `provider.test.tsx` `hydrate` |
| `setDirection("ltr")` or `setDirection("rtl")` | writes that value to `storageKey` and sets the attribute. A storage throw is ignored and the attribute still updates. Later locale changes do not move the attribute | the server throws. A locale tag is not a legal argument | `provider.test.tsx` `set`, `server set` |
| `setDirection()` | removes the key and sets the attribute to `dirOf(locale)`. `setDirection(undefined)` is the same call | any other argument throws, and storage is unchanged | `provider.test.tsx` `clear`, `bad set` |

`setDirection` then posts `{ type: "direction", value }` on `flare.sync`. `setDirection()` posts `null`. The provider does not listen for a `storage` event. There is no direction cookie. The channel rules are Cross-tab (`provider.test.tsx` `direction channel`, `direction channel quiet`).

`toggleDirection` does not exist. `getDirFromLocale` is not a return field and not a public export. `rtlLocales` does not exist. v0 had that list. A hardcoded language list was wrong for scripts the list forgot.

## i18n

```ts
createServer({ locale: i18n({ locales, defaultLocale, cookieName?, paramName?, botDetection? }) })
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `locales` | yes | — | non-empty string array, the tags the app uses | a segment `Intl.Locale` accepts is locale-like. A static route at that path wins. An optional param that is not a configured tag redirects to the path with the segment removed, `no-store`. A required `[locale]` substitutes `defaultLocale` and keeps the segment. A wrong-case configured tag 301s to the configured spelling | the stripped path of a required `[locale]` is not a route, so the segment stays | `features/i18n/server/match.test.ts` `casing`, `static wins`, `optional strip`, `required keeps` |
| `defaultLocale` | yes | — | one of `locales` | an optional segment omits this tag. A required `[locale]` keeps it in the path | a default that is not in `locales` throws | `middleware.test.ts` `default missing`; `match.test.ts` `required keeps` |
| `cookieName` | no | `"flare.locale"` | a cookie token | set on redirects and on private responses, including a private data response. `setLocale` writes the same cookie on the client after its navigation commits, under the router's `cookieName`, which defaults to the same name. A document whose URL does not already show the chosen tag is 302, `no-store`, and the query is kept. Only documents redirect. Prefetch never sets the cookie and never redirects | a shared 200 never sets it. A 301 for this negotiation would stick in the browser. A wrong-case path tag stays a 301 | `middleware.test.ts` `cookie on shared`, `negotiate 302`, `prefetch quiet` |
| `paramName` | no | `"locale"` | a param name | the segment that holds the tag | | `match.test.ts` `path first` |
| `botDetection` | no | `true` | `boolean` | `true` treats an `isbot` user agent as a bot. A bot does not follow the cookie, does not follow `Accept-Language`, and does not get a locale `Set-Cookie`. A configured path tag is the locale. No path tag stays on that URL with `defaultLocale` and no redirect. `false` uses the same negotiation as a browser | a missing `User-Agent` is `""`. Wrong casing still 301s. An unconfigured locale-like segment follows the same static, optional, and required rules as a browser | `match.test.ts` `bot path`, `bot root`, `bot off`, `bot unconfigured` |

Messages:

| API | outcome | pitfall | test |
| --- | --- | --- | --- |
| `createTranslations({ en: { hello: "Hi" } })` | a null-prototype map | a `__proto__` key returns the key | `translate.test.ts` `proto` |
| `t("hello")` | the string, or the key when missing | | `translate.test.ts` `miss` |
| plural | `Intl.PluralRules`, cardinal and ordinal, with an `other` branch required | a missing `other` throws when the translations are created | `plural.test.ts` |
| select | the matching branch, else `other` | | `plural.test.ts` `select` |
| `t.rich(key, components)` | ICU runs first. Then paired `{tag}...{/tag}` only when `tag` is a key of `components`. Text outside a matched tag is escaped. A placeholder name wins over a component of the same name | `{toString}` with no component stays escaped text | `rich.test.ts` `proto tag`, `placeholder wins` |
| `formatMessage(message, values?, locale?)` | substitutes `{name}`. A number uses `Intl.NumberFormat(locale)`. Plural, select, and `selectordinal` use `Intl.PluralRules` for that tag. An exact `=N` branch wins. `#` is replaced with the number. A missing value leaves the original token | a missing, `null`, or `undefined` value leaves `{name}`. Omitted `values` leaves every placeholder. Omitted `locale` during render inside `LocaleProvider` is that provider's tag. Outside the provider, omitted `locale` throws. A tag `Intl.Locale` rejects throws at the call. `t`, `useLoaderT`, and `usePreloaderT` pass the tag they are bound to | `features/i18n/shared/format.test.ts` `placeholder left`, `number`, `plural locale`, `ordinal`, `exact`, `locale omitted`, `locale outside`, `bad tag` |

`locales` accepts any tag `Intl.Locale` accepts, including `en`, `en-US`, `zh-Hant`, `zh-Hant-TW`, `sr-Latn`, and `pt-BR`. A tag it rejects, including `""` and `"en_US"`, throws at `i18n()` (`match.test.ts` `bcp47`).

`Accept-Language` is read up to 8 tags, after the path and the cookie. `negotiator` parses those tags. One `@formatjs/intl-localematcher` `match()` runs against the configured list. `en-US` matches `en` when `en` is the closest configured tag. If the app lists both `en` and `en-US`, `en-US` wins for `en-US`. The result is the configured spelling (`match.test.ts` `header`, `language en`, `language both`, `language spelling`). A bot skips the cookie and the header.

A segment of `paramName`, after `basePath`, is locale-like when `Intl.Locale` accepts it. A static route at that path wins and is not redirected (`match.test.ts` `static wins`). An optional param that is not a configured tag redirects to the same path with the segment removed, `no-store` (`optional strip`). A required `[locale]` substitutes `defaultLocale` and keeps the segment, because the stripped path is not a route (`required keeps`). A wrong-case path tag stays a 301 to the configured spelling (`casing`).

A document whose URL does not already show the tag chosen by the cookie or `Accept-Language` is a 302, `no-store`, and the query is kept (`middleware.test.ts` `negotiate 302`). A `.response()` route is not a rendered document: it is never negotiated. It gets no cookie- or `Accept-Language`-driven 302, no locale `Set-Cookie`, and no `negotiated` private downgrade, and it keeps its own `Cache-Control`; its locale is the URL's tag, or `defaultLocale` when untagged. The URL-shape rules still apply to it: a wrong-case tag 301s and an unknown optional tag is stripped (`middleware.test.ts` `response route`, `response route tagged`; BUGS.md B23). A document whose URL shows no tag, under an optional locale param with more than one configured locale, depended on the cookie and `Accept-Language` even when it did not redirect. It keeps its shared decision for the Flare store, which sits behind the locale slot, and leaves `private, no-store`, because a CDN copy would answer without the slot (`negotiated private`). An app that wants every locale cached at the CDN uses a required `[locale]` segment. Only documents redirect. A private data response may set the cookie and does not redirect (`data cookie`). Prefetch never sets the cookie and never redirects (`prefetch quiet`). A required `[locale]` keeps `defaultLocale` in the path.

The cookie, when it is set, is `Path=/`, `SameSite=Lax`, `Secure` on https, no `Domain`, `Max-Age` one year. Those attributes are not options (`middleware.test.ts` `cookie attrs`). The locale redirect sets no `Vary` header (`server/cacheability/variant.test.ts` `no vary`).

The slot reads `cookieName` through Solid's cookie API. Flare does not split the `Cookie` header. The string that API returns is followed only when `locales` contains it, byte for byte, in the configured casing. There is no trim and no case fold. An empty string, the wrong case, a tag the app did not list, and any other string are the same as no cookie. The request then continues with `Accept-Language`, then `defaultLocale`. A path tag still wins, including when the cookie is bad (`match.test.ts` `cookie bad`, `cookie case`, `cookie junk`, `cookie ignored on path`).

A bad cookie does not redirect by itself and is not cleared on a shared response. `Location` and `Set-Cookie` are built from the resolved tag in `locales`, never from the raw cookie string. A redirect or a private response that sets the cookie replaces the stored value with that tag (`middleware.test.ts` `cookie replaced`).

```tsx
const tag = useParams({ from: "[locale]/_root_" }).locale;

<LocaleProvider config={localeConfig} initial={tag}>
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
| `config` | yes | — | `{ locales, defaultLocale, paramName?, cookieName? }`: the router's locale config, which the app also spreads into `i18n()`. The object `i18n()` returns fits too | that object's `locales`, `defaultLocale`, `paramName`, and `cookieName` | the provider does not read the URL, the cookie, or `Accept-Language`. Client code does not import `./i18n/server`, so the app keeps the config in a module both sides import | `features/i18n/shared/provider.test.tsx` `config` |
| `initial` | no | `defaultLocale` | a string tag, or omitted | the current locale. A new string replaces it | a tag not in `locales` throws. The layout passes the route param, not `defaultLocale`, when the param is a string | `provider.test.tsx` `initial`, `initial changes` |
| `children` | yes | — | JSX | the subtree. `LocaleScript` reads the locale only inside this subtree | | `provider.test.tsx` `config` |

`useLocale()` throws outside `LocaleProvider` (`hooks.test.ts` `locale outside`). It returns `{ locale, locales, defaultLocale, setLocale }`. `locale` is an accessor and returns the tag. `locales` and `defaultLocale` are the config values, not accessors. `setLocale(tag)` navigates to that tag on the current route. On an optional segment the default tag drops the segment. On a required `[locale]` the default tag stays in the path. Search and hash stay. History is pushed. Once that navigation commits, it writes `document.cookie` with the config's `cookieName` and the server's attributes (`features/i18n/shared/cookie.ts`), so a shared page, whose answer cannot carry the cookie, still keeps the choice. It does not write `localStorage`. A navigation that does not commit writes nothing. A tag outside `locales` throws (`provider.test.tsx` `set locale`). Rendering `LocaleProvider` writes no cookie (`provider.test.tsx` `no cookie`).

After that navigation commits, the provider posts `{ type: "locale", tag }` on `flare.sync`. The channel rules are Cross-tab (`provider.test.tsx` `locale channel`, `locale channel replace`, `locale channel same`, `locale channel quiet`).

`LocaleScript` takes no props. A prop does not type-check. Rendered outside `LocaleProvider`, it throws. Inside, it emits one inline script under Solid `NoHydration`. The script sets `document.documentElement.lang` to the current tag, replacing any lang that was already there. Its nonce is the request nonce (`server.md`). A client navigation does not insert a second script. The provider sets `lang` when `locale()` changes (`script.test.tsx` `lang`, `outside`, `once`).

`useLoaderT(translations)` and `usePreloaderT(translations)` take the map `createTranslations` returns and give `t`, with `t.rich`, bound to the locale of the loader or preloader running now: the route's `paramName` param when it is a configured tag, otherwise `defaultLocale`, from the router's locale config. They are called inside the `.loader()` or `.preloader()` callback. The core runs each such call under a child of the request event, which inherits the request (`serverCtx()` included) and carries `{ kind, params, locale }`. Solid's async-local storage keeps each call's scope apart across awaits, and the request event is the parent again once the call returns (`server/loaders/scope.test.ts` `loader scope`). In a render, a server function, the other hook's function, or outside a request they throw. Without `createRouter({ locale })` they throw. Loaders and preloaders run only on the server (B8), so the client has no such scope (`features/i18n/shared/hooks.test.ts` `outside`).

These v0 fields do not exist: the provider `broadcast` flag, `skip`, `syncDirection`, `cookie.maxAge`, `cookie.secure`. `flare({ broadcast })` is the Cross-tab switch, not that flag. `createBroadcastSignal`, `useBroadcast`, and `navigate({ broadcast })` do not exist. Direction does not read the locale on its own (`rtlLocales` is gone). The app passes the same tag as `initial` and as `locale`.

## Image

`<Image />`. Widths come from `flare({ image: { widths, quality? } })` in the Vite config. A width outside that set is a build error and a 400 on the dev endpoint.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `alt` | yes | — | string | the attribute | an empty string is allowed and means decorative | `features/image/shared/image.test.tsx` `alt required` |
| `src` | yes | — | a project path or a static import of `.avif`, `.jpg`, `.jpeg`, `.png`, `.tiff`, or `.webp` | the resolved URL | a `src` that escapes the project root is 400 in dev and a build error | `dev-endpoint.test.ts` `escape` |
| `widths` | no | the plugin's `widths` | integers from the plugin set | the srcset | a number the plugin did not list throws | `optimize.test.ts` `other width` |
| `sizes` | no | — | string | passed through on the attribute | | `image.test.tsx` `sizes` |
| `quality` | no | the plugin, else `75` | integer `1`–`100` | adds `&q=` on the dev URL only. Production bytes stay the plugin quality | | `optimize.test.ts` `quality`, `dev q` |
| `priority` | no | `false` | boolean | `true` sets `loading="eager"`, `decoding="sync"`, and `fetchpriority="high"`. The default is `loading="lazy"` and `decoding="async"` | | `image.test.tsx` `priority` |
| `placeholder` | no | `"none"` | `"none"` or `"blur"` | `"blur"` uses `blurDataURL` as a cover background until load, then removes it | `"blur"` without `blurDataURL` throws | `image.test.tsx` `blur missing`, `blur until load` |
| `blurDataURL` | when `placeholder` is `"blur"` | — | a `data:` URL | the background image | any other scheme is dropped | `image.test.tsx` `blur scheme` |
| `fill` | the fill mode | — | `true` | inline style `position: absolute; inset: 0; object-fit: cover` plus the aspect ratio. The srcset is every generated width as `Nw`, uncapped | `width` or `height` with `fill` throws | `image.test.tsx` `fill` |
| `fixed` | no | `false` | boolean | `true` requires `width` and `height` and sets those pixel styles and attributes. The srcset is density: the variant at `width` is `1x`, and the variant at `width * 2` is `2x` when that width is in the plugin set. Otherwise the srcset is `1x` only | `true` with `fill` or `maxWidth` throws. A `width` outside the plugin set throws. A missing `2x` width is omitted. It is not labeled with another width | `image.test.tsx` `fixed`, `fixed 2x` |
| `width` | the fixed mode | — | a number, one of the plugin widths | required together with `height` when `fixed` is `true` | | `image.test.tsx` `fixed` |
| `height` | the fixed mode | — | a number | the same | | same |
| `maxWidth` | the responsive mode | — | a number | inline style `width: 100%` and that max width. The srcset stops above `maxWidth * 2` | | `image.test.tsx` `responsive` |
| `maxHeight` | no | — | a number | caps the box and supplies the aspect ratio when `aspectRatio` is omitted | | same |
| `aspectRatio` | no | — | a number | the box ratio when one dimension is missing | | same |

The modes `fill`, `fixed`, and responsive (`maxWidth`) are mutually exclusive. Two of them throw (`image.test.tsx` `two modes`). The plugin `widths` default, when the app sets `image: {}`, is `[640, 750, 828, 1080, 1200, 1920]`. `2048` and `3840` are not in the default.

A responsive srcset is `<url> <width>w`, ascending, comma-separated. Widths above `maxWidth * 2` are left out when `maxWidth` is set.

An optimized import opts in with `?image`: `import photo from "./a.png?image"`. A plain `./a.png`, and any other query, stay Vite's URL string, so an app keeps `vite/client` in its `types`. The `./vite` entry carries the `?image` module types. The optimized import binding is `{ src, width, height, variants }` at the intrinsic pixel size. There is no generated blur on that binding. Only configured widths that fit the bitmap are generated. The intrinsic width is not invented as an extra variant. A `.webp` source is re-encoded at the plugin quality. Production `src` is the largest generated variant. A bad `q`, an unknown width, or a path outside the project is 400. A missing file inside the project is 404 (`optimize.test.ts` `binding`, `webp`, `missing`).

Production files are `<assetsBase>/<stem>-<width>-<8 hex sha256 of the webp bytes>.webp`. Quality is in those bytes, so a different plugin quality is a different hash. Component `quality` does not change those bytes. The dev URL is `GET /_flare/image?src=<project path>&w=<width>`. `&q=<quality>` is added only when that quality differs from the plugin default (`optimize.test.ts` `prod name`, `dev url`).

Optimized extensions are `.avif`, `.jpeg`, `.jpg`, `.png`, `.tiff`, and `.webp`. `.svg` and `.gif` keep the URL the app imported and are not converted to webp, with or without `?image` (`optimize.test.ts` `svg`, `gif`). The dev endpoint refuses a path that leaves the project after decoding and a file that is not an optimized image, before reading any file (`dev-endpoint.test.ts` `endpoint refuses`). `configureImage` does not exist. A `loader` option does not exist (`options.test.ts` `unknown`).

## Fonts

```ts
const font = createFont({ family, src, category, weights?, style?, fallbackMetrics? })
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `family` | yes | — | string | escaped into `@font-face` | `</style>` in the name is escaped | `features/fonts/shared/css.test.ts` `escape family` |
| `src` | yes | — | a URL path the app serves, or a registry file | the `url()` | a `src` with `..` throws | `css.test.ts` `escape url` |
| `category` | yes | — | `"serif"`, `"sans-serif"`, `"monospace"`, `"display"`, `"handwriting"` | the stack is `"<family>", <generic>`. `serif` is `serif`, `sans-serif` is `sans-serif`, `monospace` is `monospace`, `display` is `sans-serif`, `handwriting` is `cursive`. With `fallbackMetrics` the stack is `"<family>", "<family> Fallback", <generic>` | | `create-font.test.ts` `stack` |
| `weights` | no | `"400"` | `"400"` or a number array | one `@font-face` per listed weight, each `font-display: swap`, each pointing at `src`. `createFont` emits no `unicode-range`. Two weights are two faces that share `src` | v0 emitted the first weight only. v1 emits every listed weight | `create-font.test.ts` `weights`, `no unicode range` |
| `style` | no | `"normal"` | `"normal"`, `"italic"` | `font-style` on each face | | same |
| `fallbackMetrics` | no | absent | `{ ascentOverride, descentOverride, lineGapOverride, sizeAdjust, fallbackFont }` all strings | a second `@font-face` whose family is `"<family> Fallback"`, with `size-adjust`, `ascent-override`, `descent-override`, and `line-gap-override`. `src` is `local()` of the fallback name. `Arial`, `Courier New`, and `Times New Roman` also list their metric-compatible names: Arial, ArialMT, Liberation Sans, LiberationSans-Regular, Arimo; Courier New, CourierNewPSMT, Liberation Mono, LiberationMono-Regular, Cousine; Times New Roman, TimesNewRomanPSMT, Liberation Serif, LiberationSerif-Regular, Tinos | a partial object throws | `create-font.test.ts` `partial metrics`, `fallback face` |

```tsx
<FontCSS font={font} />
<FontCSS font={font} preload={false} subsets={["latin"]} />
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `font` | yes | — | the object `createFont` returns, or a registry font | the escaped CSS in a style tag that carries the request nonce | | `features/fonts/shared/font-css.test.tsx` `nonce` |
| `preload` | no | `"latin"` on a registry font. A `createFont` result preloads its `src` | a subset name, or `false` | a `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the normal-style files of that subset. `false` emits no preload | a subset the font does not list throws when the component renders. A registry font with no `latin` files emits no link when `preload` is omitted | `font-css.test.tsx` `preload`, `preload off`, `unknown subset`, `no latin` |
| `subsets` | no | the font's own subset list | `string[]` | passed to `font.css`. A `createFont` result has one file, so this list does not change its CSS | a name the font does not list throws when the component renders | `font-css.test.tsx` `subsets` |

A registry `@font-face` copies `font-weight` and `unicode-range` as stored and takes `font-style` from the entry (`features/fonts/shared/css.test.ts` `unicode range`, `variable weight`). `createFont` does not emit `unicode-range`.

A registry font is the default export of `@lovrozagar/flare/fonts/<id>` (B78). `<id>` is a key of `features/fonts/registry.json`. `import inter from "@lovrozagar/flare/fonts/inter"`. A hyphenated id stays hyphenated in the path: `@lovrozagar/flare/fonts/open-sans`. `@lovrozagar/flare/fonts` does not resolve. The root entry's `createFont` and `FontCSS` do not import a generated module. An id that is not a key does not resolve.

## Query

Peer `@tanstack/solid-query`.

| API | required args | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `createQueryClientGetter()` | none | one client per document on the client. On the server, one client per request, on the request event's `locals`, which a loader's scope shares. A second call in that request returns it. A call outside a request throws. The getter registers once per process, and a second `createQueryClientGetter()` returns the registered one. A loader's `ctx.queryClient` is that request's client, and with no getter registered it throws `call createQueryClientGetter() in a module your router imports`. The document state's `queries` is the request's cache taken after the shell rendered. The client's first call hydrates its client from it before hydrate, so a query the shell resolved, such as one a loader prefetched through `ctx.queryClient`, does not run again. With TanStack's default `staleTime` of 0 a mounted query still refetches; a `staleTime` keeps the server's value. A query that settles after the shell rides the next data request (B83) | the function takes no options. `broadcast` is not an option. `createRouter` has no query-client field. Core imports `@tanstack/solid-query` only from `./query`. The app passes the getter's client to the TanStack provider. Render and hydrate call this getter | `getter.test.ts` `one client`, `per request`, `outside` |
| `useSuspenseQuery(options)` | the TanStack options | suspends until the query resolves. The surrounding Solid `<Loading>` shows its fallback, then the children (B80) | Flare does not add a second boundary around the hook | `use-suspense-query.test.ts` `suspense`, `loading swap` |
| `serverFnQueryOptions(fn, { queryKey, input? })` | `queryKey` | `{ queryKey, queryFn }`. `queryFn` calls `fn(input)` and returns the handler's `data`. When the server function's input is `void`, `input` is omitted and `queryFn` calls `fn()` | `input` is required when the server function has an input, and it does not type-check when the input is `void`. The helper does not append `input` to `queryKey`. A key that omits the input stores one result for every input. The envelope has no `queries` field | `options.test.ts` `query`, `query void`; `propagation.test.ts` `query options input`, `query options void` |
| `serverFnMutationOptions(fn, { mutationKey? })` | `fn` | `mutationFn(input)` calls `fn(input)` and returns `data`. When `mutationKey` is passed, `onSuccess` calls `setQueryData(mutationKey, data)` on the client from `createQueryClientGetter`. When it is omitted, there is no `onSuccess` | there is no `invalidates` list and no server-side `piggyback`. An `onSuccess` the app passes replaces the helper's | `options.test.ts` `mutation`, `mutation no key` |

The TanStack option fields beyond these wrappers are TanStack's. Flare does not redefine them. `staleTime`, `enabled`, and invalidation stay on the options the app passes to `useSuspenseQuery` or `useMutation`.
