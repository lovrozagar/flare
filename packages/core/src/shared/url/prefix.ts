export function hasPrefix(prefix: string, path: string, options?: { caseSensitive?: boolean }): boolean {
	const left = options?.caseSensitive === true ? prefix : prefix.toLowerCase()
	const right = options?.caseSensitive === true ? path : path.toLowerCase()
	return right.startsWith(`${left}/`)
}

// A route's path under the router's base: `/about` under `/app` is `/app/about`, and the index is the base itself
// (dx/router.md `basePath`).
export function underBase(base: string, path: string): string {
	if (base === "/") return path
	return `${base}${path === "/" ? "" : path}`
}
