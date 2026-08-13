/**
 * @vitest-environment node
 *
 * Integration tests for `.response()` route builder.
 * Routes with `_type: "response"` must return the raw Response from the
 * route's `.response()` function — NO SSR, NO NDJSON wrapping.
 * Middleware (security headers, response handlers) still applies.
 */
import { describe, expect, it, vi } from "vitest"

/* ── Mock solid-js/web ───────────────────────────────────────────────── */

vi.mock("solid-js/web", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>()
	return {
		...actual,
		Hydration: (props: { children: unknown }) => props.children,
		NoHydration: (props: { children: unknown }) => props.children,
		renderToStream: () => {
			throw new Error("renderToStream must NOT be called for response routes")
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

vi.mock("../../src/outlet", () => ({
	DepthContext: { id: Symbol("DepthContext") },
	FlareProvider: (props: { children: unknown }) => props.children,
	Outlet: () => null,
	RouterContext: {
		Provider: (props: { children: unknown }) => props.children,
		id: Symbol("RouterContext"),
	},
}))

/* ── Imports (after mock) ────────────────────────────────────────────── */

const { buildHandler, makeRequest, readResponseBody } = await import("./fixtures")

/* ── Tests ───────────────────────────────────────────────────────────── */

describe("Response route — .response() returns raw Response", () => {
	it("returns the exact Content-Type from .response()", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(makeRequest("/sitemap.xml"), {})

		expect(response.headers.get("Content-Type")).toBe("application/xml")
	})

	it("body contains raw XML, not SSR HTML", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(makeRequest("/sitemap.xml"), {})
		const body = await readResponseBody(response)

		expect(body).toContain("<urlset")
		expect(body).not.toContain("<html")
		expect(body).not.toContain("text/html")
	})

	it("returns 200", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(makeRequest("/sitemap.xml"), {})

		expect(response.status).toBe(200)
	})

	it("security headers still applied", async () => {
		const handler = buildHandler()
		const response = await handler.fetch(makeRequest("/sitemap.xml"), {})

		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
	})

	it("middleware response handlers still run", async () => {
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						(ctx) => {
							ctx.onResponse((res) => {
								res.headers.set("X-Middleware-Ran", "yes")
								return res
							})
							return ctx.next()
						},
					],
				},
			],
		})
		const response = await handler.fetch(makeRequest("/sitemap.xml"), {})

		expect(response.headers.get("X-Middleware-Ran")).toBe("yes")
	})
})
