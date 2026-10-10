# Server Context

Layer 1. Depends on nothing from Flare (uses `node:async_hooks`).

Per-request context via `AsyncLocalStorage`. Works natively with Cloudflare Workers (`nodejs_compat`).

## Types

```ts
interface ServerContextValue {
	nonce: string;
	request: Request;
	store: Map<string, unknown>;
}

interface ServerRequestContextStore {
	get<T>(key: string): T | undefined;
	set<K extends string, V>(key: K, value: V): void;
}
```

## Exports

```ts
generateNonce(): string

runWithServerContext<T>(options: { nonce: string; request: Request }, callback: () => T): T

getServerNonce(): string
setServerNonce(nonce: string): void
getServerRequest(): Request
getServerRequestContext<T = Record<string, unknown>>(): ServerRequestContextStore & T
```

## Behavior

### `runWithServerContext`

Creates a new `ServerContextValue` with provided nonce/request and empty store `Map`. Runs callback inside `AsyncLocalStorage.run()`. All async work within has access to context via getters. Callback can be async — `T` resolves to `Promise<X>` and context persists through the entire async chain.

### `getServerNonce`

Returns nonce from current request context. Throws `"Called outside request context"` if no active context.

Nonce is 32 hex chars (128-bit, `crypto.getRandomValues`). Used for CSP `script-src 'nonce-...'`.

### `setServerNonce`

Replaces the nonce on the current request context. Throws `"Called outside request context"` if no active context.

Used by `htmlCache` middleware (spec 36) to override the per-request nonce with the cached HTML's original nonce, so CSP headers match the nonce attributes in the cached HTML body.

### `getServerRequest`

Returns `Request` from current context. Throws `"Called outside request context"` if no active context.

### `getServerRequestContext`

Returns a `ServerRequestContextStore` wrapper around the context's `Map`. Provides typed `get<T>/set<K,V>` for arbitrary per-request data (auth, tenant, feature flags, etc.).

Throws `"Called outside request context"` if no active context.

## Nonce Generation

```ts
generateNonce(): string
```

- `crypto.getRandomValues(new Uint8Array(16))`
- Each byte → 2-char hex → 32 char string
- Called once per request in handler entry point

## Test Cases

```
runWithServerContext:
  Runs callback synchronously, returns result
  Async callback: runWithServerContext(opts, async () => { ... }) → context available through awaits
  Nested async work inherits context
  Concurrent requests get isolated contexts
  Nested calls: inner runWithServerContext shadows outer (AsyncLocalStorage nesting)
  Throws inside callback propagates to caller

getServerNonce:
  Returns nonce set by runWithServerContext
  Returns overridden nonce after setServerNonce called
  Throws "Called outside request context" when no context

setServerNonce:
  Replaces nonce on current context
  getServerNonce returns new value after set
  Throws "Called outside request context" when no context

getServerRequest:
  Returns request set by runWithServerContext
  Throws when no context

getServerRequestContext:
  .set("key", value) then .get("key") returns value
  .get("missing") returns undefined
  Isolated between concurrent requests
  Throws when no context

generateNonce:
  Returns 32-char hex string
  Each call produces unique value
  Matches /^[0-9a-f]{32}$/
```

## Notes

- One `AsyncLocalStorage` instance at module level — lazy-initialized on first `runWithServerContext` call
- No Solid.js dependency — pure Node API
- SSR rendering context (sharedConfig, FlareContext) is separate (see ssr spec)
- Middleware context wraps this with additional fields (env, executionContext, onResponse) — see middleware spec
- Store is intentionally untyped `Map` — consumers narrow via generics on `getServerRequestContext<T>()`
