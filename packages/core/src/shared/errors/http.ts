export class NotFoundError extends Error {
	readonly status: number = 404
	constructor() {
		super("Not found")
		this.name = "NotFoundError"
	}
}

export class UnauthenticatedError extends Error {
	readonly status: number = 401
	constructor() {
		super("Unauthenticated")
		this.name = "UnauthenticatedError"
	}
}

export class UnauthorizedError extends Error {
	readonly status: number = 403
	constructor() {
		super("Unauthorized")
		this.name = "UnauthorizedError"
	}
}

export function notFound(): never {
	throw new NotFoundError()
}

export function unauthenticated(): never {
	throw new UnauthenticatedError()
}

export function unauthorized(): never {
	throw new UnauthorizedError()
}
