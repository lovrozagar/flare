# Errors

Layer 0. Error classes + helper functions. No deps.

## Error Classes

All classes use `readonly name = "..." as const` for reliable discrimination.

```ts
class NotFoundError extends Error {
	readonly name = "NotFoundError" as const
	readonly status = 404 as const
	readonly pathname?: string
	constructor(message?: string, pathname?: string)
	/* message defaults to "Not found" */
}

class UnauthenticatedError extends Error {
	readonly name = "UnauthenticatedError" as const
	readonly status = 401 as const
	constructor(message?: string)
	/* message defaults to "Unauthorized" */
}

class UnauthorizedError extends Error {
	readonly name = "UnauthorizedError" as const
	readonly status = 403 as const
	constructor(message?: string)
	/* message defaults to "Forbidden" */
}

class RedirectResponse extends Error {
	readonly name = "RedirectResponse" as const
	readonly url: string
	readonly external: boolean
	readonly status: number
	readonly replace: boolean
	constructor(options: RedirectOptions)
	/* status defaults to 302, replace defaults to false */
}

class NavigationError extends Error {
	readonly name = "NavigationError" as const
	/* marker class for client-side nav failures, no extra props */
}

class ServerFnValidationError extends Error {
	readonly name = "ServerFnValidationError" as const
	readonly errors: z.typeToFlattenedError<unknown>
	constructor(errors: z.typeToFlattenedError<unknown>)
}
```

### RedirectOptions

Discriminated union — `to` (internal) vs `href` (external):

```ts
type RedirectOptions =
	| { to: string; replace?: boolean; status?: number }
	| { href: string; replace?: boolean; status?: number }
```

- `to` → internal redirect (client-side nav on CSR), `external = false`
- `href` → external redirect (full page redirect), `external = true`
- `url` property resolves to whichever was provided

## Helper Functions

All throw (return `never`):

```ts
notFound(message?: string): never              /* throws NotFoundError */
unauthenticated(message?: string): never       /* throws UnauthenticatedError */
unauthorized(message?: string): never            /* throws UnauthorizedError */
redirect(options: RedirectOptions): never       /* throws RedirectResponse */
```

## Type Guards

All use `instanceof`:

```ts
isNotFoundError(e: unknown): e is NotFoundError
isUnauthenticatedError(e: unknown): e is UnauthenticatedError
isUnauthorizedError(e: unknown): e is UnauthorizedError
isRedirectResponse(e: unknown): e is RedirectResponse
isNavigationError(e: unknown): e is NavigationError
isServerFnValidationError(e: unknown): e is ServerFnValidationError
```

## Test Cases

### Helper functions

```
notFound() throws NotFoundError with message "Not found", status 404
notFound("custom") includes message "custom", status 404
unauthenticated() throws with status 401, message "Unauthorized"
unauthenticated("session expired") includes custom message
unauthorized() throws with status 403, message "Forbidden"
unauthorized("no access") includes custom message
redirect({ to: "/login" }) throws RedirectResponse with url="/login", status=302, external=false, replace=false
redirect({ to: "/login", status: 301 }) uses provided status
redirect({ to: "/login", replace: true }) replace=true
redirect({ href: "https://example.com" }) external=true, url="https://example.com"
redirect({ href: "https://example.com", status: 307 }) external=true, status=307
```

### Error instances

```
NotFoundError instanceof Error → true
NotFoundError.name === "NotFoundError"
NotFoundError("msg", "/path").pathname === "/path"
NotFoundError().pathname === undefined

UnauthenticatedError instanceof Error → true
UnauthenticatedError.status === 401

UnauthorizedError instanceof Error → true
UnauthorizedError.status === 403

RedirectResponse instanceof Error → true
RedirectResponse({ to: "/x" }).external === false
RedirectResponse({ href: "https://x" }).external === true
RedirectResponse({ to: "/x" }).replace === false
RedirectResponse({ to: "/x" }).status === 302

NavigationError instanceof Error → true
NavigationError.name === "NavigationError"

ServerFnValidationError instanceof Error → true
ServerFnValidationError({ fieldErrors: { email: ["required"] }, formErrors: [] }).errors.fieldErrors.email → ["required"]

Stack trace preserved on all Error subclasses
```

### Type guards

```
isNotFoundError(new NotFoundError()) → true
isNotFoundError(new Error()) → false
isNotFoundError(null) → false
isNotFoundError(undefined) → false
isNotFoundError({ name: "NotFoundError" }) → false (not instanceof)

isRedirectResponse(new RedirectResponse({ to: "/x" })) → true
isRedirectResponse(new Error()) → false

isNavigationError(new NavigationError()) → true
isServerFnValidationError(new ServerFnValidationError({ fieldErrors: {}, formErrors: [] })) → true
```

## Boundary Mapping

| Error                     | Boundary type             | HTTP status |
| ------------------------- | ------------------------- | ----------- |
| `NotFoundError`           | `notFound`                | 404         |
| `UnauthenticatedError`    | `unauthorized`            | 401         |
| `UnauthorizedError`       | `unauthorized`            | 403         |
| `RedirectResponse`        | redirect (not a boundary) | 301-308     |
| `ServerFnValidationError` | N/A (server fn response)  | 400         |
| any other `Error`         | `error`                   | 500         |

## Server Function Error Handling

Server functions catch errors and map to HTTP responses:

| Error type                | HTTP status | Response body         |
| ------------------------- | ----------- | --------------------- |
| `ServerFnValidationError` | 400         | `{ message: string }` |
| `UnauthenticatedError`    | 401         | `{ message: string }` |
| `UnauthorizedError`       | 403         | `{ message: string }` |
| any other                 | 500         | `{ message: string }` |

## NDJSON Error Format

Cross-reference to spec 09 (ndjson-server). Errors streamed via NDJSON use this message shape:

```ts
type ErrorMessage = {
	e: { message: string }
	k?: string /* deferred key (for chunk errors) */
	m: string /* matchId */
	t: "e"
}
```

Only `message` sent — no stack traces to client (security/perf).

## NDJSON Redirect Format

Cross-reference to spec 09 (ndjson-server).

```ts
type RedirectMessage = {
	r?: boolean /* replace flag */
	s: number /* status */
	t: "x"
	u: string /* URL */
}
```

## Notes

- `RedirectResponse` extends Error for try/catch ergonomics, but semantically it's a control flow signal
- `RedirectResponse` does NOT validate `status` range at runtime — callers expected to use 3xx codes
- `external` flag determines behavior: internal → client-side nav, external → full page redirect
- `UnauthenticatedError` (401) and `UnauthorizedError` (403) both map to `unauthorized` boundary — boundary can distinguish via `instanceof` check on the `error` prop
- `ServerFnValidationError` carries Zod flatten output — designed for form validation feedback
- `NavigationError` is a marker class — used to identify nav-related failures vs other errors
- Keep minimal — no logging, no formatting, just typed throw/catch
- `NotFoundError.pathname` useful for logging which path triggered 404
