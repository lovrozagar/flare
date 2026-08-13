import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA } from "./helpers"

test.describe("Duration shorthand in cache config", () => {
	test("CDN headers use parsed duration values", async ({ request }) => {
		const res = await request.get("/duration-cache-test")
		expect(res.status()).toBe(200)
		const cc = res.headers()["cache-control"]
		expect(cc).toContain("max-age=300")
		expect(cc).toContain("stale-while-revalidate=60")
	})

	test("page renders and hydrates with duration cache config", async ({ page }) => {
		await loadPage(page, "/duration-cache-test")
		await expect(page.locator("[data-testid=duration-cache-test]")).toBeVisible()
		const ts = await page.locator("[data-testid=duration-timestamp]").textContent()
		expect(Number(ts)).toBeGreaterThan(0)
	})

	test("client staleTime caches across SPA navigations", async ({ page }) => {
		await loadPage(page, "/duration-cache-test")

		const ts1 = await page.locator("[data-testid=duration-timestamp]").textContent()
		const rand1 = await page.locator("[data-testid=duration-random]").textContent()

		await navigateSPA(page, "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()

		await navigateSPA(page, "/duration-cache-test")
		await expect(page.locator("[data-testid=duration-cache-test]")).toBeVisible()

		const ts2 = await page.locator("[data-testid=duration-timestamp]").textContent()
		const rand2 = await page.locator("[data-testid=duration-random]").textContent()

		/* within 10s staleTime, data should be cached */
		expect(ts2).toBe(ts1)
		expect(rand2).toBe(rand1)
	})
})
