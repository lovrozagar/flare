# Server Functions

Layer 2. Depends on server-context (05), errors (02).

Runtime system for type-safe server function definition and RPC execution. Build-time transform (ID injection, build secret) covered in plugins (spec 20). This spec covers the builder pattern, request handling, and client-side caller generation.

## Types

### ServerFnConfig

```ts
interface ServerFnConfig {
	method?: "get" | "post";
	name: string;
}
```

- `method` defaults to `"post"` when omitted
- `name` is user-provided, used in the RPC URL path for debuggability

### ServerFnBuilder

```ts
interface ServerFnBuilder<TAuth, TInput, TOutput> {
	authenticate(): ServerFnBuilder<Auth, TInput, TOutput>;
	authorize(
		fn: (ctx: { auth: TAuth; input: TInput }) => boolean | Promise<boolean>,
	): ServerFnBuilder<TAuth, TInput, TOutput>;
	handler(fn: (ctx: HandlerContext<TAuth, TInput>) => TOutput | Promise<TOutput>): ServerFn<TInput, TOutput>;
	input<T>(validator: Validator<T>): ServerFnBuilder<TAuth, T, TOutput>;
}
```

Immutable chain. Each method returns a new builder instance. Original builder unchanged.

### HandlerContext

```ts
interface HandlerContext<TAuth, TInput, TEnv = unknown> {
	auth: TAuth;
	env: TEnv;
	input: TInput;
	request: Request;
}
```

### ServerFn

```ts
type ServerFn<TInput, TOutput> = (input: TInput) => Promise<TOutput>;
```

Callable function returned by `.handler()`. On server, executes handler directly. On client, performs RPC fetch.

### ServerFnRegistration

```ts
interface ServerFnRegistration {
	authenticate: boolean;
	authorizeFn?: (ctx: { auth: unknown; input: unknown }) => boolean | Promise<boolean>;
	fn: (ctx: HandlerContext<unknown, unknown>) => unknown | Promise<unknown>;
	input?: Validator<unknown>;
	method: "get" | "post";
	name: string;
}
```

Internal representation stored in the server function registry. Used by `handleServerFnRequest`.

### Validator

```ts
type Validator<T> = { parse: (raw: unknown) => T } | ((raw: unknown) => T);
```

Accepts Zod schemas (`{ parse }`) or plain functions. Throwing from either signals validation failure.

### Auth

```ts
type Auth = NonNullable<Awaited<ReturnType<AuthenticateFn>>>;
```

Resolved auth type from the app's `authenticateFn`. When `.authenticate()` not called, `TAuth` is `null`.

## Exports

```ts
createServerFn(config: ServerFnConfig): ServerFnBuilder<null, void, unknown>

handleServerFnRequest(
  request: Request,
  env: unknown,
  fns: Map<string, ServerFnRegistration>,
  authenticateFn?: (env: unknown, request: Request) => unknown | Promise<unknown>,
): Promise<Response>
```

## Behavior

### `createServerFn`

Returns a `ServerFnBuilder` with `TAuth = null`, `TInput = void`, `TOutput = unknown`.

The `__id` field is injected by the build-time plugin (spec 20). At runtime, `createServerFn` reads `config.__id` to register the function in the global server function map.

#### Builder Chain

Each method returns a new builder. Methods can be called in any order before `.handler()`, but each method can only be called once per chain.

**`.authenticate()`** — marks the function as requiring authentication. Changes `TAuth` from `null` to `Auth`. When the function is invoked, `authenticateFn` runs first. If it returns `null`/`undefined`, throws `UnauthenticatedError` (401).

**`.input(validator)`** — sets input validation. Changes `TInput` to `T`. Raw input parsed through validator before reaching handler. If validation fails (throws), returns 400 with `ServerFnValidationError`.

**`.authorize(fn)`** — sets authorization check. Receives `{ auth, input }` (both already resolved). If `fn` returns `false`, throws `UnauthorizedError` (403). Runs after authentication and input validation.

**`.handler(fn)`** — terminal method. Receives `HandlerContext` with `{ auth, env, input, request }`. Returns a `ServerFn<TInput, TOutput>` — a callable async function.

#### Server vs Client Behavior

**Server**: `.handler()` registers the function in a global `Map<string, ServerFnRegistration>` keyed by `__id`. The returned `ServerFn` calls the handler directly (same-process invocation). `env` and `request` come from the current server context.

**Client**: `.handler()` returns an async function that serializes `input` and fetches `/_flare/server-fn/{__id}/{name}`. No handler code shipped to client — the build plugin tree-shakes it.

### `handleServerFnRequest`

Called by the server handler (spec 24) when pathname matches `/_flare/server-fn/*`.

#### URL Pattern

```
/_flare/server-fn/{id}/{name}
```

- `id` — the `__id` injected at build time (deterministic hash)
- `name` — the `name` from `ServerFnConfig`

Both segments required. URL parsing extracts them from pathname segments.

#### Request Handling Flow

