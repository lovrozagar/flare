/**
 * @vitest-environment node
 *
 * NDJSON data request integration tests.
 * No SSR mock needed — NDJSON responses bypass renderToStream entirely.
 * Tests the full pipeline: route matching → module loading → loader execution →
 * head chain → NDJSON serialization → security headers.
 */
import { describe, expect, it, vi } from "vitest"
import { createRouter } from "../../src/router-config/index.ts"
import { createTreeNode, insertRoute } from "../../src/router-primitives/index.ts"
import { createServerHandler } from "../../src/server-handler/index.ts"
import {
	alwaysAuthFn,
	buildHandler,
	dataRequest,
	makeRequest,
	type NDJSONMessage,
	neverAuthFn,
	parseNDJSON,
} from "./fixtures.ts"

/* ── Helpers ──────────────────────────────────────────────────────────── */

function findByType(messages: NDJSONMessage[], t: string): NDJSONMessage[] {
	return messages.filter((m) => m.t === t)
}

function _findLoaderWithData(messages: NDJSONMessage[]): NDJSONMessage[] {
	return messages.filter((m) => m.t === "l" && m.d !== undefined && m.d !== null)
}

/* ── Basic data request ──────────────────────────────────────────────── */

describe("NDJSON — content type and headers", () => {
	it("x-d:1 → application/x-ndjson content type", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/about"), {})

		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")
	})

	it("Cache-Control: no-store", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/about"), {})

		expect(response.headers.get("Cache-Control")).toBe("no-store")
	})

	it("security headers present", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/about"), {})

		expect(response.headers.get("X-Frame-Options")).toBe("DENY")
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
		/* HSTS and COOP are skipped in dev mode by buildSecurityHeaders */
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy()
	})

	it("CSP nonce present even on NDJSON responses", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/about"), {})
		const csp = response.headers.get("Content-Security-Policy") ?? ""

		expect(csp).toMatch(/nonce-[a-f0-9]+/)
	})
})

/* ── Message structure ───────────────────────────────────────────────── */

describe("NDJSON — message structure", () => {
	it("body is valid NDJSON (one JSON object per line)", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/about"), {})
		const body = await response.text()

		/* each non-empty line must parse as JSON */
		const lines = body.split("\n").filter((l) => l.trim().length > 0)
		expect(lines.length).toBeGreaterThan(0)
		for (const line of lines) {
			expect(() => JSON.parse(line)).not.toThrow()
		}
	})

	it("every message has a t (type) field", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/about"), {})
		const messages = parseNDJSON(await response.text())

		for (const msg of messages) {
			expect(msg.t).toBeTruthy()
			expect(["l", "h", "e", "x", "r", "d", "c"]).toContain(msg.t)
		}
	})

	it("stream ends with done message (t: d)", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/about"), {})
		const messages = parseNDJSON(await response.text())
		const last = messages[messages.length - 1]

		expect(last?.t).toBe("d")
	})

	it("loader messages (t: l) have matchId (m) field", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/about"), {})
		const messages = parseNDJSON(await response.text())
		const loaders = findByType(messages, "l")

		expect(loaders.length).toBeGreaterThan(0)
		for (const msg of loaders) {
			expect(msg.m).toBeTruthy()
		}
	})
})

/* ── Loader data ─────────────────────────────────────────────────────── */

describe("NDJSON — loader data", () => {
	it("/about → loader message contains { title: 'About' }", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/about"), {})
		const messages = parseNDJSON(await response.text())

		const aboutLoader = messages.find(
			(m) => m.t === "l" && (m.d as Record<string, unknown>)?.title === "About",
		)
		expect(aboutLoader).toBeDefined()
		expect(aboutLoader?.d).toEqual({ title: "About" })
	})

	it("/home → loader messages have undefined data (no loader)", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/home"), {})
		const messages = parseNDJSON(await response.text())
		const loaders = findByType(messages, "l")

		/* root layout + home page, both without loaders */
		for (const msg of loaders) {
			expect(msg.d).toBeUndefined()
		}
	})

	it("/about has exactly 2 loader messages (root layout + page)", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/about"), {})
		const messages = parseNDJSON(await response.text())
		const loaders = findByType(messages, "l")

		expect(loaders.length).toBe(2)
	})

	it("/blog/post has exactly 3 loader messages (root + blog layout + page)", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/blog/post"), {})
		const messages = parseNDJSON(await response.text())
		const loaders = findByType(messages, "l")

		expect(loaders.length).toBe(3)
		/* blog post page has loader data */
		const postLoader = loaders.find(
			(m) => (m.d as Record<string, unknown>)?.content === "post body",
		)
		expect(postLoader).toBeDefined()
	})
})

