import type { EffectPlace, Effects } from "../../shared/route-builder/index.ts";

type Raw = Record<string, string | string[]>;

export type { Effects } from "../../shared/route-builder/index.ts";

// One match of a navigation target. `route` is the route id and `id` the match id (B31).
export type CachedMatch = {
	route: string;
	id: string;
	layout: boolean;
	params: Raw;
	search: Raw;
	effects?: Effects;
	cacheDeferred?: boolean;
};

export type CacheEntry = { data: unknown; deferred: boolean; deps?: string };

type Stored = CacheEntry & { at: number; touched: number };

export type Plan = {
	matches: readonly CachedMatch[];
	trigger: "initial" | "navigation" | "revalidation";
	revalidate: boolean;
	current: EffectPlace;
	next: EffectPlace;
};

export type MatchCache = {
	store: (match: CachedMatch, entry: CacheEntry) => void;
	evict: (match: CachedMatch) => void;
	read: (match: CachedMatch) => Stored | undefined;
	deps: (match: CachedMatch) => string | undefined;
	plan: (plan: Plan) => { fetch: boolean; stale: string[] };
};

// Only successful `l` payloads are stored. An `e` evicts. `staleTime` decides whether a held page may skip its
// loader. `gcTime` drops an entry nobody read. Past `max`, the least recently used entry goes.
export function createMatchCache(options: {
	staleTime: number;
	gcTime: number;
	max?: number;
	now?: () => number;
}): MatchCache {
	if (options.gcTime < 0) throw new Error("gcTime is at least 0 ms");
	const now = options.now ?? Date.now;
	const max = options.max ?? 100;
	const entries = new Map<string, Stored>();
	const read = (match: CachedMatch): Stored | undefined => {
		const key = keyOf(match);
		const entry = entries.get(key);
		if (entry === undefined) return undefined;
		entries.delete(key);
		if (now() - entry.touched > options.gcTime) return undefined;
		entries.set(key, { ...entry, touched: now() });
		return entry;
	};
	return {
		store(match, entry) {
			entries.delete(keyOf(match));
			entries.set(keyOf(match), { ...entry, at: now(), touched: now() });
			if (entries.size > max) entries.delete([...entries.keys()][0]);
		},
		evict: (match) => void entries.delete(keyOf(match)),
		read,
		deps,
		// A page the client holds fresh is listed in _flare_stale, so the server skips its loader (B30). A layout
		// never is. Hydrate fetches only when a page asks to refetch on "initial".
		plan(plan) {
			const asks = (match: CachedMatch): boolean =>
				match.effects?.shouldRefetch?.({
					trigger: plan.trigger,
					location: { current: plan.current, next: plan.next },
					params: match.params,
					search: match.search,
				}) === true;
			const held = (match: CachedMatch): boolean => {
				const entry = read(match);
				if (entry === undefined || plan.revalidate || now() - entry.at > options.staleTime) return false;
				return entry.deps === deps(match) && (!entry.deferred || match.cacheDeferred === true);
			};
			const pages = plan.matches.filter((match) => !match.layout);
			const stale = pages.filter((match) => held(match) && !asks(match)).map((match) => match.id);
			const fetch = plan.trigger !== "initial" || pages.some(asks);
			return { fetch, stale };
		},
	};
}

function keyOf(match: CachedMatch): string {
	return `${match.route}\n${match.id}`;
}

// loaderDeps values compared as JSON: a new array with the same values is the same deps.
function deps(match: CachedMatch): string | undefined {
	const loaderDeps = match.effects?.loaderDeps;
	return loaderDeps === undefined
		? undefined
		: JSON.stringify(loaderDeps({ search: match.search, params: match.params }));
}
