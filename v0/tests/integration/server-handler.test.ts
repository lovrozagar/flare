/**
 * Server Handler Integration Tests
 *
 * Tests full SSR flow: request → middleware → routing → loaders → response.
 * Exercises the handler end-to-end without a browser.
 */

import type { JSX } from "solid-js"
import { describe, expect, it } from "vitest"
import {
	createTreeNode,
	type FlareRouteData,
	type FlareTreeNode,
} from "../../src/router/tree-types"
import { createServerHandler } from "../../src/server/handler"

/**
 * Test helper: Create a mock route with sensible defaults
 * Uses short property names: e=exportName o=options p=page v=variablePath x=virtualPath
 */
function createMockRoute(config: {
	page?: () => Promise<{ default: unknown }>
	variablePath: string
	virtualPath: string
}): FlareRouteData {
	return {
		e: "default",
		o: {},
		p: config.page ?? (() => Promise.resolve({ default: createMockComponent(config.virtualPath) })),
		v: config.variablePath,
		x: config.virtualPath,
	}
}

/**
 * Test helper: Create a mock component with optional loader
 */
function createMockComponent(
	virtualPath: string,
	options?: {
		_type?: "layout" | "page" | "root-layout"
		loader?: (ctx: unknown) => Promise<unknown>
		preloader?: (ctx: unknown) => Promise<unknown>
	},
): {
	_type: string
	loader?: (ctx: unknown) => Promise<unknown>
	preloader?: (ctx: unknown) => Promise<unknown>
	render: (props: unknown) => JSX.Element
	virtualPath: string
} {
	return {
		_type: options?._type ?? "page",
		loader: options?.loader,
		preloader: options?.preloader,
		render: () => null as unknown as JSX.Element,
		virtualPath,
	}
}

/**
 * Test helper: Insert route into tree by URL path (v = variablePath)
 * Uses short property names: s=static, p=param, r=route, n=paramName
 */
function insertTestRoute(tree: FlareTreeNode, route: FlareRouteData): void {
	const urlPath = route.v
	const segments = urlPath
		.replace(/^\/+|\/+$/g, "")
		.split("/")
		.filter(Boolean)

	let node = tree
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]
		if (!segment) continue

		const isLast = i === segments.length - 1

		/* Check for dynamic param [id] */
		if (segment.startsWith("[") && segment.endsWith("]") && !segment.startsWith("[...")) {
			const paramName = segment.slice(1, -1)
			if (!node.p) {
				node.p = { ...createTreeNode(), n: paramName }
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
			child = createTreeNode()
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
		tree.r = route
	}
}

