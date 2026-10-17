# navigate and hooks

```ts
navigate({ to, params?, search?, hash?, replace?, revalidate?, scroll?, shallow?, state?, viewTransition? })
```

`navigate` is a root export: the booted client's navigation, callable from anywhere on the client, the same function `useNavigate()` returns. Before `createClient` has booted, and on the server, it rejects (`client/navigation/active.test.ts`, BUGS.md 105).

`invalidate()` is a root export beside it: it drops every cached match, every held prefetch, and the query client's cache, then refetches the page on screen as `revalidate: true` does, with no history entry. Call it after a sign-in or sign-out Flare cannot see, such as an auth library's own fetch; a server function whose returned `Response` writes a cookie does the dropping itself (B133). Before boot, and on the server, it rejects (`client/navigation/active.test.ts` `active invalidate`, `invalidate.test.ts`, `tests/integration/cache-client.test.ts` `invalidate`).

`to` is required and is a page route id, including a `.response()` page (`dx/types.md`). A string that is an absolute URL throws (`client/navigation/target.test.ts` `foreign origin`).

| prop | required | default | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- |
| `to` | yes | — | the target route | | `target.test.ts` `data url` |
| `params` | when the param type has any key | — | the object. A key whose type includes `undefined` is still present. The value may be `undefined` | a missing one throws before the fetch. `params: {}` on `[[id]]` is missing that key. The types are `dx/types.md` | `target.test.ts` `missing param`; `propagation.test.ts` `optional param` |
| `search` | when the validator output has a required key | the empty search, when the prop is optional | the validator output, or the raw record when this route did not validate search (`dx/types.md`) | serialized by the `dx/link.md` URL values rule. Reserved params are stripped | `target.test.ts` `strips reserved`; `propagation.test.ts` `search required key` |
| `hash` | no | — | | | `target.test.ts` `hash` |
| `replace` | no | `false` | `replaceState` | | `navigate.test.ts` `replace` |
| `revalidate` | no | `false` | refetch even inside `staleTime`. Does not push history when the URL does not change | | `navigate.test.ts` `revalidation` |
| `scroll` | no | `true` | `false` keeps the current scroll | | `scroll.test.ts` `no scroll` |
| `shallow` | no | `false` | search or hash only. Blockers run (trigger `navigation`), and `false` cancels before the history write. Then no request is sent, no loader, `loaderDeps`, or `shouldRefetch` runs, the match cache is untouched, and `pending` never rises. The URL is pushed (or replaced with `replace`), the page match's `search` becomes the call's `search` (the validator output the URL was written from, or `{}` when the call passes none; a hash-only call keeps it), loader data and params stay, and layout matches keep their search until their next loader run, because a layout's `.input()` cannot run on the client. No view transition runs. Back or Forward across a shallow entry is an ordinary restore under the cache rules | a different pathname throws. Loader data that depends on search is stale until a later non-shallow navigation; that is what shallow means | `target.test.ts` `shallow other route`; `navigate.test.ts` `shallow`, `shallow blocked` (BUGS.md B18) |
| `state` | no | — | stored on the history entry. It must be structured-cloneable. A function throws | | `client/history/history.test.ts` `state` |
| `viewTransition` | no | the router default | `false` skips the transition. `{ scope, types }` is below | | `direction.test.ts` |

A successful data response updates the DOM, then pushes history (`navigate.test.ts` `commit then push`).

