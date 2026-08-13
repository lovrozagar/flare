/**
 * Flare Handler Unit Tests
 *
 * Tests createServerHandler server entry point.
 * Request flow: URL normalization, middleware, routing, rendering.
 */

import type { JSX } from "solid-js"
import { describe, expect, it } from "vitest"
import {
	createTreeNode,
	type FlareRouteData,
	type FlareTreeNode,
} from "../../../src/router/tree-types"
import { createServerHandler } from "../../../src/server/handler"

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

describe("createServerHandler", () => {
	describe("factory", () => {
		it("returns handler with fetch method", () => {
			const handler = createServerHandler({})
			expect(handler.fetch).toBeDefined()
			expect(typeof handler.fetch).toBe("function")
		})
	})

	describe("URL normalization", () => {
		it("redirects trailing slash (301)", async () => {
			const handler = createServerHandler({})
			const response = await handler.fetch(new Request("https://example.com/about/"), {})
			expect(response.status).toBe(301)
			expect(response.headers.get("Location")).toBe("https://example.com/about")
		})

		it("does not redirect root path", async () => {
			const handler = createServerHandler({})
			const response = await handler.fetch(new Request("https://example.com/"), {})
			expect(response.status).not.toBe(301)
		})

		/* Note: Lowercase redirect intentionally not implemented - dynamic params may need case sensitivity */
	})

	describe("static file detection", () => {
		it("returns 404 for file extensions (non-HTML)", async () => {
			const handler = createServerHandler({})
			const response = await handler.fetch(new Request("https://example.com/favicon.ico"), {})
			expect(response.status).toBe(404)
		})

		it("treats .html extensions as routes (not static files)", async () => {
			const handler = createServerHandler({})
			const response = await handler.fetch(new Request("https://example.com/page.html"), {})
			/* .html should go through routing (returns HTML 404 page), not static detection (plain text) */
			expect(response.headers.get("Content-Type")).toContain("text/html")
		})

		it("returns 404 for common static extensions", async () => {
			const handler = createServerHandler({})
			const extensions = [".js", ".css", ".png", ".jpg", ".svg", ".woff2"]

			for (const ext of extensions) {
				const response = await handler.fetch(new Request(`https://example.com/file${ext}`), {})
				expect(response.status).toBe(404)
			}
		})
	})

	describe("middleware execution", () => {
		it("runs middlewares in order", async () => {
			const order: number[] = []

			const handler = createServerHandler({
				middlewares: [
					(_ctx, next) => {
						order.push(1)
						return next()
					},
					(_ctx, next) => {
						order.push(2)
						return next()
					},
				],
			})

			await handler.fetch(new Request("https://example.com/"), {})

			expect(order).toEqual([1, 2])
		})

		it("allows middleware to respond early", async () => {
			const handler = createServerHandler({
				middlewares: [
					() =>
						Promise.resolve({
							response: new Response("Early response"),
							type: "respond" as const,
						}),
				],
			})

			const response = await handler.fetch(new Request("https://example.com/"), {})

			expect(await response.text()).toBe("Early response")
		})

		it("allows middleware to bypass", async () => {
			const handler = createServerHandler({
				middlewares: [
					() =>
						Promise.resolve({
							response: new Response("Static asset"),
							type: "bypass" as const,
						}),
				],
			})

			const response = await handler.fetch(new Request("https://example.com/"), {})

			expect(await response.text()).toBe("Static asset")
		})

		it("applies response handlers to final response", async () => {
			const handler = createServerHandler({
				middlewares: [
					(ctx, next) => {
						ctx.onResponse((r: Response) => {
							const newResponse = new Response(r.body, r)
							newResponse.headers.set("X-Test-Header", "middleware-value")
							return newResponse
						})
						return next()
					},
				],
			})

			const response = await handler.fetch(new Request("https://example.com/"), {})

			expect(response.headers.get("X-Test-Header")).toBe("middleware-value")
		})
	})

	describe("security headers", () => {
		it("includes Content-Security-Policy", async () => {
			const handler = createServerHandler({})
			const response = await handler.fetch(new Request("https://example.com/"), {})
			expect(response.headers.get("Content-Security-Policy")).toBeDefined()
		})

		it("includes X-Content-Type-Options", async () => {
			const handler = createServerHandler({})
			const response = await handler.fetch(new Request("https://example.com/"), {})
			expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
		})

		it("includes X-Frame-Options", async () => {
			const handler = createServerHandler({})
			const response = await handler.fetch(new Request("https://example.com/"), {})
			expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN")
		})

		it("includes nonce in CSP", async () => {
			const handler = createServerHandler({})
			const response = await handler.fetch(new Request("https://example.com/"), {})
			const csp = response.headers.get("Content-Security-Policy")
			expect(csp).toMatch(/'nonce-[a-f0-9]{32}'/)
		})
	})

	describe("no route tree", () => {
		it("returns 404 when no route tree configured", async () => {
			const handler = createServerHandler({})
			const response = await handler.fetch(new Request("https://example.com/"), {})
			expect(response.status).toBe(404)
		})

		it("returns HTML 404 page", async () => {
			const handler = createServerHandler({})
			const response = await handler.fetch(new Request("https://example.com/"), {})
			expect(response.headers.get("Content-Type")).toContain("text/html")
		})
	})

	describe("env and context", () => {
		it("passes env to middleware", async () => {
			let capturedEnv: unknown

			const handler = createServerHandler({
				middlewares: [
					(ctx, next) => {
						capturedEnv = ctx.env
						return next()
					},
				],
			})

			const testEnv = { API_KEY: "secret" }
			await handler.fetch(new Request("https://example.com/"), testEnv)

			expect(capturedEnv).toBe(testEnv)
		})

		it("passes nonce to middleware", async () => {
			let capturedNonce: string | undefined

			const handler = createServerHandler({
				middlewares: [
					(ctx, next) => {
						capturedNonce = ctx.nonce
						return next()
					},
				],
			})

			await handler.fetch(new Request("https://example.com/"), {})

			expect(capturedNonce).toMatch(/^[a-f0-9]{32}$/)
		})

		it("generates unique nonce per request", async () => {
			const nonces: string[] = []

			const handler = createServerHandler({
				middlewares: [
					(ctx, next) => {
						nonces.push(ctx.nonce)
						return next()
					},
				],
			})

			await handler.fetch(new Request("https://example.com/"), {})
			await handler.fetch(new Request("https://example.com/"), {})

			expect(nonces[0]).not.toBe(nonces[1])
		})
	})

	describe("route matching", () => {
		it("returns 200 for matched routes", async () => {
			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({ variablePath: "/about", virtualPath: "_root_/about" }),
			)

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("https://example.com/about"), {})

			expect(response.status).toBe(200)
		})

		it("returns 404 for unmatched routes", async () => {
			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({ variablePath: "/about", virtualPath: "_root_/about" }),
			)

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("https://example.com/contact"), {})

			expect(response.status).toBe(404)
		})

		it("matches root path", async () => {
			const routeTree = createTreeNode()
			insertTestRoute(routeTree, createMockRoute({ variablePath: "/", virtualPath: "_root_" }))

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("https://example.com/"), {})

			expect(response.status).toBe(200)
		})

		it("matches dynamic params", async () => {
			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({ variablePath: "/products/[id]", virtualPath: "_root_/products/[id]" }),
			)

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("https://example.com/products/123"), {})

			expect(response.status).toBe(200)
		})

		it("runs loaders for matched routes", async () => {
			let loaderCalled = false

			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({
					page: () =>
						Promise.resolve({
							default: createMockComponent("_root_/page", {
								loader: () => {
									loaderCalled = true
									return Promise.resolve({ data: "test" })
								},
							}),
						}),
					variablePath: "/page",
					virtualPath: "_root_/page",
				}),
			)

			const handler = createServerHandler({ routeTree })
			await handler.fetch(new Request("https://example.com/page"), {})

			expect(loaderCalled).toBe(true)
		})

		it("runs preloaders before loaders", async () => {
			const order: string[] = []

			const routeTree = createTreeNode()
			const rootLayoutPath = "_root_"
			const pagePath = "_root_/page"

			insertTestRoute(
				routeTree,
				createMockRoute({
					page: () =>
						Promise.resolve({
							default: createMockComponent(pagePath, {
								loader: () => {
									order.push("loader")
									return Promise.resolve({})
								},
							}),
						}),
					variablePath: "/page",
					virtualPath: pagePath,
				}),
			)

			const handler = createServerHandler({
				layouts: {
					[rootLayoutPath]: () =>
						Promise.resolve({
							default: createMockComponent(rootLayoutPath, {
								_type: "root-layout",
								preloader: () => {
									order.push("preloader")
									return Promise.resolve({})
								},
							}),
						}),
				},
				routeTree,
			})
			await handler.fetch(new Request("https://example.com/page"), {})

			expect(order).toEqual(["preloader", "loader"])
		})

		it("passes env to loaders", async () => {
			let capturedEnv: unknown

			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({
					page: () =>
						Promise.resolve({
							default: createMockComponent("_root_/page", {
								loader: (ctx) => {
									capturedEnv = (ctx as { env: unknown }).env
									return Promise.resolve({})
								},
							}),
						}),
					variablePath: "/page",
					virtualPath: "_root_/page",
				}),
			)

			const testEnv = { DB: "test-db" }
			const handler = createServerHandler({ routeTree })
			await handler.fetch(new Request("https://example.com/page"), testEnv)

			expect(capturedEnv).toBe(testEnv)
		})

		it("passes params to loaders", async () => {
			let capturedParams: unknown

			const routeTree = createTreeNode()

			/* First insert users path */
			const usersNode = createTreeNode()
			routeTree.s.set("users", usersNode)

			/* Then insert [userId] param */
			usersNode.p = { ...createTreeNode(), n: "userId" }

			/* Then insert posts static segment */
			const postsNode = createTreeNode()
			usersNode.p.s.set("posts", postsNode)

			/* Finally insert [postId] param with route */
			postsNode.p = {
				...createTreeNode(),
				n: "postId",
				r: createMockRoute({
					page: () =>
						Promise.resolve({
							default: createMockComponent("_root_/users/[userId]/posts/[postId]", {
								loader: (ctx) => {
									capturedParams = (ctx as { location: { params: unknown } }).location.params
									return Promise.resolve({})
								},
							}),
						}),
					variablePath: "/users/[userId]/posts/[postId]",
					virtualPath: "_root_/users/[userId]/posts/[postId]",
				}),
			}

			const handler = createServerHandler({ routeTree })
			await handler.fetch(new Request("https://example.com/users/alice/posts/42"), {})

			expect(capturedParams).toEqual({ postId: "42", userId: "alice" })
		})
	})

	describe("CSR data request (x-d header)", () => {
		it("returns NDJSON for x-d header request", async () => {
			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({
					page: () =>
						Promise.resolve({
							default: createMockComponent("_root_/page", {
								loader: () => Promise.resolve({ data: "test" }),
							}),
						}),
					variablePath: "/page",
					virtualPath: "_root_/page",
				}),
			)

			const handler = createServerHandler({ routeTree })
			const request = new Request("https://example.com/page", {
				headers: { "x-d": "1" },
			})
			const response = await handler.fetch(request, {})

			expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")
		})

		it("includes loader data in NDJSON response", async () => {
			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({
					page: () =>
						Promise.resolve({
							default: createMockComponent("_root_/product", {
								loader: () => Promise.resolve({ product: "widget" }),
							}),
						}),
					variablePath: "/product",
					virtualPath: "_root_/product",
				}),
			)

			const handler = createServerHandler({ routeTree })
			const request = new Request("https://example.com/product", {
				headers: { "x-d": "1" },
			})
			const response = await handler.fetch(request, {})
			const text = await response.text()
			const lines = text.trim().split("\n")

			const loaderLine = JSON.parse(lines[0] ?? "{}")
			expect(loaderLine.t).toBe("l")
			expect(loaderLine.d).toEqual({ product: "widget" })
		})

		it("includes done message at end", async () => {
			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({ variablePath: "/page", virtualPath: "_root_/page" }),
			)

			const handler = createServerHandler({ routeTree })
			const request = new Request("https://example.com/page", {
				headers: { "x-d": "1" },
			})
			const response = await handler.fetch(request, {})
			const text = await response.text()
			const lines = text.trim().split("\n")

			const lastLine = JSON.parse(lines[lines.length - 1] ?? "{}")
			expect(lastLine.t).toBe("d")
		})

		it("returns 404 HTML for unmatched routes even with x-d header", async () => {
			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({ variablePath: "/about", virtualPath: "_root_/about" }),
			)

			const handler = createServerHandler({ routeTree })
			const request = new Request("https://example.com/unknown", {
				headers: { "x-d": "1" },
			})
			const response = await handler.fetch(request, {})

			/* Returns 404 HTML page for unmatched routes */
			expect(response.status).toBe(404)
			expect(response.headers.get("Content-Type")).toContain("text/html")
		})

		it("includes error for failed loaders", async () => {
			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({
					page: () =>
						Promise.resolve({
							default: createMockComponent("_root_/fail", {
								loader: () => Promise.reject(new Error("Load failed")),
							}),
						}),
					variablePath: "/fail",
					virtualPath: "_root_/fail",
				}),
			)

			const handler = createServerHandler({ routeTree })
			const request = new Request("https://example.com/fail", {
				headers: { "x-d": "1" },
			})
			const response = await handler.fetch(request, {})
			const text = await response.text()
			const lines = text.trim().split("\n")

			const errorLine = JSON.parse(lines[0] ?? "{}")
			expect(errorLine.t).toBe("e")
			expect(errorLine.e.message).toBe("Load failed")
		})

		it("returns HTML without x-d header", async () => {
			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({ variablePath: "/page", virtualPath: "_root_/page" }),
			)

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("https://example.com/page"), {})

			expect(response.headers.get("Content-Type")).toContain("text/html")
		})
	})

	describe("self.flare state embedding", () => {
		it("includes self.flare script in SSR response", async () => {
			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({ variablePath: "/page", virtualPath: "_root_/page" }),
			)

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("https://example.com/page"), {})
			const html = await response.text()

			expect(html).toContain("self.flare=")
		})

		it("includes route data in self.flare", async () => {
			const routeTree = createTreeNode()

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
								loader: () => Promise.resolve({ product: "widget" }),
							}),
						}),
					variablePath: "/products/[id]",
					virtualPath: "_root_/products/[id]",
				}),
			}

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("https://example.com/products/123"), {})
			const html = await response.text()

			expect(html).toContain('"pathname":"/products/123"')
			expect(html).toContain('"id":"123"')
		})

		it("includes routerDefaults in context", async () => {
			const routeTree = createTreeNode()
			insertTestRoute(
				routeTree,
				createMockRoute({ variablePath: "/page", virtualPath: "_root_/page" }),
			)

			const handler = createServerHandler({
				routeTree,
				routerDefaults: { staleTime: 30000 },
			})

			const response = await handler.fetch(new Request("https://example.com/page"), {})
			const html = await response.text()

			expect(html).toContain('"staleTime":30000')
		})
	})
})
