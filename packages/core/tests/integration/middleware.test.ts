/**
 * @vitest-environment node
 *
 * Middleware integration tests.
 * Tests middleware through the full server handler pipeline — bypass/respond/next,
 * response handlers, chain ordering, interaction with NDJSON + server fn paths.
 *
 * Mocks solid-js/web for SSR tests that go through renderToStream.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

const devRef = vi.hoisted(() => ({ current: true }))
vi.mock("virtual:flare-is-dev", () => ({
	get default() {
		return devRef.current
	},
}))

afterEach(() => {
	devRef.current = true
})

vi.mock("solid-js/web", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>()
	return {
		...actual,
		Hydration: (props: { children: unknown }) => props.children,
		NoHydration: (props: { children: unknown }) => props.children,
		renderToStream: (factory: () => unknown) => {
			const content = String(factory() ?? "")
			const html = `<html lang="en"><head><title>Flare</title></head><body>${content}</body></html>`
			return {
				pipeTo: (writable: WritableStream<string>) => {
					const writer = writable.getWriter()
					writer.write(html).then(() => writer.close())
				},
			}
		},
	}
})

vi.mock("../../src/theme", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>()
	return {
		...actual,
		ThemeProvider: (props: { children: unknown }) => props.children,
	}
})

vi.mock("../../src/direction", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>()
	return {
		...actual,
		DirectionProvider: (props: { children: unknown }) => props.children,
	}
})

vi.mock("../../src/broadcast/provider", () => ({
	BroadcastProvider: (props: { children: unknown }) => props.children,
}))

vi.mock("../../src/outlet", () => {
	let currentCtx: Record<string, unknown> = {}
	return {
		DepthContext: { id: Symbol("DepthContext") },
		FlareProvider: (props: {
			children: unknown
			matches: Array<{
				_type: string
				loaderData: unknown
				render?: (p: Record<string, unknown>) => unknown
				preloaderContext?: unknown
			}>
			params: Record<string, unknown>
		}) => {
			currentCtx = { matches: props.matches }
			return props.children
		},
		Outlet: () => {
			const matches = (currentCtx.matches ?? []) as Array<{
				_type: string
				loaderData: unknown
				preloaderContext?: unknown
				render?: (p: Record<string, unknown>) => unknown
			}>
			let content: unknown = null
			for (let i = matches.length - 1; i >= 0; i--) {
				const m = matches[i]
				if (!m?.render) continue
				const isPage = m._type === "render" || m._type === "response"
				const props: Record<string, unknown> = {
					loaderData: m.loaderData,
					preloaderContext: m.preloaderContext,
				}
				if (!isPage) props.children = content
				content = m.render(props)
			}
			return content
		},
		RouterContext: {
			Provider: (props: { children: unknown }) => props.children,
			id: Symbol("RouterContext"),
		},
		useRouter: () => ({}),
	}
})

const { buildHandler, dataRequest, makeRequest, parseNDJSON, readResponseBody } =
	await import("./fixtures")

/* ── Bypass ──────────────────────────────────────────────────────────── */

describe("middleware — bypass", () => {
	it("bypass returns raw response without security headers", async () => {
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async () => ({
							response: new Response("static asset", {
								headers: { "Content-Type": "text/plain" },
							}),
							type: "bypass" as const,
						}),
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/anything"), {})

		expect(response.status).toBe(200)
		expect(await readResponseBody(response)).toBe("static asset")
		expect(response.headers.get("Content-Security-Policy")).toBeNull()
		expect(response.headers.get("X-Frame-Options")).toBeNull()
		expect(response.headers.get("X-Content-Type-Options")).toBeNull()
	})

	it("bypass skips route matching — even valid routes bypassed", async () => {
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async () => ({
							response: new Response("intercepted"),
							type: "bypass" as const,
						}),
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/about"), {})

		expect(await readResponseBody(response)).toBe("intercepted")
		/* bypass returns raw response — no NDJSON content type, no FlareState */
		expect(response.headers.get("Content-Type")).not.toBe("application/x-ndjson")
	})

	it("bypass skips server fn routing", async () => {
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async () => ({
							response: new Response("blocked by mw"),
							type: "bypass" as const,
						}),
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/_fn/test/run", { method: "POST" }), {})

		expect(await readResponseBody(response)).toBe("blocked by mw")
	})
})

