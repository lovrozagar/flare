/**
 * @vitest-environment node
 *
 * Tests createServer builder API.
 * Uses data requests (x-d header) to avoid SSR rendering.
 */
import { describe, expect, it, vi } from "vitest"
import type { MiddlewareContext } from "../../../src/middleware/index.ts"

vi.mock("virtual:flare-is-dev", () => ({ default: true }))

import { createServer } from "../../../src/server/index.ts"
import { buildRouter } from "../../integration/fixtures.ts"

function dataReq(path: string): Request {
	return new Request(`http://localhost${path}`, {
		headers: { "x-d": "1" },
	})
}

describe("createServer()", () => {
	it("returns object with fetch", () => {
		const server = createServer(buildRouter())
		expect(typeof server.fetch).toBe("function")
	})

	it(".fetch() returns a Response", async () => {
		const server = createServer(buildRouter())
		const response = await server.fetch(dataReq("/home"))
		expect(response).toBeInstanceOf(Response)
		expect(response.status).toBe(200)
	})

	it("builder methods return chainable builder", () => {
		const server = createServer(buildRouter())
			.use(async (ctx: MiddlewareContext) => ctx.next())
			.authenticateFn(() => null)
			.serverContext(() => ({}))
			.cache({})
			.security({})
			.keepalive({ interval: 5000 })
			.sitemap({ engines: {}, secret: "s", sitemapUrl: "http://localhost/sitemap.xml" })

		expect(typeof server.fetch).toBe("function")
	})

	it(".use() and .mount() are always available", () => {
		const server = createServer(buildRouter())
			.use(async (ctx: MiddlewareContext) => ctx.next())
			.authenticateFn(() => null)
			.serverContext(() => ({}))

		expect(typeof server.use).toBe("function")
		expect(typeof server.mount).toBe("function")
	})

	it("once-only methods are callable", () => {
		const server = createServer(buildRouter())
		expect(typeof server.authenticateFn).toBe("function")
		expect(typeof server.serverContext).toBe("function")
		expect(typeof server.cache).toBe("function")
		expect(typeof server.security).toBe("function")
		expect(typeof server.keepalive).toBe("function")
		expect(typeof server.sitemap).toBe("function")
	})

	it("passes env to serverContext", async () => {
		let receivedEnv: unknown
		const server = createServer(buildRouter()).serverContext(({ env }) => {
			receivedEnv = env
			return {}
		})

		const testEnv = { SECRET: "abc" }
		await server.fetch(dataReq("/home"), testEnv)
		expect(receivedEnv).toBe(testEnv)
	})

	it("authenticateFn receives request context", async () => {
		let receivedUrl: string | undefined
		const server = createServer(buildRouter()).authenticateFn(({ url }) => {
			receivedUrl = url.pathname
			return { id: "user-1" }
		})

		/* /dashboard has .authenticate() set — triggers authenticateFn */
		await server.fetch(dataReq("/dashboard"))
		expect(receivedUrl).toBe("/dashboard")
	})

	it(".use() middleware runs on fetch", async () => {
		let middlewareRan = false
		const server = createServer(buildRouter()).use(async (ctx: MiddlewareContext) => {
			middlewareRan = true
			return ctx.next()
		})

		await server.fetch(dataReq("/home"))
		expect(middlewareRan).toBe(true)
	})

	it("multiple .use() middlewares run in order", async () => {
		const order: number[] = []
		const server = createServer(buildRouter())
			.use(async (ctx: MiddlewareContext) => {
				order.push(1)
				return ctx.next()
			})
			.use(async (ctx: MiddlewareContext) => {
				order.push(2)
				return ctx.next()
			})

		await server.fetch(dataReq("/home"))
		expect(order).toEqual([1, 2])
	})

	it("multiple middlewares in single .use() call", async () => {
		const order: number[] = []
		const server = createServer(buildRouter()).use(
			async (ctx: MiddlewareContext) => {
				order.push(1)
				return ctx.next()
			},
			async (ctx: MiddlewareContext) => {
				order.push(2)
				return ctx.next()
			},
		)

		await server.fetch(dataReq("/home"))
		expect(order).toEqual([1, 2])
	})

	it("keepalive endpoint returns 204", async () => {
		const server = createServer(buildRouter()).keepalive({ interval: 5000 })

		const response = await server.fetch(
			new Request("http://localhost/_flare/keepalive", { method: "GET" }),
		)
		expect(response.status).toBe(204)
	})
})