describe("server handler SSR flow", () => {
	it("returns 404 for unmatched routes", async () => {
		const handler = createServerHandler({})
		const request = new Request("http://localhost/not-found")

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(404)
		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8")

		const html = await response.text()
		expect(html).toContain("404")
		expect(html).toContain("Page not found")
	})

	it("matches routes and runs loaders", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/products", {
							loader: async () => ({ products: ["Widget", "Gadget"] }),
						}),
					}),
				variablePath: "/products",
				virtualPath: "_root_/products",
			}),
		)

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, {
							_type: "root-layout",
							preloader: async () => ({ appName: "Test App" }),
						}),
					}),
			},
			routeTree,
		})
		const request = new Request("http://localhost/products")

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(200)

		const html = await response.text()
		expect(html).toContain("Matched: /products")
		expect(html).toContain("self.flare")
	})

	it("serializes flare state to HTML", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/dashboard", {
							loader: async () => ({ stats: { views: 100 } }),
						}),
					}),
				variablePath: "/dashboard",
				virtualPath: "_root_/dashboard",
			}),
		)

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, {
							_type: "root-layout",
							preloader: async () => ({ user: "Alice" }),
						}),
					}),
			},
			routeTree,
		})
		const request = new Request("http://localhost/dashboard")

		const response = await handler.fetch(request, {})
		const html = await response.text()

		/* Should contain flare state script */
		expect(html).toContain("self.flare=")

		/* Parse flare state from HTML */
		const match = html.match(/self\.flare=(\{.*?\});/)
		expect(match).not.toBeNull()
		if (!match) throw new Error("match should not be null")

		const flareState = JSON.parse(match[1] ?? "{}")
		expect(flareState.r.pathname).toBe("/dashboard")
		expect(flareState.r.matches).toHaveLength(2)
	})

	it("handles CSR data request with x-d header", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/products", {
							loader: async () => ({ products: ["A", "B", "C"] }),
						}),
					}),
				variablePath: "/products",
				virtualPath: "_root_/products",
			}),
		)

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, {
							_type: "root-layout",
							preloader: async () => ({ user: "Bob" }),
						}),
					}),
			},
			routeTree,
		})

		const request = new Request("http://localhost/products", {
			headers: {
				"x-d": "1",
				"x-m": "_root_,_root_/products",
			},
		})

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")

		const body = await response.text()
		const lines = body.trim().split("\n")

		/* Should have loader messages and done */
		expect(lines.length).toBeGreaterThanOrEqual(1)
		expect(lines[lines.length - 1]).toBe('{"t":"d"}')
	})

	it("runs middleware chain", async () => {
		const middlewareCalls: string[] = []

		const routeTree = createTreeNode()
		insertTestRoute(
			routeTree,
			createMockRoute({ variablePath: "/test", virtualPath: "_root_/test" }),
		)

		const handler = createServerHandler({
			middlewares: [
				async (_ctx, next) => {
					middlewareCalls.push("middleware1:before")
					const result = await next()
					middlewareCalls.push("middleware1:after")
					return result
				},
				async (_ctx, next) => {
					middlewareCalls.push("middleware2:before")
					const result = await next()
					middlewareCalls.push("middleware2:after")
					return result
				},
			],
			routeTree,
		})

		const request = new Request("http://localhost/test")
		await handler.fetch(request, {})

		expect(middlewareCalls).toEqual([
			"middleware1:before",
			"middleware2:before",
			"middleware2:after",
			"middleware1:after",
		])
	})

	it("applies security headers", async () => {
		const routeTree = createTreeNode()
		insertTestRoute(routeTree, createMockRoute({ variablePath: "/", virtualPath: "_root_" }))

		const handler = createServerHandler({ routeTree })
		const request = new Request("http://localhost/")

		const response = await handler.fetch(request, {})

		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
		expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN")
		expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin")
	})

	it("normalizes trailing slash", async () => {
		const handler = createServerHandler({})
		const request = new Request("http://localhost/products/")

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(301)
		/* Redirects use full URL per HTTP spec */
		expect(response.headers.get("Location")).toBe("http://localhost/products")
	})

	it("passes route params to loaders", async () => {
		const routeTree = createTreeNode()
		let capturedParams: Record<string, unknown> = {}

		/* Insert products path */
		const productsNode = createTreeNode()
		routeTree.s.set("products", productsNode)

		/* Insert [id] param with route */
		productsNode.p = {
			...createTreeNode(),
			n: "id",
			r: createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/products/[id]", {
							loader: (ctx) => {
								capturedParams = (ctx as { location: { params: Record<string, unknown> } }).location
									.params
								return Promise.resolve({ id: capturedParams.id })
							},
						}),
					}),
				variablePath: "/products/[id]",
				virtualPath: "_root_/products/[id]",
			}),
		}

		const handler = createServerHandler({ routeTree })
		const request = new Request("http://localhost/products/123")

		await handler.fetch(request, {})

		expect(capturedParams).toEqual({ id: "123" })
	})

	it("passes env to loaders", async () => {
		const routeTree = createTreeNode()
		let capturedEnv: unknown = null

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/test", {
							loader: (ctx) => {
								capturedEnv = (ctx as { env: unknown }).env
								return Promise.resolve({})
							},
						}),
					}),
				variablePath: "/test",
				virtualPath: "_root_/test",
			}),
		)

		const handler = createServerHandler({ routeTree })
		const request = new Request("http://localhost/test")

		await handler.fetch(request, { MY_BINDING: "test-value" })

		expect(capturedEnv).toEqual({ MY_BINDING: "test-value" })
	})
})

describe("preloader to loader context flow", () => {
	/* TODO: These tests need route factories (createPage, createRootLayout) to work */
	/* The mock route structure doesn't match loader-pipeline expectations */
	it.skip("preloader context flows to loader", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"
		let loaderPreloaderContext: unknown = null

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/dashboard", {
							loader: (ctx) => {
								loaderPreloaderContext = (ctx as { preloaderContextContext: unknown })
									.preloaderContextContext
								return Promise.resolve({ dashboard: true })
							},
						}),
					}),
				variablePath: "/dashboard",
				virtualPath: "_root_/dashboard",
			}),
		)

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, {
							_type: "root-layout",
							preloader: async () => ({ tenant: "acme" }),
						}),
					}),
			},
			routeTree,
		})
		const request = new Request("http://localhost/dashboard")

		await handler.fetch(request, {})

		expect(loaderPreloaderContext).toHaveProperty("_root_")
		expect((loaderPreloaderContext as Record<string, unknown>)["_root_"]).toEqual({
			tenant: "acme",
		})
	})

	it.skip("nested preloaders build tree context", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"
		const adminPath = "_root_/admin"
		let leafPreloaderTree: unknown = null

		/* Insert admin path */
		const adminNode = createTreeNode()
		routeTree.s.set("admin", adminNode)

		/* Insert users route */
		const usersNode = createTreeNode()
		adminNode.s.set("users", usersNode)
		usersNode.r = createMockRoute({
			page: () =>
				Promise.resolve({
					default: createMockComponent("_root_/admin/users", {
						preloader: (ctx) => {
							leafPreloaderTree = (ctx as { preloaderContextContext: unknown })
								.preloaderContextContext
							return Promise.resolve({ level: 2 })
						},
					}),
				}),
			variablePath: "/admin/users",
			virtualPath: "_root_/admin/users",
		})

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, {
							_type: "root-layout",
							preloader: async () => ({ level: 0 }),
						}),
					}),
				[adminPath]: () =>
					Promise.resolve({
						default: createMockComponent(adminPath, {
							_type: "layout",
							preloader: async () => ({ level: 1 }),
						}),
					}),
			},
			routeTree,
		})
		const request = new Request("http://localhost/admin/users")

		await handler.fetch(request, {})

		const treeCtx = leafPreloaderTree as Record<string, { level: number }>
		expect(treeCtx["_root_"]).toEqual({ level: 0 })
		expect(treeCtx["_root_/admin"]).toEqual({ level: 1 })
	})
})
