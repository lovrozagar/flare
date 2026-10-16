# Bit 13 — Features

Creates every `P13` row. Features do not import each other. The core pipeline does not import them. `src/exports/vite.ts` is the file that composes their vite factories, and only when the app passed the matching `flare({ ... })` option.

A component's rows run on the Solid build they are about. Rows that render on the server, such as a nonce, an escape, or `server pure`, live in a sibling `*.ssr.test.ts`. It runs in the node project on Solid's server build with a jsdom document, so a before-paint script can also run there. Rows that mount, hydrate, or post stay in the `.test.tsx`, which runs on the client build. A table names both files.

## Extends

`server/loaders/scope.ts` is born here. Each loader and preloader call runs under a child of the request event, through Solid's `provideRequestEvent`, carrying `{ kind, params, locale }`, so i18n's hooks read the running call without core importing the feature. `server/loaders/scope.test.ts` holds the row. `run.test.ts` is at its 500-line cap.

| test | case | result |
| --- | --- | --- |
| `loader scope` | two runs at once under one request, with different params, each with a preloader and a loader that awaits | each loader reads its own `{ kind: "loader", params, locale }` across the await, and `serverCtx()` still answers inside it. A preloader reads `kind` `"preloader"`. After the loaders return, `getRequestEvent()` is the parent again with no scope. A run with no raw params gives `{}` |

`tests/types/app` gains `src/image.ts` under `vite/client`: `./photo.png?image` is `{ src, width, height, variants }` and `./photo.png` stays `string` (B88). It also gains the rows bit 07 could not hold: `query options input`, `query options void`, and `query client present` in `checks.ts`, plus the fixture's `src/query.ts` importing `@lovrozagar/flare/query`, and `app.test.ts` asserts the generated `hasQueryClient` is `true`. Bit 13 is not done until `app.test.ts` is green with them.

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
| `aran` | a tag whose maximized script is `Aran` (Nastaliq), as Bun's ICU gives for `ur` and `ks` | `rtl`. `Aran` is in the right-to-left set, so the server and every browser agree whatever their ICU maximizes to (BUGS.md B26) |
| `latin` | `en` | `ltr` |
| `arabic` | `ar` | `rtl` |
| `script data` | `xx-Arab` | `rtl` |
| `unknown` | `und` | `ltr` |
| `absent` | no locale, `defaultDir` `"rtl"` | `rtl` |
| `throws` | `en_US`, `defaultDir` `"rtl"` | `rtl` |
| `no text info` | `Intl.Locale.prototype.getTextInfo` deleted, as in Firefox 151; `ar`, `he`, `fa`, `ur`, `en`, `hr` | `rtl`, `rtl`, `rtl`, `rtl`, `ltr`, `ltr`. The result never depends on `getTextInfo` |

