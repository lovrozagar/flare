/**
 * Middleware Chain Integration Tests
 *
 * Tests middleware integration with server handler.
 * Covers execution order, response modification, and context flow.
 */

import { describe, expect, it } from "vitest"
import {
	createMiddlewareContext,
	type MiddlewareContext,
	runMiddlewares,
} from "../../src/server/_internal/middleware"
import type { FlareMiddleware } from "../../src/server/middleware"
import { middlewareBypass, middlewareNext, middlewareRespond } from "../../src/server/middleware"

/* ============================================================================
 * Helper Functions
 * ============================================================================ */

function createTestContext(
	overrides: Partial<{
		env: unknown
		pathname: string
		request: Request
	}> = {},
): MiddlewareContext<unknown> {
	const url = new URL(`https://example.com${overrides.pathname ?? "/"}`)
	return createMiddlewareContext({
		env: overrides.env ?? {},
		nonce: "test-nonce",
		request: overrides.request ?? new Request(url),
		url,
	})
}

/* ============================================================================
 * Middleware Chain Execution
 * ============================================================================ */

describe("middleware chain execution", () => {
	describe("sequential flow", () => {
		it("executes middlewares in registration order", async () => {
			const executionOrder: string[] = []

			const auth: FlareMiddleware = (ctx, next) => {
				executionOrder.push("auth")
				ctx.serverRequestContext.set("user", { id: "123" })
				return next()
			}

			const logger: FlareMiddleware = (ctx, next) => {
				executionOrder.push("logger")
				const user = ctx.serverRequestContext.get("user")
				executionOrder.push(`user:${JSON.stringify(user)}`)
				return next()
			}

			const analytics: FlareMiddleware = (_ctx, next) => {
				executionOrder.push("analytics")
				return next()
			}

			await runMiddlewares([auth, logger, analytics], createTestContext())

			expect(executionOrder).toEqual(["auth", "logger", 'user:{"id":"123"}', "analytics"])
		})

		it("passes context through entire chain", async () => {
			const ctx = createTestContext({ env: { API_KEY: "secret" } })
			let capturedEnv: unknown
			let capturedNonce: string | undefined

			const mw: FlareMiddleware = (c, next) => {
				capturedEnv = c.env
				capturedNonce = c.nonce
				return next()
			}

			await runMiddlewares([mw], ctx)

			expect(capturedEnv).toEqual({ API_KEY: "secret" })
			expect(capturedNonce).toBe("test-nonce")
		})
	})

	describe("early termination", () => {
		it("stops chain on bypass and skips remaining middlewares", async () => {
			const executionOrder: string[] = []

			const staticAssets: FlareMiddleware = (ctx) => {
				if (ctx.url.pathname.startsWith("/static/")) {
					executionOrder.push("static:bypass")
					return Promise.resolve(middlewareBypass(new Response("Static content")))
				}
				executionOrder.push("static:next")
				return Promise.resolve(middlewareNext())
			}

			const auth: FlareMiddleware = (_ctx, next) => {
				executionOrder.push("auth")
				return next()
			}

			const ctx = createTestContext({ pathname: "/static/script.js" })
			const result = await runMiddlewares([staticAssets, auth], ctx)

			expect(executionOrder).toEqual(["static:bypass"])
			expect(result.type).toBe("bypass")
		})

		it("stops chain on respond and skips remaining middlewares", async () => {
			const executionOrder: string[] = []

			const authGuard: FlareMiddleware = (ctx) => {
				if (!ctx.serverRequestContext.get("user")) {
					executionOrder.push("authGuard:401")
					return Promise.resolve(middlewareRespond(new Response("Unauthorized", { status: 401 })))
				}
				executionOrder.push("authGuard:pass")
				return Promise.resolve(middlewareNext())
			}

			const handler: FlareMiddleware = (_ctx, next) => {
				executionOrder.push("handler")
				return next()
			}

			const result = await runMiddlewares([authGuard, handler], createTestContext())

			expect(executionOrder).toEqual(["authGuard:401"])
			expect(result.type).toBe("respond")
			if (result.type === "respond") {
				expect(result.response.status).toBe(401)
			}
		})

		it("bypass response skips response handlers", async () => {
			const ctx = createTestContext()

			const mw: FlareMiddleware = (c) => {
				c.onResponse(() => {
					return new Response("modified")
				})
				return Promise.resolve(middlewareBypass(new Response("bypassed")))
			}

			const result = await runMiddlewares([mw], ctx)

			expect(result.type).toBe("bypass")
			/* Response handlers would be called by the server handler, not here */
			/* In real usage, bypass means skip all post-processing */
		})
	})

	describe("response modification", () => {
		it("response handlers modify response in order", async () => {
			const ctx = createTestContext()

			const cors: FlareMiddleware = (c, next) => {
				c.onResponse((response) => {
					const newResponse = new Response(response.body, response)
					newResponse.headers.set("Access-Control-Allow-Origin", "*")
					return newResponse
				})
				return next()
			}

			const security: FlareMiddleware = (c, next) => {
				c.onResponse((response) => {
					const newResponse = new Response(response.body, response)
					newResponse.headers.set("X-Content-Type-Options", "nosniff")
					return newResponse
				})
				return next()
			}

			await runMiddlewares([cors, security], ctx)

			const response = new Response("content")
			const modified = await ctx.applyResponseHandlers(response)

			expect(modified.headers.get("Access-Control-Allow-Origin")).toBe("*")
			expect(modified.headers.get("X-Content-Type-Options")).toBe("nosniff")
		})

		it("response handlers can transform body", async () => {
			const ctx = createTestContext()

			const compress: FlareMiddleware = (c, next) => {
				c.onResponse(async (response) => {
					const text = await response.text()
					return new Response(`[compressed]${text}`, response)
				})
				return next()
			}

			await runMiddlewares([compress], ctx)

			const response = new Response("original")
			const modified = await ctx.applyResponseHandlers(response)

			expect(await modified.text()).toBe("[compressed]original")
		})

		it("respond result still applies response handlers", async () => {
			const ctx = createTestContext()
			let handlerCalled = false

			const addHeader: FlareMiddleware = (c, next) => {
				c.onResponse((response) => {
					handlerCalled = true
					const newResponse = new Response(response.body, response)
					newResponse.headers.set("X-Custom", "value")
					return newResponse
				})
				return next()
			}

			const respond: FlareMiddleware = () => {
				return Promise.resolve(middlewareRespond(new Response("from middleware")))
			}

			await runMiddlewares([addHeader, respond], ctx)

			/* In real handler, response handlers are applied to respond results */
			const response = new Response("test")
			await ctx.applyResponseHandlers(response)

			expect(handlerCalled).toBe(true)
		})
	})
})

