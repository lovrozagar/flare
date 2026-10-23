# defer

```ts
ctx.defer(() => loadReviews(id), { key: "reviews", prerender: "resolve" })
```

Called inside a loader. The return value is what the component sees in `loaderData`.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| the function | yes | — | `() => Promise<T>` | started or not, depending on the mode below. A synchronous throw before it returns its promise is that value's rejection, as an `async` function's is: the loader goes on and the other values settle (BUGS.md 429) | the function must not call `defer` again: a nested deferred has no frame, so it is a dead object on the client. In dev, a call before the function's first `await` throws `defer: called inside a deferred function` as the loader's error. A call after an `await` runs in the deferred function's own async-local scope (Solid's request event, on Node, Bun, and Workers with `nodejs_compat`), so the same error rejects that value and the inner function never runs (BUGS.md 459). On a runtime with no async-local storage, the `await` form is not guarded: the inner function runs and the client gets a dead placeholder. In production neither form throws | `server/loaders/defer.test.ts` `nested`, `nested after await`, `sync throw`; `tests/integration/defer.test.ts` `not stored` |
| `key` | no | `d0`, `d1`, … per loader | a string unique inside that loader. `d` followed by digits is reserved for the defaults | the `c` frame's `k`, and the match id plus the key identify the value | two calls with the same key return the first promise and do not call the second function. An explicit key such as `d0` throws at the `defer` call, naming the key: it would take another call's value (BUGS.md 430) | `server/loaders/defer.test.ts` `dedupe`, `reserved key`; `tests/integration/defer.test.ts` `key and prefetch` |
| `prerender` | no | the route's `defer` field | `"resolve"`, `"stream"` | overrides the route for this call, and only when the response will be stored | ignored on a `no-store` response and on a prefetch of a live page. A prefetch that misses a stored page starts the shared store write, which runs `"resolve"` functions and returns their values inline (A response that will be stored) | `server/loaders/defer.test.ts` `call overrides route`; `tests/integration/defer.test.ts` `stored modes` |

## Document response

`createServer({ documentResponseDefer })` applies only when the response being rendered is the HTML document. The default is `"stream"`. `"buffer"` holds that document until every defer running for that render has settled, then sends one HTML document that contains the values. A rejection renders as it does in a streamed document: the shell has the slot's `<Loading>` fallback, the rejection follows in the same document as Solid's hydration data, and the client paints the nearest `<Errored>` (below). The rest of the page renders, the answer is 200, and it is never stored: `private, no-store`. A public document, which waits whatever this option says (`cache.md`), renders the same way. The option changes when the bytes go out, never what the page shows (`tests/integration/defer.test.ts` `document buffer reject`, `server/lifecycle/held.test.ts`, `tests/e2e/dashboard-widgets.test.ts` `rejected value stays in its widget`, BUGS.md 373). A stored hit ignores the option and replays the stored body. A data request, a prefetch, and a client navigation ignore it. It does not change `cache.ssr.defer`, `cache.ssg.defer`, or `cache.isr.defer`. A stored `"stream"` write still stores the placeholder and does not run the function (B92).

Pitfall: `"buffer"` has no time bound. A value that never settles holds the document forever, where `"stream"` sends the shell at once; a stored render's 10 s bound (`cache.md`) does not apply to a live document. `createServer` does not check the value at runtime: only TypeScript limits it to `"stream" | "buffer"`, and any other value, a misspelled `"Buffer"` among them, streams.

Tests: `server/navigation/response.test.ts` `document buffer`, `document stream`, `data ignores buffer`, `stored stream stays a hole`; `tests/integration/defer.test.ts` `document buffer`, `not stored`.

## A response that is not stored

SSR with no `cache.ssr`, a private response, a `no-store` response. The function runs immediately. Loader data contains `{ __deferred: true, key }`. The document shell goes out. The value follows in the document stream. A data request sends all `l` frames and loader-level `e` frames, then all `h` frames, then `r`, then one `c` frame per settled defer or a deferred `e`, then `d`. Each `c` is written when that promise settles. A slow promise does not hold a fast one. `d` waits for the last of them. A rejection is an `e` frame with that `k`, the other defers still settle, and the shell stays (`server/navigation/response.test.ts` `order`, `two settle`, `one rejects`).

Prefetch (`_flare=prefetch`) on a live page does not call the function. The prefetch landing's open slots reject with "The data response ended before this value", since a prefetch asks for no fill, and the navigation discards a landing that still holds a placeholder, so nothing shows that rejection. The real navigation runs the function. A prefetch that misses a stored page is that page's store write, below.

Tests: `server/loaders/defer.test.ts` `placeholder`, `client/navigation/prefetch.test.ts` `defer not run`, `server/navigation/response.test.ts` `order`; `tests/integration/defer.test.ts` `not stored`, `key and prefetch`.

## A response that will be stored