```
1. Parse URL -> extract {id, name}
2. Look up `{id}` in fns Map
   |- not found -> 404 { message: "Server function not found" }
   |- found but name mismatch -> 404 { message: "Server function not found" }
3. Validate HTTP method
   |- request method doesn't match registration.method -> 405 { message: "Method not allowed" }
4. If authenticate === true:
   |- run authenticateFn(env, request)
   |- result is null/undefined -> 401 { message: "Unauthorized" }
   |- result is truthy -> auth = result
5. Parse input:
   |- POST -> JSON.parse(await request.text()) or undefined if empty body
   |- GET -> Object.fromEntries(new URL(request.url).searchParams) or undefined if no params
6. If input exists:
   |- run validator on raw input
   |- throws -> 400 { message: string } (validation error message)
7. If authorizeFn exists:
   |- run authorizeFn({ auth, input })
   |- returns false -> 403 { message: "Forbidden" }
8. Call fn({ auth, env, input, request })
9. Return Response:
   |- success -> 200 { data: result }
   |- result is undefined -> 200 { data: null }
```

#### Error Mapping

Errors thrown inside handler or middleware steps:

| Error                     | HTTP Status | Response Body                              |
| ------------------------- | ----------- | ------------------------------------------ |
| Input validation failure  | 400         | `{ message: string }`                      |
| `ServerFnValidationError` | 400         | `{ message: string }`                      |
| `UnauthenticatedError`    | 401         | `{ message: string }`                      |
| `UnauthorizedError`       | 403         | `{ message: string }`                      |
| Function not found        | 404         | `{ message: "Server function not found" }` |
| Method mismatch           | 405         | `{ message: "Method not allowed" }`        |
| Any other error           | 500         | `{ message: "Internal server error" }`     |

All error responses use `Content-Type: application/json`.

Production: 500 responses never expose error messages or stack traces. Always `"Internal server error"`.

#### Response Format

All responses use `Content-Type: application/json`.

Success: `{ data: TOutput }` with status 200.

Error: `{ message: string }` with appropriate status code.

### Client-Side Caller

When `createServerFn` runs on the client (browser), `.handler()` returns an async function that:

1. Determines URL: `/_flare/server-fn/{__id}/{name}`
2. For `"post"` method:
   - `fetch(url, { body: JSON.stringify(input), headers: { "Content-Type": "application/json" }, method: "POST" })`
3. For `"get"` method:
   - Serializes input as URL search params
   - `fetch(url + "?" + params, { method: "GET" })`
4. Reads response JSON
5. If `response.ok` -> returns `data` from `{ data }`
6. If `!response.ok`:
   - Status 400 -> throws `ServerFnValidationError` with parsed message
   - Status 401 -> throws `UnauthenticatedError` with parsed message
   - Status 403 -> throws `UnauthorizedError` with parsed message
   - Any other -> throws `Error` with parsed message

Client caller does not import handler code. Build plugin ensures handler body is server-only.

### Input Serialization

**POST**: input serialized as JSON request body. `Content-Type: application/json`.

**GET**: input serialized as URL search params. Only flat objects supported for GET (no nested objects/arrays). Values converted to strings via `String()`.

**void input**: no body (POST) or no search params (GET).

## Test Cases

