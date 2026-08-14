import { expect, test } from "@playwright/test"
import { loadPage, setupConsoleCapture } from "./helpers"

test.describe("@prod-only CSP on HTML responses", () => {
	test("SSR HTML response includes nonce CSP", async ({ request }) => {
		const response = await request.get("/")
		const csp = response.headers()["content-security-policy"]
		expect(csp).toBeDefined()
		expect(csp).toContain("script-src")
		expect(csp).toContain("nonce-")
		expect(csp).not.toContain("strict-dynamic")
		expect(csp).not.toContain("unsafe-eval")
	})

	test("CSP nonce in header matches script nonces in HTML", async ({ request }) => {
		const response = await request.get("/")
		const csp = response.headers()["content-security-policy"] ?? ""
		const headerNonce = csp.match(/nonce-([a-zA-Z0-9+/=_-]+)/)?.[1]
		expect(headerNonce).toBeTruthy()

		const html = await response.text()
		const scriptNonces = [...html.matchAll(/nonce="([^"]+)"/g)].map((m) => m[1])
		expect(scriptNonces.length).toBeGreaterThan(0)
		for (const sn of scriptNonces) {
			expect(sn).toBe(headerNonce)
		}
	})

	test("404 HTML response includes nonce CSP", async ({ request }) => {
		const response = await request.get("/nonexistent-prod-test")
		expect(response.status()).toBe(404)
		const csp = response.headers()["content-security-policy"]
		expect(csp).toBeDefined()
		expect(csp).toContain("nonce-")
	})

	test("CSP does not include unsafe-eval", async ({ request }) => {
		const response = await request.get("/")
		const csp = response.headers()["content-security-policy"] ?? ""
		expect(csp).not.toContain("unsafe-eval")
	})
})

test.describe("@prod-only HSTS and hashed assets", () => {
	test("Strict-Transport-Security present", async ({ page }) => {
		const response = await page.goto("/")
		const hsts = response?.headers()["strict-transport-security"]
		expect(hsts).toBeDefined()
		expect(hsts).toContain("max-age=")
	})

	test("modulepreload hrefs point to hashed assets", async ({ request }) => {
		const response = await request.get("/")
		const html = await response.text()
		const hrefs = [...html.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1])
		const srcHrefs = [...html.matchAll(/href="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1])
		const assets = hrefs.length > 0 ? hrefs : srcHrefs
		expect(assets.length).toBeGreaterThan(0)
		for (const href of assets) {
			expect(href).toMatch(/\/assets\//)
		}
	})

	test("hashed JS assets are served", async ({ request }) => {
		const response = await request.get("/")
		const html = await response.text()
		const jsAsset =
			html.match(/href="(\/assets\/[^"]+\.js)"/)?.[1] ??
			html.match(/import\("(\/assets\/[^"]+\.js)"\)/)?.[1] ??
			html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
		expect(jsAsset).toBeTruthy()
		const assetResponse = await request.get(jsAsset ?? "")
		expect(assetResponse.status()).toBe(200)
		expect(assetResponse.headers()["content-type"] ?? "").toContain("javascript")
	})

	test("no Vite HMR or /src/ paths in HTML", async ({ request }) => {
		const response = await request.get("/")
		const html = await response.text()
		expect(html).not.toContain("/@vite/client")
		expect(html).not.toContain('src="/src/')
		expect(html).not.toContain('href="/src/')
		expect(html).not.toContain("/@fs/")
		expect(html).not.toContain("/@id/")
		expect(html).not.toContain("import.meta.hot")
	})

	test("page hydrates and SPA works in production", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")
		await page.evaluate(() => {
			const nav = (window as unknown as { __flareNavigate: (to: string) => Promise<void> })
				.__flareNavigate
			return nav("/about")
		})
		await page.waitForURL("**/about", { timeout: 10_000 })
		await expect(page.getByTestId("about")).toBeVisible()
		cap.assertClean()
	})

	test("NDJSON works in production", async ({ request }) => {
		const response = await request.get("/about", { headers: { "x-d": "1" } })
		expect(response.headers()["content-type"]).toContain("application/x-ndjson")
		expect((await response.text()).length).toBeGreaterThan(0)
	})
})
