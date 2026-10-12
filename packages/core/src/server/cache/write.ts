import { parseDuration } from "../../shared/duration/index.ts";
import type { CacheConfig } from "../../shared/route-builder/chain.ts";

// How long a stored entry lives, and when it turns stale, in milliseconds.
export type StoreTiming = { ttl: number; stale: number };

// The ISR ceiling: on demand, an omitted `revalidate`, and the cap on `revalidate * 2` (B47).
const DAY = 24 * 60 * 60 * 1000;

// The mutable store's timing for a page, checked when the server loads the chain, before any render. A bad config
// is a bug that names the route. The check lives here, not in the chain, so createPage carries no bytes for it.
// `ssg` and a page with no mode have none: ssg reads the static seeds.
export function storeTiming(route: string, cache: CacheConfig | undefined): StoreTiming | undefined {
	if (cache?.ssr !== undefined) {
		if (cache.ssr.ttl === undefined) throw new Error(`${route}: cache.ssr needs a ttl`);
		const ttl = parseDuration(cache.ssr.ttl);
		const stale = parseDuration(cache.ssr.staleTime ?? "0s");
		if (stale > ttl) throw new Error(`${route}: cache.ssr.staleTime is longer than its ttl`);
		return { ttl, stale };
	}
	if (cache?.isr === undefined) return undefined;
	const revalidate = cache.isr === true ? undefined : cache.isr.revalidate;
	// Nothing turns stale before an on-demand entry expires: the 24h ttl is a real miss.
	if (revalidate === undefined) return { ttl: DAY, stale: DAY };
	const ttl = Math.min(parseDuration(revalidate) * 2, DAY);
	return { ttl, stale: Math.min(parseDuration(revalidate), ttl) };
}
