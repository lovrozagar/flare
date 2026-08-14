import { expect, test } from "@playwright/test"
import {
	clickAndAssertSPA,
	loadPage,
	setNavMarker,
	setupConsoleCapture,
	assertSPANavigation,
} from "./helpers"

test.describe("Navigation — SPA verification", () => {
	test("/ → /about is SPA", async ({ page }) => {
		await loadPage(page, "/")
		await clickAndAssertSPA(page, "a[href='/about']", "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()
	})

	test("/ → /blog is SPA", async ({ page }) => {
		await loadPage(page, "/")
		await clickAndAssertSPA(page, "a[href='/blog']", "/blog")
		await expect(page.locator("[data-testid=blog-list]")).toBeVisible()
	})

	test("/about → / is SPA", async ({ page }) => {
		await loadPage(page, "/about")
		await clickAndAssertSPA(page, "a[href='/']", "/")
		await expect(page.locator("[data-testid=home]")).toBeVisible()
	})

	test("/about → /blog is SPA", async ({ page }) => {
		await loadPage(page, "/about")
		await clickAndAssertSPA(page, "a[href='/blog']", "/blog")
		await expect(page.locator("[data-testid=blog-list]")).toBeVisible()
	})

	test("/about → /users/1 is SPA", async ({ page }) => {
		await loadPage(page, "/about")
		await clickAndAssertSPA(page, "a[href='/users/1']", "/users/1")
		await expect(page.locator("[data-testid=user-name]")).toHaveText("User 1")
	})

	test("/about → /head-demo is SPA", async ({ page }) => {
		await loadPage(page, "/about")
		await clickAndAssertSPA(page, "a[href='/head-demo']", "/head-demo")
		await expect(page.locator("[data-testid=head-demo]")).toBeVisible()
	})

	test("/users/1 → /users/2 param change is SPA", async ({ page }) => {
		await loadPage(page, "/users/1")
		await expect(page.locator("[data-testid=user-name]")).toHaveText("User 1")
		await clickAndAssertSPA(page, "a[href='/users/2']", "/users/2")
		await expect(page.locator("[data-testid=user-name]")).toHaveText("User 2")
	})

	test("/users/2 → / is SPA", async ({ page }) => {
		await loadPage(page, "/users/2")
		await clickAndAssertSPA(page, "a[href='/']", "/")
		await expect(page.locator("[data-testid=home]")).toBeVisible()
	})

	test("/blog → /blog/hello-world is SPA", async ({ page }) => {
		await loadPage(page, "/blog")
		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world")
		await expect(page.locator("[data-testid=blog-post]")).toBeVisible()
	})

	test("/blog → /blog/second-post is SPA", async ({ page }) => {
		await loadPage(page, "/blog")
		await clickAndAssertSPA(page, "a[href='/blog/second-post']", "/blog/second-post")
		await expect(page.locator("[data-testid=post-title]")).toContainText("second-post")
	})

	test("blog layout persists across blog pages (SPA)", async ({ page }) => {
		await loadPage(page, "/blog")
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible()
		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world")
		await expect(page.locator("[data-testid=blog-layout]")).toBeVisible()
		await expect(page.locator("[data-testid=blog-post]")).toBeVisible()
	})
})

test.describe("Navigation — multi-hop chain", () => {
	test("/ → /about → /blog → /users/1 all SPA", async ({ page }) => {
		await loadPage(page, "/")
		await setNavMarker(page)

		await clickAndAssertSPA(page, "a[href='/about']", "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()

		/* marker must STILL survive from the very first set */
		await assertSPANavigation(page)
		await page.click("a[href='/blog']")
		await page.waitForURL("**/blog")
		await assertSPANavigation(page)
		await expect(page.locator("[data-testid=blog-list]")).toBeVisible()

		/* navigate to blog post, still SPA */
		await page.click("a[href='/blog/hello-world']")
		await page.waitForURL("**/blog/hello-world")
		await assertSPANavigation(page)
		await expect(page.locator("[data-testid=blog-post]")).toBeVisible()
	})

	test("no console errors through full chain", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")
		await clickAndAssertSPA(page, "a[href='/about']", "/about")
		await clickAndAssertSPA(page, "a[href='/blog']", "/blog")
		await clickAndAssertSPA(page, "a[href='/blog/hello-world']", "/blog/hello-world")
		cap.assertClean()
	})
})

test.describe("Navigation — history", () => {
	test("back button after SPA nav", async ({ page }) => {
		await loadPage(page, "/")
		await setNavMarker(page)
		await clickAndAssertSPA(page, "a[href='/about']", "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()

		await page.goBack()
		await page.waitForURL("**/")
		await assertSPANavigation(page)
		await expect(page.locator("[data-testid=home]")).toBeVisible()
	})

	test("forward button after back", async ({ page }) => {
		await loadPage(page, "/")
		await setNavMarker(page)
		await clickAndAssertSPA(page, "a[href='/about']", "/about")

		await page.goBack()
		await page.waitForURL("**/")
		await assertSPANavigation(page)

		await page.goForward()
		await page.waitForURL("**/about")
		await assertSPANavigation(page)
		await expect(page.locator("[data-testid=about]")).toBeVisible()
	})

	test("back through multi-hop chain", async ({ page }) => {
		await loadPage(page, "/")
		await setNavMarker(page)

		await clickAndAssertSPA(page, "a[href='/about']", "/about")
		await clickAndAssertSPA(page, "a[href='/blog']", "/blog")

		await page.goBack()
		await page.waitForURL("**/about")
		await assertSPANavigation(page)
		await expect(page.locator("[data-testid=about]")).toBeVisible()

		await page.goBack()
		await page.waitForURL("**/")
		await assertSPANavigation(page)
		await expect(page.locator("[data-testid=home]")).toBeVisible()
	})
})
