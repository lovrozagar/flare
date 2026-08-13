/**
 * Middleware Runner Unit Tests
 *
 * Tests middleware chain execution.
 * Sequential execution, early termination, response handlers.
 */

import { describe, expect, it } from "vitest"
import {
	createMiddlewareContext,
	type FlareMiddleware,
	type MiddlewareContext,
	runMiddlewares,
} from "../../../../src/server/_internal/middleware"

function createTestContext(
	overrides: Partial<MiddlewareContext<unknown>> = {},
): MiddlewareContext<unknown> {
	return createMiddlewareContext({
		env: {},
		nonce: "test-nonce",
		request: new Request("https://example.com"),
		url: new URL("https://example.com"),
		...overrides,
	})
}

describe("runMiddlewares", () => {
	describe("execution order", () => {
		it("executes middlewares in order", async () => {
			const order: number[] = []

			const mw1: FlareMiddleware = (_ctx, next) => {
				order.push(1)
				return next()
			}
			const mw2: FlareMiddleware = (_ctx, next) => {
				order.push(2)
				return next()
			}
			const mw3: FlareMiddleware = (_ctx, next) => {
				order.push(3)
				return next()
			}

			await runMiddlewares([mw1, mw2, mw3], createTestContext())

			expect(order).toEqual([1, 2, 3])
		})

		it("returns next when all middlewares complete", async () => {
			const mw: FlareMiddleware = (_ctx, next) => next()
			const result = await runMiddlewares([mw], createTestContext())
			expect(result.type).toBe("next")
		})

		it("returns next when no middlewares", async () => {
			const result = await runMiddlewares([], createTestContext())
			expect(result.type).toBe("next")
		})
	})

	describe("early termination", () => {
		it("stops on respond result", async () => {
			const order: number[] = []

			const mw1: FlareMiddleware = () => {
				order.push(1)
				return Promise.resolve({ response: new Response("Early"), type: "respond" as const })
			}
			const mw2: FlareMiddleware = (_ctx, next) => {
				order.push(2)
				return next()
			}

			const result = await runMiddlewares([mw1, mw2], createTestContext())

			expect(order).toEqual([1])
			expect(result.type).toBe("respond")
			if (result.type === "respond") {
				expect(await result.response.text()).toBe("Early")
			}
		})

		it("stops on bypass result", async () => {
			const order: number[] = []

			const mw1: FlareMiddleware = () => {
				order.push(1)
				return Promise.resolve({ response: new Response("Static"), type: "bypass" as const })
			}
			const mw2: FlareMiddleware = (_ctx, next) => {
				order.push(2)
				return next()
			}

			const result = await runMiddlewares([mw1, mw2], createTestContext())

			expect(order).toEqual([1])
			expect(result.type).toBe("bypass")
		})
	})

	describe("response handlers", () => {
		it("collects response handlers via onResponse", async () => {
			let handlerCalled = false
			const ctx = createTestContext()

			const mw: FlareMiddleware = (c, next) => {
				c.onResponse((response) => {
					handlerCalled = true
					return response
				})
				return next()
			}

			await runMiddlewares([mw], ctx)

			const response = new Response("test")
			await ctx.applyResponseHandlers(response)

			expect(handlerCalled).toBe(true)
		})

		it("calls response handlers in order", async () => {
			const order: number[] = []
			let ctx: MiddlewareContext<unknown> | undefined

			const mw1: FlareMiddleware = (c, next) => {
				ctx = c
				c.onResponse((r) => {
					order.push(1)
					return r
				})
				return next()
			}
			const mw2: FlareMiddleware = (c, next) => {
				c.onResponse((r) => {
					order.push(2)
					return r
				})
				return next()
			}

			await runMiddlewares([mw1, mw2], createTestContext())

			const response = new Response("test")
			if (ctx) {
				await ctx.applyResponseHandlers(response)
			}

			expect(order).toEqual([1, 2])
		})

		it("passes response through handler chain", async () => {
			let ctx: MiddlewareContext<unknown> | undefined

			const mw: FlareMiddleware = (c, next) => {
				ctx = c
				c.onResponse((r) => {
					const newResponse = new Response(r.body, r)
					newResponse.headers.set("X-Middleware-1", "value1")
					return newResponse
				})
				c.onResponse((r) => {
					const newResponse = new Response(r.body, r)
					newResponse.headers.set("X-Middleware-2", "value2")
					return newResponse
				})
				return next()
			}

			await runMiddlewares([mw], createTestContext())

			const response = new Response("test")
			const finalResponse = ctx ? await ctx.applyResponseHandlers(response) : response

			expect(finalResponse.headers.get("X-Middleware-1")).toBe("value1")
			expect(finalResponse.headers.get("X-Middleware-2")).toBe("value2")
		})
	})

	describe("server request context", () => {
		it("provides serverRequestContext to middlewares", async () => {
			let capturedCtx: MiddlewareContext<unknown> | undefined

			const mw: FlareMiddleware = (ctx, next) => {
				capturedCtx = ctx
				ctx.serverRequestContext.set("user", { id: "123" })
				return next()
			}

			await runMiddlewares([mw], createTestContext())

			expect(capturedCtx?.serverRequestContext.get("user")).toEqual({ id: "123" })
		})

		it("shares serverRequestContext between middlewares", async () => {
			let capturedValue: unknown

			const mw1: FlareMiddleware = (ctx, next) => {
				ctx.serverRequestContext.set("value", "from-mw1")
				return next()
			}
			const mw2: FlareMiddleware = (ctx, next) => {
				capturedValue = ctx.serverRequestContext.get("value")
				return next()
			}

			await runMiddlewares([mw1, mw2], createTestContext())

			expect(capturedValue).toBe("from-mw1")
		})
	})

	describe("error handling", () => {
		it("propagates middleware errors", async () => {
			const mw: FlareMiddleware = () => {
				return Promise.reject(new Error("Middleware error"))
			}

			await expect(runMiddlewares([mw], createTestContext())).rejects.toThrow("Middleware error")
		})

		it("propagates next() errors", async () => {
			const mw1: FlareMiddleware = (_ctx, next) => {
				return next()
			}
			const mw2: FlareMiddleware = () => {
				return Promise.reject(new Error("Inner error"))
			}

			await expect(runMiddlewares([mw1, mw2], createTestContext())).rejects.toThrow("Inner error")
		})
	})

	describe("async behavior", () => {
		it("handles async middlewares", async () => {
			const mw: FlareMiddleware = async (_ctx, next) => {
				await new Promise((r) => setTimeout(r, 10))
				return next()
			}

			const result = await runMiddlewares([mw], createTestContext())
			expect(result.type).toBe("next")
		})

		it("waits for previous middleware before calling next", async () => {
			const order: number[] = []

			const mw1: FlareMiddleware = async (_ctx, next) => {
				await new Promise((r) => setTimeout(r, 20))
				order.push(1)
				return next()
			}
			const mw2: FlareMiddleware = (_ctx, next) => {
				order.push(2)
				return next()
			}

			await runMiddlewares([mw1, mw2], createTestContext())

			expect(order).toEqual([1, 2])
		})
	})
})

describe("createMiddlewareContext", () => {
	it("creates context with request", () => {
		const request = new Request("https://example.com/test")
		const ctx = createMiddlewareContext({
			env: {},
			nonce: "test",
			request,
			url: new URL("https://example.com/test"),
		})
		expect(ctx.request).toBe(request)
	})

	it("creates context with URL", () => {
		const url = new URL("https://example.com/test")
		const ctx = createMiddlewareContext({
			env: {},
			nonce: "test",
			request: new Request("https://example.com"),
			url,
		})
		expect(ctx.url).toBe(url)
	})

	it("creates context with env", () => {
		const env = { API_KEY: "secret" }
		const ctx = createMiddlewareContext({
			env,
			nonce: "test",
			request: new Request("https://example.com"),
			url: new URL("https://example.com"),
		})
		expect(ctx.env).toBe(env)
	})

	it("creates context with nonce", () => {
		const ctx = createMiddlewareContext({
			env: {},
			nonce: "my-nonce",
			request: new Request("https://example.com"),
			url: new URL("https://example.com"),
		})
		expect(ctx.nonce).toBe("my-nonce")
	})
})
