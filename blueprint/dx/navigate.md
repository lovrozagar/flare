# navigate and hooks

```ts
navigate({ to, params?, search?, hash?, replace?, revalidate?, scroll?, shallow?, state?, viewTransition? })
```

`navigate` is a root export: the booted client's navigation, callable from anywhere on the client, the same function `useNavigate()` returns. Before `createClient` has booted, and on the server, it rejects (`client/navigation/active.test.ts`, BUGS.md 105).

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

A network failure, which has no HTTP status, leaves the screen and the history unchanged (`navigate.test.ts` `network`). HTTP 401 and 403 commit the auth error on the target, the outlet paints the walked auth boundary (B77), and then history is pushed (`navigate.test.ts` `auth error`). A bare status at or above 400, other than those two, commits the error with the message `Request failed` and then pushes (`navigate.test.ts` `request failed`). A document whose loader throws a non-flare error is that HTTP 500. An `e` frame with no `k` inside an HTTP 200 body is a loader error on a data or prefetch response. It is not cached, the outlet paints the walked `errorRender` or the `Something went wrong` div, and history is pushed because the navigation committed (`navigate.test.ts` `loader error`). An `e` frame with `k` rejects that deferred promise. It does not by itself paint `errorRender`, and it does not push (`navigate-slots.test.ts` `slot catches`, `slot escapes`). The commit and the push happen at `r` (`navigate-slots.test.ts` `two slots`). A loader `e` frame in dev has `{ message, stack }`, `error.stack` is that stack, and the client sends Vite's overlay payload. In production the object is `{ message, digest }` with no `stack` key, `error.stack` is `""`, and nothing is sent (`frames.test.ts` `dev overlay`, `prod no overlay`). A deferred `e` uses the same object. The overlay is sent only when that rejection reaches `errorRender` (`navigate-slots.test.ts` `slot escapes`). A slot inside `<Errored>` does not send it (`navigate-slots.test.ts` `slot catches`). A same-origin `x` frame is followed as a navigation. An `x` frame whose `u` is `http:` or `https:` and not this origin is a full page load (`navigate.test.ts` `same origin`, `href load`).

An `input()` failure on a data request is HTTP 400 JSON (`builder.md`). The client does not commit and does not push (`navigate.test.ts` `input 400`).

A build-id mismatch and a missing chunk share one document load. `sessionStorage` key `flare_chunk_reload` holds `{ at, href }`. The same href within 10 seconds returns without a second load, and history stays (`reload.test.ts` `reload guard`). A different href loads (`reload.test.ts` `reload other href`). When `sessionStorage` throws, the load does not happen (`reload.test.ts` `reload no storage`).

## viewTransition

| prop | required | default | accepts | outcome | test |
| --- | --- | --- | --- | --- | --- |
| `scope` | no | `"auto"` | `"auto"`, `"document"`, or `(info) =>` those | `"auto"` uses the innermost `ViewTransitionBoundary` around the swapped outlet, otherwise the document | `shared/components/view-transition-boundary.test.tsx` `scope` |
| `types` | no | none: the plain `startViewTransition(update)` callback | `string[]`, or `(info) => string[] \| false` | given types go in the object form `{ update, types }` only where the browser supports them (it exposes `ViewTransitionTypeSet`); otherwise, and for an empty list, the plain callback. `false` skips the transition. `info.direction` is `forward`, `back`, or `same` (B119) | `client/view-transition/direction.test.ts` `types` |

`info` is `{ direction, fromLocation, toLocation, pathChanged }`. Locations are `{ hash, pathname, search }`.

A navigation transition still running is skipped (`skipTransition()`) before the next one starts, since two at once both freeze content being swapped, and an element-scoped start that throws falls back to the document transition (B119, `direction.test.ts` `skips running`, `scoped throw`). The default styling is `ViewTransitionCSS`: `@view-transition { navigation: auto }` and one duration for `::view-transition-old(*)` and `::view-transition-new(*)`. A named group is the app's choice; Flare and the docs app add none. The two paragraphs on named groups below are for an app that adds one.

A browser without element-scoped view transitions (Firefox 155 has no `Element.prototype.startViewTransition`) runs a `ViewTransitionBoundary` scope as a document transition: the whole page crossfades, with any named groups inside it.

Do not animate content inside an element that enters a view transition under a `view-transition-name`. In Firefox 155, a running CSS animation (opacity or transform) inside such an element drops frames to the page background, so the entrance flickers; Chromium is smooth (BUGS.md B61). Animate the entrance on the pseudo-element instead, and only when there is no old image: `::view-transition-new(article):only-child { animation: rise 0.4s ease-out both; }`. Measured in Firefox 155, that entrance is smooth. Without `:only-child` the rule also runs when the group has an old image, and the content dims mid-transition.

