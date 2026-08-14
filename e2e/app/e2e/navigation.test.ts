import { expect, test } from "@playwright/test"
import { clickAndAssertSPA, loadPage } from "./helpers"

test.describe("SPA Link", () => {
	test("Link renders as <a> with href", async ({ page }) => {
		await loadPage(page, "/")
		const link = page.locator("a[href='/about']").first()
		await expect(link).toBeVisible()
		await expect(link).toHaveAttribute("href", "/about")
	})

	test("click About is SPA navigation", async ({ page }) => {
		await loadPage(page, "/")
		await clickAndAssertSPA(page, "a[href='/about']", "/about")
		await expect(page.getByTestId("about")).toBeVisible()
	})

	test("click Dashboard keeps layout after SPA", async ({ page }) => {
		await loadPage(page, "/")
		await clickAndAssertSPA(page, "a[href='/dashboard']", "/dashboard")
		await expect(page.getByTestId("dashboard-layout")).toBeVisible()
		await expect(page.getByTestId("dash-overview-heading")).toHaveText("Dashboard Overview")
	})
})

test.describe("layout", () => {
	test("dashboard SSR wraps page in layout", async ({ page }) => {
		await loadPage(page, "/dashboard")
		await expect(page.getByTestId("dashboard-layout")).toBeVisible()
		await expect(page.getByTestId("layout-label")).toHaveText("dashboard")
		await expect(page.getByTestId("dash-section")).toHaveText("overview")
	})

	test("layout header is sent", async ({ page }) => {
		const response = await page.goto("/dashboard")
		expect(response?.headers()["x-dashboard-layout"]).toBe("true")
	})

	test("settings stays inside the same layout", async ({ page }) => {
		await loadPage(page, "/dashboard")
		await clickAndAssertSPA(page, "a[href='/dashboard/settings']", "/dashboard/settings")
		await expect(page.getByTestId("dashboard-layout")).toBeVisible()
		await expect(page.getByTestId("dash-settings-heading")).toHaveText("Dashboard Settings")
	})
})
