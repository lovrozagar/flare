/**
 * Redirect Integration Tests
 *
 * Tests redirect handling across SSR, NDJSON nav, and HTML nav.
 * Exercises full request flow with redirecting loaders.
 */

import type { JSX } from "solid-js"
import { describe, expect, it } from "vitest"
import { RedirectResponse } from "../../src/errors"
import { redirect } from "../../src/router/navigation"
import {
	createTreeNode,
	type FlareRouteData,
	type FlareTreeNode,
} from "../../src/router/tree-types"
import { createServerHandler } from "../../src/server/handler"

/**
 * Test helper: Create a mock route with sensible defaults
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
 * Test helper: Insert route into tree by URL path
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

	if (segments.length === 0) {
		tree.r = route
	}
}

describe("SSR redirect handling", () => {
	it("returns HTTP redirect when loader throws redirect", async () => {
		const routeTree = createTreeNode()

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/protected", {
							loader: async () => {
								redirect({ to: "/login" })
							},
						}),
					}),
				variablePath: "/protected",
				virtualPath: "_root_/protected",
			}),
		)

		const handler = createServerHandler({ routeTree })
		const request = new Request("http://localhost/protected")

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(302)
		expect(response.headers.get("Location")).toBe("/login")
	})

	it("returns HTTP redirect with custom status", async () => {
		const routeTree = createTreeNode()

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/old-page", {
							loader: async () => {
								redirect({ status: 301, to: "/new-page" })
							},
						}),
					}),
				variablePath: "/old-page",
				virtualPath: "_root_/old-page",
			}),
		)

		const handler = createServerHandler({ routeTree })
		const request = new Request("http://localhost/old-page")

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(301)
		expect(response.headers.get("Location")).toBe("/new-page")
	})

	it("redirects with params in URL", async () => {
		const routeTree = createTreeNode()

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/dashboard", {
							loader: async () => {
								redirect({ params: { id: "123" }, to: "/products/[id]" })
							},
						}),
					}),
				variablePath: "/dashboard",
				virtualPath: "_root_/dashboard",
			}),
		)

		const handler = createServerHandler({ routeTree })
		const request = new Request("http://localhost/dashboard")

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(302)
		expect(response.headers.get("Location")).toBe("/products/123")
	})

	it("redirects with search params", async () => {
		const routeTree = createTreeNode()

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/checkout", {
							loader: async () => {
								redirect({ search: { returnTo: "/checkout" }, to: "/login" })
							},
						}),
					}),
				variablePath: "/checkout",
				virtualPath: "_root_/checkout",
			}),
		)

		const handler = createServerHandler({ routeTree })
		const request = new Request("http://localhost/checkout")

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(302)
		expect(response.headers.get("Location")).toBe("/login?returnTo=%2Fcheckout")
	})

	it("redirects from preloader", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertTestRoute(
			routeTree,
			createMockRoute({
				variablePath: "/admin",
				virtualPath: "_root_/admin",
			}),
		)

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, {
							_type: "root-layout",
							preloader: async () => {
								redirect({ to: "/unauthorized" })
							},
						}),
					}),
			},
			routeTree,
		})

		const request = new Request("http://localhost/admin")

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(302)
		expect(response.headers.get("Location")).toBe("/unauthorized")
	})
})

describe("NDJSON redirect handling", () => {
	it("returns redirect message in NDJSON stream", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/protected", {
							loader: async () => {
								redirect({ to: "/login" })
							},
						}),
					}),
				variablePath: "/protected",
				virtualPath: "_root_/protected",
			}),
		)

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, { _type: "root-layout" }),
					}),
			},
			routeTree,
		})

		const request = new Request("http://localhost/protected", {
			headers: {
				"x-d": "1",
				"x-m": "_root_,_root_/protected",
			},
		})

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")

		const body = await response.text()
		const lines = body.trim().split("\n")

		/* Should have redirect message and done */
		const redirectLine = lines.find((l) => l.includes('"t":"x"'))
		expect(redirectLine).toBeDefined()

		const redirectMsg = JSON.parse(redirectLine ?? "{}")
		expect(redirectMsg.t).toBe("x")
		expect(redirectMsg.u).toBe("/login")
		expect(redirectMsg.s).toBe(302)

		/* Should end with done */
		expect(lines[lines.length - 1]).toBe('{"t":"d"}')
	})

	it("returns redirect message with custom status", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/old", {
							loader: async () => {
								redirect({ status: 301, to: "/new" })
							},
						}),
					}),
				variablePath: "/old",
				virtualPath: "_root_/old",
			}),
		)

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, { _type: "root-layout" }),
					}),
			},
			routeTree,
		})

		const request = new Request("http://localhost/old", {
			headers: {
				"x-d": "1",
				"x-m": "_root_,_root_/old",
			},
		})

		const response = await handler.fetch(request, {})
		const body = await response.text()
		const lines = body.trim().split("\n")

		const redirectLine = lines.find((l) => l.includes('"t":"x"'))
		const redirectMsg = JSON.parse(redirectLine ?? "{}")

		expect(redirectMsg.s).toBe(301)
	})

	it("returns redirect message with replace flag", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/form", {
							loader: async () => {
								redirect({ replace: true, to: "/success" })
							},
						}),
					}),
				variablePath: "/form",
				virtualPath: "_root_/form",
			}),
		)

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, { _type: "root-layout" }),
					}),
			},
			routeTree,
		})

		const request = new Request("http://localhost/form", {
			headers: {
				"x-d": "1",
				"x-m": "_root_,_root_/form",
			},
		})

		const response = await handler.fetch(request, {})
		const body = await response.text()
		const lines = body.trim().split("\n")

		const redirectLine = lines.find((l) => l.includes('"t":"x"'))
		const redirectMsg = JSON.parse(redirectLine ?? "{}")

		expect(redirectMsg.r).toBe(true)
	})
})

