import type { CustomHeadConfig, HeadConfig, ResponseHeaders } from "../route-builder/types.ts";
import { BUILDER_MARKER } from "../route-builder/types.ts";

// oxlint-disable-next-line typescript/no-explicit-any
export const EMPTY_OBJ = Object.freeze(Object.create(null)) as Record<string, any>;
// oxlint-disable-next-line typescript/no-explicit-any
export const EMPTY_ARR = Object.freeze([]) as readonly any[];

/**
 * Filter builder-method boundary fns: if user didn't call .errorRender(fn) etc,
 * the field is a builder method (accepts callback, returns PageResultRender).
 * Real render fns accept a single props arg (length <= 1).
 */
export const isRenderFn = (fn: unknown): fn is (...args: unknown[]) => unknown =>
	typeof fn === "function" && fn.length <= 1 && !(BUILDER_MARKER in fn);

export function concatArrays<T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
	if (a && b) return [...a, ...b];
	return b ?? a;
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/* scalar fields: child overrides parent */
const SCALAR_FIELDS = new Set(["canonical", "css", "description", "keywords", "title"]);

/* object fields: merge per-key, child wins */
const OBJECT_FIELDS = new Set(["favicons", "languages", "meta", "openGraph", "robots", "twitter"]);

/* array fields: concatenate */
const ARRAY_FIELDS = new Set(["images", "jsonLd"]);

function mergeCustom(parent: CustomHeadConfig | undefined, child: CustomHeadConfig | undefined): CustomHeadConfig {
	if (!parent && !child) return {};
	if (!parent) return { ...child };
	if (!child) return { ...parent };

	return {
		links: concatArrays(parent.links, child.links),
		meta: concatArrays(parent.meta, child.meta),
		scripts: concatArrays(parent.scripts, child.scripts),
		styles: concatArrays(parent.styles, child.styles),
	};
}

export function mergeHeadConfigs(parent: HeadConfig | undefined, child: HeadConfig | undefined): HeadConfig {
	if (!parent && !child) return {};
	if (!parent) return { ...child };
	if (!child) return { ...parent };

	const result: Record<string, unknown> = { ...parent };

	for (const key of Object.keys(child)) {
		if (UNSAFE_KEYS.has(key)) continue;
		const childVal = (child as Record<string, unknown>)[key];
		const parentVal = (parent as Record<string, unknown>)[key];

		if (key === "custom") {
			result.custom = mergeCustom(parentVal as CustomHeadConfig | undefined, childVal as CustomHeadConfig | undefined);
		} else if (SCALAR_FIELDS.has(key)) {
			result[key] = childVal;
		} else if (OBJECT_FIELDS.has(key)) {
			if (parentVal && childVal) {
				result[key] = {
					...(parentVal as Record<string, unknown>),
					...(childVal as Record<string, unknown>),
				};
			} else {
				result[key] = childVal ?? parentVal;
			}
		} else if (ARRAY_FIELDS.has(key)) {
			if (parentVal && childVal) {
				result[key] = [...(parentVal as unknown[]), ...(childVal as unknown[])];
			} else {
				result[key] = childVal ?? parentVal;
			}
		} else {
			result[key] = childVal;
		}
	}

	return result as HeadConfig;
}

export function mergeResponseHeaders(
	parent: ResponseHeaders | undefined,
	child: ResponseHeaders | undefined,
): ResponseHeaders {
	if (!parent && !child) return {};
	if (!parent) return { ...child };
	if (!child) return { ...parent };
	const result: ResponseHeaders = { ...parent };
	for (const key of Object.keys(child)) {
		const existing = result[key];
		const value = child[key];
		if (value === undefined) continue;
		if (existing !== undefined && key.toLowerCase() === "set-cookie") {
			const parentVals = Array.isArray(existing) ? existing : [existing];
			const childVals = Array.isArray(value) ? value : [value];
			result[key] = [...parentVals, ...childVals];
		} else {
			result[key] = value;
		}
	}
	return result;
}

export function applyResponseHeaders(target: Headers, source: ResponseHeaders): void {
	for (const [key, value] of Object.entries(source)) {
		if (Array.isArray(value)) {
			for (const v of value) target.append(key, v);
		} else {
			target.set(key, value);
		}
	}
}

const IMPORT_MAX_RETRIES = 2;
const IMPORT_RETRY_DELAY = 200;

export function isChunkLoadError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const msg = error.message;
	return (
		msg.includes("Failed to fetch dynamically imported module") ||
		msg.includes("error loading dynamically imported module") ||
		msg.includes("Importing a module script failed") ||
		msg.includes("Loading chunk") ||
		msg.includes("Loading CSS chunk")
	);
}

export async function retryImport<T>(fn: () => Promise<T>, retries = IMPORT_MAX_RETRIES): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (retries > 0 && isChunkLoadError(error)) {
			await new Promise((r) => setTimeout(r, IMPORT_RETRY_DELAY));
			return retryImport(fn, retries - 1);
		}
		throw error;
	}
}