While a document view transition is on screen, from its start to its end, the browser hit-tests the transition overlay, so a click lands on the document element and does not reach a link under it. In the BUGS.md 98 probe (WebKit and Firefox, the docs app's `duration={200}`), that window was 300 to 450 ms from start to `finished`, and a click inside it started no navigation. `::view-transition { pointer-events: none }` does not change it in WebKit. An element-scoped transition (Chromium, a `ViewTransitionBoundary` scope) leaves the rest of the page clickable, and a shorter `duration` narrows the window. Flare changes nothing here.

A named element that only the old page has (an article left for a page without one) keeps its old snapshot above the root group while it fades, at its old scroll offset, so it draws over a sticky header. Hide that exit: `::view-transition-old(article):only-child { display: none; }` (BUGS.md 65).

## ViewTransitionBoundary

```tsx
<ViewTransitionBoundary>
  <main>{props.children}</main>
</ViewTransitionBoundary>
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `children` | yes | — | one element | that element is rendered. The component adds no wrapper. `scope: "auto"` uses the innermost boundary around the swapped outlet | an empty child (`false`, `null`, `""`) registers nothing. In dev, more than one node, or a node that is not an element, throws. In production that case registers nothing and logs nothing. The client has no logger (00-rules) | `shared/components/view-transition-boundary.test.tsx` `one element`, `empty`, `dev throw`, `scope` |

No other prop exists. A `name` or `class` prop does not type-check (`view-transition-boundary.test.tsx` `no name`).

## ViewTransitionCSS

```tsx
<ViewTransitionCSS />
<ViewTransitionCSS duration={175} />
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `duration` | no | `175` | a number of milliseconds | a style tag whose nonce is the request nonce (`server.md`) and whose text is `@view-transition{navigation:auto}::view-transition-old(*),::view-transition-new(*){animation-duration:<duration>ms}@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none}}`. A user who asks for reduced motion gets the swap with no animation | a duration string does not type-check. This prop is milliseconds | `shared/components/view-transition-css.test.tsx` `default duration`, `custom duration` |

## Hooks

| hook | returns | pitfall | test |
| --- | --- | --- | --- |
| `useNavigation()` | `{ pending }`. `pending` is true from the fetch start until commit | it is false during a prefetch | `client/navigation/pending.test.ts` |
| `useNavigationProgress(options?)` | `{ pending, value }`. `pending` is the same flag as `useNavigation().pending`. `value` is `null` while idle, a number in `(0, 1)` while that flag is true, `1` when the flag falls, then `null` after `minDisplay` | prefetch leaves both idle. The hook renders no element. `NavigationProgress` is not an export | `client/navigation/progress.test.ts` |
| `useLoaderData({ from })` | that route's own loader data. `from` is the route id | a page call does not include the layout's fields. Read the layout with the layout id. An unknown id does not type-check (`dx/types.md`) | `outlet-nodes.test.ts` `layout data`; `propagation.test.ts` `hook from`, `parent loader hidden` |
| `useParams({ from })` | that route's params. Brackets, unless that file's `.input({ params })` replaced them | `from` is required | `outlet-nodes.test.ts` `params`; `propagation.test.ts` `param types` |
| `useSearch({ from })` | that route's search. The validator output when that file validated search, otherwise the raw record `Record<string, string \| string[]>` | one occurrence of a key is a string. Two or more, in appearance order, is a `string[]` | `outlet-nodes.test.ts` `search repeated`; `propagation.test.ts` `search validated` |
| `useLocation()` | `{ pathname, search, hash, params }`. `params` and `search` are the raw records | pathname is canonical. This hook takes no `from`. The values are not the validator output | same; `propagation.test.ts` `use location raw` |
| `useMatch({ from })` | `{ id, routeId }`. Both are strings. `id` is the match id, raw params plus raw search. `routeId` is the route id | `from` is required. The return has no typed `params` and no loader data | `outlet-nodes.test.ts` `match`; `propagation.test.ts` `use match untyped` |
| `useNavigate()` | the `navigate` function, with the same generics | | `navigate.test.ts`; `propagation.test.ts` `use navigate` |
| `useBlocker(fn)` | void. Only the last registered `fn` runs. It returns boolean. `false` cancels before the history write. If this attempt already pushed, `history.go` with the negative delta undoes it. The callback does not run for `"initial"`, popstate, or a same-URL revalidation. `beforeunload` calls it with `next` equal to `current` and `preventDefault` runs when it returns `false` (B84) | returning `false` when `trigger` is `"initial"` does not run, because hydrate does not call the blocker | `client/navigation/blocker.test.ts` `cancel`, `initial`, `beforeunload`, `popstate skips` |
| `usePreloaderContext({ from })` | the accumulated preloader context for that route. An empty chain is `{}` | a missing key does not type-check. This is not `undefined` | `outlet-nodes.test.ts` `preloader`; `propagation.test.ts` `preloader accumulate` |

`useBlocker` argument (`blocker.test.ts` `fields`):

| field | outcome |
| --- | --- |
| `current` | `{ hash, pathname, search, params }` of the page that is showing |
| `next` | the same shape, for the page the navigation wants |
| `trigger` | `"initial"`, `"navigation"`, or `"revalidation"`. The same set as `shouldRefetch` |

Popstate that skips entries is replayed one entry at a time. The blocker does not see those steps (`popstate.test.ts` `skipped entries`). The hook returns void. There is no `{ blocked, proceed, reset }` object. A popstate that only clears an overlay does not call the blocker.

## Scroll and history

`history.scrollRestoration` is `"manual"` when `scrollRestoration` is true (the default). `{ x, y }` is saved before push, replace, and popstate. The storage key is the history index unless `getScrollRestorationKey` is set (`dx/router.md`). After commit, the page scrolls to the element whose id is the hash, or to `(0, 0)`, unless `scroll` is `false`. A hash-only change does not fetch. It updates the URL and scrolls (`scroll.test.ts` `hash`, `restore`, `document load`). Popstate restores the saved point, or the top when none is saved. A document load does not read the store.

Hydrate calls `replaceState` with index `0` when `history.state` has no index. A push uses the next integer. A replace keeps the index. State is `{ index, usr }`. A popstate commit does not push or replace. A delta of three is three one-entry steps. An entry with no index is ignored (`client/history/history.test.ts` `index`, `foreign`, `delta`).

Starting a navigation aborts the previous data request. The aborted attempt does not commit, does not push, and is not a network failure. Only the latest may commit. An in-flight prefetch of the same URL is reused unless `revalidate` is set or a deferred placeholder still needs the enter request (`navigate.test.ts` `abort`, `reuse prefetch`).

`_flare_stale` lists page match ids that are inside `staleTime` and whose `shouldRefetch` did not return `true`. Layout ids are never listed. The param is omitted when every page loader will run. `trigger` is `"initial"` on hydrate, `"revalidation"` when the stay is a revalidate or a `loaderDeps` change, and `"navigation"` otherwise, including popstate. Returning `true` omits that page id even inside `staleTime` (`match-cache.test.ts` `stale list`, `should refetch`).

The client compares the response header `flare-build` to `self.flare.build` only when both are non-empty. A navigation mismatch document-loads and does not apply frames. A prefetch mismatch is ignored. The server does not read a request header of that name (B7). Dev id is `dev`. A missing chunk is an `Error` whose message contains one of `Failed to fetch dynamically imported module`, `error loading dynamically imported module`, `Importing a module script failed`, `Loading chunk`, or `Loading CSS chunk`. The first match uses the same `flare_chunk_reload` guard. There is no retry (`navigate.test.ts` `build mismatch`; `reload.test.ts` `chunk`).

A click on a same-origin `<a>` that matches a route follows `Link`, except a non-primary button, `meta`, `ctrl`, `shift`, `alt`, a `target` other than `_self`, `download`, `rel="external"`, `data-flare-skip`, or `defaultPrevented`. An active link does not navigate unless `force` is set or the hash differs. Disabled stays an `<a>` with `aria-disabled="true"` and `tabindex="-1"`. Active sets `aria-current="page"` (`link.test.tsx` `delegate`, `disabled`, `active`). A client `navigate` or `Link` to a `.response()` page is a full document load (`target.test.ts` `response page`).

## Outlet

`<Outlet />` has no props. It renders no `<Loading>` and no `<Reveal>`. A layout or root whose match id and own params are unchanged stays mounted, including its component state. A layout below the root whose own segment's params change remounts, for the same reason a page does (B106). The root never remounts: it renders the document, which a client remount cannot rebuild, so on a locale switch the `[[locale]]` root stays and the page under it remounts with the new params. The page remounts when its match id or its params change, so a read in the new page starts under fresh `<Loading>` boundaries and shows their fallbacks instead of holding the navigation behind boundaries already revealed (B106). A loader-data refresh and a search-only change do not remount (`shared/components/outlet.test.tsx` `layout stays`, `page remounts`). History is written when the navigation's commit is on screen: a commit Solid holds on a pending read outside any fresh `<Loading>` moves no URL until it shows, and a newer navigation that replaces it first writes its own entry only (`navigate-slots.test.ts` `pending read commits`, `supersede pending read`).

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

A client navigation whose current route id is in `from` fetches the target, pushes its URL, and saves the background scroll. The overlay entry is `{ index, intercepted: true }` and is always a push, even when `replace` is true. The same path and search, a revalidation, and a popstate do not open a second overlay and do not clear the one that is open. A navigation into another root is a document load. A failed overlay fetch continues as a normal navigation.

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
