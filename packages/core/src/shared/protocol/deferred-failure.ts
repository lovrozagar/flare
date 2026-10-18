// A deferred value that rejected, as the document carries it. Solid leaves a `<Loading>` region whose read rejected
// for the client to render again, and a document's deferred value has no promise on the client, so the server hands
// the render the projected error as a value instead: Solid writes it in its hydration data like any resolved value,
// and `useDeferred` throws it on both sides, into the nearest `<Errored>` (dx/defer.md, BUGS.md 374).
export type DeferredFailure = {
	readonly __deferredFailure: true
	readonly error: { name: string; message: string; stack?: string | undefined; digest?: string | undefined }
}

export function deferredFailure(error: DeferredFailure["error"]): DeferredFailure {
	return { __deferredFailure: true, error }
}

export function isDeferredFailure(value: unknown): value is DeferredFailure {
	return typeof value === "object" && value !== null && Reflect.get(value, "__deferredFailure") === true
}

const REBUILT = Symbol.for("flare.deferredFailure")

// The error the failure stands for, as a data answer's `e` frame gives it: the projected name and message, and the
// stack only where the server kept one (dev). It is marked, so the server's render, which already logged the rejection
// it projected, does not log it again when Solid reports the read that threw it.
export function failureError(failure: DeferredFailure): Error {
	const error = new Error(failure.error.message)
	error.name = failure.error.name
	error.stack = failure.error.stack ?? ""
	Reflect.set(error, REBUILT, true)
	return error
}

export function isFailureError(error: unknown): boolean {
	return error instanceof Error && Reflect.get(error, REBUILT) === true
}
