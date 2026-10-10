# Middleware

Layer 2. Depends on server-context (nonce, request), errors (all error types).

Request-level middleware chain. Runs before route matching/loading. Supports response interception, short-circuiting, and post-handler response transformation.

## Types

```ts
type FlareMiddleware<TEnv = unknown> = (
	ctx: MiddlewareContext<TEnv>,
	next: () => Promise<MiddlewareResult>,
) => Promise<MiddlewareResult>;

interface MiddlewareContext<TEnv = unknown> {
	env: TEnv;
	nonce: string;
	onResponse: (handler: ResponseHandler) => void;
	request: Request;
	url: URL;
}

type ResponseHandler = (response: Response) => Response | Promise<Response>;

type MiddlewareResult =
	{ response: Response; type: "bypass" } | { response: Response; type: "respond" } | { type: "next" };

type MiddlewareRunResult =
	{ type: "next" } | { response: Response; type: "respond" } | { response: Response; type: "bypass" };
```

## Exports

```ts
middlewareNext(): MiddlewareResult
middlewareRespond(response: Response): MiddlewareResult
middlewareBypass(response: Response): MiddlewareResult
runMiddlewares<TEnv = unknown>(
  middlewares: FlareMiddleware<TEnv>[],
  ctx: MiddlewareContext<TEnv>,
): Promise<MiddlewareRunOutput>
```

## Behavior

### Result Constructors

#### `middlewareNext`

Returns `{ type: "next" }`. Signals the chain to proceed to the next middleware (or to the route handler if this is the last middleware).

#### `middlewareRespond`

Returns `{ response, type: "respond" }`. Short-circuits remaining middlewares. Response handlers registered via `ctx.onResponse()` still run. Security headers still applied by the server handler.

#### `middlewareBypass`

Returns `{ response, type: "bypass" }`. Short-circuits everything. No response handlers run. No security headers applied. Raw response returned as-is. Use for health checks, webhooks, or pre-signed responses that must not be modified.

### Execution Chain

```
request arrives
    |
    v
Middleware[0] -> Middleware[1] -> ... -> Middleware[N] -> next()
    |                                                      |
    |            onResponse handlers collected             |
    |            during chain execution                    |
    v                                                      v
                      MiddlewareRunResult
                           |
              +------------+------------+
              |            |            |
           "next"      "respond"    "bypass"
              |            |            |
              v            v            v
         route handler   apply       return
              |          response    response
              v          handlers   as-is
           response        |
              |            v
              v          apply
           apply        security
          response      headers
          handlers        |
              |            v
              v          done
           apply
          security
          headers
              |
              v
            done
```

### `runMiddlewares`

Executes the middleware array as a recursive chain. Each middleware receives `ctx` and a `next` function that invokes the subsequent middleware.

1. Build chain: wrap middlewares into a recursive `next()` function. The innermost `next()` returns `middlewareNext()`.
2. Call `chain[0](ctx, next)`.
3. Collect response handlers registered via `ctx.onResponse()` during execution.
4. Return `MiddlewareRunResult`.

If the middleware array is empty, returns `{ type: "next" }` immediately.

### `ctx.onResponse`