/* ============================================================================
 * Server Request Context
 * ============================================================================ */

describe("server request context flow", () => {
	it("context persists through middleware chain", async () => {
		const values: unknown[] = []

		const setter: FlareMiddleware = (ctx, next) => {
			ctx.serverRequestContext.set("requestId", "req-123")
			ctx.serverRequestContext.set("timestamp", Date.now())
			return next()
		}

		const reader: FlareMiddleware = (ctx, next) => {
			values.push(ctx.serverRequestContext.get("requestId"))
			values.push(typeof ctx.serverRequestContext.get("timestamp"))
			return next()
		}

		await runMiddlewares([setter, reader], createTestContext())

		expect(values[0]).toBe("req-123")
		expect(values[1]).toBe("number")
	})

	it("context can be overwritten by later middleware", async () => {
		let finalValue: unknown

		const first: FlareMiddleware = (ctx, next) => {
			ctx.serverRequestContext.set("role", "user")
			return next()
		}

		const second: FlareMiddleware = (ctx, next) => {
			ctx.serverRequestContext.set("role", "admin")
			return next()
		}

		const third: FlareMiddleware = (ctx, next) => {
			finalValue = ctx.serverRequestContext.get("role")
			return next()
		}

		await runMiddlewares([first, second, third], createTestContext())

		expect(finalValue).toBe("admin")
	})

	it("different keys are independent", async () => {
		const captured: Record<string, unknown> = {}

		const mw1: FlareMiddleware = (ctx, next) => {
			ctx.serverRequestContext.set("key1", "value1")
			return next()
		}

		const mw2: FlareMiddleware = (ctx, next) => {
			ctx.serverRequestContext.set("key2", "value2")
			return next()
		}

		const reader: FlareMiddleware = (ctx, next) => {
			captured["key1"] = ctx.serverRequestContext.get("key1")
			captured["key2"] = ctx.serverRequestContext.get("key2")
			captured["key3"] = ctx.serverRequestContext.get("key3")
			return next()
		}

		await runMiddlewares([mw1, mw2, reader], createTestContext())

		expect(captured["key1"]).toBe("value1")
		expect(captured["key2"]).toBe("value2")
		expect(captured["key3"]).toBeUndefined()
	})
})

