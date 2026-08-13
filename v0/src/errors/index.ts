/**
 * Flare Error Classes
 * Error types for routing, server functions, and navigation.
 */

class NotFoundError extends Error {
	readonly name = "NotFoundError" as const
	readonly pathname?: string

	constructor(message?: string, pathname?: string) {
		super(message ?? "Not found")
		this.pathname = pathname
	}
}

interface RedirectOptionsInternal {
	replace?: boolean
	status?: number
	to: string
}

interface RedirectOptionsExternal {
	href: string
	replace?: boolean
	status?: number
}

type RedirectOptions = RedirectOptionsExternal | RedirectOptionsInternal

class RedirectResponse extends Error {
	readonly name = "RedirectResponse" as const
	readonly url: string
	readonly external: boolean
	readonly status: number
	readonly replace: boolean

	constructor(options: RedirectOptions) {
		super("Redirect")
		if ("href" in options) {
			this.url = options.href
			this.external = true
		} else {
			this.url = options.to
			this.external = false
		}
		this.status = options.status ?? 302
		this.replace = options.replace ?? false
	}
}

class NavigationError extends Error {
	readonly name = "NavigationError" as const
}

interface ZodFlattenedError {
	fieldErrors: Record<string, string[]>
	formErrors: string[]
}

class ServerFnValidationError extends Error {
	readonly name = "ServerFnValidationError" as const
	readonly errors: ZodFlattenedError

	constructor(errors: ZodFlattenedError) {
		super("Validation failed")
		this.errors = errors
	}
}

class UnauthenticatedError extends Error {
	readonly name = "UnauthenticatedError" as const
	readonly status = 401 as const

	constructor(message?: string) {
		super(message ?? "Unauthorized")
	}
}

class ForbiddenError extends Error {
	readonly name = "ForbiddenError" as const
	readonly status = 403 as const

	constructor(message?: string) {
		super(message ?? "Forbidden")
	}
}

function notFound(message?: string): never {
	throw new NotFoundError(message)
}

function redirect(options: RedirectOptions): never {
	throw new RedirectResponse(options)
}

function unauthenticated(message?: string): never {
	throw new UnauthenticatedError(message)
}

function forbidden(message?: string): never {
	throw new ForbiddenError(message)
}

function isNotFoundError(error: unknown): error is NotFoundError {
	return error instanceof NotFoundError
}

function isRedirectResponse(error: unknown): error is RedirectResponse {
	return error instanceof RedirectResponse
}

function isNavigationError(error: unknown): error is NavigationError {
	return error instanceof NavigationError
}

function isUnauthenticatedError(error: unknown): error is UnauthenticatedError {
	return error instanceof UnauthenticatedError
}

function isForbiddenError(error: unknown): error is ForbiddenError {
	return error instanceof ForbiddenError
}

export type { RedirectOptions, RedirectOptionsExternal, RedirectOptionsInternal, ZodFlattenedError }

export {
	forbidden,
	ForbiddenError,
	isForbiddenError,
	isNavigationError,
	isNotFoundError,
	isRedirectResponse,
	isUnauthenticatedError,
	NavigationError,
	notFound,
	NotFoundError,
	redirect,
	RedirectResponse,
	ServerFnValidationError,
	unauthenticated,
	UnauthenticatedError,
}