/* ── Respond ─────────────────────────────────────────────────────────── */

describe("middleware — respond", () => {
	it("respond returns response WITH security headers", async () => {
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async () => ({
							response: new Response("custom response", { status: 201 }),
							type: "respond" as const,
						}),
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/about"), {})

		expect(response.status).toBe(201)
		expect(await readResponseBody(response)).toBe("custom response")
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy()
		expect(response.headers.get("X-Frame-Options")).toBe("DENY")
	})

	it("respond does not run route loaders", async () => {
		const _loaderCalled = false
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async () => ({
							response: new Response("short-circuit"),
							type: "respond" as const,
						}),
					],
				},
			],
		})
		/* /about has a loader — but respond short-circuits before route handling */
		const response = await handler.fetch(makeRequest("/about"), {})

		expect(await readResponseBody(response)).toBe("short-circuit")
	})
})

/* ── Next ────────────────────────────────────────────────────────────── */

describe("middleware — next", () => {
	it("next continues to route handler — SSR path works", async () => {
		const handler = buildHandler({
			middlewareEntries: [{ middlewares: [async (ctx) => ctx.next()] }],
		})
		const response = await handler.fetch(makeRequest("/home"), {})

		expect(response.status).toBe(200)
		const html = await readResponseBody(response)
		expect(html).toContain("[home]")
		expect(html).toContain("[root-layout]")
	})

	it("next continues to route handler — NDJSON path works", async () => {
		const handler = buildHandler({
			middlewareEntries: [{ middlewares: [async (ctx) => ctx.next()] }],
		})
		const response = await handler.fetch(dataRequest("/about"), {})

		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")
		const messages = parseNDJSON(await response.text())
		const loader = messages.find(
			(m) => m.t === "l" && (m.d as Record<string, unknown>)?.title === "About",
		)
		expect(loader).toBeDefined()
	})

	it("next with no matching route → 404", async () => {
		const handler = buildHandler({
			middlewareEntries: [{ middlewares: [async (ctx) => ctx.next()] }],
		})
		const response = await handler.fetch(makeRequest("/nonexistent"), {})

		expect(response.status).toBe(404)
	})
})

/* ── Response handlers ───────────────────────────────────────────────── */

describe("middleware — response handlers", () => {
	it("onResponse handler modifies SSR response", async () => {
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							ctx.onResponse((res) => {
								const headers = new Headers(res.headers)
								headers.set("X-Middleware", "applied")
								return new Response(res.body, { headers, status: res.status })
							})
							return ctx.next()
						},
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/home"), {})

		expect(response.status).toBe(200)
		expect(response.headers.get("X-Middleware")).toBe("applied")
		const html = await readResponseBody(response)
		expect(html).toContain("[home]")
	})

	it("onResponse handler modifies NDJSON response", async () => {
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							ctx.onResponse((res) => {
								const headers = new Headers(res.headers)
								headers.set("X-Data-MW", "yes")
								return new Response(res.body, { headers, status: res.status })
							})
							return ctx.next()
						},
					],
				},
			],
		})
		const response = await handler.fetch(dataRequest("/about"), {})

		expect(response.headers.get("X-Data-MW")).toBe("yes")
		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")
	})

	it("multiple response handlers execute in registration order", async () => {
		const order: number[] = []
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							ctx.onResponse((res) => {
								order.push(1)
								return res
							})
							return ctx.next()
						},
						async (ctx) => {
							ctx.onResponse((res) => {
								order.push(2)
								return res
							})
							return ctx.next()
						},
					],
				},
			],
		})
		await handler.fetch(dataRequest("/home"), {})

		expect(order).toEqual([1, 2])
	})

	it("response handler can transform body", async () => {
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							ctx.onResponse(async (res) => {
								const text = await res.text()
								return new Response(text.toUpperCase(), {
									headers: res.headers,
									status: res.status,
								})
							})
							return ctx.next()
						},
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/home"), {})
		const html = await readResponseBody(response)

		expect(html).toContain("[HOME]")
		expect(html).toContain("[ROOT-LAYOUT]")
	})
})