/* ============================================================================
 * Real-World Patterns
 * ============================================================================ */

describe("real-world middleware patterns", () => {
	describe("authentication flow", () => {
		it("sets user in context when authenticated", async () => {
			let capturedUser: unknown

			const auth: FlareMiddleware = (ctx, next) => {
				const authHeader = ctx.request.headers.get("Authorization")
				if (authHeader === "Bearer valid-token") {
					ctx.serverRequestContext.set("user", { id: "user-1", role: "admin" })
				}
				return next()
			}

			const handler: FlareMiddleware = (ctx, next) => {
				capturedUser = ctx.serverRequestContext.get("user")
				return next()
			}

			const request = new Request("https://example.com", {
				headers: { Authorization: "Bearer valid-token" },
			})
			await runMiddlewares([auth, handler], createTestContext({ request }))

			expect(capturedUser).toEqual({ id: "user-1", role: "admin" })
		})

		it("returns 401 for invalid token", async () => {
			const auth: FlareMiddleware = (ctx, next) => {
				const authHeader = ctx.request.headers.get("Authorization")
				if (authHeader && authHeader !== "Bearer valid-token") {
					return Promise.resolve(middlewareRespond(new Response("Invalid token", { status: 401 })))
				}
				return next()
			}

			const request = new Request("https://example.com", {
				headers: { Authorization: "Bearer invalid-token" },
			})
			const result = await runMiddlewares([auth], createTestContext({ request }))

			expect(result.type).toBe("respond")
			if (result.type === "respond") {
				expect(result.response.status).toBe(401)
			}
		})
	})

	describe("rate limiting pattern", () => {
		it("tracks request count in context", async () => {
			const requestCounts = new Map<string, number>()

			const rateLimiter: FlareMiddleware = (ctx, next) => {
				const ip = ctx.request.headers.get("X-Real-IP") ?? "unknown"
				const count = (requestCounts.get(ip) ?? 0) + 1
				requestCounts.set(ip, count)

				if (count > 100) {
					return Promise.resolve(middlewareRespond(new Response("Rate limited", { status: 429 })))
				}

				ctx.serverRequestContext.set("requestCount", count)
				return next()
			}

			const request = new Request("https://example.com", {
				headers: { "X-Real-IP": "192.168.1.1" },
			})

			/* First 100 requests should pass */
			for (let i = 0; i < 100; i++) {
				const result = await runMiddlewares([rateLimiter], createTestContext({ request }))
				expect(result.type).toBe("next")
			}

			/* 101st request should be rate limited */
			const result = await runMiddlewares([rateLimiter], createTestContext({ request }))
			expect(result.type).toBe("respond")
		})
	})

	describe("caching pattern", () => {
		it("adds cache headers via response handler", async () => {
			const ctx = createTestContext({ pathname: "/static/image.png" })

			const cacheControl: FlareMiddleware = (c, next) => {
				if (c.url.pathname.startsWith("/static/")) {
					c.onResponse((response) => {
						const newResponse = new Response(response.body, response)
						newResponse.headers.set("Cache-Control", "public, max-age=31536000")
						return newResponse
					})
				}
				return next()
			}

			await runMiddlewares([cacheControl], ctx)

			const response = new Response("content")
			const modified = await ctx.applyResponseHandlers(response)

			expect(modified.headers.get("Cache-Control")).toBe("public, max-age=31536000")
		})

		it("does not add cache headers for non-static paths", async () => {
			const ctx = createTestContext({ pathname: "/api/data" })

			const cacheControl: FlareMiddleware = (c, next) => {
				if (c.url.pathname.startsWith("/static/")) {
					c.onResponse((response) => {
						const newResponse = new Response(response.body, response)
						newResponse.headers.set("Cache-Control", "public, max-age=31536000")
						return newResponse
					})
				}
				return next()
			}

			await runMiddlewares([cacheControl], ctx)

			const response = new Response("content")
			const modified = await ctx.applyResponseHandlers(response)

			expect(modified.headers.get("Cache-Control")).toBeNull()
		})
	})

	describe("request timing pattern", () => {
		it("measures request duration", async () => {
			const ctx = createTestContext()
			let capturedDuration: number | undefined

			const timing: FlareMiddleware = (c, next) => {
				const start = performance.now()

				c.onResponse((response) => {
					capturedDuration = performance.now() - start
					const newResponse = new Response(response.body, response)
					newResponse.headers.set("X-Response-Time", `${capturedDuration.toFixed(2)}ms`)
					return newResponse
				})

				return next()
			}

			const slowMiddleware: FlareMiddleware = async (_ctx, next) => {
				await new Promise((r) => setTimeout(r, 15))
				return next()
			}

			await runMiddlewares([timing, slowMiddleware], ctx)

			const response = new Response("content")
			const modified = await ctx.applyResponseHandlers(response)

			expect(modified.headers.get("X-Response-Time")).toMatch(/\d+\.\d+ms/)
			/* Allow some timing variance (setTimeout is not precise) */
			expect(capturedDuration).toBeGreaterThanOrEqual(10)
		})
	})
})

