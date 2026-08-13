import { expect, test } from "@playwright/test"
import { clickAndAssertSPA, loadPage, setupConsoleCapture } from "./helpers"

test.describe("Loader Data", () => {
	test("home loader data in DOM", async ({ page }) => {
		await loadPage(page, "/")
		const timestamp = page.locator("[data-testid=timestamp]")
		const text = await timestamp.textContent()
		expect(Number(text)).toBeGreaterThan(0)
	})

	test("about loader data survives hydration", async ({ page }) => {
		await loadPage(page, "/about")
		await expect(page.locator("[data-testid=about-year]")).toHaveText("2026")
		await expect(page.locator("[data-testid=about-content]")).toContainText("about page")
	})

	test("dynamic param loader", async ({ page }) => {
		await loadPage(page, "/users/42")
		await expect(page.locator("[data-testid=user-id]")).toHaveText("42")
		await expect(page.locator("[data-testid=user-name]")).toHaveText("User 42")
	})

	test("blog layout loader data", async ({ page }) => {
		await loadPage(page, "/blog")
		await expect(page.locator("[data-testid=blog-nav]")).toContainText("Blog")
	})

	test("blog post loader data with params", async ({ page }) => {
		await loadPage(page, "/blog/hello-world")
		await expect(page.locator("[data-testid=post-title]")).toHaveText("Post: hello-world")
		await expect(page.locator("[data-testid=post-slug]")).toHaveText("hello-world")
	})

	test("param change via SPA updates loader data", async ({ page }) => {
		await loadPage(page, "/users/1")
		await expect(page.locator("[data-testid=user-name]")).toHaveText("User 1")
		await clickAndAssertSPA(page, "a[href='/users/2']", "/users/2")
		await expect(page.locator("[data-testid=user-name]")).toHaveText("User 2")
		await expect(page.locator("[data-testid=user-id]")).toHaveText("2")
	})

	test("SPA nav loads new loader data", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")
		const ts1 = await page.locator("[data-testid=timestamp]").textContent()

		await clickAndAssertSPA(page, "a[href='/about']", "/about")
		await expect(page.locator("[data-testid=about-year]")).toHaveText("2026")

		cap.assertClean()
	})

	test("loader data available in SSR (before hydration)", async ({ page }) => {
		await page.goto("/about", { waitUntil: "domcontentloaded" })
		/* content should be in SSR HTML before JS runs */
		const content = page.locator("[data-testid=about-content]")
		await expect(content).toBeVisible()
		await expect(content).toContainText("about page")
	})
})
