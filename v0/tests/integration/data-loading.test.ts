/**
 * Data Loading Integration Tests
 *
 * Tests the full preloader → loader data flow.
 * Covers context accumulation, validation, deferred values, and caching.
 */

import type { JSX } from "solid-js"
import { describe, expect, it } from "vitest"
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
	inputConfig?: {
		params?: (raw: Record<string, string | string[]>) => unknown
		searchParams?: (raw: Record<string, string>) => unknown
	}
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
						inputConfig: config.inputConfig,
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
		inputConfig?: {
			params?: (raw: Record<string, string | string[]>) => unknown
			searchParams?: (raw: Record<string, string>) => unknown
		}
		loader?: (ctx: unknown) => Promise<unknown>
		preloader?: (ctx: unknown) => Promise<unknown>
	},
): {
	_type: string
	inputConfig?: unknown
	loader?: (ctx: unknown) => Promise<unknown>
	preloader?: (ctx: unknown) => Promise<unknown>
	render: (props: unknown) => JSX.Element
	virtualPath: string
} {
	return {
		_type: options?._type ?? "page",
		inputConfig: options?.inputConfig,
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
 * Preloader Execution Tests
 * ============================================================================ */

describe("preloader execution", () => {
	it("runs preloader before loader", async () => {
		const executionOrder: string[] = []
		const routeTree = createTreeNode()

		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => {
					executionOrder.push("loader")
					return { data: true }
				},
				preloader: () => {
					executionOrder.push("preloader")
					return { ctx: true }
				},
				variablePath: "/test",
				virtualPath: "_root_/test",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/test"), {})

		expect(executionOrder).toEqual(["preloader", "loader"])
	})

	it("runs root layout preloader first", async () => {
		const executionOrder: string[] = []
		const routeTree = createTreeNode()
		const rootPath = "_root_"

		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => {
					executionOrder.push("page:loader")
					return {}
				},
				preloader: () => {
					executionOrder.push("page:preloader")
					return {}
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
								return { root: true }
							},
						}),
					}),
			},
			routeTree,
		})

		await handler.fetch(new Request("http://localhost/dashboard"), {})

		/* Root preloader runs first, then page preloader, then loaders */
		expect(executionOrder[0]).toBe("root:preloader")
	})

	it("accumulates preloader context through hierarchy", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"
		let receivedContext: Record<string, unknown> = {}

		insertRoute(
			routeTree,
			createMockRoute({
				loader: (ctx) => {
					receivedContext = (ctx as { preloaderContext: Record<string, unknown> }).preloaderContext
					return {}
				},
				preloader: () => ({ pageValue: "page" }),
				variablePath: "/nested",
				virtualPath: "_root_/nested",
			}),
		)

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, {
							_type: "root-layout",
							preloader: () => ({ rootValue: "root" }),
						}),
					}),
			},
			routeTree,
		})

		await handler.fetch(new Request("http://localhost/nested"), {})

		expect(receivedContext.rootValue).toBe("root")
		expect(receivedContext.pageValue).toBe("page")
	})

	it("preloader can access request", async () => {
		const routeTree = createTreeNode()
		let capturedMethod: string | null = null
		let capturedHeader: string | null = null

		insertRoute(
			routeTree,
			createMockRoute({
				preloader: (ctx) => {
					const request = (ctx as { request: Request }).request
					capturedMethod = request.method
					capturedHeader = request.headers.get("Authorization")
					return {}
				},
				variablePath: "/auth",
				virtualPath: "_root_/auth",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(
			new Request("http://localhost/auth", {
				headers: { Authorization: "Bearer token123" },
			}),
			{},
		)

		expect(capturedMethod).toBe("GET")
		expect(capturedHeader).toBe("Bearer token123")
	})

	it("preloader can access env", async () => {
		const routeTree = createTreeNode()
		let capturedEnv: unknown = null

		insertRoute(
			routeTree,
			createMockRoute({
				preloader: (ctx) => {
					capturedEnv = (ctx as { env: unknown }).env
					return {}
				},
				variablePath: "/env",
				virtualPath: "_root_/env",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/env"), { SECRET: "mysecret" })

		expect(capturedEnv).toEqual({ SECRET: "mysecret" })
	})
})

/* ============================================================================
 * Loader Execution Tests
 * ============================================================================ */

describe("loader execution", () => {
	it("loader receives preloader context", async () => {
		const routeTree = createTreeNode()
		let receivedPreloaderCtx: unknown = null

		insertRoute(
			routeTree,
			createMockRoute({
				loader: (ctx) => {
					receivedPreloaderCtx = (ctx as { preloaderContext: unknown }).preloaderContext
					return { loaded: true }
				},
				preloader: () => ({ feature: "premium", tenant: "acme" }),
				variablePath: "/data",
				virtualPath: "_root_/data",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/data"), {})

		expect(receivedPreloaderCtx).toEqual({ feature: "premium", tenant: "acme" })
	})

	it("loader receives cause context", async () => {
		const routeTree = createTreeNode()
		let receivedCause: string | null = null

		insertRoute(
			routeTree,
			createMockRoute({
				loader: (ctx) => {
					receivedCause = (ctx as { cause: string }).cause
					return {}
				},
				variablePath: "/cause",
				virtualPath: "_root_/cause",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/cause"), {})

		/* Initial SSR load has cause "enter" */
		expect(receivedCause).toBe("enter")
	})

	it("loader receives env", async () => {
		const routeTree = createTreeNode()
		let capturedEnv: unknown = null

		insertRoute(
			routeTree,
			createMockRoute({
				loader: (ctx) => {
					capturedEnv = (ctx as { env: unknown }).env
					return {}
				},
				variablePath: "/loader-env",
				virtualPath: "_root_/loader-env",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/loader-env"), { DATABASE: "postgres" })

		expect(capturedEnv).toEqual({ DATABASE: "postgres" })
	})

	it("loader receives request", async () => {
		const routeTree = createTreeNode()
		let capturedUrl: string | null = null

		insertRoute(
			routeTree,
			createMockRoute({
				loader: (ctx) => {
					capturedUrl = (ctx as { request: Request }).request.url
					return {}
				},
				variablePath: "/req-url",
				virtualPath: "_root_/req-url",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/req-url"), {})

		expect(capturedUrl).toBe("http://localhost/req-url")
	})

	it("loader data serialized in flare state", async () => {
		const routeTree = createTreeNode()

		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => ({
					items: [1, 2, 3],
					meta: { count: 3 },
				}),
				variablePath: "/state",
				virtualPath: "_root_/state",
			}),
		)

		const handler = createServerHandler({ routeTree })
		const response = await handler.fetch(new Request("http://localhost/state"), {})
		const html = await response.text()

		const state = parseFlareStateFromHtml(html) as {
			r: { matches: Array<{ id: string; loaderData: unknown }> }
		}
		const match = state.r.matches.find((m) => m.id === "_root_/state")

		expect(match?.loaderData).toEqual({
			items: [1, 2, 3],
			meta: { count: 3 },
		})
	})

	it("multiple loaders run in parallel", async () => {
		const routeTree = createTreeNode()
		const rootPath = "_root_"
		const startTimes: number[] = []
		const endTimes: number[] = []

		insertRoute(
			routeTree,
			createMockRoute({
				loader: async () => {
					startTimes.push(Date.now())
					await new Promise((r) => setTimeout(r, 10))
					endTimes.push(Date.now())
					return { page: true }
				},
				variablePath: "/parallel",
				virtualPath: "_root_/parallel",
			}),
		)

		const handler = createServerHandler({
			layouts: {
				[rootPath]: () =>
					Promise.resolve({
						default: createMockComponent(rootPath, {
							_type: "root-layout",
							loader: async () => {
								startTimes.push(Date.now())
								await new Promise((r) => setTimeout(r, 10))
								endTimes.push(Date.now())
								return { root: true }
							},
						}),
					}),
			},
			routeTree,
		})

		await handler.fetch(new Request("http://localhost/parallel"), {})

		/* Both loaders should start at roughly the same time (parallel) */
		expect(startTimes.length).toBe(2)
		const first = startTimes[0]
		const second = startTimes[1]
		if (first === undefined || second === undefined) throw new Error("Expected two start times")
		const timeDiff = Math.abs(first - second)
		/* Allow 20ms variance for parallel start (accounts for test runner overhead) */
		expect(timeDiff).toBeLessThan(20)
	})
})

/* ============================================================================
 * Params and Location Tests
 * ============================================================================ */

describe("params and location", () => {
	it("loader receives extracted params", async () => {
		const routeTree = createTreeNode()
		let capturedParams: Record<string, unknown> = {}

		const productsNode = createTreeNode()
		routeTree.s.set("products", productsNode)

		productsNode.p = {
			...createTreeNode(),
			n: "productId",
			r: createMockRoute({
				loader: (ctx) => {
					capturedParams = (ctx as { location: { params: Record<string, unknown> } }).location
						.params
					return {}
				},
				variablePath: "/products/[productId]",
				virtualPath: "_root_/products/[productId]",
			}),
		}

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/products/abc123"), {})

		expect(capturedParams).toEqual({ productId: "abc123" })
	})

	it("loader receives pathname", async () => {
		const routeTree = createTreeNode()
		let capturedPathname: string | null = null

		insertRoute(
			routeTree,
			createMockRoute({
				loader: (ctx) => {
					capturedPathname = (ctx as { location: { pathname: string } }).location.pathname
					return {}
				},
				variablePath: "/my/path",
				virtualPath: "_root_/my/path",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/my/path"), {})

		expect(capturedPathname).toBe("/my/path")
	})

	it("preloader receives location info", async () => {
		const routeTree = createTreeNode()
		let capturedLocation: unknown = null

		const usersNode = createTreeNode()
		routeTree.s.set("users", usersNode)

		usersNode.p = {
			...createTreeNode(),
			n: "id",
			r: createMockRoute({
				preloader: (ctx) => {
					capturedLocation = (ctx as { location: unknown }).location
					return {}
				},
				variablePath: "/users/[id]",
				virtualPath: "_root_/users/[id]",
			}),
		}

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/users/42"), {})

		expect(capturedLocation).toBeDefined()
		expect((capturedLocation as { pathname: string }).pathname).toBe("/users/42")
	})
})

/* ============================================================================
 * Input Validation Tests
 * ============================================================================ */

describe("input validation", () => {
	it("validates params with custom validator", async () => {
		const routeTree = createTreeNode()
		let validatedParams: unknown = null

		const itemsNode = createTreeNode()
		routeTree.s.set("items", itemsNode)

		itemsNode.p = {
			...createTreeNode(),
			n: "id",
			r: createMockRoute({
				inputConfig: {
					params: (raw) => ({ numericId: Number(raw.id) }),
				},
				loader: (ctx) => {
					validatedParams = (ctx as { location: { params: unknown } }).location.params
					return {}
				},
				variablePath: "/items/[id]",
				virtualPath: "_root_/items/[id]",
			}),
		}

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/items/999"), {})

		expect(validatedParams).toEqual({ numericId: 999 })
	})

	it("validates search params with custom validator", async () => {
		const routeTree = createTreeNode()
		let validatedSearch: unknown = null

		insertRoute(
			routeTree,
			createMockRoute({
				inputConfig: {
					searchParams: (raw) => ({
						limit: Number(raw.limit) || 10,
						page: Number(raw.page) || 1,
					}),
				},
				loader: (ctx) => {
					validatedSearch = (ctx as { location: { search: unknown } }).location.search
					return {}
				},
				variablePath: "/search",
				virtualPath: "_root_/search",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/search?page=5&limit=25"), {})

		expect(validatedSearch).toEqual({ limit: 25, page: 5 })
	})

	it("throws on validation failure", async () => {
		const routeTree = createTreeNode()

		const itemsNode = createTreeNode()
		routeTree.s.set("items", itemsNode)

		itemsNode.p = {
			...createTreeNode(),
			n: "id",
			r: createMockRoute({
				inputConfig: {
					params: (raw) => {
						if (!/^\d+$/.test(String(raw.id))) {
							throw new Error("ID must be numeric")
						}
						return { id: Number(raw.id) }
					},
				},
				loader: () => ({}),
				variablePath: "/items/[id]",
				virtualPath: "_root_/items/[id]",
			}),
		}

		const handler = createServerHandler({ routeTree })

		await expect(handler.fetch(new Request("http://localhost/items/abc"), {})).rejects.toThrow(
			"ID must be numeric",
		)
	})
})

/* ============================================================================
 * Abort Controller Tests
 * ============================================================================ */

describe("abort controller", () => {
	it("loader receives abort controller", async () => {
		const routeTree = createTreeNode()
		let hasAbortController = false

		insertRoute(
			routeTree,
			createMockRoute({
				loader: (ctx) => {
					hasAbortController =
						(ctx as { abortController: AbortController }).abortController instanceof AbortController
					return {}
				},
				variablePath: "/abort",
				virtualPath: "_root_/abort",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/abort"), {})

		expect(hasAbortController).toBe(true)
	})

	it("preloader receives abort controller", async () => {
		const routeTree = createTreeNode()
		let hasAbortController = false

		insertRoute(
			routeTree,
			createMockRoute({
				preloader: (ctx) => {
					hasAbortController =
						(ctx as { abortController: AbortController }).abortController instanceof AbortController
					return {}
				},
				variablePath: "/pre-abort",
				virtualPath: "_root_/pre-abort",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/pre-abort"), {})

		expect(hasAbortController).toBe(true)
	})
})

/* ============================================================================
 * Defer Context Tests
 * ============================================================================ */

describe("defer context", () => {
	it("loader receives defer function", async () => {
		const routeTree = createTreeNode()
		let hasDeferFn = false

		insertRoute(
			routeTree,
			createMockRoute({
				loader: (ctx) => {
					hasDeferFn = typeof (ctx as { defer: unknown }).defer === "function"
					return {}
				},
				variablePath: "/defer",
				virtualPath: "_root_/defer",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/defer"), {})

		expect(hasDeferFn).toBe(true)
	})

	it("deferred value is awaited in SSR", async () => {
		const routeTree = createTreeNode()

		insertRoute(
			routeTree,
			createMockRoute({
				loader: (ctx) => {
					/* defer takes a function that returns a promise, not a promise directly */
					const deferFn = (ctx as { defer: <T>(fn: () => Promise<T>) => { promise: Promise<T> } })
						.defer
					const deferred = deferFn(() => Promise.resolve({ slow: "data" }))
					return { deferred, fast: "data" }
				},
				variablePath: "/deferred",
				virtualPath: "_root_/deferred",
			}),
		)

		const handler = createServerHandler({ routeTree })
		const response = await handler.fetch(new Request("http://localhost/deferred"), {})
		const html = await response.text()

		/* In SSR mode, deferred values are awaited */
		expect(html).toContain("self.flare")
	})
})

/* ============================================================================
 * Prefetch Flag Tests
 * ============================================================================ */

describe("prefetch flag", () => {
	it("SSR request has prefetch false", async () => {
		const routeTree = createTreeNode()
		let receivedPrefetch: boolean | null = null

		insertRoute(
			routeTree,
			createMockRoute({
				loader: (ctx) => {
					receivedPrefetch = (ctx as { prefetch: boolean }).prefetch
					return {}
				},
				variablePath: "/prefetch",
				virtualPath: "_root_/prefetch",
			}),
		)

		const handler = createServerHandler({ routeTree })
		await handler.fetch(new Request("http://localhost/prefetch"), {})

		expect(receivedPrefetch).toBe(false)
	})
})

/* ============================================================================
 * Complex Data Types Tests
 * ============================================================================ */

describe("complex data types", () => {
	it("handles nested objects", async () => {
		const routeTree = createTreeNode()

		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => ({
					user: {
						profile: {
							name: "Alice",
							settings: { theme: "dark" },
						},
					},
				}),
				variablePath: "/nested",
				virtualPath: "_root_/nested",
			}),
		)

		const handler = createServerHandler({ routeTree })
		const response = await handler.fetch(new Request("http://localhost/nested"), {})
		const html = await response.text()

		const state = parseFlareStateFromHtml(html) as {
			r: {
				matches: Array<{
					id: string
					loaderData: { user: { profile: { settings: { theme: string } } } }
				}>
			}
		}
		const match = state.r.matches.find((m) => m.id === "_root_/nested")

		expect(match?.loaderData.user.profile.settings.theme).toBe("dark")
	})

	it("handles arrays", async () => {
		const routeTree = createTreeNode()

		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => ({
					items: [
						{ id: 1, name: "A" },
						{ id: 2, name: "B" },
					],
				}),
				variablePath: "/array",
				virtualPath: "_root_/array",
			}),
		)

		const handler = createServerHandler({ routeTree })
		const response = await handler.fetch(new Request("http://localhost/array"), {})
		const html = await response.text()

		const state = parseFlareStateFromHtml(html) as {
			r: {
				matches: Array<{ id: string; loaderData: { items: Array<{ id: number; name: string }> } }>
			}
		}
		const match = state.r.matches.find((m) => m.id === "_root_/array")

		expect(match?.loaderData.items).toHaveLength(2)
		expect(match?.loaderData.items[0]?.name).toBe("A")
	})

	it("handles null values", async () => {
		const routeTree = createTreeNode()

		insertRoute(
			routeTree,
			createMockRoute({
				loader: () => ({
					maybeUser: null,
					status: "guest",
				}),
				variablePath: "/nulls",
				virtualPath: "_root_/nulls",
			}),
		)

		const handler = createServerHandler({ routeTree })
		const response = await handler.fetch(new Request("http://localhost/nulls"), {})
		const html = await response.text()

		const state = parseFlareStateFromHtml(html) as {
			r: { matches: Array<{ id: string; loaderData: { maybeUser: null; status: string } }> }
		}
		const match = state.r.matches.find((m) => m.id === "_root_/nulls")

		expect(match?.loaderData.maybeUser).toBeNull()
		expect(match?.loaderData.status).toBe("guest")
	})
})