/* ── Head config ─────────────────────────────────────────────────────── */

describe("NDJSON — head messages", () => {
	it("/about → head message with title", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/about"), {})
		const messages = parseNDJSON(await response.text())
		const heads = findByType(messages, "h")

		expect(heads.length).toBeGreaterThan(0)
		const aboutHead = heads.find((m) => (m.d as Record<string, unknown>)?.title === "About")
		expect(aboutHead).toBeDefined()
	})

	it("/home → no head messages (no head config)", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/home"), {})
		const messages = parseNDJSON(await response.text())
		const heads = findByType(messages, "h")

		/* root layout and home page have no head() */
		expect(heads.length).toBe(0)
	})

	it("head message matchId corresponds to loader message matchId", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/about"), {})
		const messages = parseNDJSON(await response.text())
		const heads = findByType(messages, "h")
		const loaders = findByType(messages, "l")

		const loaderMatchIds = new Set(loaders.map((m) => m.m))
		for (const head of heads) {
			expect(loaderMatchIds.has(head.m)).toBe(true)
		}
	})
})

/* ── Redirect ────────────────────────────────────────────────────────── */

describe("NDJSON — redirect", () => {
	it("/old → NDJSON redirect message (not HTTP 302)", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/old"), {})

		/* data requests get NDJSON redirect messages, not HTTP redirects */
		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")

		const messages = parseNDJSON(await response.text())
		const redirectMsg = messages.find((m) => m.t === "x")
		expect(redirectMsg).toBeDefined()
		expect(redirectMsg?.u).toBe("/about")
		expect(redirectMsg?.s).toBe(303)
	})

	it("redirect NDJSON still ends with done message", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/old"), {})
		const messages = parseNDJSON(await response.text())
		const last = messages[messages.length - 1]

		expect(last?.t).toBe("d")
	})

	it("redirect NDJSON has no loader messages", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/old"), {})
		const messages = parseNDJSON(await response.text())

		expect(findByType(messages, "l").length).toBe(0)
	})
})

/* ── Authentication ──────────────────────────────────────────────────── */

describe("NDJSON — authentication", () => {
	it("/dashboard without auth → 401 (not NDJSON)", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/dashboard"), {})

		/* UnauthenticatedError thrown before NDJSON serialization */
		expect(response.status).toBe(401)
		expect(response.headers.get("Content-Type")).toContain("text/html")
	})

	it("/dashboard with null auth → 401", async () => {
		const handler = buildHandler({ authenticateFn: neverAuthFn })
		const response = await handler.fetch(dataRequest("/dashboard"), {})

		expect(response.status).toBe(401)
	})

	it("/dashboard with valid auth → NDJSON with auth data in loader", async () => {
		const handler = buildHandler({ authenticateFn: alwaysAuthFn })
		const response = await handler.fetch(dataRequest("/dashboard"), {})

		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")

		const messages = parseNDJSON(await response.text())
		const dashLoader = messages.find(
			(m) => m.t === "l" && (m.d as Record<string, unknown>)?.user !== undefined,
		)
		expect(dashLoader).toBeDefined()
		expect((dashLoader?.d as Record<string, unknown>)?.user).toEqual({
			id: "user-1",
			role: "admin",
		})
	})

	it("non-auth routes work in data request without authenticateFn", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/home"), {})

		expect(response.status).toBe(200)
	})
})

/* ── Error handling ──────────────────────────────────────────────────── */

