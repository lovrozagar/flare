// The ssr graph keeps `fn`. The client and worker rewrites drop it, so a call that still runs there throws and
// nothing of the body runs. The throw is the backstop. The tripwire is the test (dx/env.md).
export function createServerOnlyFn<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R
export function createServerOnlyFn<A extends unknown[], R>(fn?: (...args: A) => R): (...args: A) => R {
	return fn ?? missing
}

function missing(): never {
	throw new Error("A createServerOnlyFn function was called outside the server")
}
