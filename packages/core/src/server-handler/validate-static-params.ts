import type { ResolvedRoute } from "../loader-pipeline/index.ts";
import type { CacheConfig } from "../route-builder/types.ts";

type ParamsFn = (ctx: { params: Record<string, string | string[]> }) => unknown;

/**
 * Extract params fn from a route's cache config.
 * Handles: `ssg: fn`, `ssg: { params: fn }`, `isr: { params: fn }`
 */
export function extractParamsFn(cache: CacheConfig | undefined): ParamsFn | undefined {
	if (!cache) return undefined;

	const ssg = cache.ssg;
	if (typeof ssg === "function") return ssg as ParamsFn;
	if (ssg && typeof ssg === "object") {
		const params = (ssg as Record<string, unknown>).params;
		if (typeof params === "function") return params as ParamsFn;
	}

	const isr = cache.isr;
	if (isr && typeof isr === "object") {
		const params = (isr as Record<string, unknown>).params;
		if (typeof params === "function") return params as ParamsFn;
	}

	return undefined;
}

/**
 * Determine whether a cache config requires strict param validation.
 * - ssg with params fn → always validate
 * - isr with params fn + dynamicParams: false → validate
 * - everything else → skip
 */
function shouldValidateParams(cache: CacheConfig | undefined): boolean {
	if (!cache) return false;

	const ssg = cache.ssg;
	if (typeof ssg === "function") return true;
	if (ssg && typeof ssg === "object" && "params" in ssg) return true;

	const isr = cache.isr;
	if (isr && typeof isr === "object" && "params" in isr) {
		const dynamicParams = (isr as Record<string, unknown>).dynamicParams ?? true;
		return dynamicParams === false;
	}

	return false;
}

/*
 * Production cache: caches params fn results per virtualPath+matchParams.
 * Skipped in dev mode so route file edits take effect without restart —
 * layout modules are loaded via dynamic imports that Vite invalidates on
 * file change, but this module's state persists across those invalidations.
 *
 * Bounded to MAX_PARAMS_CACHE_SIZE with FIFO eviction to prevent unbounded
 * memory growth in production with many unique URL param combinations.
 */
const MAX_PARAMS_CACHE_SIZE = 500;
const paramsCache = new Map<string, Record<string, string | string[]>[]>();

export function clearParamsCache(): void {
	paramsCache.clear();
}

/**
 * Validate that the matched URL params are within the allowed set
 * defined by SSG/ISR params functions in the route chain.
 *
 * Returns `false` if any route in the chain rejects the params.
 *
 * In dev mode, params fn results are NOT cached so edits to route files
 * (e.g. changing params lists) take effect immediately without restart.
 */
export async function validateStaticParams(
	resolvedRoutes: ResolvedRoute[],
	matchParams: Record<string, string | string[]>,
	isDev?: boolean,
): Promise<boolean> {
	for (const route of resolvedRoutes) {
		if (!shouldValidateParams(route.cache)) continue;

		const paramsFn = extractParamsFn(route.cache);
		if (!paramsFn) continue;

		/* Cache key includes matchParams because params fns can depend on parent
		 * params (e.g. repoSegment reads ctx.params.org to filter repos). */
		const cacheKey = `${route.virtualPath}:${JSON.stringify(matchParams, Object.keys(matchParams).sort())}`;
		let allowedList = isDev ? undefined : paramsCache.get(cacheKey);
		if (!allowedList) {
			const produced = await paramsFn({ params: matchParams });
			allowedList = Array.isArray(produced) ? (produced as Record<string, string | string[]>[]) : [];
			if (!isDev) {
				if (paramsCache.size >= MAX_PARAMS_CACHE_SIZE) {
					const oldest = paramsCache.keys().next().value;
					if (oldest !== undefined) paramsCache.delete(oldest);
				}
				paramsCache.set(cacheKey, allowedList);
			}
		}

		if (allowedList.length === 0) return false;

		/* Extract which param keys this level defines */
		const paramKeys = Object.keys(allowedList[0] ?? {});
		if (paramKeys.length === 0) continue;

		/* Check if matchParams values exist in the allowed list */
		const matched = allowedList.some((allowed) =>
			paramKeys.every((key) => {
				const matchVal = matchParams[key];
				const allowedVal = allowed[key];
				/* Optional param [[x]] skipped — not in matchParams → skip validation */
				if (matchVal === undefined) return true;
				if (allowedVal === undefined) return false;
				if (Array.isArray(matchVal) && Array.isArray(allowedVal)) {
					if (matchVal.length !== allowedVal.length) return false;
					return matchVal.every((v, i) => v === allowedVal[i]);
				}
				if (Array.isArray(matchVal) || Array.isArray(allowedVal)) return false;
				return String(matchVal) === String(allowedVal);
			}),
		);

		if (!matched) return false;
	}

	return true;
}
