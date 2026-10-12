import type { MiddlewareFilter, MiddlewareKind } from "./types.ts";

// One filter engine (dx/server.md). Paths compare case-folded, and a prefix stops at a segment boundary, so
// `/api` takes `/api/x` and not `/apiv2`. There is no regular expression.
export function enters(filter: MiddlewareFilter, request: { path: string; kind: MiddlewareKind }): boolean {
	if (filter.kind !== undefined && !filter.kind.includes(request.kind)) return false;
	const exact = filter.exact ?? [];
	const prefix = filter.prefix ?? [];
	if (exact.length === 0 && prefix.length === 0) return true;
	const path = request.path.toLowerCase();
	return exact.some((item) => item.toLowerCase() === path) || prefix.some((item) => under(item.toLowerCase(), path));
}

function under(prefix: string, path: string): boolean {
	return path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}