A network failure, which has no HTTP status, leaves the screen and the history unchanged (`navigate.test.ts` `network`). A Back or Forward step cannot leave the history unchanged, since the browser already moved it: one that commits nothing, a network failure or a 400, loads its URL as a document, so the screen matches the URL and a Link to the page that was on screen is not taken for the current one (`navigate-failure.test.ts` `failed back loads document`, plan 21 12.4, BUGS.md 242). A response whose body fails to read or land, other than by the navigation's own abort, is logged with `console.error` and the target loads as a document, under the reload guard (`request.test.ts` `unreadable body`, `aborted body`; e2e `docs-resilience.test.ts` `unreadable response`; BUGS.md 123). Once Flare has begun a document load, a fallback, a deploy mismatch, a missing chunk, or a cross-origin follow, the page is leaving: a later navigation to another page loads that page as a document and fetches no data, so the latest click wins, and a revalidation does nothing; a back-forward cache restore (`pageshow` with `persisted`) ends it (`leaving.test.ts` `leaving`, `leaving refused`, `leaving restored`; `create-client.test.ts` `pageshow`; e2e `docs-resilience.test.ts` `click after reload starts`; BUGS.md 129). The client reads every response body through a reader, never by async iteration, which Safari before 27 lacks (e2e `docs-smoke.test.ts` `no stream iteration`). HTTP 401 and 403 commit the auth error on the target, the outlet paints the walked auth boundary (B77), and then history is pushed (`navigate.test.ts` `auth error`). A bare status at or above 400, other than those two, commits the error with the message `Request failed` and then pushes (`navigate.test.ts` `request failed`). A document whose loader throws a non-flare error is that HTTP 500. An `e` frame with no `k` inside an HTTP 200 body is a loader error on a data or prefetch response. It is not cached, the outlet paints the walked `errorRender` or the `Something went wrong` div, and history is pushed because the navigation committed (`navigate.test.ts` `loader error`). An `e` frame with `k` rejects that deferred promise. It does not by itself paint `errorRender`, and it does not push (`navigate-slots.test.ts` `slot catches`, `slot escapes`). The commit and the push happen at `r` (`navigate-slots.test.ts` `two slots`). A loader `e` frame in dev has `{ message, stack }`, `error.stack` is that stack, and the client sends Vite's overlay payload. In production the object is `{ message, digest }` with no `stack` key, `error.stack` is `""`, and nothing is sent (`frames.test.ts` `dev overlay`, `prod no overlay`). A deferred `e` uses the same object. The overlay is sent only when that rejection reaches `errorRender` (`navigate-slots.test.ts` `slot escapes`). A slot inside `<Errored>` does not send it (`navigate-slots.test.ts` `slot catches`). A same-origin `x` frame is followed as a navigation. An `x` frame whose `u` is `http:` or `https:` and not this origin is a full page load (`navigate.test.ts` `same origin`, `href load`).

An `input()` failure on a data request is HTTP 400 JSON (`builder.md`). The client does not commit and does not push (`navigate.test.ts` `input 400`).

A URL no page matches is a document load, a Back or Forward onto a server 404 among them: the server's not-found document renders the not-found page inside its root, which a bare data 404 cannot paint in a root that renders the document. On a Back or Forward the browser already shows that URL, so the load replaces the entry instead of adding one (`target.test.ts` `unmatched url`, `tests/integration/history-client.test.ts`, BUGS.md 212).

A build-id mismatch and a missing chunk share one document load. `sessionStorage` key `flare_chunk_reload` holds `{ at, href }`. The same href within 10 seconds returns without a second load, and history stays (`reload.test.ts` `reload guard`). A different href loads (`reload.test.ts` `reload other href`). When `sessionStorage` throws, the load does not happen (`reload.test.ts` `reload no storage`).

## viewTransition

| prop | required | default | accepts | outcome | test |
| --- | --- | --- | --- | --- | --- |
| `scope` | no | `"content"` | `"content"`, `"document"`, `"auto"`, or `(info) =>` those | `"content"`: the document's transition with only the innermost `ViewTransitionBoundary` around the swapped outlet captured. For the transition's life the root is named `none` and the boundary `flare-content` (the element there after the update too, when a remount replaces it), through CSSOM, so a nonce CSP allows it; when it finishes, is skipped, or its start throws, each element gets back its own inline name, or none. The content crossfades in place and the header, sidebar, and the rest of the page stay live: the pointer hits them, hover works, a click navigates, and they are not animated. Measured in Chrome 154, Firefox 151, Playwright WebKit 26.5, and Safari 26.6.1, from the top and from a page scrolled to its bottom (B129). With no boundary it is the whole-document crossfade. `"document"` always captures the whole page (B119 (5)). `"auto"`, an opt-in, starts the boundary element's own transition, otherwise the document's; see the caveat below | `client/view-transition/direction.test.ts` `content scope names`, `content names the new boundary`, `content names cleared`, `content names restored`, `content without boundary`, `scope`; e2e `docs-transition.test.ts` `chrome stays live`, `chrome stays live scrolled`; `docs-navigation.test.ts` `view transition document` |
| `types` | no | none: the plain `startViewTransition(update)` callback | `string[]`, or `(info) => string[] \| false` | given types go in the object form `{ update, types }` only where the browser supports them (it exposes `ViewTransitionTypeSet`); otherwise, and for an empty list, the plain callback. `false` skips the transition. `info.direction` is `forward`, `back`, or `same` (B119) | `client/view-transition/direction.test.ts` `types` |