The function maps `new Intl.Locale(tag).maximize().script` through the right-to-left script set in `dx/features.md`. The module contains no array of language codes. A throw from the constructor returns `defaultDir`.

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
| `queryFn inside a render` | a `serverFnQueryOptions` `queryFn` first invoked inside a component render (an owner and no observer, as a suspense query's first fetch is), and a hand-written `queryFn` that calls the server function directly in the same place | both call the transport once and neither throws. The helper's call logs no warning; the hand-written one logs the dev warning (BUGS.md B36) |
| `query` | `serverFnQueryOptions(fn, { queryKey, input })` | `queryFn` calls `fn` with that input and returns its `data` |
| `query void` | a server function with no `.input()`, and no `input` argument | `queryFn` calls `fn` with no argument |
| `mutation` | `serverFnMutationOptions(fn, { mutationKey })` | `onSuccess` calls `setQueryData` with that key and the returned data |
| `mutation no key` | `serverFnMutationOptions(fn)` | the result has `mutationFn` and no `onSuccess` |
| `no side channel` | the server envelope from bit 07 | it has no `queries` field, and this module does not read one |

### `features/query/client/getter.test.ts`, `getter.ssr.test.ts`, and `use-suspense-query.test.ts`

| test | case | result |
| --- | --- | --- |
| `one client` | two calls on the client | the same client |
| `per request` | two calls during one server request | the same client. A second request gets another |
| `outside` | a server call with no request | throw |
| `getter registered once` | `createQueryClientGetter()` called twice | the second call returns the first getter, which is the registered one. The registry holds a function, not request data |
| `client seed` | the document state's `queries` hold a resolved query | the client's first getter call hydrates its client from them before hydrate, so the query does not run again on the client. No `queries` is an empty client |
| `dehydrate` | the registered getter's `dehydrate()` in a request that made a client, in one that made none, and outside a request | the request's cache, then `undefined`, then `undefined` |
| `suspense` | a query that has not resolved | the hook suspends |
| `resolved` | a query that has resolved | the data is returned |
| `loading swap` | the hook is under `<Loading fallback={<p>Loading query</p>}>` | the fallback is shown, then the data, and the fallback is gone |
| `hydration mount` | the document's `queries` hold `["tally", "a"]`, and a component with `useQuery` on that key and `staleTime: 0` hydrates | the query function runs 0 times during hydration. After the hydrated phase fires, the component unmounts and mounts again: the query function runs once (B102) |
| `hydration mount app wins` | the same, with `refetchOnMount: "always"` on the query | the query function runs once during hydration |
| `hydration mount not in document` | a `useQuery` on a key that is not in the document's `queries` mounts during hydration | the query function runs once |
| `no retry on 4xx` | `serverFnQueryOptions` over a server function that rejects with 400, then one that fails with a network error, then a 400 with the app's `retry: 2` | the first query errors after 1 call; the second keeps TanStack's default retries; the third makes 3 calls (B107, BUGS.md 64) |

### The core's half: `shared/protocol/query.test.ts`, `server/loaders/scope.test.ts`, and `server/render/document.test.ts`

Core reads the registered getter by its symbol and never imports TanStack (00-rules Module state).

| test | case | result |
| --- | --- | --- |
| `registry` | two registrations, and a symbol holding something other than a getter | the first wins and the second gets it back. A value that is not a getter with `dehydrate` is no registration |
| `loader query client` | a getter is registered and a loader reads `ctx.queryClient` | the getter's client for this request |
| `query client unregistered` | no getter is registered and a loader reads `ctx.queryClient` | throw `call createQueryClientGetter() in a module your router imports`, never `undefined` |
| `state queries` | a registered getter, and a render that resolves before the shell | the document state carries `"queries"`, the getter's `dehydrate()` taken after the shell rendered. No getter is `"queries":null`. The matches still serialize before the shell |
| `queries unserializable` | a query whose data JSON cannot hold, such as a bigint | the bug names the query by its hash in the server log, in production too, and the state carries `"queries":null`, so the document completes and the client fetches that query itself. A cache that is not a list of queries is named as the cache |

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
| `numbering from tag` | the release message with `n` = 14 under `ar-u-nu-arab` and under `ar-u-nu-latn` | `١٤ releases` and `14 releases`: the tag's `-u-nu-` decides the digits on every runtime (BUGS.md B29) |
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
| `placeholder wins` | a placeholder and a component share a name | the placeholder wins. Paired `{tag}...{/tag}` runs only when `tag` is a component key and not a value name |
| `value is text` | message `Hi {name}, {b}welcome{/b}` with `name` `"{link}x{/link} {/b}"`, and components `b` and `link` | `link` is never called, the `{/b}` inside the value does not close `b`, and the value renders as that literal text. Tags are found in the message template only. Values are formatted into text segments after the tags are parsed, so a value never becomes markup |

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
| `casing` | path `EN`, configured `en` | the matcher reports a 301 to `en`. In the pipeline the canonical step already folds a locale param to its configured spelling (B22), so this redirect is the matcher's contract only |
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

### `shared/router/create-router.test.ts`

| test | case | result |
| --- | --- | --- |
| `locale param` | `createRouter({ locale })` with `/[[locale]]`, `/[[locale]]/[[slug]]`, and `/[locale]/docs` | `/favicon.ico` leaves the optional locale empty and is the slug. `/x.y/docs` matches nothing. `/hr` and `/fr` are the locale param. Without a locale config, `x.y` is an ordinary param value (B73) |

### `features/i18n/server/middleware.test.ts`

| test | case | result |
| --- | --- | --- |
| `response route` | an untagged `.response()` route under an optional locale, with `Accept-Language: hr` and a `flare.locale=hr` cookie, whose handler sets `public, max-age=300` | 200, the handler's `Cache-Control` kept, no `Set-Cookie`, no redirect (BUGS.md B23) |
| `response route tagged` | `/hr/llms.txt` on the same route | its own `Cache-Control` kept, no `Set-Cookie` |
| `slot` | the object is passed as `createServer({ locale })` | it runs between rewrite and middleware |
| `not a middleware` | the return type | it is not assignable to the middleware list |
| `redirect is a route` | the folded locale target does not match a route | 404, no redirect |
| `cookie on redirect` | a redirect the slot makes: an unconfigured optional tag stripped with a 302 | `Set-Cookie` is present and the response is `no-store`. No `Vary` |
| `cookie on shared` | a shared 200 | no `Set-Cookie` |
| `cookie on private` | a private 200 | `Set-Cookie` is allowed |
| `cookie attrs` | a response that sets the cookie | `Path=/`, `SameSite=Lax`, no `Domain`, `Max-Age` of one year, `Secure` only on https |
| `cookie replaced` | the incoming cookie is `nope` and the response sets the cookie | the `Set-Cookie` value is the resolved tag. `nope` is not in the response |
| `locale param` | locales `en`, `hr`; routes `/[[locale]]/` and `/[[locale]]/pricing`; GET `/favicon.ico`, `/x.y`, `/hr`, `/fr` | `/favicon.ico` and `/x.y` are the router's 404, never a render with that value as the locale. `/hr` renders. `/fr` is the strip redirect |
| `data unconfigured tag` | `/fr/pricing?_flare=data`, and the same as `_flare=prefetch` | the data answer is the redirect frame to `/pricing`. The prefetch is 404 with no frames. The layout never receives `fr` |
| `negotiate 302` | a document at `/` with a cookie or `Accept-Language` that chooses `hr`, and `hr` is not the default | 302, `no-store`, `Location` keeps the query, and the path shows `hr` |
| `negotiated private` | locales `en` (default) and `hr`, a route `/[[locale]]/pricing` with `cache.isr` and `cdn.maxAge`, and a document at `/pricing` that does not redirect | `private, no-store`, and the shared decision still reaches the Flare store, so a later visitor who also stays on the default reads it. `/hr/pricing` leaves public. The data answer for `/pricing` leaves public. A CDN copy of a URL with no tag would skip the cookie and `Accept-Language` |
| `data cookie` | a private data response whose URL does not show the chosen tag | no redirect. `Set-Cookie` may be set |
| `prefetch quiet` | a prefetch of a URL that does not show the chosen tag | no redirect and no `Set-Cookie` |
| `default missing` | `defaultLocale` is not in `locales` | throw when `i18n()` is called |

### `tests/e2e/docs-features.test.ts` (was `tests/e2e/i18n.test.ts`)

B94 moved these seven cases, under the same names, into the docs app's `docs-features.test.ts`, which boots `boot({ app: "docs", runtime, mode })`. The `i18n` app is retired. The rest of this section is the original contract. It called `boot({ app: "i18n", runtime, mode })` (B70). The project name selects `runtime`, `mode`, and the browser. `boot` receives `runtime` and `mode`. The app is born with `wrangler.jsonc` so `workers-prod` can boot it. The locale slot stays on this app. `minimal` does not gain it.

| test | case | result |
| --- | --- | --- |
| `prefix` | open `/hr` | the Croatian message |
| `shared cookie` | a public page | the response has no `Set-Cookie` |
| `unknown locale` | `/fr` when `fr` is not configured | no redirect: `/fr` is an ordinary path, which no route matches, so it is the app's 404 (B73, BUGS.md 184) |
| `theme no flash` | `localStorage` holds `dark`, then a document load of a page under `ThemeScript` and `ThemeProvider` | the theme attribute is `dark` on `<html>` in the first paint (read before any module script runs), the page hydrates with no console error or hydration warning, and `useTheme().theme()` is `dark` after hydrate |
| `rtl client` | chromium and firefox; a client-side `setLocale` to an Arabic-script locale configured in the app | `dir` becomes `rtl` and `useDirection().direction()` is `rtl` in both browsers |
| `tabs sync` | two pages in one browser context; `setTheme("light")`, `setDir("rtl")`, and `setLocale("hr")` in the first | the second page shows each value without a reload. A `storage` event alone, from writing `localStorage` in the second page, changes nothing there |
| `set locale persists` | a browser whose `Accept-Language` is `hr`, on the shared `/hr` with no cookie, chooses the default with `setLocale` | the next document load of `/` stays on `/` in English, with no redirect to `/hr`: the cookie `setLocale` wrote after its navigation committed carries the choice |

### `features/i18n/shared/provider.test.tsx`, `provider.ssr.test.ts`, `script.test.tsx`, `script.ssr.test.ts`, `hooks.test.ts`

| test | case | result |
| --- | --- | --- |
| `initial` | `initial` is a configured tag | that tag is the locale. `locale` is a memo of `initial`, not a setter copy |
| `server pure` | an SSR render of `LocaleProvider` | `OBSERVE.diagnostics` reports no `SERVER_WRITE` |
| `param` | `initial` is `"hr"`, then a render that omits `initial` | the locale is `hr`, then `defaultLocale`. The provider does not read `useParams`, the cookie, or `Accept-Language` |
| `initial changes` | `initial` changes from `en` to `hr` | `locale()` becomes `hr` and `lang` becomes `hr` |
| `set locale` | `setLocale` of another configured tag | a navigation to that tag. Once it commits, `document.cookie` holds the tag under the config's `cookieName`, with the server's attributes |
| `no cookie` | the provider renders, and a `setLocale` whose navigation does not commit | `document.cookie` is not written |
| `locale channel` | `setLocale("hr")` commits | `{ type: "locale", tag: "hr" }` is posted on `BroadcastChannel` `"flare.sync"` |
| `locale channel replace` | another tab receives that message while showing `en` | it navigates to `hr` on its current route with `replace`, and posts nothing |
| `locale channel same` | the message tag is the tag already showing, the tag is outside `locales`, or the message has another shape | no navigation |
| `locale channel search` | this tab is `/pricing?x=1#y` and the segment is optional. The message tag is `hr`, then the default tag | the URL is `/hr/pricing?x=1#y`, then `/pricing?x=1#y`. Both use `replace` |
| `locale channel required` | a required `[locale]`, and the message tag is the default | the default tag stays in the path. `replace` is used |
| `locale channel fail` | the navigation does not commit | the screen stays, and nothing is posted |
| `locale channel quiet` | `BroadcastChannel` is absent, or `broadcastEnabled` is false | this tab still navigates, and nothing is posted |
| `config` | the `i18n()` object | the provider renders the children |
| `outside` | `useLoaderT(translations)` during render, in a request outside any loader, inside a preloader, with no request, and with no router locale config; `usePreloaderT` the same way | throw. Inside a loader, `t` is bound to that run's `paramName` param when it is a configured tag, else `defaultLocale`. Inside a preloader, `usePreloaderT` does the same |
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

`shared/router/create-router.test.ts` gains `locale types`: `createRouter({ locale })` accepts `{ locales, defaultLocale, paramName?, cookieName? }`, `cookieName` defaults to `"flare.locale"`, and `botDetection` does not type-check. It also gains `locale invalid`: an empty `locales`, a duplicate, a non-canonical tag such as `en-us` or `en_US`, or a `defaultLocale` outside `locales` throws at `createRouter`. `en-US`, `zh-Hant-TW`, and `sr-Latn` pass.

### `features/i18n/shared/cookie.test.ts`

| test | case | result |
| --- | --- | --- |
| `cookie string` | `localeCookie(name, tag, secure)` | `<name>=<tag>; Path=/; SameSite=Lax; Max-Age=31536000`, plus `; Secure` when secure. No `Domain`. The server and `setLocale` both write this string |

## Image

### `features/image/shared/image.test.tsx`

| test | case | result |
| --- | --- | --- |
| `complete before hydrate` | a `priority` Image with `placeholder: "blur"` whose `<img>` reports `complete` at mount, and no `load` event is ever dispatched | after the commit the blur background is gone. The check runs in a post-commit callback, so the server render and the hydration render call no setter (B90). A `complete` image that failed to decode also drops the blur (BUGS.md B20) |
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
| `svg` | an `.svg` import, with or without `?image` | the original URL. The file is not converted to webp |
| `gif` | a `.gif?image` import | the original URL. The file is not converted to webp |
| `prod name` | a png at width 640 | the emitted name is `<stem>-640-<8 hex sha256 of the webp bytes>.webp` under `assetsBase` |
| `dev url` | the same image in dev, quality left at the plugin default | `/_flare/image?src=<path>&w=640`. A quality other than the default adds `&q=` |
| `quality` | `quality: 0` | throw at plugin creation. `75` is the default |
| `exclude` | a path the regexp matches; a plain import, another query, or a query beyond `?image` | that file is copied unchanged, and the others stay Vite's |
| `binding` | an optimized `?image` import | the binding is `{ src, width, height, variants }` at the intrinsic pixel size. There is no generated blur. Only configured widths that fit are generated. The intrinsic width is not an extra variant. Production `src` is the largest variant. Component `quality` does not change those bytes |
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
| `endpoint refuses` | a `src` that leaves the project after decoding `%2e%2e`, and an existing file that is not an optimized image | 400, before any file is read |

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

### `features/seo/vite/sitemap.test.ts`

| test | case | result |
| --- | --- | --- |
| `optional absent` | a non-SSG `[[locale]]/search` with locales `en`, `hr`, `ar` (default `en`); a `[[locale]]/docs/[slug]` with no rendered paths; an SSG optional-only home rendered at `/` and `/hr` | `/search`, `/hr/search`, and `/ar/search` once each; the docs page absent; `/`, `/hr`, `/ar` once each (BUGS.md B10) |
| `public only` | one public route and one required-auth route | the sitemap contains only the public route |
| `optional included` | a route whose auth is optional | the route is included |
| `authorize omitted` | a public page whose layout has `authorize`, and an optional-auth page with no `authorize` | the first is absent, the second is listed |
| `param listed` | `ssg` `/blog/[slug]` resolving `a` and `b`, `isr` `/docs/[id]` with params `1`, a dynamic `ssr` `/u/[id]`, and an `additionalEntries` loc equal to `/blog/a` | `/blog/a`, `/blog/b`, and `/docs/1` once each. `/u/[id]` is absent. The duplicate `additionalEntries` loc is not listed twice |
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

### `server/cache/prerender.test.ts`

| test | case | result |
| --- | --- | --- |
| `bare path` | `[[locale]]/search`, `[[locale]]/examples/[[...rest]]`, and a route with a required param | `bare` is `/search`, `/examples`, and `undefined` |
| `routes` | a tree with static, param, `.response()`, required-auth, and `authorize` routes under a base path | every route node in tree order, with its public path under the base, no path for a param URL, the `.response()` flag, and the chain's auth. No loader runs. `site` is `createServer({ site })` |

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
| `server context` | a router whose loader calls `serverCtx()`, and `createTestServer(router, { serverContext })` | the loader reads that context (BUGS.md B25) |
| `other keys refused` | `createTestServer(router, { site: "https://x" })` through a cast | throws, naming the key |
| `boots` | `createTestServer` with the minimal router | `fetch("/")` returns the page |
| `no options` | a second argument | throw |

### `testing/playwright.test.ts`

| test | case | result |
| --- | --- | --- |
| `hydrated` | `load("/")` | the helper resolves after `data-flare-hydrated`, its query sliced at 5 s |
| `lost reply` | the query's reply never comes, and the page's binding fires | the wait resolves on the binding, with no query sent again (BUGS.md 107) |
| `reissue` | no binding call, and the first query and its driver timeout never answer | the wait's own timer ends the slice after 6 s, one query is sent again and counted, and its answer resolves the wait |
| `never hydrated` | every query times out and the binding never fires, under a 12 s deadline | slices of 5, 5, and 2 s, then `The page never hydrated: no html[data-flare-hydrated] within 12000 ms` |
| `binding once` | two loads of one page | one binding named `__flare_hydrated_` plus 32 hex digits and one init script carrying that name; the binding resolves each load that armed it |
| `reissue warns` | the first query times out | one `console.warn` naming the path and the query number |
| `page script` | the init script run in the document | it calls the binding once the attribute is set, not when it is removed first, once only, and never from a subframe |
| `console all` | a hydration-mismatch message and an `Error` | both are returned. A hydration mismatch is an app bug, and Flare's own pages emit none, so the helper never hides one |
| `state` | a document with `self.flare` | `state()` returns `build`, `nonce`, `matches`, and `queries`. A match is `{ id, params, search, data, preloader, head, error }`. A `{ p, r, c }` object is not accepted |

### `tests/integration/seo.test.ts` and `seo-submit.test.ts` (plan 14 9.6, B96)

dx/seo.md through real apps and real requests. seo.test builds fixture apps with `vite build` and `flare({ prerender: { sitemap } })` (tests/integration/vite-app.ts, shared with routes.test) and reads the sitemap.xml and robots.txt the build wrote; the key file is a middleware of the real `createServer(...).fetch`. seo-submit runs each submitter in a child process on the test's runtime, whose fetch goes through an HTTPS proxy to a local TLS server holding a certificate, signed by a test CA only the child trusts (tests/integration/seo-tls.ts), for each service's host. The proxy refuses any other host. The fence: the child first fetches a `.invalid` host and calls a submitter only once that probe came back through the proxy, so a runtime that ignored the proxy stops at a DNS failure and reaches no real service. Each group's bite is the source mutation that turns it red (16 for seo.test, 12 for seo-submit).

| test | case | result |
| --- | --- | --- |
| `sitemap entries` | public, optional-auth, required-auth, authorize, `.response()`, ssg-slug, dynamic, optional catch-all, and excluded pages, a changefreq record, one priority, an extra entry with `&` and a lastmod | the public, optional-auth, bare catch-all, and each ssg slug listed with their fields; the extra entry escaped with a UTC date |
| `robots string` | a robots string with a foreign `Sitemap:` line | the other lines kept, that line dropped, the one on `site` appended |
| `robots true and records` | `robotsTxt: true`, one changefreq, a priority record | the one line; each entry's changefreq; the priority only on the id named |
| `sitemap defaults` | `sitemap: {}` | every public page, no fields, no robots.txt |
| `sitemap options checked` | priority 1.1 to `flare()` and to `sitemap()`, an unknown changefreq, a bad lastmod | each throws when made |
| `sitemap build errors` | a changefreq record key that is no route id, an extra entry off `site` | the build fails naming it |
| `indexnow key file` | `GET /<key>.txt`, another path, the app, a short key | the key as text/plain; 404; the page; a throw |
| `indexnow posts` | with and without keyLocation | one JSON POST each, keyLocation only when set |
| `indexnow fails` | a 500 | `{ ok: false }` with the status, no key in the result or the output |
| `indexnow checks` | a scheme in host, a short key, an off-host url | each throws, no request |
| `google sitemap` | sitemap mode | a token request whose RS256 assertion verifies with the key's public half (iss, aud, webmasters scope, one hour), then one PUT of the encoded site and sitemap with the bearer |
| `google notify` | three urls, concurrency 2, then the default | the indexing scope, one publish each with its body, at most 2 then 1 in flight |
| `google fails` | a failed token, a failed publish among three, a PEM that does not sign | `{ ok: false }` each, the in-flight publishes finished, no PEM and no token in the result or the output |
| `google one mode` | both modes, neither, no urls, 101 urls | each throws, no request |
| `bing submits` | one url | one POST with the key in the query only and `{ siteUrl, urlList }` |
| `bing fails` | a 503 | `{ ok: false }`, no key in the result or the output |

### `tests/integration/i18n.test.ts`, `features-client.test.ts`, `features-media.test.ts`, and `query.test.ts` (plan 14 9.6, B96)

dx/features.md through real apps. i18n.test and query.test run the real `createServer(...).fetch`; i18n.test's `render t` also runs the app in vite dev and a production build. features-client runs one app through the hydrate harness (the real createServer and createClient) in each engine: its `[[locale]]` root writes ThemeScript, DirectionScript, and LocaleScript in its head and wraps the page in the three providers, and an init script reads what the scripts set at DOMContentLoaded while the client waits 200 ms to hydrate. features-media builds one fixture app with `vite build` (tests/integration/vite-app.ts) and reads the documents its built server sends. Each group's bite is a source mutation that turns its case red (5 for features-client, 1 for i18n, 2 for features-media, 1 for query).

| test | case | result |
| --- | --- | --- |
| `locales` | a configured tag, an unconfigured locale-like segment on the optional and the required param, a static route at that path, a wrong-case tag, a tag Intl.Locale rejects | the locale; a redirect without it, or to the default in the segment; the static route; a 301 to the configured spelling; a throw |
| `defaultLocale` | the default on an optional and a required segment, a default outside `locales` | omitted; kept; a throw |
| `cookieName` | a document whose URL does not show the cookie's tag, a cookie of another name, `Accept-Language` | a 302, no-store, query kept, the cookie set under the name; no cookie; negotiated |
| `paramName` | the tag in a segment of that name | the locale |
| `botDetection` | a bot with a cookie and `Accept-Language`, `false` | neither followed and no cookie; treated as a browser |
| `response route` | a `.response()` route | no redirect, no locale cookie, its own Cache-Control |
| `messages` | a loader's `t`: a missing key, plural with `=N` and `#`, selectordinal, select, a branch without `other`, `formatMessage` with its own tag | the key; each by the tag's rules; a throw at creation; the given tag |
| `render t` | `useT` in a render, in dev and a production build | `t` and `t.rich` on the provider's locale, the rich tag a component, the text around it escaped (BUGS 142) |
| `theme script` | a stored theme, one outside `themes`, none, over light and dark media | before hydration the attribute, colorScheme, and `lang`; after, `theme()` from storage and `resolvedTheme()` from the media |
| `set theme` | `setTheme("dark")`, then the media turned light; a `system` theme when the media turns dark | storage, the attribute, and colorScheme; the explicit theme held; the system theme follows; `*{transition:none!important}` added and removed |
| `direction` | `/ar/home`, a stored `ltr` on it, `setDirection("rtl")` then `setDirection()` | rtl before paint; the stored value wins; storage written, then removed and back to the locale's dir |
| `locale` | `/hr/home` before hydration, `setLocale("en")` | `lang` is `hr` from the script; the navigation to `/home`, the cookie, and `lang` follow |
| `cross tab` | a second tab, then the first tab's three setters | the second tab's theme, dir, and locale route follow on `flare.sync` |
| `image responsive` | `maxWidth`, `sizes`, `alt` | the box capped, an ascending srcset up to twice it, lazy and async, the attributes |
| `image fixed` | width and height, `priority` | pixels and attributes, a density srcset with 2x, eager with high fetch priority |
| `image fill` | `fill` | absolutely placed, the source's aspect ratio, every built width up to the source's |
| `image props` | blur, own widths, a component `quality`, `maxHeight`, `aspectRatio` | the data URL background until load; the narrowed srcset; the plugin's bytes; the box capped; the missing dimension set |
| `fonts` | createFont with weights, italic, fallbackMetrics, a category; FontCSS with and without `preload`, `subsets` | one face per weight, swap, the family escaped, a metrics fallback, the stack; a preload unless off; a one-file font's CSS untouched |
| `query client` | the getter in a loader and a render, outside a request | one client per request filled by the loader's prefetch, no second call, the query in the document's state; a throw |
| `server fn options` | serverFnQueryOptions, serverFnMutationOptions with and without a mutationKey | the key as given; a mutationFn returning the data, an onSuccess only with a key |

## Done

Each feature's tests pass without importing another feature. The i18n e2e shows a shared page with no `Set-Cookie`. Open tabs hear theme, direction, and locale on `flare.sync`, and a `storage` event updates none of them.
