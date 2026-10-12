# Bit 06 — Navigation

Creates every `P6` row. Document responses stay HTML. `_flare=data` and `_flare=prefetch` return NDJSON. The client commits, then pushes history.

## Extends

`shared/components/outlet-nodes.test.ts` gains `page props`, `layout children`, `layout data`, `params`, `preloader`, `match`, and `search repeated`. `match` returns `{ id, routeId }`. `search repeated` is a string for one key and a `string[]`, in appearance order, for two.

`server/lifecycle/classify.test.ts`: the bit 01 cases that expected 400 for `_flare=data` and `_flare=prefetch` are replaced by the cases below, in this bit's commit.

`src/exports/index.ts` re-exports `useNavigationProgress`.

`tests/integration/nonce.test.ts` gains `client head`: after a client navigation, a new inline head script carries `self.flare.nonce`. It also gains `view transition`: `ViewTransitionCSS` carries that same nonce.

`server/loaders/hints.test.ts` is now also reached through `internal-params` rather than only by a direct call.

## Cases

### `shared/protocol/constants.test.ts`

| test | case | result |
| --- | --- | --- |
| `names` | the module | `_flare`, `_flare_stale`, `/_flare/fn/`, response headers `flare-build`, `flare-render`, `flare-cache` |

### `shared/protocol/internal-params.test.ts`

| test | case | result |
| --- | --- | --- |
| `absent` | no param | document, params removed from the URL the router sees |
| `data` | `_flare=data` | data |
| `prefetch` | `_flare=prefetch` | prefetch |
| `other` | `_flare=isr` | 400 |
| `stripped` | the URL also has `q=1` | the user search is `{ q: "1" }` and `_flare` is not in it |
| `stale cap` | `_flare_stale` longer than 8 KiB | the all-page-loaders-stale fallback from bit 04 |

### `shared/protocol/frames.test.ts`

Corpus-driven, one line per frame.

| test | case | result |
| --- | --- | --- |
| `round trip` | each of `l c e h x r d` | decode(encode(frame)) equals the frame |
| `unknown t` | `{ "t": "g" }` | rejected |
| `unknown t q` | `{ "t": "q" }` | rejected |
| `oversize` | a line of 1 MiB + 1 | an `e` frame, and the decoder stops |
| `redirect only` | an `x` frame | the body is that one line |
| `e dev` | an `e` frame whose `e` is `{ message, stack }` | round-trips, and `digest` is absent |
| `e prod` | an `e` frame whose `e` is `{ message, digest }` | round-trips, and `stack` is absent |

### `server/navigation/data.test.ts`

| test | case | result |
| --- | --- | --- |
| `all matches` | a layout and a page, no stale list | both produce an `l` |
| `page stale` | the page id is listed | the page produces no `l`, the layout does |
| `skipped head` | the page is stale | the page produces no `h` |

### `server/navigation/response.test.ts`

| test | case | result |
| --- | --- | --- |
| `order` | loaders, heads, one deferred | lines are `l`, `l`, `h`, `h`, `r`, `c`, `d` |
| `two settle` | the slow defer is created first and the fast one resolves while the slow one is still pending | the fast `c` is written before the slow promise resolves. `d` is after both. The `c` order is completion order |
| `content type` | any data response | `application/x-ndjson` |
| `redirect` | the chain redirects | HTTP 200, the only line is `x`. `s` is the status, `u` is the built URL with search and hash, and `r` is present. The overlay sender is not called |
| `defer rejected` | a deferred function rejects on a response that is not stored | an `e` frame with that `k`, and the shell stays |
| `one rejects` | one defer rejects and the other resolves | the `e` with that `k` and the other `c` are both written before `d`. The `l` frames stay. The rejection does not cancel the other |
| `document buffer` | `documentResponseDefer: "buffer"`, a document request, one slow defer | the HTML is not sent until the defer settles. The body contains the value, not the placeholder |
| `document stream` | the option omitted, or `"stream"` | the shell is sent before the defer settles |
| `data ignores buffer` | `documentResponseDefer: "buffer"`, a data request, one slow defer | the fast frame order stays. The slow `c` is not held |
| `stored stream stays a hole` | the route `defer` is `"stream"` and `documentResponseDefer` is `"buffer"` | the stored body is the placeholder. The function is not run at store time |

