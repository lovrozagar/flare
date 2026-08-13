import { expect, test } from "@playwright/test"
import { loadPage } from "./helpers"

test.describe("Redirects", () => {
	test("SSR redirect lands on target", async ({ page }) => {
		await page.goto("/redirect-source")
		await page.waitForURL("**/redirect-target")
		expect(page.url()).toContain("/redirect-target")
		await expect(page.locator("[data-testid=redirect-target]")).toBeVisible()
	})

	test("redirect target content visible", async ({ page }) => {
		await page.goto("/redirect-source")
		await page.waitForURL("**/redirect-target")
		await expect(page.locator("[data-testid=redirect-target]")).toContainText(
			"You were redirected here",
		)
	})

	test("CSR redirect is SPA and lands on target", async ({ page }) => {
		await loadPage(page, "/")
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) throw new Error("__flareNavigate not available")
			return nav("/redirect-source")
		})
		/* Redirect should land on target */
		await page.waitForURL("**/redirect-target", { timeout: 10_000 })
		expect(page.url()).toContain("/redirect-target")
	})
})
