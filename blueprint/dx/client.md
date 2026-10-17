# createClient

```ts
createClient(router)
  .onReady((ctx) => {})
  .onHydrated(() => {})
  .onIdle(() => {})
  .onInteraction(() => {})
```

`router` is the object from `createRouter`. It is required. There is no second argument.

The return value hydrates on the next microtask, which is why the callbacks are registered by chaining in the same turn. A callback registered after that microtask throws (`client/boot/ready.test.ts` `late`; `tests/integration/client.test.ts` `late registration`).

| method | argument | when it runs | pitfall | test |
| --- | --- | --- | --- | --- |
| `onReady` | `(ctx) => void` | after the router context exists and before hydrate commits | `ctx` is only `{ navigate, location }`. `location` is `{ pathname, search, hash }` | `ready.test.ts` `ready context`; `tests/integration/client.test.ts` `ready then hydrated` |
| `onHydrated` | `() => void` | after hydrate. `data-flare-hydrated` is already on `<html>` | | `ready.test.ts` `order`; `tests/integration/client.test.ts` `ready then hydrated`, `idle after hydrated` |
| `onIdle` | `() => void` | `requestIdleCallback`, or one second after hydrate if the browser never idles | `modules: "all"` prefetch starts here, after these callbacks | `ready.test.ts` `all after idle`, `idle timeout`; `tests/integration/client.test.ts` `idle after hydrated` |
| `onInteraction` | `() => void` | the first `pointerdown` or `keydown`, once | it does not run on a programmatic navigation | `ready.test.ts` `order`; `tests/integration/client.test.ts` `interaction once` |

Order is ready, then hydrated, then idle and interaction when those events fire. Each method may be called more than once. The functions run in registration order. A callback that throws is the app's bug, not the end of the boot: it is logged as `[flare] an app callback threw`, in dev the overlay shows it, and the rest of its phase still runs, so the page hydrates and a stored page's holes fill (`ready.test.ts` `throwing callback`, `boot/callbacks.test.ts` `callback report`, `tests/integration/callbacks-client.test.ts` `throwing callbacks`, BUGS.md 203).

There is no `onLoad`. Prefetch of every route chunk is the router's `prefetch.modules: "all"`, not a client callback (`link.md`).
