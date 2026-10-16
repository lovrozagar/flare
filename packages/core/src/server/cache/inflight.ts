import type { INCOMPLETE, SharedRender } from "./scrub.ts"
import type { StoredPage } from "./write.ts"

// A shared render that finished, with the page it left; an entry another request wrote meanwhile, served as a hit;
// or nothing a waiter can serve from it.
export type Flight = { shared: SharedRender; page: StoredPage } | { stored: StoredPage } | typeof INCOMPLETE | undefined

// What a flight settles to: its result, and the store write it scheduled.
export type Landing = { flight: Flight; written: Promise<unknown> }

// per-process-constant: in-flight renders
const flights = new Map<string, Promise<Flight>>()

// How long a flight holds its slot and its joiners: v0's bound on a background render (plan 21 7.5).
const DEADLINE_MS = 30_000

// Concurrent misses and refreshes of one key share one shared render. The slot spans the render and its store write,
// so a request that arrives after the render but before the entry lands joins it instead of rendering again. The
// first request is not delayed by the write. A failed render or a failed write frees the slot, so the next request
// starts its own (dx/cache.md, BUGS.md B31, B33). A flight that has not landed after the deadline frees its slot too,
// and a request that joined it gets nothing to serve, so it renders on its own: a hung loader or store write never
// holds the page past it. The request that started the render keeps waiting on its own.
export function inflight(key: string, start: () => Promise<Landing>): Promise<Flight> {
	const current = flights.get(key)
	if (current !== undefined) return current
	const landing = start()
	const started = landing.then((landed) => landed.flight)
	const expired = Promise.withResolvers<undefined>()
	const timer = setTimeout(() => expired.resolve(undefined), DEADLINE_MS)
	const joined = Promise.race([started, expired.promise])
	// A joiner handles its own rejection; with none, a failed render is not an unhandled one.
	joined.catch(() => undefined)
	flights.set(key, joined)
	void Promise.race([landing.then((landed) => landed.written), expired.promise])
		.catch(() => undefined)
		.finally(() => {
			clearTimeout(timer)
			flights.delete(key)
		})
	return started
}