`info` is `{ direction, fromLocation, toLocation, pathChanged }`. Locations are `{ hash, pathname, search }`.

An element-scoped transition (`scope: "auto"` in a browser with `Element.prototype.startViewTransition`, Chromium) draws the scope's old image at the box the element had before the update. A navigation that moves the window, a scrolled page going to the top or a hash, or a Back restoring a position, moves that box: the old content slides from where it was, or the area shows neither page until the new one fades in (BUGS.md 119.2, 119.3). The document's transition has no such box, and a crossfade of unchanged pixels is invisible, so a still sidebar looks still. Opt into `"auto"` only where the navigations it covers leave the scroll where it is.

A navigation transition still running is skipped (`skipTransition()`) before the next one starts, since two at once both freeze content being swapped, and an element-scoped start that throws falls back to the document transition (B119, `direction.test.ts` `skips running`, `scoped throw`). The default styling is `ViewTransitionCSS`: `@view-transition { navigation: auto }`, one duration for `::view-transition-old(*)` and `::view-transition-new(*)`, and a still `flare-content` group, the content scope's. Any other named group is the app's choice; the docs app adds none. The two paragraphs on named groups below are for an app that adds one.

A browser without element-scoped view transitions (Firefox 155 has no `Element.prototype.startViewTransition`) runs a `ViewTransitionBoundary` scope as a document transition: the whole page crossfades, with any named groups inside it.

Do not animate content inside an element that enters a view transition under a `view-transition-name`. In Firefox 155, a running CSS animation (opacity or transform) inside such an element drops frames to the page background, so the entrance flickers; Chromium is smooth (BUGS.md B61). Animate the entrance on the pseudo-element instead, and only when there is no old image: `::view-transition-new(article):only-child { animation: rise 0.4s ease-out both; }`. Measured in Firefox 155, that entrance is smooth. Without `:only-child` the rule also runs when the group has an old image, and the content dims mid-transition.

While a transition that captures the root is on screen, from its start to its end, Chromium, WebKit, and Safari hit-test the document element whatever the CSS, so hover stops and a click does not reach a link under it; Firefox passes it with `ViewTransitionCSS`'s `::view-transition{pointer-events:none}`. In the BUGS.md 98 probe (WebKit and Firefox, the docs app's `duration={200}`), that window was 300 to 450 ms from start to `finished`, and a click inside it started no navigation. Fixed with a boundary: the default `"content"` scope leaves the root uncaptured, so with a `ViewTransitionBoundary` around the swapped content the rest of the page keeps hover and clicks in every engine (B129). The fix depends on the pointer rule: without it the same naming hits the document element in all four Playwright engines. With no boundary, or `scope: "document"`, the limit stands, and a shorter `duration` narrows the window.

A named element that only the old page has (an article left for a page without one) keeps its old snapshot above the root group while it fades, at its old scroll offset, so it draws over a sticky header. Hide that exit: `::view-transition-old(article):only-child { display: none; }` (BUGS.md 65).

## ViewTransitionBoundary

