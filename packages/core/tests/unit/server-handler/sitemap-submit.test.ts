/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createRouter, type MarkedRouterConfig } from "../../../src/router-config/index.ts"
import type { RouteData } from "../../../src/router-primitives/index.ts"
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts"
import { createServerHandler, type ServerHandlerConfig } from "../../../src/server-handler/index.ts"

/* ── Mocks ───────────────────────────────────────────────────────── */

vi.mock("../../../src/search-engine/google", () => ({
	submitSitemapToGoogle: vi.fn(async () => ({ ok: true })),
}))

vi.mock("../../../src/search-engine/bing", () => ({
	submitUrlsToBing: vi.fn(async () => ({ ok: true })),
}))

vi.mock("../../../src/search-engine/index-now", () => ({
	submitIndexNow: vi.fn(async () => ({ ok: true })),
}))

import { submitUrlsToBing } from "../../../src/search-engine/bing.ts"
import { submitSitemapToGoogle } from "../../../src/search-engine/google.ts"
import { submitIndexNow } from "../../../src/search-engine/index-now.ts"

/* ── Helpers ─────────────────────────────────────────────────────── */

function makeRouteData(): RouteData {
	return {
		e: "page",
		o: {},
		p: () =>
			Promise.resolve({
				default: {
					_type: "render",
					loader: () => ({ msg: "ok" }),
					render: () => "html",
					variablePath: "/test",
					virtualPath: "_root_/test",
				},
			}),
		t: "r" as const,
		v: "/test",
		x: "_root_/test",
	}
}

function makeRouter(): MarkedRouterConfig {
	const tree = createTreeNode()
	insertRoute(tree, "/test", makeRouteData())
	return createRouter({ layouts: {}, routeTree: tree })
}

function makeConfig(overrides?: Partial<ServerHandlerConfig>): ServerHandlerConfig {
	return {
		router: makeRouter(),
		...overrides,
	}
}

const SECRET = "test-sitemap-secret"
const SITEMAP_URL = "https://example.com/sitemap.xml"