SSG, ISR build, ISR populate, and a shared SSR write. The route field `cache.ssg.defer`, `cache.isr.defer`, or `cache.ssr.defer` decides. Omitted means `"resolve"`.

| mode | outcome | pitfall | test |
| --- | --- | --- | --- |
| `"resolve"` | the promise is awaited. The stored HTML and the stored NDJSON contain the value, not a placeholder: the stored state and each `l` frame carry it inline (`{ __deferred, key, value }`), the client's one source for it, and the stored NDJSON writes no `c` frame for it (BUGS.md 94). The value is then in a stored page twice, once in Solid's hydration data and once in the state: under brotli the second copy compresses to little, but gzip's 32 KB window cannot reach the first, so on a gzip-only CDN a multi-KB `"resolve"` value costs roughly its compressed size again, and a large one is cheaper as `"stream"`. A rejection fails the SSG build with the route id, and an ISR or SSR populate is not stored. A rejection the page reads through `useDeferred`, and any other fragment that fails after the shell, makes that render unstorable: the miss answers with the shared render's own output, `private, no-store`, `flare-cache: miss`, and logs the failure once. Nothing runs twice: no second live render runs the loaders and the defers again, for a document and for a data request alike (BUGS.md 458). A prefetch that misses the stored page runs this same write | a slow promise holds the build. That is the point: a stored page must not contain a hole | `server/cache/write.test.ts` `resolved defer`; `server/cache/serve.test.ts` `resolve runs once`, `resolve rejects runs once`; `vite/prerender/run.test.ts` `defer rejected`; `tests/integration/defer.test.ts` `stored modes` |
| `"stream"` | the function is not run at store time. The stored HTML and NDJSON contain the placeholder and no `c` frame. After hydrate, and after a data landing whose `d` frame leaves a placeholder unfilled, the client requests `?_flare=fill` for that URL. A fill is its own URL so a CDN's public data copy, which holds the hole, cannot answer it. It commits once its last frame is in, so the commit never waits behind a pending value (BUGS.md 89). A fill runs only the page's holes, by the store write's own rule: a value the stored page carries inline runs nothing and travels as `{ __deferred, key, kept: true }`, and the client keeps the one promise the page shows; a `kept` value the page does not hold rejects, naming it (BUGS.md 94). It is `no-store`, renders live, never reads or writes the store, and commits without a history write. A shallow or hash move made while the fill is in flight wins: the fill commits its values onto the page as it is then, keeping that move's URL and the page's search (`client/navigation/navigate-fill.test.ts` `later move wins`, BUGS.md 190) | the field is empty for a user with no JavaScript. Do not put the page's primary content here | `server/cache/write.test.ts` `streamed defer`; `tests/e2e/navigation.test.ts` `stored stream fills`; `tests/integration/defer.test.ts` `stored modes` |

One route may mix them. A call with `prerender: "resolve"` is awaited even when the route says `"stream"`, and the opposite too.

The stored document is still required to contain `<html>` and `</body>`. `"stream"` does not relax that.

## What the component does

The type of `loaderData.reviews` is `Deferred<T>`, which is `{ __deferred: true; key: string; promise: Promise<T>; hole?: true }`. It has no `then`. `Awaited` does not unwrap it. `T` is on `.promise`. The type cases are `propagation.test.ts` `defer field` and `defer nested`; they pin that a `Deferred` is not its value.

The pending UI is Solid `<Loading>`. The read that suspends is `useDeferred`, from `@lovrozagar/flare`:

```tsx
const reviews = useDeferred(() => props.loaderData.reviews);

<Loading fallback={<p>Loading reviews</p>}>
  <Reviews items={reviews()} />
</Loading>
```

`useDeferred(() => deferred)` is an async `createMemo`, with Solid's `ssrSource` option, over the value's view: on the server, the document's own view of the value where it has one, which settles a rejection as its projected failure, else `deferred.promise`. The accessor it returns throws that failure (below). It takes an accessor, so the memo reads loader data in its own tracking scope: a component body that reads `props.loaderData` directly gets Solid's `STRICT_READ_UNTRACKED` warning, and its value would not follow a later loader run. A plain `Deferred` does not type-check by `useDeferred`'s signature, which takes only an accessor; no type case pins it. Passed as a value, it would read loader data untracked and keep the first value. `ssrSource` is Solid's public option, and it is `"client"` only when `deferred.hole` is true. A hole is a `"stream"` value a stored render did not run. The server and the client read the same `hole`, because the `l` marker carries it. On a live render, and on a client navigation, the memo is an ordinary async memo, so the server streams the value into the document. On a stored hole, Solid renders the `<Loading>` fallback on the server and hands that boundary to the client. The client computes after hydration. It revives the state's placeholders as pending values, and the `?_flare=fill` landing resolves those same promises, so the read that holds the first value sees the fill's (`shared/components/use-deferred.test.ts` `live value`, `stored hole`; `client/navigation/request.test.ts` `fill request`).