/* ── Middleware chain ────────────────────────────────────────────────── */

describe("middleware — chain ordering", () => {
	it("middlewares execute in array order", async () => {
		const callOrder: string[] = []
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							callOrder.push("mw1-before")
							const result = await ctx.next()
							callOrder.push("mw1-after")
							return result
						},
						async (ctx) => {
							callOrder.push("mw2-before")
							const result = await ctx.next()
							callOrder.push("mw2-after")
							return result
						},
					],
				},
			],
		})
		await handler.fetch(dataRequest("/home"), {})

		expect(callOrder).toEqual(["mw1-before", "mw2-before", "mw2-after", "mw1-after"])
	})

	it("second middleware can short-circuit with respond", async () => {
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => ctx.next(),
						async () => ({
							response: new Response("mw2 responded"),
							type: "respond" as const,
						}),
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/about"), {})

		expect(await readResponseBody(response)).toBe("mw2 responded")
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy()
	})

	it("empty middlewares array → proceeds to handler", async () => {
		const handler = buildHandler({ middlewareEntries: [] })
		const response = await handler.fetch(dataRequest("/about"), {})

		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")
	})
})

/* ── Env + context access ────────────────────────────────────────────── */

describe("middleware — context access", () => {
	it("middleware receives env from handler.fetch", async () => {
		const envSpy = vi.fn()
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							envSpy(ctx.env)
							return {
								response: new Response("ok"),
								type: "respond" as const,
							}
						},
					],
				},
			],
		})
		const testEnv = { DB: "test-db", SECRET: "abc" }
		await handler.fetch(makeRequest("/"), testEnv)

		expect(envSpy).toHaveBeenCalledWith(testEnv)
	})

	it("middleware receives parsed URL", async () => {
		let capturedUrl: URL | undefined
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							capturedUrl = ctx.url
							return {
								response: new Response("ok"),
								type: "respond" as const,
							}
						},
					],
				},
			],
		})
		await handler.fetch(makeRequest("/about?q=test&page=2"), {})

		expect(capturedUrl?.pathname).toBe("/about")
		expect(capturedUrl?.searchParams.get("q")).toBe("test")
		expect(capturedUrl?.searchParams.get("page")).toBe("2")
	})

	it("middleware receives nonce", async () => {
		let capturedNonce: string | undefined
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							capturedNonce = ctx.nonce
							return {
								response: new Response("ok"),
								type: "respond" as const,
							}
						},
					],
				},
			],
		})
		await handler.fetch(makeRequest("/"), {})

		expect(capturedNonce).toBeTruthy()
		expect(capturedNonce).toMatch(/^[a-f0-9]+$/)
	})
})

/* ── Error in middleware ─────────────────────────────────────────────── */

describe("middleware — error handling", () => {
	it("middleware throwing → 500 with security headers", async () => {
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async () => {
							throw new Error("middleware crash")
						},
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/home"), {})

		expect(response.status).toBe(500)
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy()
	})

	it("dev mode shows error message in 500 body", async () => {
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async () => {
							throw new Error("dev crash message")
						},
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/home"), {})

		expect(response.status).toBe(500)
		const html = await readResponseBody(response)
		expect(html).toContain("dev crash message")
	})

	it("prod mode hides error message", async () => {
		devRef.current = false
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async () => {
							throw new Error("secret error info")
						},
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/home"), {})

		expect(response.status).toBe(500)
		const html = await readResponseBody(response)
		expect(html).not.toContain("secret error info")
		expect(html).toContain("Internal Server Error")
	})
})

/* ── No console noise ────────────────────────────────────────────────── */

