/**
 * Prefetch model: two independent settings per link.
 *   modules — the target route's JS and CSS (no server work)
 *   data    — the route's loaders (server work), which always brings its modules along
 * Each is a trigger. The router may also set `modules: "all"`: every route's code on idle.
 * Precedence per field: link > route > router > legacy router `cache.client.prefetch` > default.
 * Client-safe.
 */

export type PrefetchTrigger = false | "intent" | "render" | "viewport";

/** Link and route form: a string sets both fields; an object sets the fields it names. */
export type PrefetchConfig = PrefetchTrigger | { data?: PrefetchTrigger; modules?: PrefetchTrigger };

/** Router form: like links, plus `modules: "all"`. */
export type RouterPrefetchConfig = PrefetchTrigger | { data?: PrefetchTrigger; modules?: PrefetchTrigger | "all" };

export interface ResolvedPrefetch {
	data: PrefetchTrigger;
	modules: PrefetchTrigger | "all";
}

export const DEFAULT_PREFETCH: Readonly<ResolvedPrefetch> = Object.freeze({ data: false, modules: "all" });

type Layer = Partial<ResolvedPrefetch>;

function fromConfig(value: RouterPrefetchConfig | undefined): Layer {
	if (value === undefined) return {};
	if (typeof value !== "object") return { data: value, modules: value };
	const layer: Layer = {};
	if (value.data !== undefined) layer.data = value.data;
	if (value.modules !== undefined) layer.modules = value.modules;
	return layer;
}

/** `cache.client.prefetch` strings predate the split: viewport/render warmed modules only. */
function fromLegacy(value: PrefetchConfig | undefined): Layer {
	if (value === undefined || typeof value === "object") return fromConfig(value);
	return value === "intent" ? { data: "intent", modules: "intent" } : { data: false, modules: value };
}

export function resolvePrefetch(layers: {
	link?: PrefetchConfig;
	/** The target route's `cache.client.prefetch` (legacy string meaning). */
	route?: PrefetchConfig;
	router?: RouterPrefetchConfig;
	/** The router's `cache.client.prefetch` (deprecated; legacy string meaning). */
	routerLegacy?: PrefetchConfig;
}): ResolvedPrefetch {
	return {
		...DEFAULT_PREFETCH,
		...fromLegacy(layers.routerLegacy),
		...fromConfig(layers.router),
		...fromLegacy(layers.route),
		...fromConfig(layers.link),
	};
}
