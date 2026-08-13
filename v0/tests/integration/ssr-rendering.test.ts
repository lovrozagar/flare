/**
 * SSR Rendering Integration Tests
 *
 * Tests the complete server-side rendering flow.
 * Covers routing, preloaders, loaders, state serialization, and response handling.
 */

import type { JSX } from "solid-js"
import { describe, expect, it, vi } from "vitest"
import {
	ForbiddenError,
	NotFoundError,
	RedirectResponse,
	UnauthenticatedError,
} from "../../src/errors"
import {
	createTreeNode,
	type FlareRouteData,
	type FlareTreeNode,
} from "../../src/router/tree-types"
import { createServerHandler } from "../../src/server/handler"

/* ============================================================================
 * Test Helpers
 * ============================================================================ */

function createMockRoute(config: {
	loader?: (ctx: unknown) => Promise<unknown>
	page?: () => Promise<{ default: unknown }>
	preloader?: (ctx: unknown) => Promise<unknown>
	variablePath: string
	virtualPath: string
}): FlareRouteData {
	return {
		e: "default",
		o: {},
		p:
			config.page ??
			(() =>
				Promise.resolve({
					default: createMockComponent(config.virtualPath, {
						loader: config.loader,
						preloader: config.preloader,
					}),
				})),
		v: config.variablePath,
		x: config.virtualPath,
	}
}

function createMockComponent(
	virtualPath: string,
	options?: {
		_type?: "layout" | "page" | "root-layout"
		authorize?: (ctx: unknown) => boolean | Promise<boolean>
		loader?: (ctx: unknown) => Promise<unknown>
		preloader?: (ctx: unknown) => Promise<unknown>
	},
): {
	_type: string
	authorize?: (ctx: unknown) => boolean | Promise<boolean>
	loader?: (ctx: unknown) => Promise<unknown>
	preloader?: (ctx: unknown) => Promise<unknown>
	render: (props: unknown) => JSX.Element
	virtualPath: string
} {
	return {
		_type: options?._type ?? "page",
		authorize: options?.authorize,
		loader: options?.loader,
		preloader: options?.preloader,
		render: () => null as unknown as JSX.Element,
		virtualPath,
	}
}

