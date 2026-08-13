import { expect, test } from "@playwright/test"

/*
 * Security header tests use page.goto() for non-CSP headers (preserved by dev server)
 * and request API for CSP (stripped from HTML in dev because Vite injects nonce-less scripts).
 */

test.describe("Security Headers", () => {
	test("X-Content-Type-Options: nosniff", async ({ page }) => {
		const response = await page.goto("/")
		expect(response?.headers()["x-content-type-options"]).toBe("nosniff")
	})

	test("X-Frame-Options: DENY", async ({ page }) => {
		const response = await page.goto("/")
		expect(response?.headers()["x-frame-options"]).toBe("DENY")
	})

	test("Strict-Transport-Security skipped in dev @dev-only", async ({ page }) => {
		const response = await page.goto("/")
		expect(response?.headers()["strict-transport-security"]).toBeUndefined()
	})

	test("Strict-Transport-Security present @prod-only", async ({ page }) => {
		const response = await page.goto("/")
		const hsts = response?.headers()["strict-transport-security"]
		expect(hsts).toBeDefined()
		expect(hsts).toContain("max-age=")
	})

	test("Referrer-Policy present", async ({ page }) => {
		const response = await page.goto("/")
		expect(response?.headers()["referrer-policy"]).toBeDefined()
	})

	test("CSP with nonce on NDJSON", async ({ request }) => {
		const response = await request.get("/", {
			headers: { "x-d": "1" },
		})
		const csp = response.headers()["content-security-policy"]
		expect(csp).toBeDefined()
		expect(csp).toContain("nonce-")
		expect(csp).toContain("object-src 'none'")
		expect(csp).not.toContain("strict-dynamic")
	})

	test("nonce differs between requests", async ({ request }) => {
		const r1 = await request.get("/", { headers: { "x-d": "1" } })
		const r2 = await request.get("/", { headers: { "x-d": "1" } })
		const csp1 = r1.headers()["content-security-policy"] ?? ""
		const csp2 = r2.headers()["content-security-policy"] ?? ""
		const nonce1 = csp1.match(/nonce-([a-f0-9]+)/)?.[1]
		const nonce2 = csp2.match(/nonce-([a-f0-9]+)/)?.[1]
		expect(nonce1).toBeDefined()
		expect(nonce2).toBeDefined()
		expect(nonce1).not.toBe(nonce2)
	})
})