```tsx
<ViewTransitionBoundary>
  <main>{props.children}</main>
</ViewTransitionBoundary>
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `children` | yes | — | one element | that element is rendered. The component adds no wrapper. The default `"content"` scope captures only the innermost boundary around the swapped outlet, and `scope: "auto"` starts its own transition | an empty child (`false`, `null`, `""`) registers nothing. In dev, more than one node, or a node that is not an element, throws. In production that case registers nothing and logs nothing. The client has no logger (00-rules) | `shared/components/view-transition-boundary.test.tsx` `one element`, `empty`, `dev throw`, `scope` |

No other prop exists. A `name` or `class` prop does not type-check (`view-transition-boundary.test.tsx` `no name`).

## ViewTransitionCSS

```tsx
<ViewTransitionCSS />
<ViewTransitionCSS duration={150} />
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `duration` | no | `150` | a number of milliseconds | a style tag whose nonce is the request nonce (`server.md`) and whose text is `@view-transition{navigation:auto}::view-transition{pointer-events:none}::view-transition-group(flare-content){animation:none}::view-transition-old(*),::view-transition-new(*){animation-duration:<duration>ms}@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none}}`. The transition crossfades the old content out and the new in (B125): the boundary's in place, its group still, or the whole page with no boundary (B129). The overlay passes the pointer through, so what the transition does not capture keeps hover and clicks (B126, B129). A user who asks for reduced motion gets the swap with no animation | a duration string does not type-check. This prop is milliseconds. In Chrome on some Linux compositor and GPU combinations the old root snapshot comes out fully white (https://issues.chromium.org/issues/573693508): an app that sees it adds, after the component, `::view-transition-old(flare-content){display:none}` with a boundary or `::view-transition-old(root){display:none}` without one, so the new content fades in over the old instead (B125, B129). With no boundary, Chromium, WebKit, and Safari hit-test the document element while a transition runs: hover stops and a click is lost for the transition's length, so keep `duration` short (B126) | `shared/components/view-transition-css.test.tsx` `default duration`, `custom duration`, `old root kept`, `pointer passthrough`, `content group still`; e2e `docs-navigation.test.ts` `old snapshot shown`; `docs-transition.test.ts` `chrome stays live` |

## Hooks

| hook | returns | pitfall | test |
| --- | --- | --- | --- |
| `useNavigation()` | `{ pending }`. `pending` is true from the fetch start until commit: inside the view transition's update when one runs, so the old capture shows the page as it was while pending, and it has fallen by the time the update returns (B124). A fill's pending ends with its fetch | it is false during a prefetch | `client/navigation/pending.test.ts`; `navigate-transition.test.ts` `pending until commit`, `pending ends once`, `pending ends once, skipped`; `navigate.test.ts` `pending until commit, no transition` |
| `useNavigationProgress(options?)` | `{ pending, value }`. `pending` is the same flag as `useNavigation().pending`. `value` is `null` while idle, a number in `(0, 1)` while that flag is true, `1` when the flag falls, then `null` after `minDisplay` | prefetch leaves both idle. The hook renders no element. `NavigationProgress` is not an export | `client/navigation/progress.test.ts` |
| `useLoaderData({ from })` | that route's own loader data. `from` is the route id | a page call does not include the layout's fields. Read the layout with the layout id. An unknown id does not type-check (`dx/types.md`) | `outlet-nodes.test.ts` `layout data`; `propagation.test.ts` `hook from`, `parent loader hidden` |
| `useParams({ from })` | that route's params. Brackets, unless that file's `.input({ params })` replaced them | `from` is required | `outlet-nodes.test.ts` `params`; `propagation.test.ts` `param types` |
| `useSearch({ from })` | that route's search. The validator output when that file validated search, otherwise the raw record `Record<string, string \| string[]>` | one occurrence of a key is a string. Two or more, in appearance order, is a `string[]` | `outlet-nodes.test.ts` `search repeated`; `propagation.test.ts` `search validated` |
| `useLocation()` | `{ pathname, search, hash, params }`. `params` and `search` are the raw records | pathname is canonical. This hook takes no `from`. The values are not the validator output | same; `propagation.test.ts` `use location raw` |
| `useMatch({ from })` | `{ id, routeId }`. Both are strings. `id` is the match id, raw params plus raw search. `routeId` is the route id | `from` is required. The return has no typed `params` and no loader data | `outlet-nodes.test.ts` `match`; `propagation.test.ts` `use match untyped` |
| `useNavigate()` | the `navigate` function, with the same generics | | `navigate.test.ts`; `propagation.test.ts` `use navigate` |
| `useBlocker(fn)` | void. Only the last registered `fn` runs. It returns boolean. `false` cancels before the history write. If this attempt already pushed, `history.go` with the negative delta undoes it. The callback does not run for `"initial"`, popstate, or a same-URL revalidation. `beforeunload` calls it with `next` equal to `current` and `preventDefault` runs when it returns `false`, so a reload, a tab close, and a link that loads a document ask first; the client listens from boot until it is disposed (B84, BUGS.md 183) | returning `false` when `trigger` is `"initial"` does not run, because hydrate does not call the blocker | `client/navigation/blocker.test.ts` `cancel`, `initial`, `beforeunload`, `popstate skips`; `client/boot/leave.test.ts` `blocker unload`; `tests/integration/client.test.ts` `blocker unload` |
| `usePreloaderContext({ from })` | the accumulated preloader context for that route. An empty chain is `{}` | a missing key does not type-check. This is not `undefined` | `outlet-nodes.test.ts` `preloader`; `propagation.test.ts` `preloader accumulate` |