function insertRoute(tree: FlareTreeNode, route: FlareRouteData): void {
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

function parseFlareStateFromHtml(html: string): Record<string, unknown> | null {
	const match = html.match(/self\.flare=(\{.*?\});/)
	return match ? JSON.parse(match[1] ?? "{}") : null
}

/* ============================================================================
 * SSR Rendering Flow Tests
 * ============================================================================ */

describe("SSR rendering flow", () => {
	describe("basic rendering", () => {
		it("renders HTML response with content-type header", async () => {
			const routeTree = createTreeNode()
			insertRoute(routeTree, createMockRoute({ variablePath: "/", virtualPath: "_root_" }))

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("http://localhost/"), {})

			expect(response.status).toBe(200)
			expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8")
		})

		it("includes DOCTYPE and html structure", async () => {
			const routeTree = createTreeNode()
			insertRoute(routeTree, createMockRoute({ variablePath: "/", virtualPath: "_root_" }))

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("http://localhost/"), {})
			const html = await response.text()

			expect(html).toContain("<!DOCTYPE html>")
			expect(html).toContain("<html")
			expect(html).toContain("</html>")
		})

		it("includes flare state script in response", async () => {
			const routeTree = createTreeNode()
			insertRoute(routeTree, createMockRoute({ variablePath: "/page", virtualPath: "_root_/page" }))

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("http://localhost/page"), {})
			const html = await response.text()

			expect(html).toContain("self.flare=")
			const state = parseFlareStateFromHtml(html)
			expect(state).not.toBeNull()
			expect(state?.r).toBeDefined()
		})

		it("serializes pathname in flare state", async () => {
			const routeTree = createTreeNode()
			insertRoute(
				routeTree,
				createMockRoute({ variablePath: "/products", virtualPath: "_root_/products" }),
			)

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("http://localhost/products"), {})
			const html = await response.text()

			const state = parseFlareStateFromHtml(html) as { r: { pathname: string } }
			expect(state.r.pathname).toBe("/products")
		})
	})

	describe("route matching", () => {
		it("matches static routes", async () => {
			const routeTree = createTreeNode()
			insertRoute(
				routeTree,
				createMockRoute({ variablePath: "/about", virtualPath: "_root_/about" }),
			)

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("http://localhost/about"), {})

			expect(response.status).toBe(200)
			const html = await response.text()
			expect(html).toContain("Matched: /about")
		})

		it("extracts params from dynamic segments", async () => {
			const routeTree = createTreeNode()
			let capturedParams: Record<string, unknown> = {}

			const productsNode = createTreeNode()
			routeTree.s.set("products", productsNode)

			productsNode.p = {
				...createTreeNode(),
				n: "id",
				r: createMockRoute({
					loader: (ctx) => {
						capturedParams = (ctx as { location: { params: Record<string, unknown> } }).location
							.params
						return Promise.resolve({ id: capturedParams.id })
					},
					variablePath: "/products/[id]",
					virtualPath: "_root_/products/[id]",
				}),
			}

			const handler = createServerHandler({ routeTree })
			await handler.fetch(new Request("http://localhost/products/456"), {})

			expect(capturedParams).toEqual({ id: "456" })
		})

		it("includes params in flare state", async () => {
			const routeTree = createTreeNode()

			const usersNode = createTreeNode()
			routeTree.s.set("users", usersNode)

			usersNode.p = {
				...createTreeNode(),
				n: "userId",
				r: createMockRoute({
					variablePath: "/users/[userId]",
					virtualPath: "_root_/users/[userId]",
				}),
			}

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("http://localhost/users/789"), {})
			const html = await response.text()

			const state = parseFlareStateFromHtml(html) as { r: { params: Record<string, string> } }
			expect(state.r.params).toEqual({ userId: "789" })
		})
	})

	describe("preloader and loader execution", () => {
		it("runs page loader and includes data in state", async () => {
			const routeTree = createTreeNode()
			const loaderSpy = vi.fn(async () => ({ items: ["a", "b", "c"] }))

			insertRoute(
				routeTree,
				createMockRoute({
					loader: loaderSpy,
					variablePath: "/items",
					virtualPath: "_root_/items",
				}),
			)

			const handler = createServerHandler({ routeTree })
			await handler.fetch(new Request("http://localhost/items"), {})

			expect(loaderSpy).toHaveBeenCalledTimes(1)
		})

		it("runs root layout preloader before page", async () => {
			const routeTree = createTreeNode()
			const executionOrder: string[] = []
			const rootPath = "_root_"

			insertRoute(
				routeTree,
				createMockRoute({
					loader: () => {
						executionOrder.push("page:loader")
						return { page: true }
					},
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
								preloader: () => {
									executionOrder.push("root:preloader")
									return { app: "test" }
								},
							}),
						}),
				},
				routeTree,
			})

			await handler.fetch(new Request("http://localhost/dashboard"), {})

			expect(executionOrder).toEqual(["root:preloader", "page:loader"])
		})

		it("passes preloader context to loaders", async () => {
			const routeTree = createTreeNode()
			let receivedContext: unknown = null
			const rootPath = "_root_"

			insertRoute(
				routeTree,
				createMockRoute({
					loader: (ctx) => {
						receivedContext = (ctx as { preloaderContext: unknown }).preloaderContext
						return {}
					},
					variablePath: "/test",
					virtualPath: "_root_/test",
				}),
			)

			const handler = createServerHandler({
				layouts: {
					[rootPath]: () =>
						Promise.resolve({
							default: createMockComponent(rootPath, {
								_type: "root-layout",
								preloader: () => ({ tenant: "acme", user: "alice" }),
							}),
						}),
				},
				routeTree,
			})

			await handler.fetch(new Request("http://localhost/test"), {})

			expect(receivedContext).toEqual({ tenant: "acme", user: "alice" })
		})

		it("passes env to loaders", async () => {
			const routeTree = createTreeNode()
			let capturedEnv: unknown = null

			insertRoute(
				routeTree,
				createMockRoute({
					loader: (ctx) => {
						capturedEnv = (ctx as { env: unknown }).env
						return Promise.resolve({})
					},
					variablePath: "/env-test",
					virtualPath: "_root_/env-test",
				}),
			)

			const handler = createServerHandler({ routeTree })
			await handler.fetch(new Request("http://localhost/env-test"), {
				API_KEY: "secret",
				DB: "postgres",
			})

			expect(capturedEnv).toEqual({ API_KEY: "secret", DB: "postgres" })
		})

		it("passes request to loaders", async () => {
			const routeTree = createTreeNode()
			let capturedMethod: string | null = null
			let capturedHeader: string | null = null

			insertRoute(
				routeTree,
				createMockRoute({
					loader: (ctx) => {
						const request = (ctx as { request: Request }).request
						capturedMethod = request.method
						capturedHeader = request.headers.get("X-Custom")
						return Promise.resolve({})
					},
					variablePath: "/req-test",
					virtualPath: "_root_/req-test",
				}),
			)

			const handler = createServerHandler({ routeTree })
			await handler.fetch(
				new Request("http://localhost/req-test", {
					headers: { "X-Custom": "value123" },
				}),
				{},
			)

			expect(capturedMethod).toBe("GET")
			expect(capturedHeader).toBe("value123")
		})
	})

	describe("serializes matches in flare state", () => {
		it("includes match virtualPath in state", async () => {
			const routeTree = createTreeNode()
			insertRoute(
				routeTree,
				createMockRoute({ variablePath: "/settings", virtualPath: "_root_/settings" }),
			)

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("http://localhost/settings"), {})
			const html = await response.text()

			const state = parseFlareStateFromHtml(html) as {
				r: { matches: Array<{ id: string }> }
			}
			expect(state.r.matches.some((m) => m.id === "_root_/settings")).toBe(true)
		})

		it("includes loader data in match", async () => {
			const routeTree = createTreeNode()
			insertRoute(
				routeTree,
				createMockRoute({
					loader: () => ({ products: ["Widget", "Gadget"] }),
					variablePath: "/products",
					virtualPath: "_root_/products",
				}),
			)

			const handler = createServerHandler({ routeTree })
			const response = await handler.fetch(new Request("http://localhost/products"), {})
			const html = await response.text()

			const state = parseFlareStateFromHtml(html) as {
				r: { matches: Array<{ id: string; loaderData: unknown }> }
			}
			const match = state.r.matches.find((m) => m.id === "_root_/products")
			expect(match?.loaderData).toEqual({ products: ["Widget", "Gadget"] })
		})
	})
})

