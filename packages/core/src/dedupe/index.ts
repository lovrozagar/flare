import { warn } from "../logger.ts";
import { getServerRequestContext } from "@lovrozagar/flare/server-context";

const DEDUPE_CACHE_KEY = "__flare_dedupe";
const FETCH_CACHE_KEY = "__flare_fetch_dedupe";

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

function getFetchCache(): Map<string, Promise<Response>> | undefined {
	try {
		const ctx = getServerRequestContext();
		let cache = ctx.get<Map<string, Promise<Response>>>(FETCH_CACHE_KEY);
		if (!cache) {
			cache = new Map();
			ctx.set(FETCH_CACHE_KEY, cache);
		}
		return cache;
	} catch {
		return undefined;
	}
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

const EXCLUDED_HEADERS = new Set(["traceparent", "tracestate", "x-request-id", "x-correlation-id"]);

function getFetchCacheKey(input: RequestInfo | URL, init?: RequestInit): string | undefined {
	let method = "GET";
	let url: string;

	if (input instanceof Request) {
		method = input.method.toUpperCase();
		url = input.url;
	} else if (input instanceof URL) {
		url = input.toString();
	} else {
		url = input;
	}

	if (init?.method) {
		method = init.method.toUpperCase();
	}

	if (method !== "GET" && method !== "HEAD") {
		return undefined;
	}

	let headersKey = "";
	const headers = init?.headers ?? (input instanceof Request ? input.headers : undefined);
	if (headers) {
		const entries: Array<[string, string]> = [];
		if (headers instanceof Headers) {
			headers.forEach((v, k) => {
				if (!EXCLUDED_HEADERS.has(k.toLowerCase())) {
					entries.push([k.toLowerCase(), v]);
				}
			});
		} else if (Array.isArray(headers)) {
			for (const [k, v] of headers) {
				if (!EXCLUDED_HEADERS.has(k.toLowerCase())) {
					entries.push([k.toLowerCase(), v]);
				}
			}
		} else {
			for (const k of Object.keys(headers)) {
				if (!EXCLUDED_HEADERS.has(k.toLowerCase())) {
					entries.push([k.toLowerCase(), headers[k] as string]);
				}
			}
		}
		entries.sort((a, b) => a[0].localeCompare(b[0]));
		headersKey = JSON.stringify(entries);
	}

	return `fetch:${method}:${url}:${headersKey}`;
}

let originalFetch: typeof globalThis.fetch | undefined;
let enableCount = 0;

function createDedupedFetch(baseFetch: typeof globalThis.fetch): typeof globalThis.fetch {
	return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const key = getFetchCacheKey(input, init);
		if (!key) return baseFetch(input, init);

		const cache = getFetchCache();
		if (!cache) return baseFetch(input, init);

		const existing = cache.get(key);
		if (existing) return (await existing).clone();

		const promise = baseFetch(input, init);
		cache.set(key, promise);
		/* Clean up cache on rejection so retries within same request can succeed */
		promise.catch((e: unknown) => {
			warn("dedupe", "fetch failed, clearing cache", e);
			cache.delete(key);
		});
		return (await promise).clone();
	};
}

/**
 * Reference-counted enable/disable to avoid race conditions
 * when concurrent requests share the same isolate.
 */
export function enableFetchDedupe(): void {
	enableCount++;
	if (enableCount === 1) {
		originalFetch = globalThis.fetch;
		globalThis.fetch = createDedupedFetch(originalFetch);
	}
}

export function disableFetchDedupe(): void {
	enableCount--;
	if (enableCount <= 0) {
		if (originalFetch) globalThis.fetch = originalFetch;
		originalFetch = undefined;
		enableCount = 0;
	}
}

export function isFetchDedupeEnabled(): boolean {
	return enableCount > 0;
}