### `client/navigation/navigate.test.ts`

| test | case | result |
| --- | --- | --- |
| `foreign origin` | `https://evil/` | throw, no fetch |
| `commit then push` | a successful data response | the DOM updates, then `history.pushState` |
| `network` | the fetch fails and has no status | the screen and the history stay |
| `auth error` | HTTP 401, and HTTP 403 | the auth error is committed on the target, the outlet paints the walked auth boundary or its built-in `div`, then history is pushed |
| `request failed` | HTTP 500 | the error is committed with message `Request failed`, then history is pushed |
| `loader error` | an `e` frame with no `k` inside HTTP 200 | the outlet paints the walked `errorRender` or the `Something went wrong` div, it is not cached, and history is pushed |
| `two slots` | two `<Loading>` boundaries, and `r` arrives before either `c` | history is pushed at `r`, while both fallbacks are showing. The fast `c` replaces its fallback and leaves the slow fallback. The slow `c` replaces that one. Neither frame pushes |
| `slot catches` | a deferred `e`, and that slot is inside `<Errored>` | the `<Errored>` fallback is shown. The sibling slot still swaps when its `c` arrives. `errorRender` is not called. The overlay sender is not called |
| `slot escapes` | a deferred `e`, and the slot has no `<Errored>` | the outlet paints the walked `errorRender` or the `Something went wrong` div. The layout render text stays. In dev the overlay sender is called |
| `dev overlay` | a loader `e` frame, no `k`, with `stack` in dev | `error.stack` is that stack, and the hot channel is sent `{ type: "error", err: { message, stack } }` |
| `prod no overlay` | a loader `e` frame in production | `error.stack` is `""`, and nothing is sent |
| `same origin` | an `x` frame whose `u` is a same-origin path | followed as a navigation |
| `href load` | an `x` frame whose `u` is `https://example.com/a` | a full page load. `navigate` does not push history |
| `input 400` | a data request whose `input()` failed | no commit and no push |
| `reload guard` | the same href again within 10 seconds | no second document load, history unchanged. The storage key is `flare_chunk_reload` and the value is `{ at, href }` |
| `reload other href` | a different href inside that window | the document loads |
| `reload no storage` | `sessionStorage` throws | no document load |
| `revalidation` | navigate to the current URL | no push |
| `data url` | navigate to `/about` | the fetch URL is `/about?_flare=data` |
| `missing param` | `to` a route with `[id]` and no `params` | throw before the fetch |
| `strips reserved` | `search` contains `_flare` | the fetch URL does not contain it |
| `hash` | `hash: "x"` | the URL ends in `#x` and the fetch does not |
| `shallow other route` | `shallow` and a different pathname | throw |
| `replace` | `replace: true` | `replaceState` |
| `location shape` | rewrite sees `/old?q=1#h` | the argument is `{ pathname: "/old", search: "?q=1", hash: "#h" }`, and returning `{ pathname: "/new", search: "?q=1", hash: "#h" }` matches `/new` |
| `rewrite off origin` | the result points at another origin | throw, no fetch |
| `other root` | the target route's root-layout is not the current one | a document load, and no `_flare=data` request |
| `rewrite throws` | the client `rewrite` throws | the navigation fails. The previous URL stays |
| `abort` | a second navigation starts before the first data request settles | the first request is aborted. It does not commit, does not push, and is not a network failure. Only the latest may commit |
| `reuse prefetch` | an in-flight prefetch of the same URL | that response is reused, unless `revalidate` is set or a deferred placeholder still needs the enter request |
| `build mismatch` | the response `flare-build` and `self.flare.build` are both non-empty and differ | a document load, and the frames are not applied. A prefetch mismatch is ignored. The server does not read a `flare-build` request header |
| `chunk` | the dynamic import rejects with one of the five chunk messages | one document load under `flare_chunk_reload`. No retry. A storage throw does not load |
| `response page` | `navigate` or `Link` to a `.response()` page | a full document load |

