import type { CacheConfig, CdnCache } from "../../shared/route-builder/chain.ts";
import type { SegmentCache } from "../../shared/route-builder/segment.ts";
import type { EffectiveAuth } from "../auth/effective.ts";

// Each match's `cache`, root to page. The page is last.
export type CacheEntry = CacheConfig | SegmentCache | undefined;

export type DecideInput = { chain: readonly CacheEntry[]; auth: EffectiveAuth; session: boolean };

// `shared` may be stored. Its class says whether the CDN header may be public: only `public` may, because
// Flare sends no Vary and a CDN cannot tell a session from none (dx/cache.md "How the decision is made").
export type Decision = {
	policy: "shared" | "private" | "no-store";
	class?: "public" | "anonymous";
	cdn: CdnCache;
};

// The mode comes from the page alone. A required chain is never shared (B27), and a chain that reads is shared
// only for the anonymous answer.
export function decide(input: DecideInput): Decision {
	const cdn = mergeCdn(input.chain);
	if (cdn.private === true) return { policy: "private", cdn };
	if (!hasMode(input.chain.at(-1)) || input.auth.requires) return { policy: "no-store", cdn };
	if (input.auth.reads)
		return input.session ? { policy: "private", cdn } : { policy: "shared", class: "anonymous", cdn };
	return { policy: "shared", class: "public", cdn };
}

// Root to page, the nearer match wins per field, except `private`: once any match sets it, it stays.
export function mergeCdn(chain: readonly CacheEntry[]): CdnCache {
	let merged: CdnCache = {};
	for (const entry of chain) {
		const cdn = entry?.cdn;
		if (cdn === undefined) continue;
		const set = Object.fromEntries(Object.entries(cdn).filter(([, value]) => value !== undefined));
		merged = { ...merged, ...set, ...(merged.private === true ? { private: true } : {}) };
	}
	return merged;
}

function hasMode(page: CacheEntry): boolean {
	if (page === undefined) return false;
	return ["ssr", "isr", "ssg"].some((mode) => Reflect.get(page, mode) !== undefined);
}
