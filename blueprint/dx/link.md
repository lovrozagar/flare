# Link and prefetch

## Prefetch

Two fields.

| field | server work | what it loads |
| --- | --- | --- |
| `modules` | no | the route's JS and CSS |
| `data` | yes | the loaders, and the modules too. `data` never loads data without modules |

A trigger is `false`, `"intent"` (pointer hover, focus, or touch), `"viewport"` (the link is in view), or `"render"` (after the current page's load and idle).

| where | accepts | default |
| --- | --- | --- |
| `createRouter({ prefetch })` | a trigger, or `{ data?: trigger, modules?: trigger \| "all" }` | `{ modules: "all", data: false }` |
| `.cache({ client: { prefetch } })` | a trigger, or `{ data?: trigger, modules?: trigger }` | the router value |
| `<Link prefetch>` | the same as the route | the route value, else the router |

A string sets both fields to that trigger. An object sets the fields it names and leaves the other to the next layer. Precedence per field is link, then route, then router.

`modules: "all"` is legal only on the router. After the window fires `load` and the browser is idle, everything a navigation to a route the client has not imported would download is warmed (B127). Where the browser has rel=prefetch, each such route's chunk and the chunks it imports (a production build lists them in the `chunks` map) are added as `<link rel="prefetch" as="script" crossorigin>`, each file once and none the page already loaded (BUGS.md 80); the scripts are not executed. Where it has none (`link.relList.supports("prefetch")` is false: Safari through 26.x), each such route and layout module is imported, as intent prefetch does, so the module map holds it and its imports; route modules have no side effects. A modulepreload is not used there: WebKit warns in the console for each one the page does not use within seconds of load. Only JavaScript is warmed: route CSS is not. Lazy components inside a route are not in this list. They load when they render. Data Saver and a 2G connection skip `"all"` and prefetch modules for links in the viewport instead.

Hashed assets must be served `immutable`. A prefetched URL that the browser has to revalidate is downloaded twice. On Cloudflare Workers Flare does it: the client build appends `/assets/*` → `Cache-Control: public, max-age=31536000, immutable` to the `_headers` file the assets binding reads, after the app's own rules from `public/_headers`; an app whose `_headers` already has an `/assets/*` rule keeps it, and the build warns once (B130). On Node and Bun the host's static layer serves the files, so the host sets it.

| case | outcome | test |
| --- | --- | --- |
| default router | no loader is prefetched, and after idle every route chunk is | `client/navigation/prefetch.test.ts` `all modules`, `loaded chunks skipped`; `client/boot/ready.test.ts` `all after idle` |
| `<Link prefetch="intent" />` | hover loads modules and data | `link.test.tsx` `intent` |
| `<Link prefetch={{ data: "intent" }} />` | data on hover. Modules stay at the inherited value | `prefetch.test.ts` `object leaves the other field` |
| `<Link prefetch={false} />` | this link prefetches nothing | `link.test.tsx` `off` |
| route `prefetch: "viewport"` | both fields are viewport. It does not mean modules only | `prefetch.test.ts` `route string` |
| link `modules: "all"` | type error. A cast throws in dev | `link.test.tsx` `all rejected` |
| foreign origin | the anchor renders, prefetch does not run | `link.test.tsx` `foreign` |
| data prefetch of a deferred loader | the shell is fetched, the deferred function does not run | `prefetch.test.ts` `defer not run`; `server/lifecycle/create.test.ts` `prefetch defer` |
| save-data | `"all"` does not run | `prefetch.test.ts` `save data` |

## Link props

An internal link has `to`. An external link has `href` and must not have `to`.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `to` | one of `to` or `href` | — | a page route id, including a `.response()` page (`dx/types.md`) | the href is built from `to`, `params`, `search`, `hash`. A `.response()` page is a full document load (B84) | a layout id, the root id, and a segment id do not type-check. A missing required param throws when the link renders | `link.test.tsx` `href`; `propagation.test.ts` `layout to`; `target.test.ts` `response page` |
| `href` | one of `to` or `href` | — | a string | rendered as the anchor href. Prefetch does not run | `javascript:`, `data:`, `blob:`, `vbscript:`, and a leading control or whitespace-hidden scheme render `href="#"` and do not navigate | `link.test.tsx` `dangerous` |
| `params` | when the param type has any key | — | the object. A key whose type includes `undefined` is still present | | `params: {}` on `[[id]]` is missing that key (`dx/types.md`) | `link.test.tsx` `params`; `propagation.test.ts` `optional param` |
| `search` | when the validator output has a required key | — | the validator output, or the raw record when that route did not validate search | serialized onto the query | reserved `_flare`, `_flare_stale`, and on a server-fn URL `_i`, are stripped if a caller puts them here | `link.test.tsx` `strips reserved`; `propagation.test.ts` `search required key` |
| `hash` | no | — | a string without the leading `#`. The component adds `#` | | | `link.test.tsx` `hash` |
| `prefetch` | no | inherited | above | | | |
| `replace` | no | `false` | boolean | `history.replaceState` instead of push | | `client/navigation/navigate.test.ts` `replace` |
| `revalidate` | no | `false` | boolean | the current match is refetched even inside `staleTime` | | `match-cache.test.ts` `revalidate` |
| `scroll` | no | `true` | boolean | `false` keeps the scroll position | | `scroll.test.ts` `no scroll` |
| `shallow` | no | `false` | boolean | `true` changes the URL and does not run loaders | a shallow navigation to a different route throws. Shallow is for search and hash on the current route | `target.test.ts` `shallow other route` |
| `activeClass` | no | — | string | added when the link is active | | `link.test.tsx` `active` |
| `inactiveClass` | no | — | string | added when it is not | | same |
| `activeProps` | no | — | anchor attributes | spread when active | | same |
| `inactiveProps` | no | — | anchor attributes | spread when inactive | | same |
| `isActive` | no | exact pathname and exact search | `(location: { pathname, search }) => boolean` | replaces the default. The default is not a prefix. Search equality is a multiset of pairs: order does not matter, and a repeated key must match. The hash is not compared | | `link.test.tsx` `is active`, `active default`, `active search order`, `active prefix` |
| `disabled` | no | `false` | boolean | stays an `<a>`. No navigation, no prefetch, `aria-disabled="true"`, `tabindex="-1"` | it is not replaced by a `span` | `link.test.tsx` `disabled` |
| `force` | no | `false` | boolean | navigate even when `isActive` is true | | `link.test.tsx` `force` |
| `target` | no | — | anchor target | `_blank` does not run the client router | | `link.test.tsx` `blank` |
| `rel` | no | — | string | passed through. `_blank` with no `rel` gets `noopener noreferrer` | | `link.test.tsx` `noopener` |
| `viewTransition` | no | the router default | `boolean` or `{ scope?, types? }` | `navigate.md` | | |
| `children` | yes | — | JSX | | | |

Other anchor attributes pass through, except `href` when `to` is set. `class` and `style` are the Solid attributes.

## Href

`href(value)` returns the branded string `Href`, or throws (`shared/url/href.test.ts`). `buildUrl` returns `Href`.

| value | result |
| --- | --- |
| a path that starts with one `/` | accepted. `//` is rejected |
| `http:` or `https:` | accepted |
| `javascript:`, `data:`, `blob:`, `vbscript:` | rejected |
| a leading control byte, or whitespace before the scheme | rejected |

`Link` uses the same classification and renders `href="#"` instead of throwing (`link.test.tsx` `dangerous`). `redirect({ href })` throws on a rejected value.

## URL values

`params` and `search` take the validator output, so a value that a validator produced can go back into a `Link`, `navigate()`, `redirect()`, or `buildUrl` and parse back to the same value. One rule turns a value into URL text, in `shared/url`, for all four:

| value | URL text | read back with |
| --- | --- | --- |
| string | as is, then percent-encoded | — |
| number, boolean, bigint | `String(value)` | `z.coerce.number()`, `z.coerce.boolean()`, or the same in another schema |
| `Date` | `toISOString()` | `z.coerce.date()` |
| array | one entry per element: `?tag=a&tag=b`; a catch-all param joins its segments with `/` | the array |
| plain object | `JSON.stringify` | a JSON parse step in the validator |
| `null`, `undefined` | omitted from search; a missing value for a path param, so an optional one drops and a required one throws | an optional field |
| function, symbol | throws, naming the key | — |

A plain value stays readable text, not JSON. A typed URL, a `<form method="get">`, and a `Link` produce the same text for the same value, so the match id and the cache key agree (B31). There is no custom serializer: a caller that wants another format passes the string it built (`href.test.ts` `typed values`, `date value`, `object value`, `nullish value`).
