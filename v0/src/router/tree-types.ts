/**
 * Flare Radix Tree Types
 *
 * O(depth) route matching using radix tree structure.
 * Compact format for minimal bundle size.
 *
 * FlareRouteData (D): e=exportName o=options p=page v=variablePath x=virtualPath
 * FlareTreeNode (N): s=static p=param c=catchAll o=optionalCatchAll r=route n=paramName
 */

import type { RouteMeta } from "./types"

/**
 * Route data stored at terminal tree nodes
 *
 * Short names for bundle size:
 * - e: exportName (debug/dev)
 * - o: options (route meta)
 * - p: page loader
 * - v: variablePath - URL with placeholders (e.g., "/products/[id]")
 * - x: virtualPath - full path with virtual segments (e.g., "_root_/(auth)/login")
 */
export type FlareRouteData = {
	e: string
	o: RouteMeta
	p: () => Promise<{ default: unknown }>
	v: string
	x: string
}

/**
 * Radix tree node for route matching
 *
 * Short names for bundle size:
 * - s: static children (Map)
 * - p: param node ([id])
 * - c: catchAll node ([...slug])
 * - o: optionalCatchAll node ([[...slug]])
 * - r: route data
 * - n: paramName
 *
 * Priority order during matching:
 * 1. s - static (Map lookup O(1))
 * 2. p - param ([id] - single segment)
 * 3. c - catchAll ([...slug] - rest of path)
 * 4. o - optionalCatchAll ([[...slug]] - optional rest)
 */
export type FlareTreeNode = {
	s: Map<string, FlareTreeNode>
	p?: FlareTreeNode
	c?: FlareTreeNode
	o?: FlareTreeNode
	r?: FlareRouteData
	n?: string
}

/**
 * Result of route matching with extracted params
 */
export type MatchResult = {
	route: FlareRouteData
	params: Record<string, string | string[]>
}

/**
 * Create empty tree node
 */
export function createTreeNode(paramName?: string): FlareTreeNode {
	return paramName ? { n: paramName, s: new Map() } : { s: new Map() }
}

/**
 * Parse path into segments
 */
function parseSegments(path: string): string[] {
	const cleaned = path.replace(/^\/+|\/+$/g, "")
	return cleaned ? cleaned.split("/") : []
}

/**
 * Recursive match with backtracking
 */
function matchRecursive(
	node: FlareTreeNode,
	segments: string[],
	index: number,
	params: Record<string, string | string[]>,
): MatchResult | null {
	if (index >= segments.length) {
		if (node.r) {
			return { params: { ...params }, route: node.r }
		}
		if (node.o?.r) {
			const result = { ...params }
			if (node.o.n) {
				result[node.o.n] = []
			}
			return { params: result, route: node.o.r }
		}
		return null
	}

	const segment = segments[index]
	if (segment === undefined) return null

	/* 1. Static match (O(1)) */
	const lowerSegment = segment.toLowerCase()
	const staticChild = node.s.get(lowerSegment)
	if (staticChild) {
		const result = matchRecursive(staticChild, segments, index + 1, params)
		if (result) return result
	}

	/* 2. Dynamic param [id] */
	if (node.p) {
		const paramParams = { ...params }
		if (node.p.n) {
			paramParams[node.p.n] = segment
		}
		const result = matchRecursive(node.p, segments, index + 1, paramParams)
		if (result) return result
	}

	/* 3. Catch-all [...slug] */
	if (node.c?.r) {
		const restSegments = segments.slice(index)
		const result = { ...params }
		if (node.c.n) {
			result[node.c.n] = restSegments
		}
		return { params: result, route: node.c.r }
	}

	/* 4. Optional catch-all [[...slug]] */
	if (node.o?.r) {
		const restSegments = segments.slice(index)
		const result = { ...params }
		if (node.o.n) {
			result[node.o.n] = restSegments
		}
		return { params: result, route: node.o.r }
	}

	return null
}

/**
 * Match pathname against route tree
 */
export function matchRoute(tree: FlareTreeNode, pathname: string): MatchResult | null {
	const segments = parseSegments(pathname)
	return matchRecursive(tree, segments, 0, {})
}

/* ============================================================================
 * Path Utility Functions (v2)
 * ============================================================================ */

/**
 * Derive layouts array from virtualPath
 * Builds cumulative layout keys from virtual segments only (_root_, (groups), [params])
 *
 * @example
 * "_root_/(auth)/login" → ["_root_", "_root_/(auth)"]
 * "_root_/(layout)/products/(detail)/[id]" → ["_root_", "_root_/(layout)", "_root_/(layout)/(detail)/[id]"]
 */
export function deriveLayouts(virtualPath: string): string[] {
	const segments = virtualPath.split("/").filter(Boolean)
	const layouts: string[] = []
	let currentKey = ""

	for (const segment of segments) {
		const isRoot = /^_\w+_$/.test(segment)
		const isGroup = segment.startsWith("(") && segment.endsWith(")")
		const isParam =
			segment.startsWith("[") &&
			segment.endsWith("]") &&
			!segment.startsWith("[...") &&
			!segment.startsWith("[[...")

		if (isRoot) {
			currentKey = segment
			layouts.push(currentKey)
		} else if (isGroup || isParam) {
			currentKey = currentKey ? `${currentKey}/${segment}` : segment
			layouts.push(currentKey)
		}
		/* URL segments are skipped - they don't affect layout hierarchy */
	}

	return layouts
}

/**
 * Extract layout key from virtualPath (virtual segments only)
 * Strips URL segments, keeps only: _root_, (groups), [params]
 *
 * @example
 * "_root_/(layout-tests)/layout-tests/(dynamic)/dynamic/[orgId]" → "_root_/(layout-tests)/(dynamic)/[orgId]"
 * "_root_/(auth)/login" → "_root_/(auth)"
 */
export function extractLayoutKey(virtualPath: string): string {
	const segments = virtualPath.split("/").filter(Boolean)
	const virtualSegments: string[] = []

	for (const segment of segments) {
		const isRoot = /^_\w+_$/.test(segment)
		const isGroup = segment.startsWith("(") && segment.endsWith(")")
		const isParam = segment.startsWith("[") && segment.endsWith("]")

		if (isRoot || isGroup || isParam) {
			virtualSegments.push(segment)
		}
	}

	return virtualSegments.join("/")
}

/**
 * Derive params array from variablePath
 * Extracts parameter names from [id], [...slug], [[...slug]] patterns
 *
 * @example
 * "/products/[id]" → ["id"]
 * "/[...slug]" → ["slug"]
 * "/products/[id]/reviews/[reviewId]" → ["id", "reviewId"]
 */
export function deriveParams(variablePath: string): string[] {
	const params: string[] = []
	const segments = variablePath.split("/").filter(Boolean)

	for (const segment of segments) {
		if (segment.startsWith("[[...") && segment.endsWith("]]")) {
			params.push(segment.slice(5, -2))
		} else if (segment.startsWith("[...") && segment.endsWith("]")) {
			params.push(segment.slice(4, -1))
		} else if (segment.startsWith("[") && segment.endsWith("]")) {
			params.push(segment.slice(1, -1))
		}
	}

	return params
}
