import { parseDuration } from "../duration/parse.ts";
import type { Router, RouterCache, RouterOptions } from "./create-router.ts";

// The URL and scroll behavior, each at its dx/router.md default when omitted.
export function behaviorOf(
	options: RouterOptions,
): Pick<
	Router,
	| "caseSensitive"
	| "trailingSlash"
	| "scrollRestoration"
	| "scrollRestorationBehavior"
	| "scrollRestorationMaxEntries"
	| "getScrollRestorationKey"
	| "routeCacheMaxEntries"
> {
	return {
		caseSensitive: options.caseSensitive ?? false,
		trailingSlash: options.trailingSlash ?? "preserve",
		scrollRestoration: options.scrollRestoration ?? true,
		scrollRestorationBehavior: options.scrollRestorationBehavior ?? "instant",
		scrollRestorationMaxEntries: counted("scrollRestorationMaxEntries", options.scrollRestorationMaxEntries ?? 50, 200),
		getScrollRestorationKey: options.getScrollRestorationKey,
		routeCacheMaxEntries: counted("routeCacheMaxEntries", options.routeCacheMaxEntries ?? 100, 500),
	};
}

// A count option is an integer from 1 to `max`. Anything else throws at the call (dx/router.md).
function counted(name: string, value: number, max: number): number {
	if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${name} is an integer from 1 to ${max}`);
	return value;
}

// The router's client cache with each omitted duration at its default (`0` and `"5m"`); `staleTime` is read as
// milliseconds.
export function clientCacheOf(client: RouterCache["client"]): Router["cache"]["client"] {
	if (client === false) return false;
	const staleTime = client?.staleTime === undefined ? 0 : parseDuration(client.staleTime);
	return { staleTime, gcTime: client?.gcTime ?? "5m" };
}