A plain `createMemo(async () => loaderData.reviews.promise)` still works on a page that is never stored: `promise` is the value as it settled, and a rejection rejects it, on the server and on the client (`late read /direct-bad`, BUGS.md 375). Over a stored hole, it waits on a server promise that never settles, and the fallback stays. On the server it also keeps a stored render from completing, so after 10 seconds that page is served live and not stored (`cache.md` What gets stored). Use `useDeferred` for every deferred read.

`fallback` is the skeleton the app writes. While the promise is pending, that fallback is what the boundary renders. When the promise resolves, the boundary renders the children and the fallback is gone. `reviews()` is then `T`. Two boundaries swap on their own. `<Reveal>` is Solid's. Flare does not render one, so each boundary reveals when its own promise settles. An `order` other than `"natural"` holds a fast boundary until an earlier one settles. Reading `.promise` in JSX, or passing that promise as a prop, does not suspend. The async computation has to be under the `<Loading>`.

A child component takes the deferred field as an accessor typed with `Deferred` from `@lovrozagar/flare`, and reads it with `useDeferred` beside its own `<Loading>` (`types.md` `deferred named`):

```tsx
import { useDeferred, type Deferred } from "@lovrozagar/flare";

function Reviews(props: { read: () => Deferred<Review[]> }) {
  const reviews = useDeferred(props.read);
  return <Loading fallback={<p>Loading reviews</p>}><List items={reviews()} /></Loading>;
}

<Reviews read={() => props.loaderData.reviews} />
```

Flare ships no `<Await>`, no skeleton, and no content-swap component. `useDeferred` is its one deferred hook (B80).

A deferred value is a wire value on every path (B145): in the document it reaches the client through Solid's hydration data, which seroval writes, and in an `l` or `c` frame or an inline stored value through flare's frames, which seroval writes too, so a Date or a Map arrives as itself either way (`tests/integration/transport-client.test.ts` `one value everywhere`). The client builds the promise when it applies the `l` placeholder. A `c` frame resolves the promise for that `m` and `k`. A deferred `e` rejects it. The navigation commits and pushes at `r`, and these later frames do not push again. The document render awaits the same promise the loader started. Solid appends that boundary's fragment. Flare does not write a `c` frame into the HTML: a live document writes each value it started through Solid's keyed hydration channel instead (`getHydrationWriter`, under `flare:` plus the route and key), as the view `useDeferred` reads, its rejection the projected failure. The client's boot gives every deferred field of the document its slot and settles it from that value (`takeHydrationValue`), from a stored page's inline value, or, for a hole, from the fill. So a read that mounts after hydration, in a tab, a dialog, or any branch the server did not render, which Solid's hydration data holds nothing for, waits on its slot and shows the value or throws into its `<Errored>` (`tests/integration/defer.test.ts` `late read`, BUGS.md 375). Solid's serializer writes it, so a value the render also read is written once and referenced. A value the wire cannot hold, a function, a class instance, or one holding a Promise or a ReadableStream (BUGS.md 507), fails its own key on both paths: a data answer writes that key's `e`, and the document's view hands the render and the writer its projected failure, so Solid's serializer never meets it and the values beside it still settle (`server/loaders/defer.test.ts` `document and data agree`, `tests/integration/defer.test.ts` `unserializable deferred document`, BUGS.md 505).

`<Errored>` around the slot renders its fallback for that rejection. The route `errorRender` is not called, and a sibling `<Loading>` still swaps. An uncaught rejection is a failure of that match, and the walk in `dx/builder.md` runs (B77). A loader `e` frame has no `k` and is that walk as soon as it arrives.

A document's value that rejected reaches the render as its projected failure, which `useDeferred` throws on the server and in the client, so the nearest `<Errored>` paints it once the client hydrates, whether the rejection came before hydration or after it; Solid leaves a rejected region for the client to render, and the failure is what the client reads (`tests/integration/defer.test.ts` `streamed rejection early`, `streamed rejection late`, BUGS.md 374).

Tests: `server/render/document.test.ts` `two fragments`, `reject keeps shell`. `client/navigation/navigate-slots.test.ts` `two slots`, `slot catches`, `slot escapes`. `tests/e2e/navigation.test.ts` `two skeletons`; `tests/integration/defer.test.ts` `component reads`.

A client cache entry that still holds a placeholder is not reused unless the route sets `cache.client.cacheDeferred: true` (`cache.md`). With it, the entry counts as filled once every placeholder in the match's data has settled. The walk reaches arrays, objects, and a Map's or Set's members, and sees a cycle once, so a cyclic value cannot crash the commit (BUGS.md 431). A Set stays itself when the client revives the data, so a placeholder inside one stays raw and never settles: that entry stays unfilled and is fetched again (`client/router/match-cache.test.ts` `deferred in a cycle or a map`).
