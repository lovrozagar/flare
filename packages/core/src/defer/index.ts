import type { StaticDeferMode } from "../route-builder/types.ts";

export interface Deferred<T> {
	__deferred: true;
	error?: unknown;
	key: string;
	prerender?: StaticDeferMode;
	promise: Promise<T>;
}

export interface DeferContext {
	defer: DeferFn;
	entries: () => DeferredEntry[];
}

export type DeferFn = <T>(fn: () => Promise<T>, options?: { key?: string; prerender?: StaticDeferMode }) => Deferred<T>;

export interface DeferredEntry {
	key: string;
	matchId: string;
	prerender?: StaticDeferMode;
	promise: Promise<unknown>;
}

export interface DeferContextOptions {
	prefetch?: boolean;
}

export function createDeferContext(matchId: string, opts?: DeferContextOptions): DeferContext {
	const isPrefetch = opts?.prefetch ?? false;
	let counter = 0;
	const cache = new Map<string, Deferred<unknown>>();
	const entryList: DeferredEntry[] = [];

	const defer: DeferFn = <T>(
		fn: () => Promise<T>,
		options?: { key?: string; prerender?: StaticDeferMode },
	): Deferred<T> => {
		const key = options?.key ?? `d${counter++}`;
		const existing = cache.get(key);
		if (existing) return existing as Deferred<T>;

		if (isPrefetch) {
			const deferred: Deferred<T> = { __deferred: true, key, promise: new Promise<T>(() => {}) };
			cache.set(key, deferred as Deferred<unknown>);
			return deferred;
		}

		let promise: Promise<T>;
		try {
			promise = fn();
		} catch (e) {
			promise = Promise.reject(e);
		}
		const deferred: Deferred<T> = { __deferred: true, key, prerender: options?.prerender, promise };

		/* Prevent unhandled rejection for both sync throw and async reject paths.
		 * Error surfaces when consumer awaits the promise via Promise.allSettled.
		 * Also capture error on the deferred object for direct access. */
		promise.catch((e) => {
			deferred.error = e;
		});
		cache.set(key, deferred as Deferred<unknown>);
		entryList.push({ key, matchId, prerender: options?.prerender, promise });
		return deferred;
	};

	return {
		defer,
		entries: () => entryList,
	};
}

export function isDeferred(value: unknown): value is Deferred<unknown> {
	return (
		value !== null &&
		value !== undefined &&
		typeof value === "object" &&
		"__deferred" in value &&
		(value as Record<string, unknown>).__deferred === true
	);
}
