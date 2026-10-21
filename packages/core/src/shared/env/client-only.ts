// The client and worker graphs keep `fn`. The ssr rewrite drops it, so a call that still runs on the server throws
// and nothing of the body runs (dx/env.md).
export function createClientOnlyFn<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R
export function createClientOnlyFn<A extends unknown[], R>(fn?: (...args: A) => R): (...args: A) => R {
	return fn ?? missing
}

// The runtime's own words, which only this module holds: a server chunk that still has them kept the runtime, so a
// call escaped the rewrite (vite/boundary/tripwire.ts, BUGS.md 461).
export const CLIENT_ONLY_RUNTIME = "A createClientOnlyFn function was called outside the client"

function missing(): never {
	throw new Error(CLIENT_ONLY_RUNTIME)
}
