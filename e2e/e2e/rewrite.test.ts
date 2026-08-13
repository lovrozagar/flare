import { expect, test } from "@playwright/test"
import { loadPage, setNavMarker } from "./helpers"

test.describe("Rewrite — /vanity → /about", () => {
	test("SSR: /vanity renders about page content", async ({ page }) => {
		await loadPage(page, "/vanity")
		await expect(page.locator("[data-testid=about]")).toBeVisible()
		await expect(page.locator("[data-testid=about-content]")).toContainText("about page")
	})

	test("SSR: browser URL stays /vanity", async ({ page }) => {
		await loadPage(page, "/vanity")
		expect(page.url()).toContain("/vanity")
		expect(page.url()).not.toContain("/about")
	})

	test("SPA: client-side navigate to /vanity renders about content", async ({ page }) => {
		await loadPage(page, "/")
		await setNavMarker(page)

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) throw new Error("__flareNavigate not available")
			return nav("/vanity")
		})
		await page.waitForURL("**/vanity", { timeout: 10_000 })

		await expect(page.locator("[data-testid=about]")).toBeVisible()
		expect(page.url()).toContain("/vanity")
	})
})
