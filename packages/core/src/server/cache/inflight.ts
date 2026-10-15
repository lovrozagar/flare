import type { INCOMPLETE, SharedRender } from "./scrub.ts"
import type { StoredPage } from "./write.ts"

// A shared render that finished, with the page it left; an entry another request wrote meanwhile, served as a hit;
// or nothing a waiter can serve from it.
export type Flight = { shared: SharedRender; page: StoredPage } | { stored: StoredPage } | typeof INCOMPLETE | undefined

// What a flight settles to: its result, and the store write it scheduled.
export type Landing = { flight: Flight; written: Promise<unknown> }

// per-process-constant: in-flight renders
const flights = new Map<string, Promise<Flight>>()

// Concurrent misses and refreshes of one key share one shared render. The slot spans the render and its store write,
// so a request that arrives after the render but before the entry lands joins it instead of rendering again. The
// first request is not delayed by the write. A failed render or a failed write frees the slot, so the next request
// starts its own (dx/cache.md, BUGS.md B31, B33).
export function inflight(key: string, start: () => Promise<Landing>): Promise<Flight> {
	const current = flights.get(key)
	if (current !== undefined) return current
	const landing = start()
	const started = landing.then((landed) => landed.flight)
	flights.set(key, started)
	void landing
		.then((landed) => landed.written)
		.catch(() => undefined)
		.finally(() => flights.delete(key))
	return started
}