### `client/navigation/pending.test.ts`

| test | case | result |
| --- | --- | --- |
| `pending` | a fetch that has not resolved | `useNavigation().pending` is true |
| `settled` | the fetch resolves | false |

### `client/navigation/progress.test.ts`

| test | case | result |
| --- | --- | --- |
| `start` | `pending` becomes true | `value` is `0.08` and `pending` is true |
| `first trickle` | one default interval, `200` ms | `value` is `0.18` |
| `cap` | intervals until the value stops changing | `value` is `0.994` and it is not `1` |
| `complete` | `pending` becomes false | `value` is `1` in that turn, then `null` after `minDisplay` |
| `min display` | `minDisplay: 300`, complete at 50 ms | `value` stays `1` until 300 ms from the start, then `null` |
| `restart` | `pending` becomes true during that hold | the hold is cleared and `value` is `0.08` |
| `prefetch` | a prefetch | `value` stays `null` and `pending` stays false |
| `failure` | the navigation fails and `pending` falls | the same as `complete` |
| `ssr` | the hook runs on the server | `{ pending: false, value: null }` and no timer |
| `trickle 0` | `trickle: 0` | throw at the call |
| `trickle 15` | `trickle: 15` | throw |
| `trickle 16` | `trickle: 16` | accepted |
| `min display negative` | `minDisplay: -1` | throw |
| `exports` | the module | it exports `useNavigationProgress` and does not export `NavigationProgress` |

### `client/history/history.test.ts`

| test | case | result |
| --- | --- | --- |
| `stamp` | the first navigation | the state index is 1 |
| `adopt` | hydrate with an existing index 4 | the next push is 5, and history length did not grow during hydrate |
| `index` | hydrate when `history.state` has no index | `replaceState` with index `0`. A push uses the next integer. A replace keeps the index. State is `{ index, usr }`. A popstate commit does not push or replace |
| `foreign` | a history entry with no index | ignored |
| `delta` | a popstate whose index delta is 3 | three one-entry steps |

### `client/navigation/scroll.test.ts`

| test | case | result |
| --- | --- | --- |
| `restore` | index 2 was saved at `y=40` | popping back to 2 sets `scrollY` to 40 |
| `storage` | the save | the key is in `sessionStorage`, not `localStorage` |
| `behavior` | `scrollRestorationBehavior: "smooth"` | `scrollTo` is called with `smooth` |
| `cap` | `scrollRestorationMaxEntries: 0` | throw. The default cap is 50 |
| `custom key` | `getScrollRestorationKey` returns a constant | every visit shares one entry |
| `no scroll` | `scroll: false` | `scrollY` does not change |
| `hash` | the URL changes only in the hash | no fetch. The URL updates and the page scrolls to that id |
| `document load` | a full document load | the scroll store is not read. `history.scrollRestoration` is `"manual"` when restoration is on |

### `client/navigation/blocker.test.ts`

| test | case | result |
| --- | --- | --- |
| `cancel` | the blocker returns false before the history write | the write does not happen. `history.go` runs only when this attempt already pushed |
| `allow` | the blocker returns true | the navigation commits |
| `fields` | a navigation from `/a` to `/b` | the argument is `{ current, next, trigger }`. `current.pathname` is `/a`, `next.pathname` is `/b`, `trigger` is `"navigation"`. Only the last registered callback runs |
| `initial` | hydrate, and a same-URL revalidation | the callback is not called |
| `beforeunload` | the page unloads | the last callback runs with `next` equal to `current`. `preventDefault` runs when it returns false |
| `popstate skips` | a popstate, including one that only clears an overlay | the blocker is not called |

### `shared/components/view-transition-boundary.test.tsx`

