import { getServerRequestContext } from "@lovrozagar/flare/server-context";

const DEDUPE_CACHE_KEY = "__flare_dedupe";

let fnCounter = 0;

function getDedupeCache(): Map<string, Promise<unknown>> {
	const ctx = getServerRequestContext();
	let cache = ctx.get<Map<string, Promise<unknown>>>(DEDUPE_CACHE_KEY);
	if (!cache) {
		cache = new Map();
		ctx.set(DEDUPE_CACHE_KEY, cache);
	}
	return cache;
}

export function dedupe<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
	fnCounter = (fnCounter + 1) % Number.MAX_SAFE_INTEGER;
	const fnId = fnCounter;
	return (...args: TArgs): Promise<TResult> => {
		const cache = getDedupeCache();
		/* JSON.stringify maps both undefined and null to "null" — replacer preserves distinction */
		const key = `${fnId}:${JSON.stringify(args, (_, v) => (v === undefined ? "\x00" : v))}`;
		const existing = cache.get(key);
		if (existing) return existing as Promise<TResult>;
		const promise = fn(...args);
		cache.set(key, promise);
		return promise;
	};
}

export { disableFetchDedupe, enableFetchDedupe, isFetchDedupeEnabled } from "./fetch.ts";
