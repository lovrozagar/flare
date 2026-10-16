export function hasPrefix(prefix: string, path: string, options?: { caseSensitive?: boolean }): boolean {
	const left = options?.caseSensitive === true ? prefix : prefix.toLowerCase()
	const right = options?.caseSensitive === true ? path : path.toLowerCase()
	return right.startsWith(`${left}/`)
}

// A route's URL as the router writes it: its path under the router's base, `/about` under `/app` being `/app/about` and
// the index the base itself, then the router's trailing-slash rule, so a link, a navigation, and a prerendered path are
// the canonical URL and never meet a 301. The search and the hash stay as they are (dx/router.md, BUGS.md 187, 188).
export function routeHref(
	router: { basePath: string; trailingSlash: "preserve" | "always" | "never" },
	url: string,
): string {
	const end = url.search(/[?#]/)
	const path = end === -1 ? url : url.slice(0, end)
	const rest = end === -1 ? "" : url.slice(end)
	const based = router.basePath === "/" ? path : `${router.basePath}${path === "/" ? "" : path}`
	const slashed = router.trailingSlash === "always" && based !== "/" && !based.endsWith("/") ? `${based}/` : based
	return `${slashed}${rest}`
}
