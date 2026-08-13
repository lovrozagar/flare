/**
 * Route Testing Utilities
 *
 * Create mock routes, components, and route trees for testing.
 */

import type { JSX } from "solid-js"
import type { FlareRouteData, FlareTreeNode } from "../../src/router/tree-types"

/* ============================================================================
 * Mock Components
 * ============================================================================ */

/** Component type discriminator */
type ComponentType = "layout" | "page" | "root-layout"

/** Mock component structure */
interface MockComponent {
	_type: ComponentType
	head?: () => { description?: string; title?: string }
	loader?: (ctx: unknown) => Promise<unknown>
	preloader?: (ctx: unknown) => Promise<unknown>
	render: (props: unknown) => JSX.Element | null
	virtualPath: string
}

/** Input for creating mock components */
interface MockComponentInput {
	_type?: ComponentType
	head?: () => { description?: string; title?: string }
	loader?: (ctx: unknown) => Promise<unknown>
	preloader?: (ctx: unknown) => Promise<unknown>
	render?: (props: unknown) => JSX.Element | null
}

/**
 * Create a mock component with optional loader and preloader
 */
function createMockComponent(virtualPath: string, options?: MockComponentInput): MockComponent {
	return {
		_type: options?._type ?? "page",
		head: options?.head,
		loader: options?.loader,
		preloader: options?.preloader,
		render: options?.render ?? (() => null),
		virtualPath,
	}
}

/**
 * Create a mock page component
 */
function createMockPage(
	virtualPath: string,
	options?: Omit<MockComponentInput, "_type">,
): MockComponent {
	return createMockComponent(virtualPath, { ...options, _type: "page" })
}

/**
 * Create a mock layout component
 */
function createMockLayout(
	virtualPath: string,
	options?: Omit<MockComponentInput, "_type">,
): MockComponent {
	return createMockComponent(virtualPath, { ...options, _type: "layout" })
}

/* ============================================================================
 * Mock Routes
 * ============================================================================ */

/** Route metadata options */
interface RouteMeta {
	[key: string]: unknown
}

/** Input for creating route data */
interface RouteDataInput {
	exportName?: string
	options?: RouteMeta
	page?: () => Promise<{ default: unknown }>
	variablePath: string
	virtualPath?: string
}

/**
 * Create minimal FlareRouteData for testing
 */
function createRouteData(input: RouteDataInput): FlareRouteData {
	const { exportName = "default", options = {}, page, variablePath, virtualPath } = input

	const derivedVirtualPath = virtualPath ?? `_root_${variablePath === "/" ? "" : variablePath}`

	return {
		e: exportName,
		o: options,
		p: page ?? (() => Promise.resolve({ default: {} })),
		v: variablePath,
		x: derivedVirtualPath,
	}
}

/** Full input for creating mock routes with component options */
interface MockRouteInput {
	exportName?: string
	head?: () => { title?: string; description?: string }
	loader?: (ctx: unknown) => Promise<unknown>
	options?: RouteMeta
	preloader?: (ctx: unknown) => Promise<unknown>
	variablePath: string
	virtualPath?: string
}

/**
 * Create a mock route with optional loader and preloader
 */
function createMockRoute(input: MockRouteInput): FlareRouteData {
	const {
		exportName = "default",
		head,
		loader,
		options = {},
		preloader,
		variablePath,
		virtualPath,
	} = input

	const derivedVirtualPath = virtualPath ?? `_root_${variablePath === "/" ? "" : variablePath}`

	const component = {
		_type: "page" as const,
		head,
		loader,
		preloader,
		render: () => null,
		virtualPath: derivedVirtualPath,
	}

	return {
		e: exportName,
		o: options,
		p: () => Promise.resolve({ default: component }),
		v: variablePath,
		x: derivedVirtualPath,
	}
}

/* ============================================================================
 * Route Tree Builder
 * ============================================================================ */

/** Create empty tree node */
function createTestTreeNode(paramName?: string): FlareTreeNode {
	return paramName ? { n: paramName, s: new Map() } : { s: new Map() }
}

