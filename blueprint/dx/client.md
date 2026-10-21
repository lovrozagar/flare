# createClient

```ts
createClient(router)
  .onReady((ctx) => {})
  .onHydrated(() => {})
  .onIdle(() => {})
  .onInteraction(() => {})
```

`router` is the object from `createRouter`. It is required. There is no second argument. Anything else, `undefined` or an object without the router's shape, throws at the call, naming `router`, before any boot is queued (`create-client.test.ts` `router required`, BUGS.md 434).

Registration closes on the next microtask, when the boot starts, which is why the callbacks are registered by chaining in the same turn. A callback registered after that microtask throws (`client/boot/ready.test.ts` `late`; `tests/integration/client.test.ts` `late registration`). Hydrate comes later: the boot first imports the route modules of the current URL.

| method | argument | when it runs | pitfall | test |
| --- | --- | --- | --- | --- |
| `onReady` | `(ctx) => void` | after the router context exists and before hydrate commits | `ctx` is only `{ navigate, location }`. `location` is `{ pathname, search, hash }` | `ready.test.ts` `ready context`; `tests/integration/client.test.ts` `ready then hydrated` |
| `onHydrated` | `() => void` | after hydrate. `data-flare-hydrated` is already on `<html>` | | `ready.test.ts` `order`; `tests/integration/client.test.ts` `ready then hydrated`, `idle after hydrated` |
| `onIdle` | `() => void` | `requestIdleCallback`, or one second after hydrate if the browser never idles | A browser without `requestIdleCallback`, such as Safari, always waits the one second. `modules: "all"` prefetch starts here, after these callbacks | `ready.test.ts` `all after idle`, `idle timeout`; `tests/integration/client.test.ts` `idle after hydrated` |
| `onInteraction` | `() => void` | the first `pointerdown` or `keydown` after hydrate, once. The listeners capture, so an element that stops its event's propagation does not hide it (BUGS.md 435) | It does not run on a programmatic navigation. Input before hydrate is never seen. A synthetic event an app dispatches counts as input | `ready.test.ts` `order`, `interaction under a stopped event`; `tests/integration/client.test.ts` `interaction once` |

Order is ready, then hydrated, then idle and interaction when those events fire. Each method may be called more than once. The functions run in registration order. A callback that throws is the app's bug, not the end of the boot: it is logged as `[flare] an app callback threw`, in dev the overlay shows it, and the rest of its phase still runs, so the page hydrates and a stored page's holes fill (`ready.test.ts` `throwing callback`, `boot/callbacks.test.ts` `callback report`, `tests/integration/callbacks-client.test.ts` `throwing callbacks`, BUGS.md 203). An `async` callback whose promise rejects is reported the same way, never as an unhandled rejection (`ready.test.ts` `async callback rejects`, BUGS.md 436).

A boot that fails before the router context exists, such as a route module that will not load, runs no callback, not even `onReady`. The failure is logged, and in dev the overlay shows it (BUGS.md 352).

There is no `onLoad`. Prefetch of every route chunk is the router's `prefetch.modules: "all"`, not a client callback (`link.md`).
