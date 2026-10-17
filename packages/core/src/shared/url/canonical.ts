// Case is not folded here: the fold follows the matched route (B22, shared/router/fold.ts).
export type CanonicalOptions = {
	trailingSlash?: "preserve" | "never" | "always" | undefined
	basePath?: string | undefined
}

export type CanonicalPath = { path: string } | { hostile: true }

export function canonicalPath(path: string, options: CanonicalOptions = {}): CanonicalPath {
	if (isHostile(path)) return { hostile: true }
	const collapsed = collapse(path)
	if (typeof collapsed !== "string") return collapsed
	let next = collapsed
	if (options.trailingSlash === "never" && next.length > 1 && next.endsWith("/")) next = next.slice(0, -1)
	if (options.basePath !== undefined && next === options.basePath) return { path: "/" }
	if (options.trailingSlash === "always" && next !== "/" && !next.endsWith("/")) next = `${next}/`
	return { path: next }
}

function isHostile(path: string): boolean {
	if (hasControl(path)) return true
	if (path.includes("\\")) return true
	if (path.startsWith("//")) return true
	return path.toLowerCase().includes("%2f")
}

function hasControl(path: string): boolean {
	for (let index = 0; index < path.length; index++) {
		if (path.charCodeAt(index) < 0x20) return true
	}
	return false
}

function collapse(path: string): string | { hostile: true } {
	const trailing = path.endsWith("/") && path.length > 1
	const out: string[] = []
	for (const raw of path.split("/")) {
		if (raw === "") continue
		const segment = normalEscapes(raw)
		// An escaped dot segment is a traversal the URL parser did not resolve.
		if (segment !== raw && (segment === "." || segment === "..")) return { hostile: true }
		if (segment === "..") {
			out.pop()
			continue
		}
		out.push(segment)
	}
	const next = `/${out.join("/")}`
	return trailing ? `${next}/` : next
}

// RFC 3986 6.2.2: an escape of an unreserved character is that character, and every other escape's hex is uppercase,
// so `/docs/%72outing` is `/docs/routing` and redirects there like any other non-canonical path (plan 21 13.7).
function normalEscapes(segment: string): string {
	return segment.replace(/%[\dA-Fa-f]{2}/g, (escape) => {
		const char = String.fromCharCode(Number.parseInt(escape.slice(1), 16))
		return /^[\w.~-]$/.test(char) ? char : escape.toUpperCase()
	})
}
