import type { HeadConfig } from "../route-builder/types.ts";

export interface CachedMatch {
	data: unknown;
	error?: unknown;
	gcTime?: number;
	hasDeferred?: boolean;
	headConfig?: HeadConfig;
	invalid: boolean;
	matchId: string;
	preloaderContext?: Record<string, unknown>;
	tags?: string[];
	updatedAt: number;
}

export interface InvalidateOptions {
	broadcast?: boolean;
	filter?: (match: CachedMatch) => boolean;
	matchId?: string;
	routeId?: string;
	tags?: string[];
}

export interface MatchCache {
	clear(): void;
	delete(matchId: string): void;
	get(matchId: string): CachedMatch | undefined;
	getAll(): CachedMatch[];
	has(matchId: string): boolean;
	invalidate(options?: InvalidateOptions): void;
	isCached(matchId: string): boolean;
	isStale(matchId: string, staleTime: number): boolean;
	set(match: CachedMatch): void;
	size(): number;
}

export interface PrefetchCache {
	cleanup(maxAge: number): void;
	clear(): void;
	delete(url: string): void;
	get(url: string): number | undefined;
	has(url: string): boolean;
	isStale(url: string, staleTime: number): boolean;
	mark(url: string): void;
	set(url: string, fetchedAt: number): void;
	shouldPrefetch(url: string, staleTime: number): boolean;
	size(): number;
}

const DEFAULT_MAX_MATCH_ENTRIES = 500;
const DEFAULT_MAX_PREFETCH_ENTRIES = 1000;

export function createMatchCache(maxSize = DEFAULT_MAX_MATCH_ENTRIES): MatchCache {
	const store = new Map<string, CachedMatch>();

	return {
		clear() {
			store.clear();
		},

		delete(matchId: string) {
			store.delete(matchId);
		},

		get(matchId: string) {
			return store.get(matchId);
		},

		getAll() {
			return [...store.values()];
		},

		has(matchId: string) {
			return store.has(matchId);
		},

		invalidate(options?: InvalidateOptions) {
			if (!options) {
				for (const entry of store.values()) {
					entry.invalid = true;
				}
				return;
			}

			if (options.tags && options.tags.length > 0) {
				for (const entry of store.values()) {
					if (entry.tags?.some((t) => options.tags?.includes(t))) {
						entry.invalid = true;
					}
				}
				return;
			}

			if (options.matchId) {
				const entry = store.get(options.matchId);
				if (entry) {
					entry.invalid = true;
				}
				return;
			}

			if (options.routeId) {
				const prefix = `${options.routeId}:`;
				for (const entry of store.values()) {
					if (entry.matchId.startsWith(prefix)) {
						entry.invalid = true;
					}
				}
				return;
			}

			if (options.filter) {
				for (const entry of store.values()) {
					if (options.filter(entry)) {
						entry.invalid = true;
					}
				}
			}
		},

		isCached(matchId: string) {
			const entry = store.get(matchId);
			return !!entry && !entry.invalid;
		},

		isStale(matchId: string, staleTime: number) {
			const entry = store.get(matchId);
			if (!entry) return true;
			if (entry.invalid) return true;
			if (entry.hasDeferred) return true;
			if (staleTime <= 0 || Number.isNaN(staleTime)) return true;
			return Date.now() - entry.updatedAt > staleTime;
		},

		set(match: CachedMatch) {
			/* Delete before re-insert so Map moves key to end of iteration order (LRU) */
			if (store.has(match.matchId)) store.delete(match.matchId);
			store.set(match.matchId, match);
			if (store.size > maxSize) {
				const oldest = store.keys().next().value;
				if (oldest !== undefined) store.delete(oldest);
			}
		},

		size() {
			return store.size;
		},
	};
}

export function createPrefetchCache(maxSize = DEFAULT_MAX_PREFETCH_ENTRIES): PrefetchCache {
	const store = new Map<string, number>();

	return {
		cleanup(maxAge: number) {
			const now = Date.now();
			for (const [url, fetchedAt] of store) {
				if (now - fetchedAt > maxAge) {
					store.delete(url);
				}
			}
		},

		clear() {
			store.clear();
		},

		delete(url: string) {
			store.delete(url);
		},

		get(url: string) {
			return store.get(url);
		},

		has(url: string) {
			return store.has(url);
		},

		isStale(url: string, staleTime: number) {
			const fetchedAt = store.get(url);
			if (fetchedAt === undefined) return true;
			return Date.now() - fetchedAt > staleTime;
		},

		mark(url: string) {
			if (store.has(url)) store.delete(url);
			store.set(url, Date.now());
			if (store.size > maxSize) {
				const oldest = store.keys().next().value;
				if (oldest !== undefined) store.delete(oldest);
			}
		},

		set(url: string, fetchedAt: number) {
			if (store.has(url)) store.delete(url);
			store.set(url, fetchedAt);
			if (store.size > maxSize) {
				const oldest = store.keys().next().value;
				if (oldest !== undefined) store.delete(oldest);
			}
		},

		shouldPrefetch(url: string, staleTime: number) {
			const fetchedAt = store.get(url);
			if (fetchedAt === undefined) return true;
			return Date.now() - fetchedAt > staleTime;
		},

		size() {
			return store.size;
		},
	};
}

export interface CollectedDeferred {
	key: string;
	promise: Promise<unknown>;
}