describe("HTML nav redirect handling", () => {
	it("returns HTTP redirect for HTML nav request", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/protected", {
							loader: async () => {
								redirect({ to: "/login" })
							},
						}),
					}),
				variablePath: "/protected",
				virtualPath: "_root_/protected",
			}),
		)

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, { _type: "root-layout" }),
					}),
			},
			routeTree,
		})

		const request = new Request("http://localhost/protected", {
			headers: {
				"x-d": "1",
				"x-f": "html",
			},
		})

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(302)
		expect(response.headers.get("Location")).toBe("/login")
	})

	it("returns HTTP redirect with custom status for HTML nav", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/old-page", {
							loader: async () => {
								redirect({ status: 308, to: "/new-page" })
							},
						}),
					}),
				variablePath: "/old-page",
				virtualPath: "_root_/old-page",
			}),
		)

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, { _type: "root-layout" }),
					}),
			},
			routeTree,
		})

		const request = new Request("http://localhost/old-page", {
			headers: {
				"x-d": "1",
				"x-f": "html",
			},
		})

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(308)
		expect(response.headers.get("Location")).toBe("/new-page")
	})
})

describe("redirect with raw RedirectResponse", () => {
	it("handles raw RedirectResponse throw", async () => {
		const routeTree = createTreeNode()

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/test", {
							loader: async () => {
								throw new RedirectResponse({ to: "/target" })
							},
						}),
					}),
				variablePath: "/test",
				virtualPath: "_root_/test",
			}),
		)

		const handler = createServerHandler({ routeTree })
		const request = new Request("http://localhost/test")

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(302)
		expect(response.headers.get("Location")).toBe("/target")
	})

	it("handles external redirect", async () => {
		const routeTree = createTreeNode()

		insertTestRoute(
			routeTree,
			createMockRoute({
				page: () =>
					Promise.resolve({
						default: createMockComponent("_root_/oauth", {
							loader: async () => {
								throw new RedirectResponse({ href: "https://oauth.example.com/authorize" })
							},
						}),
					}),
				variablePath: "/oauth",
				virtualPath: "_root_/oauth",
			}),
		)

		const handler = createServerHandler({ routeTree })
		const request = new Request("http://localhost/oauth")

		const response = await handler.fetch(request, {})

		expect(response.status).toBe(302)
		expect(response.headers.get("Location")).toBe("https://oauth.example.com/authorize")
	})
})