/** Route input for builder */
interface RouteInput extends Omit<MockComponentInput, "_type"> {
	_type?: ComponentType
}

/**
 * Fluent builder for constructing route trees
 *
 * @example
 * const tree = new RouteTreeBuilder()
 *   .addRoute("/", { loader: async () => ({ home: true }) })
 *   .addRoute("/products", { loader: async () => ({ products: [] }) })
 *   .addRoute("/products/[id]", { loader: async () => ({ product: {} }) })
 *   .addLayout("_root_", { preloader: async () => ({ user: null }) })
 *   .build()
 */
class RouteTreeBuilder {
	private tree: FlareTreeNode = createTestTreeNode()
	private layouts: Map<string, () => Promise<{ default: unknown }>> = new Map()

	/**
	 * Add a route at the given path
	 */
	addRoute(variablePath: string, options?: RouteInput): this {
		const route = createMockRoute({
			...options,
			variablePath,
		})
		this.insertRoute(route)
		return this
	}

	/**
	 * Add a layout at the given virtual path
	 */
	addLayout(virtualPath: string, options?: Omit<RouteInput, "_type">): this {
		const component = createMockComponent(virtualPath, {
			...options,
			_type: virtualPath === "_root_" ? "root-layout" : "layout",
		})
		this.layouts.set(virtualPath, () => Promise.resolve({ default: component }))
		return this
	}

	/**
	 * Insert a pre-built route into the tree
	 */
	insertRoute(route: FlareRouteData): this {
		const urlPath = route.v
		const segments = urlPath
			.replace(/^\/+|\/+$/g, "")
			.split("/")
			.filter(Boolean)

		let node = this.tree

		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i]
			if (!segment) continue

			const isLast = i === segments.length - 1

			/* Optional catch-all [[...slug]] */
			if (segment.startsWith("[[...") && segment.endsWith("]]")) {
				const paramName = segment.slice(5, -2)
				if (!node.o) {
					node.o = createTestTreeNode(paramName)
				}
				if (isLast) {
					node.o.r = route
				}
				continue
			}

			/* Catch-all [...slug] */
			if (segment.startsWith("[...") && segment.endsWith("]")) {
				const paramName = segment.slice(4, -1)
				if (!node.c) {
					node.c = createTestTreeNode(paramName)
				}
				if (isLast) {
					node.c.r = route
				}
				continue
			}

			/* Dynamic param [id] */
			if (segment.startsWith("[") && segment.endsWith("]")) {
				const paramName = segment.slice(1, -1)
				if (!node.p) {
					node.p = createTestTreeNode(paramName)
				}
				if (isLast) {
					node.p.r = route
				} else {
					node = node.p
				}
				continue
			}

			/* Static segment */
			const lowerSegment = segment.toLowerCase()
			let child = node.s.get(lowerSegment)
			if (!child) {
				child = createTestTreeNode()
				node.s.set(lowerSegment, child)
			}
			if (isLast) {
				child.r = route
			} else {
				node = child
			}
		}

		/* Root route */
		if (segments.length === 0) {
			this.tree.r = route
		}

		return this
	}

	/**
	 * Build the route tree
	 */
	build(): FlareTreeNode {
		return this.tree
	}

	/**
	 * Build the route tree with layouts
	 */
	buildWithLayouts(): {
		layouts: Record<string, () => Promise<{ default: unknown }>>
		routeTree: FlareTreeNode
	} {
		const layouts: Record<string, () => Promise<{ default: unknown }>> = {}
		this.layouts.forEach((value, key) => {
			layouts[key] = value
		})
		return { layouts, routeTree: this.tree }
	}
}

export type {
	ComponentType,
	MockComponent,
	MockComponentInput,
	MockRouteInput,
	RouteDataInput,
	RouteInput,
	RouteMeta,
}

export {
	createMockComponent,
	createMockLayout,
	createMockPage,
	createMockRoute,
	createRouteData,
	createTestTreeNode,
	RouteTreeBuilder,
}
