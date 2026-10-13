import type { INCOMPLETE, SharedRender } from "./scrub.ts";
import type { StoredPage } from "./write.ts";

// A shared render that finished, with the page it left, or nothing a waiter can serve from it.
export type Flight = { shared: SharedRender; page: StoredPage } | typeof INCOMPLETE | undefined;

// per-process-constant: in-flight renders
const flights = new Map<string, Promise<Flight>>();

// Concurrent misses and refreshes of one key share one shared render. The slot frees once it settles, a failure
// included, so the next request starts its own.
export function inflight(key: string, render: () => Promise<Flight>): Promise<Flight> {
	const current = flights.get(key);
	if (current !== undefined) return current;
	const started = render().finally(() => flights.delete(key));
	flights.set(key, started);
	return started;
}