`useBlocker` argument (`blocker.test.ts` `fields`):

| field | outcome |
| --- | --- |
| `current` | `{ hash, pathname, search, params }` of the page that is showing |
| `next` | the same shape, for the page the navigation wants |
| `trigger` | `"initial"`, `"navigation"`, or `"revalidation"`. The same set as `shouldRefetch` |

A Back or Forward step whose matches the client cache holds, at any age, paints them at once with no request, as bfcache would; a match past its `staleTime` then revalidates once in place, writing no history, keeping the scroll the step restored, and with no view transition of its own (`navigate-transition.test.ts` `held back once`) (B137, `client/router/match-cache.test.ts` `pop held`, `client/navigation/navigate-cache.test.ts` `back paints held`, `tests/integration/history-client.test.ts` `back paints held` in chromium, firefox, and webkit, BUGS.md 229). A step the cache cannot cover, a match it never held, one evicted, an unfilled deferred value, or a page whose `shouldRefetch` asks, fetches before it commits, as any navigation does.

Popstate that skips entries is replayed one entry at a time. The blocker does not see those steps (`popstate.test.ts` `skipped entries`). The hook returns void. There is no `{ blocked, proceed, reset }` object. A popstate that only clears an overlay does not call the blocker.

## Scroll and history

Where reading `sessionStorage` throws, as with cookies off or in a sandboxed iframe, the client still hydrates and navigates: the scroll positions and the reload guard read the storage only when they use it, and go without it (`tests/integration/client.test.ts` `storage blocked`, `client/navigation/scroll.test.ts` `bad storage`, BUGS.md 178).

`history.scrollRestoration` is `"manual"` when `scrollRestoration` is true (the default). `{ x, y }` is saved before push, replace, and popstate. The storage key is the history index unless `getScrollRestorationKey` is set (`dx/router.md`). After commit, the page scrolls to the element whose id is the hash, or to `(0, 0)`, unless `scroll` is `false`. A hash-only change does not fetch. It updates the URL and scrolls. A navigation to the hash already current goes to its target again and replaces its entry, as the browser does for the same URL; a revalidation, a fill, or hydrate's refresh of that URL fetches (`scroll.test.ts` `hash`, `restore`, `document load`; `navigate.test.ts` `same hash again`, `refresh at a hash`, `revalidate at a hash`; `tests/e2e/docs-hash.test.ts`, BUGS.md 148). Popstate restores the saved point, or the top when none is saved. A document load does not read the store.

Hydrate calls `replaceState` with index `0` when `history.state` has no index. A push uses the next integer. A replace keeps the index. State is `{ index, usr }`. A popstate commit does not push or replace. A delta of three is three one-entry steps. An entry with no index is ignored (`client/history/history.test.ts` `index`, `foreign`, `delta`).

Starting a navigation aborts the previous data request that has not committed. The aborted attempt does not commit, does not push, and is not a network failure. Only the latest may commit. The request whose page is on screen is not aborted then: its deferred values stream on until another page commits, so a navigation that commits nothing, an input failure or a blocked one, leaves them settling (`requests.test.ts` `requests`, `navigate-fill.test.ts` `uncommitted keeps stream`, BUGS.md 213). An in-flight prefetch of the same URL is reused unless `revalidate` is set or a deferred placeholder still needs the enter request (`navigate.test.ts` `abort`, `reuse prefetch`).

`_flare_stale` lists page match ids that are inside `staleTime` and whose `shouldRefetch` did not return `true`. Layout ids are never listed. The param is omitted when every page loader will run. `trigger` is `"initial"` on hydrate, `"revalidation"` for a revalidate of the same URL, and `"navigation"` otherwise, including popstate and a `loaderDeps` change on a new URL. Returning `true` omits that page id even inside `staleTime` (`match-cache.test.ts` `stale list`, `should refetch`). After hydrate the cache plans once with `"initial"`: a page that returns `true` is refetched by one same-URL request with no history entry, and a document with holes sends only its fill, which runs every loader live (`client/boot/initial.test.ts` `asks initial`, `fill wins`; `tests/integration/builder-client.test.ts` `holed initial`; BUGS.md 139).

