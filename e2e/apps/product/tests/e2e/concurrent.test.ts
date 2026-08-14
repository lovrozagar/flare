import { expect, test } from "@playwright/test"
import { assertSPANavigation, loadPage, setNavMarker, setupConsoleCapture } from "./helpers"

test.describe("Concurrent Navigation", () => {
	test("rapid nav cancels previous, only latest renders (SPA)", async ({ page }) => {
		await loadPage(page, "/")
		await setNavMarker(page)

		/* Fire nav to /slow (1.5s loader) then immediately to /about */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) throw new Error("__flareNavigate not available")
			nav("/slow")
			nav("/about")
		})
		await page.waitForURL("**/about", { timeout: 10_000 })
		await assertSPANavigation(page)
		await expect(page.locator("[data-testid=about]")).toBeVisible()

		/* slow page should never appear */
		const slowVisible = await page
			.locator("[data-testid=slow-page]")
			.isVisible()
			.catch(() => false)
		expect(slowVisible).toBe(false)
	})

	test("no console errors from aborted navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")
		await setNavMarker(page)

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) throw new Error("__flareNavigate not available")
			nav("/slow")
			nav("/about")
		})
		await page.waitForURL("**/about", { timeout: 10_000 })
		await assertSPANavigation(page)

		await page.waitForTimeout(500)
		cap.assertClean()
	})

	test("navigation settles cleanly", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/about")
		await page.waitForTimeout(200)
		cap.assertClean()
	})
})