/**
 * Walk hydrated data tree and collect deferred markers that have a promise.
 * After `hydrateLoaderData`, markers look like `{ __deferred: true, __key: string, promise: Promise }`.
 */
export function collectDeferredPromises(data: unknown, seen?: WeakSet<object>): CollectedDeferred[] {
	if (data === null || data === undefined || typeof data !== "object") return [];

	const tracking = seen ?? new WeakSet<object>();
	if (tracking.has(data as object)) return [];
	tracking.add(data as object);

	const obj = data as Record<string, unknown>;
	if (obj["__deferred"] === true && typeof obj["__key"] === "string" && obj["promise"] instanceof Promise) {
		return [{ key: obj["__key"] as string, promise: obj["promise"] as Promise<unknown> }];
	}

	if (Array.isArray(data)) {
		return data.flatMap((item) => collectDeferredPromises(item, tracking));
	}

	return Object.values(obj).flatMap((val) => collectDeferredPromises(val, tracking));
}

export interface DeferredTracker {
	clear(): void;
	prune(activeMatchIds: Set<string>): void;
	reject(matchId: string, key: string, error: Error, generation?: number): void;
	resolve(matchId: string, key: string, data: unknown, generation?: number): void;
	track(matchId: string, key: string, onAllResolved: (matchId: string) => void): number;
}

const PENDING = Symbol("pending");

const DEFERRED_TIMEOUT = 60_000;

interface TrackedKey {
	generation: number;
	value: unknown;
}

interface PendingDeferred {
	keys: Map<string, TrackedKey>;
	onAllResolved: (matchId: string) => void;
	rejected: boolean;
	trackedAt: number;
}

/**
 * Walk data tree and replace deferred markers with resolved values.
 * Markers: `{ __deferred: true, __key: string }` or `{ __deferred: true, __key: string, promise: ... }`
 */
function replaceDeferredMarkers(data: unknown, resolved: Map<string, unknown>): unknown {
	if (data === null || data === undefined || typeof data !== "object") return data;

	if (Array.isArray(data)) {
		return data.map((item) => replaceDeferredMarkers(item, resolved));
	}

	const obj = data as Record<string, unknown>;
	if (obj["__deferred"] === true && typeof obj["__key"] === "string") {
		const key = obj["__key"] as string;
		return resolved.has(key) ? resolved.get(key) : data;
	}

	const result: Record<string, unknown> = Object.create(null);
	for (const k of Object.keys(obj)) {
		if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
		result[k] = replaceDeferredMarkers(obj[k], resolved);
	}
	return result;
}

export function createDeferredTracker(matchCache: MatchCache): DeferredTracker {
	const pending = new Map<string, PendingDeferred>();
	let generationCounter = 0;

	return {
		clear() {
			pending.clear();
		},

		prune(activeMatchIds: Set<string>) {
			for (const id of pending.keys()) {
				if (!activeMatchIds.has(id)) pending.delete(id);
			}
		},

		reject(matchId: string, key: string, _error: Error, generation?: number) {
			const entry = pending.get(matchId);
			if (!entry) return;
			const tracked = entry.keys.get(key);
			if (!tracked) return;
			if (generation !== undefined && generation !== tracked.generation) return;
			entry.rejected = true;
			entry.keys.delete(key);
			if (entry.keys.size === 0) {
				pending.delete(matchId);
			}
		},

		resolve(matchId: string, key: string, data: unknown, generation?: number) {
			const entry = pending.get(matchId);
			if (!entry) return;
			const tracked = entry.keys.get(key);
			if (!tracked) return;
			if (generation !== undefined && generation !== tracked.generation) return;

			tracked.value = data;

			/* Check: all tracked keys have resolved values? */
			let allResolved = true;
			for (const t of entry.keys.values()) {
				if (t.value === PENDING) {
					allResolved = false;
					break;
				}
			}
			if (!allResolved) return;

			/* All resolved — update matchCache */
			const cached = matchCache.get(matchId);
			if (cached && !entry.rejected) {
				const resolved = new Map<string, unknown>();
				for (const [k, t] of entry.keys) {
					resolved.set(k, t.value);
				}
				cached.data = replaceDeferredMarkers(cached.data, resolved);
				cached.hasDeferred = false;
				cached.updatedAt = Date.now();
				matchCache.set(cached);
			}

			if (!entry.rejected) {
				entry.onAllResolved(matchId);
			}
			pending.delete(matchId);
		},

		track(matchId: string, key: string, onAllResolved: (matchId: string) => void) {
			const now = Date.now();
			const stale: string[] = [];
			for (const [id, e] of pending) {
				if (now - e.trackedAt > DEFERRED_TIMEOUT) stale.push(id);
			}
			for (const id of stale) pending.delete(id);
			generationCounter++;
			const existing = pending.get(matchId);
			if (existing) {
				existing.keys.set(key, { generation: generationCounter, value: PENDING });
				existing.onAllResolved = onAllResolved;
				existing.trackedAt = now;
			} else {
				const entry: PendingDeferred = {
					keys: new Map(),
					onAllResolved,
					rejected: false,
					trackedAt: now,
				};
				entry.keys.set(key, { generation: generationCounter, value: PENDING });
				pending.set(matchId, entry);
			}
			return generationCounter;
		},
	};
}