Registers a `ResponseHandler` that runs after the route handler produces a response. Handlers execute in registration order (FIFO). Each handler receives the response from the previous handler (or the route handler's response for the first handler).

Response handlers run for `"next"` and `"respond"` results. They do NOT run for `"bypass"` results.

A middleware can register multiple response handlers. All are collected into a single ordered list.

### Response Handler Application

Response handlers are not applied inside `runMiddlewares`. The server handler calls them separately after the route handler completes:

```
responseHandlers: ResponseHandler[]  /* collected during runMiddlewares */

for each handler in responseHandlers:
  response = await handler(response)
```

`runMiddlewares` returns the collected handlers alongside the result. The server handler is responsible for applying them.

Full return type from `runMiddlewares`:

```ts
interface MiddlewareRunOutput {
	responseHandlers: ResponseHandler[];
	result: MiddlewareRunResult;
}
```

### Short-Circuit Behavior

When a middleware returns `middlewareRespond(response)`:

- Remaining middlewares in the chain do NOT execute
- Response handlers registered by middlewares that already ran DO apply
- Security headers applied by server handler

When a middleware returns `middlewareBypass(response)`:

- Remaining middlewares in the chain do NOT execute
- Response handlers do NOT apply (even ones registered by earlier middlewares)
- Security headers NOT applied

### Error Propagation

Errors thrown inside a middleware propagate to the caller of `runMiddlewares`. No internal catch. The server handler catches and maps errors to appropriate responses (error boundaries, 500, etc.).

Errors in response handlers propagate similarly. The server handler wraps response handler application in its own error handling.

## Test Cases

```
middlewareNext:
  Returns { type: "next" }
  Frozen object (no mutation)

middlewareRespond:
  Returns { type: "respond", response } with provided Response
  Frozen object

middlewareBypass:
  Returns { type: "bypass", response } with provided Response
  Frozen object

runMiddlewares (empty):
  Empty array -> { type: "next" }, responseHandlers = []

runMiddlewares (single middleware):
  Middleware calls next() -> { type: "next" }
  Middleware returns middlewareRespond(res) -> { type: "respond", response: res }
  Middleware returns middlewareBypass(res) -> { type: "bypass", response: res }

runMiddlewares (chain order):
  Three middlewares -> execute in array order [0], [1], [2]
  Each middleware receives same ctx object
  next() in [0] invokes [1], next() in [1] invokes [2]
  Innermost next() (after last middleware) returns { type: "next" }

runMiddlewares (short-circuit with respond):
  [0] returns middlewareRespond -> [1] and [2] never called
  Result is { type: "respond", response }

runMiddlewares (short-circuit with bypass):
  [0] returns middlewareBypass -> [1] and [2] never called
  Result is { type: "bypass", response }

runMiddlewares (mid-chain short-circuit):
  [0] calls next(), [1] returns middlewareRespond -> [2] never called
  [0] calls next(), [1] returns middlewareBypass -> [2] never called

runMiddlewares (onResponse collection):
  Middleware registers handler via ctx.onResponse -> handler in responseHandlers
  Multiple middlewares each register handler -> handlers in registration order
  Middleware registers two handlers -> both collected in order
  No onResponse calls -> responseHandlers = []

runMiddlewares (onResponse + respond):
  [0] registers handler, [1] returns middlewareRespond
  -> handler from [0] is in responseHandlers
  [0] registers handler, [0] returns middlewareRespond (no next())
  -> handler from [0] is in responseHandlers

runMiddlewares (onResponse + bypass):
  [0] registers handler, [1] returns middlewareBypass
  -> responseHandlers still collected but server handler skips them
  The bypass result signals server handler to ignore responseHandlers

runMiddlewares (error propagation):
  Middleware throws Error -> runMiddlewares rejects with same error
  Middleware throws RedirectResponse -> propagates as-is
  Middleware throws UnauthenticatedError -> propagates as-is
  Error in [1] -> [2] not called, error propagates to caller

ctx.onResponse:
  Handler receives Response, returns modified Response
  Handler can return Promise<Response>
  Handlers run in FIFO order (registration order across all middlewares)

ctx fields:
  ctx.env -> environment bindings (typed via TEnv generic)
  ctx.nonce -> same nonce from server context
  ctx.request -> original Request
  ctx.url -> parsed URL from request

MiddlewareContext identity:
  All middlewares in a chain receive the same ctx reference
  ctx is not cloned between middleware invocations
```

## Notes

- Middleware is server-only. No client-side middleware concept.
- `env` is `unknown` at the middleware level. Typed via `TEnv` generic at the app's server entry point.
- `ctx.url` is pre-parsed from `ctx.request.url`. Avoids redundant `new URL()` in each middleware.
- `ctx.nonce` matches the nonce from `runWithServerContext`. Used for CSP headers in response handlers.
- Response handlers are intentionally separated from `runMiddlewares` return. The server handler applies them after the route handler, not inside the middleware system. This keeps middleware and routing concerns decoupled.
- `middlewareBypass` exists for raw pass-through (health checks, webhook receivers, pre-signed URLs). Overusing it defeats security headers.
- Result objects should be frozen (`Object.freeze`) to prevent accidental mutation downstream.
- Middleware does not have access to route information. It runs before route matching. Use preloaders/authorize for route-aware logic.
- `onResponse` handlers can modify headers, transform body, add cookies, etc. They compose naturally since each receives the previous handler's output.
- Built-in middleware for common patterns (apiProxy, cdnProxy, htmlCache, i18n, staticAssets) in spec 36. App can also provide custom middlewares.