| test | case | result |
| --- | --- | --- |
| `one element` | one `<main>` child | that element is rendered and no wrapper is added |
| `empty` | the child is `false` | nothing is registered |
| `dev throw` | two element children, dev | throw |
| `scope` | `scope: "auto"` and a boundary around the outlet | the transition scope is that element |
| `no name` | a `name` prop | does not type-check |

### `shared/components/view-transition-css.test.tsx`

| test | case | result |
| --- | --- | --- |
| `default duration` | no prop | the style text uses `175ms` and the tag's nonce is the request nonce |
| `custom duration` | `duration={300}` | the style text uses `300ms` |

### `client/navigation/popstate.test.ts`

| test | case | result |
| --- | --- | --- |
| `one step` | back one entry | one data fetch |
| `skipped entries` | a popstate whose index delta is 3 | three fetches, in order |

### `client/navigation/prefetch.test.ts`

| test | case | result |
| --- | --- | --- |
| `all modules` | the default router, after idle | a prefetch link for every route chunk, and no `/_flare=prefetch` request |
| `intent` | `<Link prefetch="intent" />` hovered | the module import and `/path?_flare=prefetch` |
| `object leaves the other field` | `<Link prefetch={{ data: "intent" }} />` on the default router | data on hover. Modules stay `"all"` |
| `route string` | the route sets `prefetch: "viewport"` | both modules and data wait for the viewport. It is not modules-only |
| `defer not run` | a data prefetch of a loader that calls `defer` | the shell is fetched and the deferred function is not called |
| `save data` | `Save-Data` or an effective type of `2g` | `"all"` does not run. Viewport module prefetch does |
| `prefetch stale` | `prefetchStaleTime` shorter than `staleTime` | the prefetched entry is stale on its own clock |
| `no commit` | the prefetch returns | the current page is unchanged |

### `client/router/match-cache.test.ts`

| test | case | result |
| --- | --- | --- |
| `store success` | an `l` payload | the cache returns it |
| `evict error` | an `e` payload for that id | the cache has no entry |
| `stale time` | `staleTime: 1000`, read at 1001 ms | miss |
| `gc` | `gcTime: "1s"` and no read for 1s | the entry is gone |
| `loader deps` | `loaderDeps` returns a new array whose values differ | the loader refetches on a stay |
| `loader deps same` | `loaderDeps` returns a new array with the same values | the loader does not refetch. The match id is unchanged |
| `should refetch` | `shouldRefetch` returns true for `"initial"` | the loader refetches during hydrate |
| `deferred placeholder` | the match still holds a placeholder and `cacheDeferred` is false | the match is not reused |
| `cap` | entry 101 with the default max of 100 | the least recently used entry is gone |
| `revalidate` | `revalidate: true` inside `staleTime` | a data request is sent |
| `stale list` | a page loader inside `staleTime` whose `shouldRefetch` did not return true | `_flare_stale` lists that page id. Layout ids are never listed. The param is omitted when every page loader will run. `true` omits that page id |

### `client/head/apply.test.ts`

| test | case | result |
| --- | --- | --- |
| `slot order` | an `h` frame with a title | `useHead` is called with that title |
| `replace` | the next navigation has a different title | the old title is gone |
| `nonce` | an `h` frame with an inline script, and `self.flare.nonce` is `n` | the applied script's nonce is `n` |

### `client/view-transition/direction.test.ts`

| test | case | result |
| --- | --- | --- |
| `forward` | index increases | `forward` |
| `back` | index decreases | `back` |
| `off` | `viewTransitions: false` | no transition class |

### `shared/components/link.test.tsx`