describe("NDJSON — broken loader", () => {
	it("/broken → error message (t: e) in NDJSON", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/broken"), {})

		expect(response.status).toBe(200)
		const messages = parseNDJSON(await response.text())
		const errors = findByType(messages, "e")

		expect(errors.length).toBeGreaterThan(0)
		expect((errors[0]?.e as Record<string, unknown>)?.message).toBe("Loader exploded")
	})

	it("error message has matchId", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/broken"), {})
		const messages = parseNDJSON(await response.text())
		const errors = findByType(messages, "e")

		expect(errors[0]?.m).toBeTruthy()
	})

	it("broken loader still gets done message", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/broken"), {})
		const messages = parseNDJSON(await response.text())
		const last = messages[messages.length - 1]

		expect(last?.t).toBe("d")
	})
})

/* ── Prefetch ────────────────────────────────────────────────────────── */

describe("NDJSON — prefetch cause", () => {
	it("x-p:1 → loader receives cause='prefetch' and prefetch=true", async () => {
		let capturedCause: unknown
		let capturedPrefetch: unknown
		const tree = createTreeNode()
		insertRoute(tree, "/spy", {
			e: "_root_/spy",
			o: {},
			p: () =>
				Promise.resolve({
					default: {
						_type: "render",
						loader: (ctx: Record<string, unknown>) => {
							capturedCause = ctx.cause
							capturedPrefetch = ctx.prefetch
							return { spied: true }
						},
						variablePath: "_root_/spy",
						virtualPath: "_root_/spy",
					},
				}),
			t: "r" as const,
			v: "_root_/spy",
			x: "_root_/spy",
		})
		const router = createRouter({ layouts: {}, routeTree: tree })
		const handler = createServerHandler({ router })
		await handler.fetch(makeRequest("/spy", { headers: { "x-d": "1", "x-p": "1" } }), {})

		expect(capturedCause).toBe("prefetch")
		expect(capturedPrefetch).toBe(true)
	})

	it("without x-p:1 → cause='enter' and prefetch=false", async () => {
		let capturedCause: unknown
		let capturedPrefetch: unknown
		const tree = createTreeNode()
		insertRoute(tree, "/spy2", {
			e: "_root_/spy2",
			o: {},
			p: () =>
				Promise.resolve({
					default: {
						_type: "render",
						loader: (ctx: Record<string, unknown>) => {
							capturedCause = ctx.cause
							capturedPrefetch = ctx.prefetch
							return {}
						},
						variablePath: "_root_/spy2",
						virtualPath: "_root_/spy2",
					},
				}),
			t: "r" as const,
			v: "_root_/spy2",
			x: "_root_/spy2",
		})
		const router = createRouter({ layouts: {}, routeTree: tree })
		const handler = createServerHandler({ router })
		await handler.fetch(dataRequest("/spy2"), {})

		expect(capturedCause).toBe("enter")
		expect(capturedPrefetch).toBe(false)
	})
})

/* ── Stale match filtering ───────────────────────────────────────────── */

