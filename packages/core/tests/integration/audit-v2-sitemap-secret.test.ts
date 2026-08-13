/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { buildHandler, makeRequest } from "./fixtures.ts"

describe("Sitemap submit — GET method should be rejected", () => {
	const handler = buildHandler({
		sitemap: {
			engines: {},
			secret: "test-secret-abc",
			sitemapUrl: "https://example.com/sitemap.xml",
		},
	})

	it("GET /_flare/sitemap/submit?secret=valid returns 405 (method not allowed)", async () => {
		const request = makeRequest("/_flare/sitemap/submit?secret=test-secret-abc", { method: "GET" })
		const response = await handler.fetch(request, {})
		expect(response.status).toBe(405)
	})

	it("POST with x-sitemap-secret header still works (200)", async () => {
		const request = makeRequest("/_flare/sitemap/submit", {
			body: JSON.stringify({}),
			headers: {
				"Content-Type": "application/json",
				"x-sitemap-secret": "test-secret-abc",
			},
			method: "POST",
		})
		const response = await handler.fetch(request, {})
		expect(response.status).toBe(200)
	})

	it("GET without secret returns 405, not 401", async () => {
		const request = makeRequest("/_flare/sitemap/submit", { method: "GET" })
		const response = await handler.fetch(request, {})
		expect(response.status).toBe(405)
	})
})
