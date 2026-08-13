import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("3-level head merging — SSR", () => {
	test("page title comes from page head", async ({ page }) => {
		await loadPage(page, "/head-3-level/head-page")
		await expect(page).toHaveTitle("Three Level Head")
	})

	test("page description overrides layout description", async ({ page }) => {
		await loadPage(page, "/head-3-level/head-page")
		const meta = page.locator('meta[name="description"]')
		await expect(meta).toHaveAttribute("content", "Page desc")
	})

	test("layout wrapper renders", async ({ page }) => {
		await loadPage(page, "/head-3-level/head-page")
		await expect(page.getByTestId("head-layout-wrapper")).toBeVisible()
		await expect(page.getByTestId("head-3-page")).toBeVisible()
	})

	test("root meta charset is preserved through 3 levels", async ({ page }) => {
		await loadPage(page, "/head-3-level/head-page")
		const charset = page.locator('meta[charset="utf-8"]')
		await expect(charset).toHaveCount(1)
	})
})

test.describe("3-level head merging — SPA", () => {
	test("SPA nav to 3-level page updates title and description", async ({ page }) => {
		await loadPage(page, "/")
		await navigateSPA(page, "/head-3-level/head-page")
		await expect(page).toHaveTitle("Three Level Head")

		const meta = page.locator('meta[name="description"]')
		await expect(meta).toHaveAttribute("content", "Page desc")
	})

	test("SPA nav away cleans up page-level head", async ({ page }) => {
		await loadPage(page, "/head-3-level/head-page")
		await expect(page).toHaveTitle("Three Level Head")

		await navigateSPA(page, "/about")
		await expect(page).not.toHaveTitle("Three Level Head")
	})

	test("SPA nav back restores 3-level head", async ({ page }) => {
		await loadPage(page, "/head-3-level/head-page")
		await navigateSPA(page, "/about")
		await navigateSPA(page, "/head-3-level/head-page")
		await expect(page).toHaveTitle("Three Level Head")

		const meta = page.locator('meta[name="description"]')
		await expect(meta).toHaveAttribute("content", "Page desc")
	})
})

test.describe("3-level head merging — console", () => {
	test("no console errors during 3-level head nav", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/head-3-level/head-page")
		await navigateSPA(page, "/about")
		await navigateSPA(page, "/head-3-level/head-page")
		cap.assertClean()
	})
})