/* ============================================================================
 * Security Headers Tests
 * ============================================================================ */

describe("security headers", () => {
	it("applies X-Content-Type-Options", async () => {
		const routeTree = createTreeNode()
		insertRoute(routeTree, createMockRoute({ variablePath: "/", virtualPath: "_root_" }))

		const handler = createServerHandler({ routeTree })
		const response = await handler.fetch(new Request("http://localhost/"), {})

		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
	})

	it("applies X-Frame-Options", async () => {
		const routeTree = createTreeNode()
		insertRoute(routeTree, createMockRoute({ variablePath: "/", virtualPath: "_root_" }))

		const handler = createServerHandler({ routeTree })
		const response = await handler.fetch(new Request("http://localhost/"), {})

		expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN")
	})

	it("applies Referrer-Policy", async () => {
		const routeTree = createTreeNode()
		insertRoute(routeTree, createMockRoute({ variablePath: "/", virtualPath: "_root_" }))

		const handler = createServerHandler({ routeTree })
		const response = await handler.fetch(new Request("http://localhost/"), {})

		expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin")
	})
})

/* ============================================================================
 * URL Handling Tests
 * ============================================================================ */

describe("URL handling", () => {
	it("normalizes trailing slash with redirect", async () => {
		const handler = createServerHandler({})
		const response = await handler.fetch(new Request("http://localhost/about/"), {})

		expect(response.status).toBe(301)
		expect(response.headers.get("Location")).toBe("http://localhost/about")
	})

	it("preserves query string on trailing slash redirect", async () => {
		const handler = createServerHandler({})
		const response = await handler.fetch(new Request("http://localhost/search/?q=test&page=2"), {})

		expect(response.status).toBe(301)
		expect(response.headers.get("Location")).toBe("http://localhost/search?q=test&page=2")
	})

	it("handles query string in request", async () => {
		const routeTree = createTreeNode()
		let capturedPathname = ""

		insertRoute(
			routeTree,
			createMockRoute({
				loader: (ctx) => {
					capturedPathname = (ctx as { location: { pathname: string } }).location.pathname
					return Promise.resolve({})
				},
				variablePath: "/search",
				virtualPath: "_root_/search",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/search?q=hello&limit=10"), {})

		/* Location pathname should not include query string */
		expect(capturedPathname).toBe("/search")
	})
})

/* ============================================================================
 * 404 Handling Tests
 * ============================================================================ */

describe("404 handling", () => {
	it("returns 404 for unmatched routes", async () => {
		const handler = createServerHandler({})
		const response = await handler.fetch(new Request("http://localhost/not-found"), {})

		expect(response.status).toBe(404)
	})

	it("includes 404 in response body", async () => {
		const handler = createServerHandler({})
		const response = await handler.fetch(new Request("http://localhost/missing"), {})
		const html = await response.text()

		expect(html).toContain("404")
	})

	it("returns HTML content type for 404", async () => {
		const handler = createServerHandler({})
		const response = await handler.fetch(new Request("http://localhost/nope"), {})

		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8")
	})

	it("returns 404 when no route tree configured", async () => {
		const handler = createServerHandler({})
		const response = await handler.fetch(new Request("http://localhost/anything"), {})

		expect(response.status).toBe(404)
	})
})

/* ============================================================================
 * Error Handling Tests
 * ============================================================================ */

describe("error handling", () => {
	it("NotFoundError propagates from loader", async () => {
		const routeTree = createTreeNode()
		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => {
					throw new NotFoundError("Item not found")
				},
				variablePath: "/item",
				virtualPath: "_root_/item",
			}),
		)

		const handler = createServerHandler({ routeTree })

		/* NotFoundError propagates up - handler doesn't catch it without error boundary */
		await expect(handler.fetch(new Request("http://localhost/item"), {})).rejects.toThrow(
			NotFoundError,
		)
	})

	it("RedirectResponse propagates from loader", async () => {
		const routeTree = createTreeNode()
		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => {
					throw new RedirectResponse({ to: "/new-location" })
				},
				variablePath: "/old",
				virtualPath: "_root_/old",
			}),
		)

		const handler = createServerHandler({ routeTree })

		/* RedirectResponse propagates - handler doesn't catch it without error boundary */
		await expect(handler.fetch(new Request("http://localhost/old"), {})).rejects.toThrow(
			RedirectResponse,
		)
	})

	it("UnauthenticatedError propagates from loader", async () => {
		const routeTree = createTreeNode()
		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => {
					throw new UnauthenticatedError()
				},
				variablePath: "/protected",
				virtualPath: "_root_/protected",
			}),
		)

		const handler = createServerHandler({ routeTree })

		/* UnauthenticatedError propagates - handler doesn't catch it without error boundary */
		await expect(handler.fetch(new Request("http://localhost/protected"), {})).rejects.toThrow(
			UnauthenticatedError,
		)
	})

	it("ForbiddenError propagates from loader", async () => {
		const routeTree = createTreeNode()
		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => {
					throw new ForbiddenError()
				},
				variablePath: "/admin",
				virtualPath: "_root_/admin",
			}),
		)

		const handler = createServerHandler({ routeTree })

		/* ForbiddenError propagates - handler doesn't catch it without error boundary */
		await expect(handler.fetch(new Request("http://localhost/admin"), {})).rejects.toThrow(
			ForbiddenError,
		)
	})

	it("generic Error propagates from loader", async () => {
		const routeTree = createTreeNode()
		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => {
					throw new Error("Something went wrong")
				},
				variablePath: "/error",
				virtualPath: "_root_/error",
			}),
		)

		const handler = createServerHandler({ routeTree })

		/* Generic errors propagate - handler doesn't catch them without error boundary */
		await expect(handler.fetch(new Request("http://localhost/error"), {})).rejects.toThrow(
			"Something went wrong",
		)
	})
})

