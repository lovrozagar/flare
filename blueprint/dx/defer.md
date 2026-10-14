# defer

```ts
ctx.defer(() => loadReviews(id), { key: "reviews", prerender: "resolve" })
```

Called inside a loader. The return value is what the component sees in `loaderData`.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| the function | yes | — | `() => Promise<T>` | started or not, depending on the mode below | the function must not call `defer` again. A nested deferred is a dead object on the client | `server/loaders/defer.test.ts` `nested` |
| `key` | no | `d0`, `d1`, … per loader | a string unique inside that loader | the `c` frame's `k`, and the match id plus the key identify the value | two calls with the same key return the first promise and do not call the second function | `server/loaders/defer.test.ts` `dedupe` |
| `prerender` | no | the route's `defer` field | `"resolve"`, `"stream"` | overrides the route for this call, and only when the response will be stored | ignored on a `no-store` response and on a prefetch | `server/loaders/defer.test.ts` `call overrides route` |

## Document response

`createServer({ documentResponseDefer })` applies only when the response being rendered is the HTML document. The default is `"stream"`. `"buffer"` holds that document until every defer running for that render has settled, then sends one HTML document that contains the values. A rejection is the document error. A stored hit ignores the option and replays the stored body. A data request, a prefetch, and a client navigation ignore it. It does not change `cache.ssr.defer`, `cache.ssg.defer`, or `cache.isr.defer`. A stored `"stream"` write still stores the placeholder and does not run the function (B92).

Tests: `server/navigation/response.test.ts` `document buffer`, `document stream`, `data ignores buffer`, `stored stream stays a hole`.

## A response that is not stored

SSR with no `cache.ssr`, a private response, a `no-store` response. The function runs immediately. Loader data contains `{ __deferred: true, key }`. The document shell goes out. The value follows in the document stream. A data request sends all `l` frames and loader-level `e` frames, then all `h` frames, then `r`, then one `c` frame per settled defer or a deferred `e`, then `d`. Each `c` is written when that promise settles. A slow promise does not hold a fast one. `d` waits for the last of them. A rejection is an `e` frame with that `k`, the other defers still settle, and the shell stays (`server/navigation/response.test.ts` `order`, `two settle`, `one rejects`).

Prefetch (`_flare=prefetch`) does not call the function. The placeholder never resolves. The prefetch entry is the shell only. The real navigation runs the function.

Tests: `server/loaders/defer.test.ts` `placeholder`, `client/navigation/prefetch.test.ts` `defer not run`, `server/navigation/response.test.ts` `order`.

## A response that will be stored

SSG, ISR build, ISR populate, and a shared SSR write. The route field `cache.ssg.defer`, `cache.isr.defer`, or `cache.ssr.defer` decides. Omitted means `"resolve"`.

| mode | outcome | pitfall | test |
| --- | --- | --- | --- |
| `"resolve"` | the promise is awaited. The stored HTML and the stored NDJSON contain the value, not a placeholder. A rejection fails the SSG build with the route id, and an ISR or SSR populate is not stored | a slow promise holds the build. That is the point: a stored page must not contain a hole | `server/cache/write.test.ts` `resolved defer`; `vite/prerender/run.test.ts` `defer rejected` |
| `"stream"` | the function is not run at store time. The stored HTML and NDJSON contain the placeholder and no `c` frame. After hydrate, and after a data landing whose `d` frame leaves a placeholder unfilled, the client requests `?_flare=fill` for that URL. A fill is its own URL so a CDN's public data copy, which holds the hole, cannot answer it. It commits once its last frame is in, so the commit never waits behind a pending value (BUGS.md 89). It is `no-store`, renders live, never reads or writes the store, and commits without a history write | the field is empty for a user with no JavaScript. Do not put the page's primary content here | `server/cache/write.test.ts` `streamed defer`; `tests/e2e/navigation.test.ts` `stored stream fills` |

One route may mix them. A call with `prerender: "resolve"` is awaited even when the route says `"stream"`, and the opposite too.

The stored document is still required to contain `<html>` and `</body>`. `"stream"` does not relax that.

## What the component does

The type of `loaderData.reviews` is `Deferred<T>`, which is `{ __deferred: true; key: string; promise: Promise<T>; hole?: true }`. It has no `then`. `Awaited` does not unwrap it. `T` is on `.promise`. The type cases are `propagation.test.ts` `defer field` and `defer nested`.

The pending UI is Solid `<Loading>`. The read that suspends is `useDeferred`, from `@lovrozagar/flare`:

```tsx
const reviews = useDeferred(() => props.loaderData.reviews);

<Loading fallback={<p>Loading reviews</p>}>
  <Reviews items={reviews()} />
</Loading>
```

`useDeferred(() => deferred)` is `createMemo(() => deferred.promise, { ssrSource })`. It takes an accessor, so the memo reads loader data in its own tracking scope: a component body that reads `props.loaderData` directly gets Solid's `STRICT_READ_UNTRACKED` warning, and its value would not follow a later loader run. A plain `Deferred` does not type-check: it would read loader data untracked and keep the first value. `ssrSource` is Solid's public option, and it is `"client"` only when `deferred.hole` is true. A hole is a `"stream"` value a stored render did not run. The server and the client read the same `hole`, because the `l` marker carries it. On a live render, and on a client navigation, the memo is an ordinary async memo, so the server streams the value into the document. On a stored hole, Solid renders the `<Loading>` fallback on the server and hands that boundary to the client. The client computes after hydration. It revives the state's placeholders as pending values, and the `?_flare=fill` landing resolves those same promises, so the read that holds the first value sees the fill's (`shared/components/use-deferred.test.ts` `live value`, `stored hole`; `client/navigation/request.test.ts` `fill request`).

A plain `createMemo(async () => loaderData.reviews.promise)` still works on a page that is never stored. Over a stored hole, it waits on a server promise that never settles, and the fallback stays. On the server it also keeps a stored render from completing, so after 10 seconds that page is served live and not stored (`cache.md` What gets stored). Use `useDeferred` for every deferred read.

`fallback` is the skeleton the app writes. While the promise is pending, that fallback is what the boundary renders. When the promise resolves, the boundary renders the children and the fallback is gone. `reviews()` is then `T`. Two boundaries swap on their own. `<Reveal>` is Solid's. Flare does not render one, so each boundary reveals when its own promise settles. An `order` other than `"natural"` holds a fast boundary until an earlier one settles. Reading `.promise` in JSX, or passing that promise as a prop, does not suspend. The async computation has to be under the `<Loading>`.

Flare ships no `<Await>`, no skeleton, and no content-swap component. `useDeferred` is its one deferred hook (B80).

The client builds the promise when it applies the `l` placeholder. A `c` frame resolves the promise for that `m` and `k`. A deferred `e` rejects it. The navigation commits and pushes at `r`, and these later frames do not push again. The document render awaits the same promise the loader started. Solid appends that boundary's fragment. Flare does not write a `c` frame into the HTML.

`<Errored>` around the slot renders its fallback for that rejection. The route `errorRender` is not called, and a sibling `<Loading>` still swaps. An uncaught rejection is a failure of that match, and the walk in `dx/builder.md` runs (B77). A loader `e` frame has no `k` and is that walk as soon as it arrives.

Tests: `server/render/document.test.ts` `two fragments`, `reject keeps shell`. `client/navigation/navigate-slots.test.ts` `two slots`, `slot catches`, `slot escapes`. `tests/e2e/navigation.test.ts` `two skeletons`.

A client cache entry that still holds a placeholder is not reused unless the route sets `cache.client.cacheDeferred: true` (`cache.md`).