| test | case | result |
| --- | --- | --- |
| `href` | `to` the about route | an anchor whose href is `/about` |
| `foreign` | `href="https://evil/"` | the anchor is rendered and prefetch does not run |
| `intent` | hover on `prefetch="intent"` | prefetch is called for modules and data |
| `off` | `prefetch={false}` | no prefetch |
| `all rejected` | `prefetch={{ modules: "all" }}` | a dev throw. The type does not allow it |
| `dangerous` | `href="javascript:alert(1)"` | `href="#"` and no navigation |
| `params` | `to` a route with `[id]` and no `params` | throw when the link renders |
| `strips reserved` | `search` contains `_flare` | the href does not contain `_flare` |
| `hash` | `hash="x"` | the href ends in `#x` |
| `active` | the current path | `activeClass` is present, `inactiveClass` is not, and `aria-current` is `page`. `isActive` does not compare the hash |
| `is active` | a custom `isActive` | it replaces the default and receives `{ pathname, search }` |
| `active default` | the same pathname and the same search pairs | active. A longer pathname is not |
| `active search order` | the same pairs in a different order | active |
| `active prefix` | the link path is a prefix of the current path | not active |
| `disabled` | `disabled` | the element stays an `<a>`. No navigation, `aria-disabled="true"`, `tabindex="-1"` |
| `delegate` | a click on a same-origin `<a>` that matches a route | the click follows `Link`, except a non-primary button, `meta`, `ctrl`, `shift`, `alt`, a `target` other than `_self`, `download`, `rel="external"`, `data-flare-skip`, or `defaultPrevented` |
| `force` | `force` on the current route | navigation still runs |
| `blank` | `target="_blank"` | the browser navigates. The client router does not |
| `noopener` | `target="_blank"` and no `rel` | `rel` is `noopener noreferrer` |

### `shared/components/intercept-outlet.test.tsx`

| test | case | result |
| --- | --- | --- |
| `shows intercepted` | `from` includes the current route id | the outlet child is called, the background page stays mounted, and the URL is the target |
| `custom` | the child paints a card from `loaderData` and does not call `match.render` | the card is shown. The page component is not mounted |
| `direct visit` | the URL is opened as a document | the page render. The outlet child is not called |
| `reload` | reload on the overlay URL | the page render |
| `dismiss` | `dismiss()` | `history.back()`. The overlay clears. The background page is still mounted |
| `forward` | forward onto the overlay entry | the outlet child is called again. The background stays |
| `fetch fails` | the overlay data request fails | the navigation continues as a normal visit |
| `head stays` | the overlay is open | the document head stays the background head. The history entry is `{ index, intercepted: true }` and is a push even when `replace` is true. Back clears the overlay, does not fetch, and does not scroll. A revalidation does not open a second overlay |

### `client/boot/ready.test.ts`

| test | case | result |
| --- | --- | --- |
| `order` | all four callbacks | ready, hydrated, then idle and interaction when those events fire |
| `all after idle` | the default prefetch | the module prefetch links are added from the idle callback, not before |
| `late` | `onReady` after the microtask | throw |
| `ready context` | `onReady` | the argument is `{ navigate, location }` and nothing else |
| `idle timeout` | the browser never idles | the callback runs one second after hydrate |

### `tests/integration/navigation.test.ts`

| test | case | result |
| --- | --- | --- |
| `document is html` | GET `/about` | `text/html` |
| `data is ndjson` | GET `/about?_flare=data` | the frame order above |
| `header ignored` | `flare-data: 1` with no param | a document |
| `stale layout` | `_flare_stale` names the layout | the layout loader still ran |

### `tests/e2e/navigation.test.ts`

This file calls `boot` for the `minimal` app (B70). The project name selects `runtime`, `mode`, and the browser. `boot` receives `runtime` and `mode`. It does not start a server of its own. `stored stream fills` adds a page under `minimal` when that page's cache config leaves `/` and `/about` unchanged. It does not add an app.

| test | case | result |
| --- | --- | --- |
| `click` | click the about link | the URL changes, the root layout element is the same DOM node |
| `back` | browser back | the home text returns |
| `scroll` | scroll, navigate, back | the saved scroll position returns |
| `stored stream fills` | a stored page whose defer mode is `stream` | the HTML has the placeholder, then a `no-store` data request fills it |
| `two skeletons` | a document with two deferred reads, each under its own `<Loading>` | the first HTML contains both fallbacks and neither resolved string. The fast string appears in a later chunk while the slow fallback is still showing. Then the slow string appears. The status stays 200 |

## Done

A client navigation does not request a document. A request header cannot select the data response. History grows only after a successful commit.
