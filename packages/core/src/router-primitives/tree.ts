import type { MatchResult, RouteData, TreeNode } from "./types.ts"

/** Constrains which decoded segment values are accepted when consuming an optional param. */
export interface LocaleMatch {
	paramName: string
	locales: readonly string[]
}

/** Builds a `LocaleMatch` from a `LocaleConfig`-shaped object. Absent cfg → greedy fallback. */
export function toLocaleMatch(
	cfg: { locales: readonly string[]; paramName?: string } | undefined,
): LocaleMatch | undefined {
	if (!cfg) return undefined
	return { locales: cfg.locales, paramName: cfg.paramName ?? "locale" }
}

function safeDecodeURIComponent(s: string): string | null {
	try {
		return decodeURIComponent(s)
	} catch {
		return null
	}
}

export function createTreeNode(paramName?: string): TreeNode {
	const node: TreeNode = { s: Object.create(null) }
	if (paramName !== undefined) {
		node.n = paramName
	}
	return node
}

function splitSegments(path: string): string[] {
	return path.split("/").filter((s) => s.length > 0)
}

export function insertRoute(tree: TreeNode, path: string, route: RouteData): void {
	const segments = splitSegments(path)
	let node = tree

	for (const segment of segments) {
		const optionalCatchAll = segment.match(/^\[\[\.\.\.(\w+)\]\]$/)
		if (optionalCatchAll) {
			if (!node.o) {
				node.o = createTreeNode(optionalCatchAll[1])
			}
			node = node.o
			continue
		}

		const optionalParam = segment.match(/^\[\[(\w+)\]\]$/)
		if (optionalParam) {
			if (!node.q) {
				node.q = createTreeNode(optionalParam[1])
			}
			node = node.q
			continue
		}

		const catchAll = segment.match(/^\[\.\.\.(\w+)\]$/)
		if (catchAll) {
			if (!node.c) {
				node.c = createTreeNode(catchAll[1])
			}
			node = node.c
			continue
		}

		const param = segment.match(/^\[(\w+)\]$/)
		if (param) {
			if (!node.p) {
				node.p = createTreeNode(param[1])
			}
			node = node.p
			continue
		}

		/* Store lowercase key for case-insensitive lookup (default).
		 * Generated patterns from filesystem are already lowercase by convention. */
		const key = segment.toLowerCase()
		let child = node.s[key]
		if (!child) {
			child = createTreeNode()
			node.s[key] = child
		}
		node = child
	}

	node.r = route
}

export function matchRoute(
	tree: TreeNode,
	pathname: string,
	caseSensitive?: boolean,
	localeMatch?: LocaleMatch,
): MatchResult | null {
	const segments = splitSegments(pathname)
	const params: Record<string, string | string[]> = {}
	const result = matchNode(tree, segments, 0, params, caseSensitive, localeMatch)
	if (result) {
		return { params, route: result }
	}
	return null
}

export function matchRoutePartial(
	tree: TreeNode,
	pathname: string,
	caseSensitive?: boolean,
	localeMatch?: LocaleMatch,
): MatchResult | null {
	const segments = splitSegments(pathname)
	for (let len = segments.length - 1; len >= 1; len--) {
		const prefix = `/${segments.slice(0, len).join("/")}`
		const result = matchRoute(tree, prefix, caseSensitive, localeMatch)
		if (result) return result
	}
	/* Skip "/" fallback when localeMatch is set and the first segment is neither a declared
	 * locale nor a static child — returning root for a cross-worker path like /docs/x/y
	 * would falsely imply ownership and hijack the navigation. */
	if (localeMatch && segments.length > 0) {
		const first = safeDecodeURIComponent(segments[0])
		const isValidLocale = first !== null && localeMatch.locales.includes(first)
		const staticKey = caseSensitive ? segments[0] : segments[0].toLowerCase()
		const hasStaticChild = staticKey in tree.s
		if (!isValidLocale && !hasStaticChild) return null
	}
	return matchRoute(tree, "/", caseSensitive, localeMatch)
}

function matchNode(
	node: TreeNode,
	segments: string[],
	index: number,
	params: Record<string, string | string[]>,
	caseSensitive?: boolean,
	localeMatch?: LocaleMatch,
): RouteData | null {
	if (index === segments.length) {
		if (node.r) {
			return node.r
		}
		/* optional single param skipped — try matching descendants directly */
		if (node.q) {
			const result = matchNode(node.q, segments, index, params, caseSensitive, localeMatch)
			if (result) return result
		}
		/* optional catch-all at terminal */
		if (node.o?.r && node.o.n) {
			params[node.o.n] = []
			return node.o.r
		}
		return null
	}

	const segment = segments[index]

	/* static — s is always null-prototype (createTreeNode / generated S helper) */
	const key = caseSensitive ? segment : segment.toLowerCase()
	const staticChild = node.s[key]
	if (staticChild) {
		const result = matchNode(staticChild, segments, index + 1, params, caseSensitive, localeMatch)
		if (result) return result
	}

	/* param */
	if (node.p) {
		const paramName = node.p.n
		if (paramName) {
			const decoded = safeDecodeURIComponent(segment)
			if (decoded === null) return null
			const hadKey = paramName in params
			const prevVal = params[paramName]
			params[paramName] = decoded
			const result = matchNode(node.p, segments, index + 1, params, caseSensitive, localeMatch)
			if (result) return result
			/* backtrack — restore only the single key we changed */
			if (hadKey) {
				params[paramName] = prevVal
			} else {
				delete params[paramName]
			}
		} else {
			const result = matchNode(node.p, segments, index + 1, params, caseSensitive, localeMatch)
			if (result) return result
		}
	}

	/* optional single param — try skipping first (static children win), then consuming */
	if (node.q) {
		/* skip — match descendants without consuming segment */
		const skipResult = matchNode(node.q, segments, index, params, caseSensitive, localeMatch)
		if (skipResult) return skipResult

		/* consume — use segment as param value */
		const paramName = node.q.n
		if (paramName) {
			const decoded = safeDecodeURIComponent(segment)
			/* locale allow-list: reject consume when segment is not a declared locale —
			 * prevents /[[locale]] from greedily matching cross-worker path segments like /docs */
			if (
				decoded !== null &&
				(!localeMatch ||
					paramName !== localeMatch.paramName ||
					localeMatch.locales.includes(decoded))
			) {
				const hadKey = paramName in params
				const prevVal = params[paramName]
				params[paramName] = decoded
				const result = matchNode(node.q, segments, index + 1, params, caseSensitive, localeMatch)
				if (result) return result
				if (hadKey) {
					params[paramName] = prevVal
				} else {
					delete params[paramName]
				}
			}
		}
	}

	/* catch-all */
	if (node.c?.r && node.c.n) {
		const decoded = segments.slice(index).map(safeDecodeURIComponent)
		if (decoded.some((d) => d === null)) return null
		params[node.c.n] = decoded as string[]
		return node.c.r
	}

	/* optional catch-all */
	if (node.o?.r && node.o.n) {
		const decoded = segments.slice(index).map(safeDecodeURIComponent)
		if (decoded.some((d) => d === null)) return null
		params[node.o.n] = decoded as string[]
		return node.o.r
	}

	return null
}