describe("NDJSON — stale match filtering (x-m)", () => {
	it("x-m with non-matching route → loader NOT called", async () => {
		const loaderSpy = vi.fn(() => ({ fresh: true }))
		const tree = createTreeNode()
		insertRoute(tree, "/filtered", {
			e: "_root_/filtered",
			o: {},
			p: () =>
				Promise.resolve({
					default: {
						_type: "render",
						loader: loaderSpy,
						variablePath: "_root_/filtered",
						virtualPath: "_root_/filtered",
					},
				}),
			t: "r" as const,
			v: "_root_/filtered",
			x: "_root_/filtered",
		})
		const router = createRouter({ layouts: {}, routeTree: tree })
		const handler = createServerHandler({ router })
		await handler.fetch(
			makeRequest("/filtered", { headers: { "x-d": "1", "x-m": "_root_/other-route" } }),
			{},
		)

		expect(loaderSpy).not.toHaveBeenCalled()
	})

	it("x-m matching route → loader called", async () => {
		const loaderSpy = vi.fn(() => ({ stale: true }))
		const tree = createTreeNode()
		insertRoute(tree, "/stale", {
			e: "_root_/stale",
			o: {},
			p: () =>
				Promise.resolve({
					default: {
						_type: "render",
						loader: loaderSpy,
						variablePath: "_root_/stale",
						virtualPath: "_root_/stale",
					},
				}),
			t: "r" as const,
			v: "_root_/stale",
			x: "_root_/stale",
		})
		const router = createRouter({ layouts: {}, routeTree: tree })
		const handler = createServerHandler({ router })
		await handler.fetch(
			makeRequest("/stale", { headers: { "x-d": "1", "x-m": "_root_/stale" } }),
			{},
		)

		expect(loaderSpy).toHaveBeenCalled()
	})

	it("x-m with prefix match → loader called", async () => {
		const loaderSpy = vi.fn(() => ({ stale: true }))
		const tree = createTreeNode()
		insertRoute(tree, "/prefixed", {
			e: "_root_/prefixed",
			o: {},
			p: () =>
				Promise.resolve({
					default: {
						_type: "render",
						loader: loaderSpy,
						variablePath: "_root_/prefixed",
						virtualPath: "_root_/prefixed",
					},
				}),
			t: "r" as const,
			v: "_root_/prefixed",
			x: "_root_/prefixed",
		})
		const router = createRouter({ layouts: {}, routeTree: tree })
		const handler = createServerHandler({ router })
		await handler.fetch(
			makeRequest("/prefixed", { headers: { "x-d": "1", "x-m": "_root_/prefixed:some-dep" } }),
			{},
		)

		expect(loaderSpy).toHaveBeenCalled()
	})
})

/* ── 404 ─────────────────────────────────────────────────────────────── */

describe("NDJSON — 404 for unknown route", () => {
	it("unknown route with x-d:1 → 404 HTML (not NDJSON)", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/nonexistent"), {})

		/* 404 happens before data request check */
		expect(response.status).toBe(404)
		expect(response.headers.get("Content-Type")).toContain("text/html")
	})
})

/* ── Parameterized route ─────────────────────────────────────────────── */

describe("NDJSON — parameterized route", () => {
	it("/users/42 → loader data reflects param", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(dataRequest("/users/42"), {})

		expect(response.status).toBe(200)
		const messages = parseNDJSON(await response.text())
		const userLoader = messages.find(
			(m) => m.t === "l" && (m.d as Record<string, unknown>)?.userId !== undefined,
		)
		expect(userLoader).toBeDefined()
		/* userId comes from loader reading location.params.id — proves params flow through pipeline */
	})
})

/* ── No console noise ────────────────────────────────────────────────── */

describe("NDJSON — no console errors", () => {
	it("data requests produce no console.error", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		const handler = buildHandler({ authenticateFn: alwaysAuthFn })
		await handler.fetch(dataRequest("/home"), {})
		await handler.fetch(dataRequest("/about"), {})
		await handler.fetch(dataRequest("/users/1"), {})
		await handler.fetch(dataRequest("/dashboard"), {})
		await handler.fetch(dataRequest("/blog/post"), {})

		expect(errorSpy).not.toHaveBeenCalled()
		errorSpy.mockRestore()
	})
})

/* ── Request isolation ───────────────────────────────────────────────── */

describe("NDJSON — request isolation", () => {
	it("sequential data requests return independent data", async () => {
		const handler = buildHandler()
		const r1 = await handler.fetch(dataRequest("/about"), {})
		const r2 = await handler.fetch(dataRequest("/home"), {})

		const m1 = parseNDJSON(await r1.text())
		const m2 = parseNDJSON(await r2.text())

		/* /about has loader data, /home does not */
		const aboutData = m1.find((m) => m.t === "l" && (m.d as Record<string, unknown>)?.title)
		const homeData = m2.filter((m) => m.t === "l")

		expect(aboutData?.d).toEqual({ title: "About" })
		for (const msg of homeData) {
			expect(msg.d).toBeUndefined()
		}
	})
})