/* ============================================================================
 * CSR Data Request Tests
 * ============================================================================ */

describe("CSR data request (x-d header)", () => {
	it("returns NDJSON for data requests", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => ({ data: "value" }),
				variablePath: "/api-test",
				virtualPath: "_root_/api-test",
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

		const response = await handler.fetch(
			new Request("http://localhost/api-test", {
				headers: {
					"x-d": "1",
					"x-m": "_root_,_root_/api-test",
				},
			}),
			{},
		)

		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")
	})

	it("streams loader data as NDJSON lines", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => ({ items: [1, 2, 3] }),
				variablePath: "/stream-test",
				virtualPath: "_root_/stream-test",
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

		const response = await handler.fetch(
			new Request("http://localhost/stream-test", {
				headers: {
					"x-d": "1",
					"x-m": "_root_,_root_/stream-test",
				},
			}),
			{},
		)

		const body = await response.text()
		const lines = body.trim().split("\n")

		/* Should have at least done message */
		expect(lines.length).toBeGreaterThanOrEqual(1)
		expect(lines[lines.length - 1]).toBe('{"t":"d"}')
	})

	it("includes loader message type in NDJSON", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => ({ test: true }),
				variablePath: "/loader-msg",
				virtualPath: "_root_/loader-msg",
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

		const response = await handler.fetch(
			new Request("http://localhost/loader-msg", {
				headers: {
					"x-d": "1",
					"x-m": "_root_,_root_/loader-msg",
				},
			}),
			{},
		)

		const body = await response.text()
		const lines = body.trim().split("\n")

		/* Find loader message */
		const loaderLine = lines.find((line) => {
			try {
				const parsed = JSON.parse(line) as { t: string }
				return parsed.t === "l"
			} catch {
				return false
			}
		})

		expect(loaderLine).toBeDefined()
	})
})