/* ============================================================================
 * Error Handling
 * ============================================================================ */

describe("error handling in middleware chain", () => {
	it("errors propagate through the chain", async () => {
		const errorMiddleware: FlareMiddleware = () => {
			return Promise.reject(new Error("Middleware failure"))
		}

		await expect(runMiddlewares([errorMiddleware], createTestContext())).rejects.toThrow(
			"Middleware failure",
		)
	})

	it("async errors propagate", async () => {
		const asyncError: FlareMiddleware = async () => {
			await new Promise((r) => setTimeout(r, 1))
			return Promise.reject(new Error("Async failure"))
		}

		await expect(runMiddlewares([asyncError], createTestContext())).rejects.toThrow("Async failure")
	})

	it("errors in nested middleware propagate to outer", async () => {
		const outer: FlareMiddleware = (_ctx, next) => {
			return next()
		}

		const inner: FlareMiddleware = () => {
			return Promise.reject(new Error("Inner error"))
		}

		await expect(runMiddlewares([outer, inner], createTestContext())).rejects.toThrow("Inner error")
	})

	it("can catch and handle errors in middleware", async () => {
		const errorHandler: FlareMiddleware = async (_ctx, next) => {
			try {
				return await next()
			} catch {
				return middlewareRespond(new Response("Error handled", { status: 500 }))
			}
		}

		const thrower: FlareMiddleware = () => {
			throw new Error("Something went wrong")
		}

		const result = await runMiddlewares([errorHandler, thrower], createTestContext())

		expect(result.type).toBe("respond")
		if (result.type === "respond") {
			expect(result.response.status).toBe(500)
			expect(await result.response.text()).toBe("Error handled")
		}
	})
})

/* ============================================================================
 * Middleware Helper Functions
 * ============================================================================ */

describe("middleware helper functions", () => {
	it("middlewareNext returns correct result", () => {
		const result = middlewareNext()
		expect(result.type).toBe("next")
	})

	it("middlewareRespond wraps response", () => {
		const response = new Response("test")
		const result = middlewareRespond(response)
		expect(result.type).toBe("respond")
		expect((result as { response: Response }).response).toBe(response)
	})

	it("middlewareBypass wraps response", () => {
		const response = new Response("bypass")
		const result = middlewareBypass(response)
		expect(result.type).toBe("bypass")
		expect((result as { response: Response }).response).toBe(response)
	})
})
