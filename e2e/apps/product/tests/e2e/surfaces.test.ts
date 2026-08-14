import { expect, test } from "@playwright/test"
import { loadPage } from "./helpers"

test.describe("markdown negotiation", () => {
	test("Accept text/markdown converts HTML", async ({ request }) => {
		const res = await request.get("/about", { headers: { accept: "text/markdown" } })
		expect(res.status()).toBe(200)
		expect(res.headers()["content-type"]).toContain("text/markdown")
		const body = await res.text()
		expect(body).toMatch(/About/i)
		expect(body).not.toContain("<html")
	})

	test("HTML Accept still returns HTML", async ({ request }) => {
		const res = await request.get("/about", { headers: { accept: "text/html" } })
		expect(res.headers()["content-type"] ?? "").toContain("text/html")
		expect(await res.text()).toContain("<html")
	})
})

test.describe("cdn-proxy and api-proxy", () => {
	test("cdn object is served with cache headers", async ({ request }) => {
		const res = await request.get("/cdn/hello.txt")
		expect(res.status()).toBe(200)
		expect(await res.text()).toBe("cdn-hello")
		expect(res.headers()["etag"]).toMatch(/^(W\/)?"cdn-hello"$/)
		expect(res.headers()["cache-control"]).toContain("immutable")
	})

	test("cdn missing key is 404", async ({ request }) => {
		expect((await request.get("/cdn/missing.bin")).status()).toBe(404)
	})

	test("cdn rejects path traversal", async ({ request }) => {
		expect((await request.get("/cdn/foo%2e%2ebar")).status()).toBe(400)
	})

	test("api-proxy rewrites to the mock target", async ({ request }) => {
		const res = await request.get("/proxy/echo")
		expect(res.status()).toBe(200)
		const json = (await res.json()) as { path: string; proxied: boolean }
		expect(json.proxied).toBe(true)
		expect(json.path).toBe("/echo")
	})
})

test.describe("nested cache layers", () => {
	test("all layers render in HTML", async ({ request }) => {
		const html = await (await request.get("/deep-cache")).text()
		for (const id of ["dc-l1", "dc-l2", "dc-l3", "dc-p1"]) {
			expect(html).toContain(`data-testid="${id}"`)
		}
		expect(html).toContain('data-testid="dc-l1-layer">L1<')
		expect(html).toContain('data-testid="dc-p1-layer">P1-isr<')
	})

	test("uncached child still wraps layouts", async ({ page }) => {
		await loadPage(page, "/deep-cache/uncached")
		await expect(page.getByTestId("dc-l1")).toBeVisible()
		await expect(page.getByTestId("dc-l2")).toBeVisible()
		await expect(page.getByTestId("dc-p2-layer")).toHaveText("P2-uncached")
	})
})

test.describe("mobile viewport", () => {
	test.use({ viewport: { height: 800, width: 390 } })

	test("home and about remain usable at phone width", async ({ page }) => {
		await loadPage(page, "/")
		await expect(page.getByTestId("home")).toBeVisible()
		await page.locator("a[href='/about']").first().click()
		await page.waitForURL("**/about")
		await expect(page.getByTestId("about")).toBeVisible()
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 8)
		expect(overflow).toBe(false)
	})
})
