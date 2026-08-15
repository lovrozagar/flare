import type { RouteDefinition } from "@lovrozagar/flare/generators";

/**
 * Resolve a URL path pattern to a matching RouteDefinition.
 * Tries exact virtualPath match first, then URL pattern match.
 */
export function resolveRoute(urlPath: string, defs: RouteDefinition[]): RouteDefinition | null {
	/* Exact virtualPath match */
	const exact = defs.find((d) => d.virtualPath === urlPath);
	if (exact) return exact;

	/* Normalize: strip leading slash for comparison */
	const normalized = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath;

	/* Try matching against virtualPath without leading components before root */
	const byVirtual = defs.find((d) => {
		const parts = d.virtualPath.split("/");
		/* Find root segment (e.g. _root_) */
		const rootIdx = parts.findIndex((p) => p.startsWith("_") && p.endsWith("_") && p.length >= 3);
		if (rootIdx >= 0) {
			const afterRoot = parts.slice(rootIdx + 1).join("/");
			return afterRoot === normalized;
		}
		return d.virtualPath === normalized;
	});
	if (byVirtual) return byVirtual;

	/* Try URL pattern matching (strip group segments for comparison) */
	const urlNormalized = normalized.replace(/^\/|\/$/g, "");
	const byUrl = defs.find((d) => {
		const url = computeUrlPattern(d.virtualPath).replace(/^\/|\/$/g, "");
		return url === urlNormalized;
	});
	if (byUrl) return byUrl;

	/* Also try stripping group segments from the afterRoot match */
	const byAfterRootNoGroups = defs.find((d) => {
		const parts = d.virtualPath.split("/");
		const rootIdx = parts.findIndex((p) => p.startsWith("_") && p.endsWith("_") && p.length >= 3);
		if (rootIdx >= 0) {
			const afterRoot = parts
				.slice(rootIdx + 1)
				.filter((p) => !(p.startsWith("(") && p.endsWith(")")))
				.join("/");
			return afterRoot === normalized;
		}
		return false;
	});

	return byAfterRootNoGroups ?? null;
}

function computeUrlPattern(virtualPath: string): string {
	const parts = virtualPath.split("/");
	const rootIdx = parts.findIndex((p) => p.startsWith("_") && p.endsWith("_") && p.length >= 3);
	const urlParts: string[] = [];

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i] ?? "";
		if (i === rootIdx) continue;
		if (rootIdx >= 0 && i < rootIdx && !part.startsWith("[")) continue;
		if (part.startsWith("(") && part.endsWith(")")) continue;
		if (part === "") continue;
		urlParts.push(part);
	}

	const url = `/${urlParts.join("/")}`;
	return url === "" ? "/" : url;
}
