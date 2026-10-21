// The ssr graph keeps `fn`. The client and worker rewrites drop it, so a call that still runs there throws and
// nothing of the body runs. The throw is the backstop. The tripwire is the test (dx/env.md).
export function createServerOnlyFn<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R
export function createServerOnlyFn<A extends unknown[], R>(fn?: (...args: A) => R): (...args: A) => R {
	return fn ?? missing
}

// The runtime's own words, which only this module holds: a client chunk that still has them kept the runtime, so a
// call escaped the rewrite (vite/boundary/tripwire.ts, BUGS.md 461).
export const SERVER_ONLY_RUNTIME = "A createServerOnlyFn function was called outside the server"

function missing(): never {
	throw new Error(SERVER_ONLY_RUNTIME)
}
