# createRouter

```ts
createRouter({ layouts, routeTree, ... })
```

`layouts` and `routeTree` come from `src/_gen/routes.gen.ts`. The app does not write them.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `layouts` | yes | — | the codegen record | layout modules | a hand-written record drifts from the files | `vite/codegen/routes.test.ts` `one route` |
| `routeTree` | yes | — | the codegen tree | the matcher walks it | | same |
| `basePath` | no | `"/"` | a path that starts with `/` and does not end with `/`, except `"/"` | every route is under it. The base itself is the index. A `Link`'s `href`, `navigate()`, and `setLocale` put the route's URL under it, so a client navigation asks for its data under the base and lands there (BUGS.md 187) | `"/app/"` is a build error. `/app` must serve, not 404. `buildUrl` gives the route's path without the base | `shared/url/canonical.test.ts` `base path`; e2e `base path serves /app`; `tests/integration/basepath-client.test.ts`; `shared/components/link.test.tsx` `base path` |
| `caseSensitive` | no | `false` | boolean | `false` matches static segments ignoring case and redirects to the route's spelling | folding does not apply to param values or percent-escapes. A locale param takes its configured tag's spelling (B22) | `shared/route-tree/match.test.ts` `case fold`, `case strict` |
| `trailingSlash` | no | `"preserve"` | `"preserve"`, `"always"`, `"never"` | `preserve` redirects neither form and both match. `never` strips a trailing slash except on `/`. `always` adds one except on `/`. Internal empty segments collapse in that same redirect. `/` never becomes `//`. A mismatch is 301 for GET/HEAD and 308 otherwise | a POST that 301s becomes a GET. v1 does not do that | `server/redirect/builder.test.ts` `POST canonical`, `always`, `preserve both`, `no double slash` |
| `notFoundMode` | no | `"root"` | `"root"`, `"fuzzy"` | `"root"` renders the root not-found and runs only the root layout's loaders. `"fuzzy"` renders the not-found of the longest layout prefix, including a layout-only directory. That layout's `notFoundRender` runs, or the root's when it has none. Loaders run for that layout and its ancestors only. The root is that chain's root layout, including `_admin_`. The selected layout's `render` runs. When it and that root omit `notFoundRender`, the outlet is one `div` whose text is `Page not found` (B77) | `"fuzzy"` was v0's default. v1's default is `"root"` so an unknown path does not render a nested layout's data. A deeper page loader does not run | `shared/router/create-router.test.ts` `not found root`, `not found fuzzy`; `shared/components/outlet.test.tsx` `unknown builtin`, `unknown admin`; `tests/integration/auth.test.ts` `fuzzy loaders`, `root loaders` |
| `scrollRestoration` | no | `true` | boolean | `sessionStorage`, keyed by history index | `false` still does not push history during hydrate | `client/navigation/scroll.test.ts` `restore` |
| `scrollRestorationBehavior` | no | `"instant"` | `"instant"`, `"auto"`, `"smooth"` | passed to `scrollTo` | `"auto"` follows the page's CSS `scroll-behavior` | `client/navigation/scroll.test.ts` `behavior` |
| `scrollRestorationMaxEntries` | no | `50` | integer `1`–`200` | oldest entries drop | `0` throws | `client/navigation/scroll.test.ts` `cap` |
| `getScrollRestorationKey` | no | history index | `(location) => string` | the storage key | a key that changes every visit never restores | `client/navigation/scroll.test.ts` `custom key` |
| `routeCacheMaxEntries` | no | `100` | integer `1`–`500` | the client match cache evicts the least recently used | | `client/router/match-cache.test.ts` `cap` |
| `prefetch` | no | `{ modules: "all", data: false }` | see `link.md` | | | `shared/router/create-router.test.ts` `defaults` |
| `cache` | no | `{ client: { staleTime: 0, gcTime: "5m" } }` | `{ client: ClientCache \| false }` | the default client cache for routes that do not set their own. `false` disables the client cache for the whole app | this object has no `ssr`, `ssg`, `isr`, or `cdn`. Those are per route | `shared/router/create-router.test.ts` `cache client only` |
| `viewTransitions` | no | `false` | `boolean` or `{ scope?, types? }` | see `navigate.md` | | `client/view-transition/direction.test.ts` `off` |
| `rewrite` | no | absent | `(location) => location \| undefined` | runs on the client before match. The server function is `createServer({ rewrite })` and takes a pathname (`server.md`) | a client rewrite that points off-origin throws | `client/navigation/target.test.ts` `rewrite off origin`, `location shape` |
| `theme` | no | absent | `features.md` | the resolved config is stored on this router object. Render and hydrate provide that object as the router context. The theme feature reads it there | a second copy passed to `ThemeScript` or `ThemeProvider` does not type-check | `shared/router/create-router.test.ts` `theme stored`, `theme absent`; `server/render/document.test.ts` `router context`; `client/boot/hydrate.test.ts` `router context` |
| `direction` | no | absent | `features.md` | the resolved config is stored on this router object. The per-request locale is a component prop, not a field here | a `config` prop on `DirectionScript` or `DirectionProvider` does not type-check | `create-router.test.ts` `direction stored` |
| `locale` | no | absent | `{ locales: readonly string[], defaultLocale: string, paramName?: string, cookieName?: string }` | this field types the param, and the param matches only a configured tag, in any case, so any other segment is an ordinary one (B73). It does not redirect and it does not read a cookie. It is the one source of the locale config: `createServer({ locale: i18n() })` reads the tags, the default, the param name, and the cookie name from it, requires it, and throws when `i18n()` was given one that differs, naming the field (BUGS.md 185). `cookieName` defaults to `"flare.locale"`, the server's default, and is the cookie `setLocale` writes. `locales` is non-empty, unique, and canonical BCP 47 (`Intl.getCanonicalLocales(tag)[0] === tag`), and holds `defaultLocale` | `botDetection` belongs on `createServer({ locale: i18n(...) })`. `en-us`, a duplicate, an empty list, or a default outside the list throws | `shared/router/create-router.test.ts` `locale types`, `locale invalid` |

`notFoundMode` default `"root"` is a v1 change. v0 defaulted to `"fuzzy"`. The pitfall is documented in the table so a port does not silently keep the old default.

`shared/router/context.ts` exports the router context. The value is the object `createRouter` returned. `server/render/document.ts` wraps the root layout in that context before `renderToStream`. `client/boot/hydrate.ts` wraps the same way before hydrate. There is one context. A module-level router variable is not a second copy. `useRouter` is not a public export. Theme and direction read this object. The app does not.

## rewrite

```ts
createRouter({
  rewrite(location) {
    if (location.pathname === "/old") return { ...location, pathname: "/new" };
    return undefined;
  },
});
```

`location` is `{ pathname, search, hash }`. `search` is the raw search string and includes the leading `?`, or `""` when there is none. `hash` includes the leading `#`, or `""`. `undefined` leaves the location alone. A returned location replaces `pathname`, `search`, and `hash`, and that pathname is matched. A throw fails the navigation before any history write: nothing commits and the previous URL stays (`target.test.ts` `rewrite throws`). A result whose origin is not the page's origin throws (`location shape`, `rewrite off origin`). The rewrite runs once per navigation, for `navigate`, `Link`, and a same-origin `<a href>` click alike. An anchor whose href matches a route only after the rewrite is a client navigation to the rewritten location, and the address bar shows the rewritten URL. A rewrite that throws or leaves the origin on an anchor click prevents the default, so the navigation fails and the URL stays. A server-built URL (an `x` frame, a server-function redirect) is not rewritten again (`link.test.tsx` `delegate rewrite`; BUGS.md B17).