The client compares the response header `flare-build` to `self.flare.build` only when both are non-empty. A navigation mismatch document-loads and does not apply frames. A prefetch mismatch is ignored. The server does not read a request header of that name (B7). Dev id is `dev`. A missing chunk is an `Error` whose message contains one of `Failed to fetch dynamically imported module`, `error loading dynamically imported module`, `Importing a module script failed`, `Loading chunk`, or `Loading CSS chunk`. The first match uses the same `flare_chunk_reload` guard. There is no retry (`navigate.test.ts` `build mismatch`; `reload.test.ts` `chunk`).

A click on a same-origin `<a>` that matches a route follows `Link`, except a non-primary button, `meta`, `ctrl`, `shift`, `alt`, a `target` other than `_self`, `download`, `rel="external"`, `data-flare-skip`, or `defaultPrevented`. An active link does not navigate unless `force` is set or it has a hash: a new hash moves the page, and the current one scrolls to its target again with no history entry and no request (`link.test.tsx` `same hash`). Disabled stays an `<a>` with `aria-disabled="true"` and `tabindex="-1"`. Active sets `aria-current="page"` (`link.test.tsx` `delegate`, `disabled`, `active`). A client `navigate` or `Link` to a `.response()` page is a full document load (`target.test.ts` `response page`).

## Outlet

`<Outlet />` has no props. It renders no `<Loading>` and no `<Reveal>`. A layout or root whose match id and own params are unchanged stays mounted, including its component state. A layout below the root whose own segment's params change remounts, for the same reason a page does (B106). The root never remounts: it renders the document, which a client remount cannot rebuild, so on a locale switch the `[[locale]]` root stays and the page under it remounts with the new params. The page remounts when its match id or its params change, so a read in the new page starts under fresh `<Loading>` boundaries and shows their fallbacks instead of holding the navigation behind boundaries already revealed (B106). A loader-data refresh and a search-only change do not remount (`shared/components/outlet.test.tsx` `layout stays`, `page remounts`). History is written when the navigation's commit is on screen: a commit Solid holds on a pending read outside any fresh `<Loading>` moves no URL until it shows, and a newer navigation that replaces it first writes its own entry only (`navigate-slots.test.ts` `pending read commits`, `supersede pending read`).

## Focus and announcement

A client navigation that puts a page on another pathname on screen does for a keyboard or screen reader user what a document load does (B141). Focus moves to the element the URL's hash names, else the page's `main h1`, else the first `h1`, else `main`, else the body, without scrolling: the step already restored or reset the scroll. An element that takes no focus of its own gets `tabindex="-1"` until focus leaves it. The new page's title, else its heading's text, else its pathname, is then read out by `#flare-announcer`, one polite, atomic live region at the end of `<body>`, made on the first navigation and hidden from sight through its style object, which a nonce CSP allows. Back and Forward do the same. A search-only change, a shallow or hash move, a revalidation, a fill, and an overlay opening keep focus where it is, so a search box that writes `?q=` keeps its caret (`client/navigation/arrival.test.ts` `heading and title`, `fallbacks`; `navigate-cache.test.ts` `arrived`; `tests/integration/history-client.test.ts` `arrival focus` in chromium, firefox, and webkit, plan 21 4.1, BUGS.md 236).

## InterceptOutlet

```tsx
<InterceptOutlet>
  {(state) => <dialog><h2>{state.match.loaderData.title}</h2></dialog>}
</InterceptOutlet>
```

The layout owns the outlet. With no overlay the child is not called, including during SSR and on a document load.

| field | outcome |
| --- | --- |
| `render` | the string passed to `.intercept()`. A label for the child |
| `match` | the target page only. `loaderData` is that page's loader data. `match.render` is the page component |
| `params` | that page's params |
| `search` | that page's search |
| `backgroundLocation` | `{ pathname, search, hash, params }` of the page underneath |
| `dismiss()` | `history.back()` |