describe("middleware — no console errors", () => {
	it("normal middleware flow produces no console.error", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							ctx.onResponse((res) => res)
							return ctx.next()
						},
					],
				},
			],
		})
		await handler.fetch(makeRequest("/home"), {})
		await handler.fetch(dataRequest("/about"), {})

		expect(errorSpy).not.toHaveBeenCalled()
		errorSpy.mockRestore()
	})
})

/* ── Mixed exit paths ──────────────────────────────────────────────── */

describe("middleware — mixed exit paths", () => {
	it("MW1 registers handler + next(), MW2 respond(): MW1 handler still runs", async () => {
		let mw1HandlerCalled = false
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							ctx.onResponse((res) => {
								mw1HandlerCalled = true
								const headers = new Headers(res.headers)
								headers.set("X-MW1", "yes")
								return new Response(res.body, { headers, status: res.status })
							})
							return ctx.next()
						},
						async () => ({
							response: new Response("mw2 short-circuit"),
							type: "respond" as const,
						}),
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/about"), {})

		expect(await readResponseBody(response)).toBe("mw2 short-circuit")
		/* onResponse handlers still execute even when downstream MW responds */
		expect(mw1HandlerCalled).toBe(true)
		expect(response.headers.get("X-MW1")).toBe("yes")
	})

	it("MW1 next() → MW2 next() → MW3 respond(): all handlers run", async () => {
		const order: number[] = []
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							ctx.onResponse((res) => {
								order.push(1)
								return res
							})
							return ctx.next()
						},
						async (ctx) => {
							ctx.onResponse((res) => {
								order.push(2)
								return res
							})
							return ctx.next()
						},
						async (ctx) => {
							ctx.onResponse((res) => {
								order.push(3)
								return res
							})
							return {
								response: new Response("mw3"),
								type: "respond" as const,
							}
						},
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/home"), {})

		expect(await readResponseBody(response)).toBe("mw3")
		expect(order).toEqual([1, 2, 3])
	})

	it("MW1 respond() without next(): MW2 never called, no handlers from MW2", async () => {
		let mw2Called = false
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async () => ({
							response: new Response("mw1 early"),
							type: "respond" as const,
						}),
						async (ctx) => {
							mw2Called = true
							return ctx.next()
						},
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/home"), {})

		expect(await readResponseBody(response)).toBe("mw1 early")
		expect(mw2Called).toBe(false)
	})
})

/* ── onResponse on 404 and error paths ─────────────────────────────── */

describe("middleware — response handlers on error paths", () => {
	it("onResponse NOT applied to unmatched route 404 (fallback path)", async () => {
		/* Unmatched routes return fallbackHtmlResponse directly, bypassing response handlers.
		 * This is by design — middleware handlers only apply when the request reaches the route pipeline. */
		let handlerCalled = false
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							ctx.onResponse(() => {
								handlerCalled = true
								return new Response("should not reach")
							})
							return ctx.next()
						},
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/nonexistent-page"), {})

		expect(response.status).toBe(404)
		expect(handlerCalled).toBe(false)
	})

	it("onResponse applied to matched route SSR response (200)", async () => {
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							ctx.onResponse((res) => {
								const headers = new Headers(res.headers)
								headers.set("X-MW-SSR", "applied")
								return new Response(res.body, { headers, status: res.status })
							})
							return ctx.next()
						},
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/about"), {})

		expect(response.status).toBe(200)
		expect(response.headers.get("X-MW-SSR")).toBe("applied")
	})
})

/* ── Middleware + serverContext mutation ─────────────────────────────── */

describe("middleware — serverContext mutation propagation", () => {
	it("middleware can write to serverContext, visible downstream", async () => {
		let capturedCtx: Record<string, unknown> | undefined
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							ctx.serverContext["requestId"] = "abc-123"
							return ctx.next()
						},
						async (ctx) => {
							capturedCtx = { ...ctx.serverContext }
							return ctx.next()
						},
					],
				},
			],
		})
		await handler.fetch(makeRequest("/home"), {})

		expect(capturedCtx?.["requestId"]).toBe("abc-123")
	})
})