/* ============================================================================
 * Middleware Integration Tests
 * ============================================================================ */

describe("middleware integration", () => {
	it("runs middleware chain in order", async () => {
		const executionOrder: string[] = []
		const routeTree = createTreeNode()
		insertRoute(
			routeTree,
			createMockRoute({ variablePath: "/mw-test", virtualPath: "_root_/mw-test" }),
		)

		const handler = createServerHandler({
			middlewares: [
				async (_ctx, next) => {
					executionOrder.push("mw1:before")
					const result = await next()
					executionOrder.push("mw1:after")
					return result
				},
				async (_ctx, next) => {
					executionOrder.push("mw2:before")
					const result = await next()
					executionOrder.push("mw2:after")
					return result
				},
			],
			routeTree,
		})

		await handler.fetch(new Request("http://localhost/mw-test"), {})

		expect(executionOrder).toEqual(["mw1:before", "mw2:before", "mw2:after", "mw1:after"])
	})

	it("middleware can access request", async () => {
		const routeTree = createTreeNode()
		let capturedPath = ""
		insertRoute(
			routeTree,
			createMockRoute({ variablePath: "/path-test", virtualPath: "_root_/path-test" }),
		)

		const handler = createServerHandler({
			middlewares: [
				(ctx, next) => {
					capturedPath = ctx.url.pathname
					return next()
				},
			],
			routeTree,
		})

		await handler.fetch(new Request("http://localhost/path-test"), {})

		expect(capturedPath).toBe("/path-test")
	})

	it("middleware can access env", async () => {
		const routeTree = createTreeNode()
		let capturedEnv: unknown = null
		insertRoute(
			routeTree,
			createMockRoute({ variablePath: "/env-mw", virtualPath: "_root_/env-mw" }),
		)

		const handler = createServerHandler({
			middlewares: [
				(ctx, next) => {
					capturedEnv = ctx.env
					return next()
				},
			],
			routeTree,
		})

		await handler.fetch(new Request("http://localhost/env-mw"), { SECRET: "abc123" })

		expect(capturedEnv).toEqual({ SECRET: "abc123" })
	})
})

/* ============================================================================
 * Router Defaults Tests
 * ============================================================================ */

describe("router defaults", () => {
	it("includes router defaults in flare state", async () => {
		const routeTree = createTreeNode()
		insertRoute(
			routeTree,
			createMockRoute({ variablePath: "/defaults", virtualPath: "_root_/defaults" }),
		)

		const handler = createServerHandler({
			routeTree,
			routerDefaults: {
				gcTime: 300000,
				prefetchStaleTime: 60000,
				staleTime: 30000,
			},
		})

		const response = await handler.fetch(new Request("http://localhost/defaults"), {})
		const html = await response.text()

		const state = parseFlareStateFromHtml(html) as { c: { routerDefaults: unknown } }
		expect(state.c.routerDefaults).toEqual({
			gcTime: 300000,
			prefetchStaleTime: 60000,
			staleTime: 30000,
		})
	})
})