The child paints the preview. The page component runs only when the child calls `state.match.render`. The target route's layouts are not mounted in the overlay. The background chain stays mounted, so its scroll stays. Inside `state.match.render`, the page's own hooks (`useParams`, `useSearch`, `useLoaderData`, `usePreloaderContext`, `useMatch`) with `from` set to the page's id read the overlay's params, search, loader data, and preloader context, and hooks naming a background route read the background. A `from` naming one of the target's own layouts throws, since that layout is not mounted (BUGS.md B16). The child renders inside the same boundary walk as `Outlet` (`builder.md` Boundaries): a throw in the child or in the page paints the nearest `errorRender` of the layout that owns the outlet, sends the dev overlay payload in dev, and never vanishes (BUGS.md B41).

A client navigation whose current route id is in `from` fetches the target, pushes its URL, and saves the background scroll. The overlay entry is `{ index, intercepted: true }`. Opening the overlay always pushes it, even when `replace` is true; a navigation inside the open overlay with `replace` replaces it, so one Back closes the overlay however many searches it held (`tests/integration/overlay-client.test.ts`, BUGS.md 214). A language switch with the overlay open navigates the background page to another locale's URL, which is not intercepted, so the overlay closes by design. The same path and search, a revalidation, and a popstate do not open a second overlay and do not clear the one that is open. A navigation into another root is a document load. A failed overlay fetch continues as a normal navigation.

While the child is on screen it holds keyboard focus (B142): focus moves into it, to an element marked `autofocus`, else the first that takes focus, else its first element, without scrolling the page under it; Tab and Shift+Tab wrap inside it; Escape calls `dismiss()` unless the app already handled the key; and on close focus returns to the element that opened it. No wrapper element is added, so the child's own `role="dialog"` and label are what assistive technology reads (`shared/components/overlay-focus.test.ts` `trap`, `edges`; `intercept-outlet.test.tsx` `overlay focus`, `overlay focus kept`; `tests/integration/overlay-client.test.ts` `overlay keyboard` in chromium, firefox, and webkit, BUGS.md 237).

Back onto the background entry clears the overlay, does not fetch, and does not scroll. The background page stays mounted. Forward onto the overlay entry shows the overlay again, does not remount the background, and fetches only under the ordinary stale rules. While the overlay is open, the document head stays the background head. A history entry for a different URL is a normal navigation. A reload, or any document load of the target URL, renders the page (`intercept-outlet.test.tsx` `shows intercepted`, `custom`, `direct visit`, `reload`, `dismiss`, `forward`, `fetch fails`, `head stays`).

## useNavigationProgress

```tsx
const progress = useNavigationProgress()
const paced = useNavigationProgress({ trickle: 200, minDisplay: 0 })
```

The app paints the bar. Flare returns the number. These v0 props do not exist: `color`, `height`, `showPeg`, `speed`, `trickleSpeed`, `zIndex`, `minDisplayTime`. The component `NavigationProgress` does not exist.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `trickle` | no | `200` | an integer number of milliseconds, at least `16` | the gap between creep steps | `0`, a value below `16`, or a duration string throws at the call | `progress.test.ts` `trickle 0`, `trickle 15`, `trickle 16` |
| `minDisplay` | no | `0` | an integer number of milliseconds, at least `0` | after `pending` falls, `value` stays `1` until this many milliseconds have passed since the navigation started | a negative number or a duration string throws at the call | `progress.test.ts` `min display`, `min display negative` |

`value` while `pending` is true:

| step | value |
| --- | --- |
| the flag becomes true | `0.08` |
| each `trickle` tick, while the current value is below `0.2` | add `0.1` |
| below `0.5` | add `0.04` |
| below `0.8` | add `0.02` |
| below `0.994` | add `0.005` |
| otherwise | add `0` |
| after the add | at most `0.994`. It stays below `1` while `pending` is true |

The first tick waits one `trickle` interval. Completion sets `value` to `1` in that turn. There is no random jump on the way to `1`. When `pending` becomes true again during the hold, the hold timer is cleared and `value` starts over at `0.08`.

On the server the hook returns `{ pending: false, value: null }` and schedules no timer (`progress.test.ts` `ssr`, `start`, `first trickle`, `cap`, `complete`, `restart`, `prefetch`, `failure`). A failed navigation completes the same way a commit does.
