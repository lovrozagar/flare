import { expect, test } from "@playwright/test"

test.describe("Extension URLs pass through normalizeUrl", () => {
	test("extension URL reaches middleware (not 404'd by normalizeUrl)", async ({ request }) => {
		/* Previously normalizeUrl would 404 any URL with a file extension
		 * before middleware could run. Now extensions pass through.
		 * /sitemap.xml is a registered route — proves extension URLs reach route matching. */
		const response = await request.get("/sitemap.xml")
		/* Middleware sets x-request-type on page requests */
		expect(response.headers()["x-request-type"]).toBe("page")
	})

	test("extension URL gets security headers (middleware ran)", async ({ request }) => {
		const response = await request.get("/sitemap.xml")
		expect(response.headers()["x-content-type-options"]).toBe("nosniff")
	})

	test("matched extension route returns 200", async ({ request }) => {
		const response = await request.get("/sitemap.xml")
		expect(response.status()).toBe(200)
	})
})
