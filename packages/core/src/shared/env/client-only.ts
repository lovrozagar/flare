// The client and worker graphs keep `fn`. The ssr rewrite drops it, so a call that still runs on the server throws
// and nothing of the body runs (dx/env.md).
export function createClientOnlyFn<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R
export function createClientOnlyFn<A extends unknown[], R>(fn?: (...args: A) => R): (...args: A) => R {
	return fn ?? missing
}

function missing(): never {
	throw new Error("A createClientOnlyFn function was called outside the client")
}