```
createServerFn:
  Returns a builder object with authenticate, authorize, handler, input methods
  Config name preserved in registration
  Config method defaults to "post" when omitted
  Config method "get" preserved in registration

Builder immutability:
  .authenticate() returns new builder, original unchanged
  .input(validator) returns new builder, original unchanged
  .authorize(fn) returns new builder, original unchanged
  Each chain produces independent builder instances

Builder chain - authenticate:
  .authenticate().handler(fn) -> registration.authenticate === true
  No .authenticate() -> registration.authenticate === false
  .authenticate() changes TAuth from null to Auth type

Builder chain - input:
  .input(zodSchema).handler(fn) -> registration.input set
  .input(plainFn).handler(fn) -> registration.input set
  No .input() -> registration.input undefined
  .input() changes TInput type for handler context

Builder chain - authorize:
  .authorize(fn).handler(fn) -> registration.authorizeFn set
  No .authorize() -> registration.authorizeFn undefined

Builder chain - handler:
  .handler(fn) returns callable ServerFn
  ServerFn is async (returns Promise)
  Server-side: calls handler directly
  Client-side: returns fetch-based caller

Builder chain - ordering:
  .authenticate().input(v).authorize(fn).handler(fn) -> valid
  .input(v).authenticate().authorize(fn).handler(fn) -> valid
  .authorize(fn).authenticate().input(v).handler(fn) -> valid
  Order of authenticate/input/authorize does not affect execution order

handleServerFnRequest - URL parsing:
  /_flare/server-fn/abc123/myFn -> id = "abc123", name = "myFn"
  /_flare/server-fn/abc123 -> 404 (missing name)
  /_flare/server-fn/ -> 404 (missing id and name)

handleServerFnRequest - lookup:
  Known id, matching name -> proceeds to execution
  Known id, wrong name -> 404 { message: "Server function not found" }
  Unknown id -> 404 { message: "Server function not found" }
  Empty fns Map -> 404 for any request

handleServerFnRequest - method validation:
  Registration method "post", request GET -> 405 { message: "Method not allowed" }
  Registration method "get", request POST -> 405 { message: "Method not allowed" }
  Registration method "post", request POST -> proceeds
  Registration method "get", request GET -> proceeds

handleServerFnRequest - authentication:
  authenticate: true, authenticateFn returns user -> auth = user, proceeds
  authenticate: true, authenticateFn returns null -> 401 { message: "Unauthorized" }
  authenticate: true, authenticateFn returns undefined -> 401 { message: "Unauthorized" }
  authenticate: false -> auth = null, proceeds (no authenticateFn call)
  authenticate: true, no authenticateFn provided -> 401

handleServerFnRequest - input parsing (POST):
  POST with JSON body -> parsed as input
  POST with empty body -> input = undefined
  POST with invalid JSON -> 400

handleServerFnRequest - input parsing (GET):
  GET with search params -> Object.fromEntries as input
  GET with no search params -> input = undefined

handleServerFnRequest - input validation:
  input (Zod schema), valid input -> validated input passed to handler
  input (Zod schema), invalid input -> 400 { message: string }
  input (plain function), valid input -> returned value passed to handler
  input (plain function), throws -> 400 { message: string }
  No input -> raw input passed to handler

handleServerFnRequest - authorization:
  authorizeFn returns true -> proceeds to handler
  authorizeFn returns false -> 403 { message: "Forbidden" }
  authorizeFn returns Promise<true> -> proceeds
  authorizeFn returns Promise<false> -> 403
  No authorizeFn -> proceeds (no authorization check)

handleServerFnRequest - execution order:
  Full chain: authenticate -> parse input -> validate input -> authorize -> handler
  authenticate fails -> input not parsed, authorize not called, handler not called
  validation fails -> authorize not called, handler not called
  authorize fails -> handler not called

handleServerFnRequest - handler execution:
  Handler receives { auth, env, input, request }
  Handler returns value -> 200 { data: value }
  Handler returns undefined -> 200 { data: null }
  Handler returns object -> 200 { data: object }
  Handler returns array -> 200 { data: array }
  Handler returns null -> 200 { data: null }

handleServerFnRequest - error mapping:
  Handler throws ServerFnValidationError -> 400 { message: string }
  Handler throws UnauthenticatedError -> 401 { message: string }
  Handler throws UnauthorizedError -> 403 { message: string }
  Handler throws generic Error -> 500 { message: "Internal server error" }
  Handler throws string -> 500 { message: "Internal server error" }
  Handler throws RedirectResponse -> propagates (not caught by handleServerFnRequest)

handleServerFnRequest - response format:
  Content-Type: application/json on all responses
  Success body: { data: TOutput }
  Error body: { message: string }
  500 never exposes internal error details

Client-side caller:
  POST method -> fetch with JSON body
  GET method -> fetch with search params
  void input, POST -> fetch with no body
  void input, GET -> fetch with no search params
  Response ok -> returns data field
  Response 400 -> throws ServerFnValidationError
  Response 401 -> throws UnauthenticatedError
  Response 403 -> throws UnauthorizedError
  Response 500 -> throws Error
  GET input serialization -> flat object to search params
  Content-Type: application/json set on POST requests

Registration:
  .handler() registers in global Map keyed by __id
  Multiple createServerFn calls -> multiple entries in Map
  Duplicate __id -> last registration wins (build plugin prevents this)
```

## Notes

- `__id` is injected by the build-time plugin (spec 20), not user-provided. Users never see or set it.
- Build plugin computes `__id` from file hash + function name. Deterministic across builds of the same source.
- `/_flare/server-fn/` is a reserved URL prefix. Route tree must not contain routes starting with `_flare` (enforced by route generator, spec 19).
- RPC URL includes `name` for human-readable devtools/network panel inspection. `id` alone is sufficient for lookup, but `name` mismatch returns 404 to catch stale client code after deploys.
- GET method is for idempotent reads. Enables HTTP caching (CDN, browser cache). POST for mutations. Default is POST to prevent accidental caching of side-effectful calls.
- Input validation runs the validator's `parse` method (Zod) or calls the function directly. Both should throw on invalid input. Error message extracted from the thrown error.
- Authorization receives both `auth` and `input` — enables input-dependent access control (e.g., "can this user edit this resource?").
- Handler `env` comes from the server handler's `fetch(request, env)` args. Typed via app-level `TEnv` generic.
- Handler `request` is the original incoming `Request`. Useful for reading headers, cookies, etc.
- `undefined` handler results serialize as `{ data: null }` — JSON has no `undefined`.
- RedirectResponse thrown from handler propagates up to the server handler (spec 24), which converts it to an HTTP redirect. `handleServerFnRequest` does not catch it.
- No HMAC signing in v1 runtime. Build secret from spec 20 reserved for future CSRF protection.
- Server functions are server-only code. Client bundle only contains the fetch-based caller stub. Build plugin handles the split.
- Execution order is fixed regardless of builder chain order: authenticate -> parse input -> validate input -> authorize -> handler. Builder chain order only affects type narrowing.
