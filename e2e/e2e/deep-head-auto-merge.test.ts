import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("head auto-merge — SSR", () => {
	test("auto-merged page inherits layout description", async ({ page }) => {
		await loadPage(page, "/head-auto-merge/auto-merged")
		await expect(page).toHaveTitle("Auto Merged Page")
		const desc = page.locator('meta[name="description"]')
		await expect(desc).toHaveAttribute("content", "Layout description for merge test")
	})

	test("auto-merged page inherits layout keywords", async ({ page }) => {
		await loadPage(page, "/head-auto-merge/auto-merged")
		const kw = page.locator('meta[name="keywords"]')
		await expect(kw).toHaveAttribute("content", "flare,test,merge")
	})

	test("replaced page has its own title", async ({ page }) => {
		await loadPage(page, "/head-auto-merge/replaced")
		await expect(page).toHaveTitle("Replaced Page")
	})

	test("replaced page does NOT inherit layout description", async ({ page }) => {
		await loadPage(page, "/head-auto-merge/replaced")
		const desc = page.locator('meta[name="description"]')
		await expect(desc).toHaveCount(0)
	})

	test("replaced page does NOT inherit layout keywords", async ({ page }) => {
		await loadPage(page, "/head-auto-merge/replaced")
		const kw = page.locator('meta[name="keywords"]')
		await expect(kw).toHaveCount(0)
	})

	test("layout wrapper renders for both pages", async ({ page }) => {
		await loadPage(page, "/head-auto-merge/auto-merged")
		await expect(page.getByTestId("ham-layout-wrapper")).toBeVisible()
		await expect(page.getByTestId("ham-auto-merged")).toBeVisible()
	})
})

test.describe("head auto-merge — SPA", () => {
	test("SPA nav from auto-merged to replaced drops inherited head", async ({ page }) => {
		await loadPage(page, "/head-auto-merge/auto-merged")
		const desc = page.locator('meta[name="description"]')
		await expect(desc).toHaveAttribute("content", "Layout description for merge test")

		await navigateSPA(page, "/head-auto-merge/replaced")
		await expect(page).toHaveTitle("Replaced Page")
		await expect(desc).toHaveCount(0)
	})

	test("SPA nav from replaced to auto-merged restores inherited head", async ({ page }) => {
		await loadPage(page, "/head-auto-merge/replaced")
		const desc = page.locator('meta[name="description"]')
		await expect(desc).toHaveCount(0)

		await navigateSPA(page, "/head-auto-merge/auto-merged")
		await expect(page).toHaveTitle("Auto Merged Page")
		await expect(desc).toHaveAttribute("content", "Layout description for merge test")
	})
})

test.describe("head auto-merge — console", () => {
	test("no console errors during auto-merge nav", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/head-auto-merge/auto-merged")
		await navigateSPA(page, "/head-auto-merge/replaced")
		await navigateSPA(page, "/head-auto-merge/auto-merged")
		cap.assertClean()
	})
})
