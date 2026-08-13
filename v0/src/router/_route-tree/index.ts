/**
 * Flare Route Tree
 * Builds route tree from route definitions for matching.
 */

import type { JSX } from "solid-js"
import { createTreeNode, type FlareTreeNode, insertRoute, matchRoute } from "../_tree-matcher"
import type { MatchedRoute } from "../outlet"

interface RouteDefinition {
	_type: "layout" | "render" | "root-layout"
	authorize?: (...args: any[]) => any
	effectsConfig?: unknown
	head?: (...args: any[]) => any
	headers?: (...args: any[]) => any
	inputConfig?: unknown
	loader?: (...args: any[]) => any
	options?: unknown
	preloader?: (...args: any[]) => any
	render: (...args: any[]) => JSX.Element | null
	virtualPath: string
}

interface StoredRoute extends RouteDefinition {
	variablePath: string
	virtualPath: string
}

interface RouteTree {
	root: FlareTreeNode
	routes: Map<string, StoredRoute>
}

interface RouteMatch {
	matches: MatchedRoute[]
	params: Record<string, string | string[]>
	pathname: string
}

/**
 * Extract variablePath from virtualPath
 * _root_/products/[id] → /products/[id]
 * _root_/(dashboard)/settings → /settings
 */
function extractVariablePath(virtualPath: string): string {
	let result = virtualPath.replace(/^_\w+_/, "")
	result = result.replace(/\/\([^)]+\)/g, "")
	if (!result.startsWith("/")) {
		result = `/${result}`
	}
	if (result === "/") {
		return "/"
	}
	return result.replace(/\/+$/, "")
}

/**
 * Extract URL path for tree insertion (strips layout groups)
 */
function extractUrlPath(virtualPath: string): string {
	let result = virtualPath.replace(/^_\w+_/, "")
	result = result.replace(/\/\([^)]+\)/g, "")
	if (!result.startsWith("/")) {
		result = `/${result}`
	}
	return result
}

function createRouteTree(routes?: RouteDefinition[]): RouteTree {
	const tree: RouteTree = {
		root: createTreeNode(),
		routes: new Map(),
	}

	if (routes) {
		for (const route of routes) {
			addRoute(tree, route)
		}
	}

	return tree
}

function addRoute(tree: RouteTree, route: RouteDefinition): void {
	const { virtualPath } = route
	const variablePath = extractVariablePath(virtualPath)
	const urlPath = extractUrlPath(virtualPath)

	const stored: StoredRoute = {
		...route,
		variablePath,
		virtualPath,
	}

	tree.routes.set(virtualPath, stored)

	if (route._type !== "layout") {
		insertRoute(tree.root, urlPath, {
			variablePath,
			virtualPath,
		})
	}
}

/**
 * Find all layout ancestors for a matched route
 */
function findLayoutHierarchy(tree: RouteTree, virtualPath: string): StoredRoute[] {
	const result: StoredRoute[] = []
	const segments = virtualPath.split("/")

	let currentPath = ""
	for (const segment of segments) {
		if (!segment) continue

		currentPath = currentPath ? `${currentPath}/${segment}` : segment

		const route = tree.routes.get(currentPath)
		if (route) {
			result.push(route)
		}

		if (segment.startsWith("(") && segment.endsWith(")")) {
			const layoutPath = currentPath
			const layout = tree.routes.get(layoutPath)
			if (layout && !result.includes(layout)) {
				result.push(layout)
			}
		}
	}

	return result
}

function match(tree: RouteTree, pathname: string): RouteMatch | null {
	const result = matchRoute(tree.root, pathname)
	if (!result) {
		return null
	}

	const hierarchy = findLayoutHierarchy(tree, result.route.virtualPath)

	/* Ensure the matched route itself is included at the end */
	const matchedRoute = tree.routes.get(result.route.virtualPath)
	if (matchedRoute && !hierarchy.includes(matchedRoute)) {
		hierarchy.push(matchedRoute)
	}

	const matches: MatchedRoute[] = hierarchy.map((route) => ({
		loaderData: {},
		render: route.render as (props: unknown) => JSX.Element,
		virtualPath: route.virtualPath,
	}))

	return {
		matches,
		params: result.params,
		pathname: result.pathname,
	}
}

export type { RouteDefinition, RouteMatch, RouteTree, StoredRoute }

export { addRoute, createRouteTree, match }
