import { hasPrefix } from "../../shared/url/index.ts"
import type { MiddlewareFilter, MiddlewareKind } from "./types.ts"

// One filter engine (dx/server.md). Paths compare case-folded, and a prefix stops at a segment boundary, so
// `/api` takes `/api/x` and not `/apiv2`. There is no regular expression.
// A filter matches the pathname as sent or the route path, so a basePath or a locale prefix never walks around it
// (BUGS.md 159).
export function enters(
	filter: MiddlewareFilter,
	request: { path: string; routePath?: string; kind: MiddlewareKind },
): boolean {
	if (filter.kind !== undefined && !filter.kind.includes(request.kind)) return false
	const exact = filter.exact ?? []
	const prefix = filter.prefix ?? []
	if (exact.length === 0 && prefix.length === 0) return true
	return [request.path, request.routePath ?? request.path].some((raw) => {
		const path = raw.toLowerCase()
		return exact.some((item) => item.toLowerCase() === path) || prefix.some((item) => under(item.toLowerCase(), path))
	})
}

// The path a filter names: the pathname without the basePath, and without a configured locale as its first segment.
export function routePath(
	pathname: string,
	router: { basePath: string; locales?: readonly string[] | undefined },
): string {
	const base = router.basePath
	const local =
		base === "/" || !(pathname === base || hasPrefix(base, pathname, { caseSensitive: true }))
			? pathname
			: pathname.slice(base.length) || "/"
	const end = local.indexOf("/", 1)
	const first = end === -1 ? local.slice(1) : local.slice(1, end)
	const locale = router.locales?.some((tag) => tag.toLowerCase() === first.toLowerCase()) === true
	return locale ? local.slice(first.length + 1) || "/" : local
}

function under(prefix: string, path: string): boolean {
	return path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
}
