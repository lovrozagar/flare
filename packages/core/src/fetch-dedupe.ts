import { createDedupedFetch, DEFAULT_MAX_BYTES, type FetchFn } from "./dedupe/fetch.ts";

/** A fetch function, or anything with a `fetch` method such as a Workers service binding. */
export type FetchTarget = FetchFn | { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };

export interface FetchDedupeOptions {
	/** Largest body that is memoized for later callers. Larger bodies still stream. Default 1 MiB. */
	maxBytes?: number;
}

const scopes = new WeakMap<object, string>();
let scopeCounter = 0;

function scopeOf(target: object): string {
	let scope = scopes.get(target);
	if (!scope) {
		scopeCounter++;
		scope = `target:${scopeCounter}`;
		scopes.set(target, scope);
	}
	return scope;
}

/**
 * Request-scoped GET / HEAD dedupe for a fetch that is not `globalThis.fetch`, such as an SDK
 * over a service binding. Flare already dedupes `globalThis.fetch` during a request.
 *
 * Wrappers over the same target share one cache, so build the SDK per request and pass the
 * binding itself (`withFetchDedupe(env.API)`), not a new arrow around it. Bindings are called
 * as methods, so `this` stays intact.
 */
export function withFetchDedupe(target: FetchTarget, options?: FetchDedupeOptions): FetchFn {
	const call: FetchFn =
		typeof target === "function" ? (input, init) => target(input, init) : (input, init) => target.fetch(input, init);
	return createDedupedFetch(call, scopeOf(target), options?.maxBytes ?? DEFAULT_MAX_BYTES);
}