function makeSitemapConfig(overrides?: Record<string, unknown>) {
	return {
		engines: {
			bing: { apiKey: "bing-key", siteUrl: "https://example.com" },
			google: {
				credentials: {
					clientEmail: "test@test.iam.gserviceaccount.com",
					privateKey: "fake-key",
				},
				siteUrl: "https://example.com",
			},
			indexNow: { host: "example.com", key: "indexnow-key" },
		},
		secret: SECRET,
		sitemapUrl: SITEMAP_URL,
		...overrides,
	}
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe("/_flare/sitemap/submit endpoint", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("authentication", () => {
		it("returns 401 for missing secret (POST)", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			const res = await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					headers: { "content-type": "application/json" },
					method: "POST",
				}),
				{},
			)

			expect(res.status).toBe(401)
		})

		it("returns 401 for wrong secret (POST)", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			const res = await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					headers: {
						"content-type": "application/json",
						"x-sitemap-secret": "wrong-secret",
					},
					method: "POST",
				}),
				{},
			)

			expect(res.status).toBe(401)
		})

		it("returns 405 for GET request (POST-only endpoint)", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			const res = await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit?secret=wrong"),
				{},
			)

			expect(res.status).toBe(405)
		})

		it("accepts POST with correct x-sitemap-secret header", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			const res = await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					headers: { "x-sitemap-secret": SECRET },
					method: "POST",
				}),
				{},
			)

			expect(res.status).toBe(200)
			const json = (await res.json()) as Record<string, unknown>
			expect(json.submitted).toBe(true)
		})

		it("rejects GET even with correct secret (POST-only)", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			const res = await handler.fetch(
				new Request(`http://localhost/_flare/sitemap/submit?secret=${SECRET}`),
				{},
			)

			expect(res.status).toBe(405)
		})

		it("resolves secret from function with env", async () => {
			const handler = createServerHandler(
				makeConfig({
					sitemap: makeSitemapConfig({
						secret: (env: unknown) => (env as Record<string, string>).SITEMAP_SECRET,
					}),
				}),
			)

			const res = await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					headers: { "x-sitemap-secret": "env-secret" },
					method: "POST",
				}),
				{ SITEMAP_SECRET: "env-secret" },
			)

			expect(res.status).toBe(200)
		})
	})

	describe("engine selection", () => {
		it("submits to Google with credentials", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					headers: { "x-sitemap-secret": SECRET },
					method: "POST",
				}),
				{},
			)

			expect(submitSitemapToGoogle).toHaveBeenCalledWith({
				credentials: {
					clientEmail: "test@test.iam.gserviceaccount.com",
					privateKey: "fake-key",
				},
				siteUrl: "https://example.com",
				sitemapUrl: SITEMAP_URL,
			})
		})

		it("resolves Google credentials from function", async () => {
			const creds = {
				clientEmail: "fn@test.iam.gserviceaccount.com",
				privateKey: "fn-key",
			}
			const handler = createServerHandler(
				makeConfig({
					sitemap: makeSitemapConfig({
						engines: {
							google: {
								credentials: () => creds,
								siteUrl: "https://example.com",
							},
						},
					}),
				}),
			)

			await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					headers: { "x-sitemap-secret": SECRET },
					method: "POST",
				}),
				{},
			)

			expect(submitSitemapToGoogle).toHaveBeenCalledWith(
				expect.objectContaining({ credentials: creds }),
			)
		})

		it("submits to Bing when URLs provided in POST body", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					body: JSON.stringify({ urls: ["https://example.com/page1"] }),
					headers: {
						"content-type": "application/json",
						"x-sitemap-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			)

			expect(submitUrlsToBing).toHaveBeenCalledWith({
				apiKey: "bing-key",
				siteUrl: "https://example.com",
				urls: ["https://example.com/page1"],
			})
		})

		it("skips Bing when no URLs provided", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					headers: { "x-sitemap-secret": SECRET },
					method: "POST",
				}),
				{},
			)

			expect(submitUrlsToBing).not.toHaveBeenCalled()
		})

		it("submits to IndexNow when URLs provided", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					body: JSON.stringify({ urls: ["https://example.com/page1"] }),
					headers: {
						"content-type": "application/json",
						"x-sitemap-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			)

			expect(submitIndexNow).toHaveBeenCalledWith({
				host: "example.com",
				key: "indexnow-key",
				urls: ["https://example.com/page1"],
			})
		})

		it("skips IndexNow when no URLs provided", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					headers: { "x-sitemap-secret": SECRET },
					method: "POST",
				}),
				{},
			)

			expect(submitIndexNow).not.toHaveBeenCalled()
		})

		it("resolves Bing apiKey from function", async () => {
			const handler = createServerHandler(
				makeConfig({
					sitemap: makeSitemapConfig({
						engines: {
							bing: {
								apiKey: (env: unknown) => (env as Record<string, string>).BING_KEY,
								siteUrl: "https://example.com",
							},
						},
					}),
				}),
			)

			await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					body: JSON.stringify({ urls: ["https://example.com/a"] }),
					headers: {
						"content-type": "application/json",
						"x-sitemap-secret": SECRET,
					},
					method: "POST",
				}),
				{ BING_KEY: "resolved-key" },
			)

			expect(submitUrlsToBing).toHaveBeenCalledWith(
				expect.objectContaining({ apiKey: "resolved-key" }),
			)
		})

		it("resolves IndexNow key from function", async () => {
			const handler = createServerHandler(
				makeConfig({
					sitemap: makeSitemapConfig({
						engines: {
							indexNow: {
								host: "example.com",
								key: (env: unknown) => (env as Record<string, string>).INOW_KEY,
							},
						},
					}),
				}),
			)

			await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					body: JSON.stringify({ urls: ["https://example.com/a"] }),
					headers: {
						"content-type": "application/json",
						"x-sitemap-secret": SECRET,
					},
					method: "POST",
				}),
				{ INOW_KEY: "resolved-inow" },
			)

			expect(submitIndexNow).toHaveBeenCalledWith(expect.objectContaining({ key: "resolved-inow" }))
		})
	})

	describe("error handling", () => {
		it("individual engine failure does not block others", async () => {
			vi.mocked(submitSitemapToGoogle).mockRejectedValueOnce(new Error("Google down"))

			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			const res = await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					body: JSON.stringify({ urls: ["https://example.com/a"] }),
					headers: {
						"content-type": "application/json",
						"x-sitemap-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			)

			expect(res.status).toBe(200)
			const json = (await res.json()) as Record<string, Record<string, unknown>>
			expect(json.engines.google).toEqual({ error: "Google down", ok: false })
			expect(json.engines.bing).toEqual({ ok: true })
			expect(json.engines.indexNow).toEqual({ ok: true })
		})

		it("all engines fail: returns 200 with per-engine errors", async () => {
			vi.mocked(submitSitemapToGoogle).mockRejectedValueOnce(new Error("g"))
			vi.mocked(submitUrlsToBing).mockRejectedValueOnce(new Error("b"))
			vi.mocked(submitIndexNow).mockRejectedValueOnce(new Error("i"))

			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			const res = await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					body: JSON.stringify({ urls: ["https://example.com/a"] }),
					headers: {
						"content-type": "application/json",
						"x-sitemap-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			)

			expect(res.status).toBe(200)
			const json = (await res.json()) as Record<string, Record<string, Record<string, unknown>>>
			expect(json.engines.google.ok).toBe(false)
			expect(json.engines.bing.ok).toBe(false)
			expect(json.engines.indexNow.ok).toBe(false)
		})

		it("POST body parse error: silently continues with sitemap-only", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			const res = await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					body: "not valid json{{{",
					headers: {
						"content-type": "application/json",
						"x-sitemap-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			)

			expect(res.status).toBe(200)
			/* Google should still be called (sitemap only, no URLs needed) */
			expect(submitSitemapToGoogle).toHaveBeenCalled()
			/* Bing/IndexNow skipped (no URLs) */
			expect(submitUrlsToBing).not.toHaveBeenCalled()
			expect(submitIndexNow).not.toHaveBeenCalled()
		})

		it("no engines configured: returns 200 with empty results", async () => {
			const handler = createServerHandler(
				makeConfig({
					sitemap: makeSitemapConfig({ engines: {} }),
				}),
			)

			const res = await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					headers: { "x-sitemap-secret": SECRET },
					method: "POST",
				}),
				{},
			)

			expect(res.status).toBe(200)
			const json = (await res.json()) as Record<string, unknown>
			expect(json.engines).toEqual({})
			expect(json.submitted).toBe(true)
		})
	})

	describe("URL filtering", () => {
		it("filters non-string URLs from POST body", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					body: JSON.stringify({
						urls: [123, null, "https://example.com/a", {}, "https://example.com/b"],
					}),
					headers: {
						"content-type": "application/json",
						"x-sitemap-secret": SECRET,
					},
					method: "POST",
				}),
				{},
			)

			expect(submitUrlsToBing).toHaveBeenCalledWith(
				expect.objectContaining({
					urls: ["https://example.com/a", "https://example.com/b"],
				}),
			)
		})
	})

	describe("security headers", () => {
		it("includes security headers on success response", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			const res = await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					headers: { "x-sitemap-secret": SECRET },
					method: "POST",
				}),
				{},
			)

			expect(res.status).toBe(200)
			expect(res.headers.get("x-content-type-options")).toBe("nosniff")
		})

		it("includes security headers on 401 response", async () => {
			const handler = createServerHandler(makeConfig({ sitemap: makeSitemapConfig() }))

			const res = await handler.fetch(
				new Request("http://localhost/_flare/sitemap/submit", {
					headers: { "x-sitemap-secret": "wrong" },
					method: "POST",
				}),
				{},
			)

			expect(res.status).toBe(401)
			expect(res.headers.get("x-content-type-options")).toBe("nosniff")
		})
	})

	describe("not configured", () => {
		it("falls through to normal routing when sitemap not configured", async () => {
			const handler = createServerHandler(makeConfig())

			const res = await handler.fetch(new Request("http://localhost/_flare/sitemap/submit"), {})

			expect(res.status).toBe(404)
		})
	})
})
