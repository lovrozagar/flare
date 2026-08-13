/**
 * Flare Radix Tree Matcher
 *
 * O(depth) route matching using radix tree structure.
 * Priority: static > param > catch-all > optional catch-all
 */

/**
 * Route data stored at terminal tree nodes
 */
interface FlareRouteData {
	/** URL pattern: "/products/[id]" */
	variablePath: string
	/** Internal path: "_root_/products/[id]" */
	virtualPath: string
}

/**
 * Radix tree node for route matching
 */
interface FlareTreeNode {
	/** Static segment children (O(1) Map lookup) */
	static: Map<string, FlareTreeNode>
	/** Dynamic param [id] child */
	param: FlareTreeNode | null
	/** Catch-all [...slug] child */
	catchAll: FlareTreeNode | null
	/** Optional catch-all [[...slug]] child */
	optionalCatchAll: FlareTreeNode | null
	/** Route data if this is a terminal node */
	route: FlareRouteData | null
	/** Param name for dynamic nodes */
	paramName?: string
}

/**
 * Result of route matching
 */
interface MatchResult {
	route: FlareRouteData
	params: Record<string, string | string[]>
	/** Normalized pathname: static segments lowercase, params preserve original */
	pathname: string
}

/**
 * Create empty tree node
 */
function createTreeNode(paramName?: string): FlareTreeNode {
	return {
		catchAll: null,
		optionalCatchAll: null,
		param: null,
		paramName,
		route: null,
		static: new Map(),
	}
}

/**
 * Parse path into segments
 * "/products/123" → ["products", "123"]
 */
function parseSegments(path: string): string[] {
	const cleaned = path.replace(/^\/+|\/+$/g, "")
	return cleaned ? cleaned.split("/") : []
}

/**
 * Check if segment is dynamic param [id]
 */
function isDynamicParam(segment: string): string | null {
	if (
		segment.startsWith("[") &&
		segment.endsWith("]") &&
		!segment.startsWith("[...") &&
		!segment.startsWith("[[")
	) {
		return segment.slice(1, -1)
	}
	return null
}

/**
 * Check if segment is catch-all [...slug]
 */
function isCatchAll(segment: string): string | null {
	if (segment.startsWith("[...") && segment.endsWith("]")) {
		return segment.slice(4, -1)
	}
	return null
}

/**
 * Check if segment is optional catch-all [[...slug]]
 */
function isOptionalCatchAll(segment: string): string | null {
	if (segment.startsWith("[[...") && segment.endsWith("]]")) {
		return segment.slice(5, -2)
	}
	return null
}

/**
 * Insert a route into the tree
 */
function insertRoute(tree: FlareTreeNode, path: string, route: FlareRouteData): void {
	const segments = parseSegments(path)

	/* Root route */
	if (segments.length === 0) {
		tree.route = route
		return
	}

	let node = tree

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]
		if (segment === undefined) break

		const isLast = i === segments.length - 1

		/* Check for optional catch-all [[...slug]] */
		const optionalCatchAllParam = isOptionalCatchAll(segment)
		if (optionalCatchAllParam !== null) {
			if (!node.optionalCatchAll) {
				node.optionalCatchAll = createTreeNode(optionalCatchAllParam)
			}
			node.optionalCatchAll.route = route
			return
		}

		/* Check for catch-all [...slug] */
		const catchAllParam = isCatchAll(segment)
		if (catchAllParam !== null) {
			if (!node.catchAll) {
				node.catchAll = createTreeNode(catchAllParam)
			}
			node.catchAll.route = route
			return
		}

		/* Check for dynamic param [id] */
		const dynamicParam = isDynamicParam(segment)
		if (dynamicParam !== null) {
			if (!node.param) {
				node.param = createTreeNode(dynamicParam)
			}
			if (isLast) {
				node.param.route = route
			} else {
				node = node.param
			}
			continue
		}

		/* Static segment - use lowercase for case-insensitive matching */
		const lowerSegment = segment.toLowerCase()
		let child = node.static.get(lowerSegment)
		if (!child) {
			child = createTreeNode()
			node.static.set(lowerSegment, child)
		}
		if (isLast) {
			child.route = route
		} else {
			node = child
		}
	}
}

/**
 * Internal recursive match with backtracking support
 * Builds normalized pathname: static segments lowercase, params preserve original
 */
function matchRecursive(
	node: FlareTreeNode,
	segments: string[],
	index: number,
	params: Record<string, string | string[]>,
	pathParts: string[],
): MatchResult | null {
	/* All segments consumed - check terminal node */
	if (index >= segments.length) {
		const pathname = pathParts.length > 0 ? `/${pathParts.join("/")}` : "/"
		if (node.route) {
			return { params: { ...params }, pathname, route: node.route }
		}
		/* Check optional catch-all at terminal */
		if (node.optionalCatchAll?.route) {
			const result = { ...params }
			if (node.optionalCatchAll.paramName) {
				result[node.optionalCatchAll.paramName] = []
			}
			return { params: result, pathname, route: node.optionalCatchAll.route }
		}
		return null
	}

	const segment = segments[index]
	if (segment === undefined) return null

	/* 1. Try static match (highest priority, O(1)) - normalize to lowercase */
	const lowerSegment = segment.toLowerCase()
	const staticChild = node.static.get(lowerSegment)
	if (staticChild) {
		const result = matchRecursive(staticChild, segments, index + 1, params, [
			...pathParts,
			lowerSegment,
		])
		if (result) return result
	}

	/* 2. Try dynamic param [id] - preserve original case */
	if (node.param) {
		const paramParams = { ...params }
		if (node.param.paramName) {
			paramParams[node.param.paramName] = segment
		}
		const result = matchRecursive(node.param, segments, index + 1, paramParams, [
			...pathParts,
			segment,
		])
		if (result) return result
	}

	/* 3. Try catch-all [...slug] - preserve original case */
	if (node.catchAll?.route) {
		const restSegments = segments.slice(index)
		const result = { ...params }
		if (node.catchAll.paramName) {
			result[node.catchAll.paramName] = restSegments
		}
		const pathname = `/${[...pathParts, ...restSegments].join("/")}`
		return { params: result, pathname, route: node.catchAll.route }
	}

	/* 4. Try optional catch-all [[...slug]] - preserve original case */
	if (node.optionalCatchAll?.route) {
		const restSegments = segments.slice(index)
		const result = { ...params }
		if (node.optionalCatchAll.paramName) {
			result[node.optionalCatchAll.paramName] = restSegments
		}
		const pathname = `/${[...pathParts, ...restSegments].join("/")}`
		return { params: result, pathname, route: node.optionalCatchAll.route }
	}

	return null
}

/**
 * Match a pathname against the tree
 *
 * @param tree - Pre-built radix tree
 * @param pathname - Request pathname (e.g., "/products/123")
 * @returns MatchResult with route, params, and normalized pathname
 */
function matchRoute(tree: FlareTreeNode, pathname: string): MatchResult | null {
	const segments = parseSegments(pathname)
	return matchRecursive(tree, segments, 0, {}, [])
}

export type { FlareRouteData, FlareTreeNode, MatchResult }

export { createTreeNode, insertRoute, matchRoute }
