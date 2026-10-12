// B8: what a route module keeps in the client graph. `cache` keeps only its `client` field. An unknown chain method
// is a build error, so it has its own verdict.
export type RouteVerdict = "keep" | "remove" | "cache" | "unknown";

const VERDICTS: ReadonlyMap<string, RouteVerdict> = new Map<string, RouteVerdict>([
	["render", "keep"],
	["errorRender", "keep"],
	["notFoundRender", "keep"],
	["unauthenticatedRender", "keep"],
	["unauthorizedRender", "keep"],
	["intercept", "keep"],
	["effects", "keep"],
	["cache", "cache"],
	["loader", "remove"],
	["preloader", "remove"],
	["authenticate", "remove"],
	["authenticateOptional", "remove"],
	["authorize", "remove"],
	["headers", "remove"],
	["security", "remove"],
	["head", "remove"],
	["response", "remove"],
	["input", "remove"],
]);

export function routeMethod(name: string): RouteVerdict {
	return VERDICTS.get(name) ?? "unknown";
}

// `ssr`, `ssg`, `isr`, and `cdn` are server policy. Only `client` reaches the client graph.
export function cacheKeyKept(key: string): boolean {
	return key === "client";
}
