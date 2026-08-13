import { expect, test } from "@playwright/test"
import { assertSPANavigation, loadPage, setNavMarker, setupConsoleCapture } from "./helpers"

test.describe("Intercepting routes", () => {
	test("direct load renders full page (no overlay)", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/products/1")

		/* Should see product detail rendered normally */
		await expect(page.locator("[data-testid=product-detail]")).toBeVisible()
		await expect(page.locator("[data-testid=product-name]")).toContainText("Product 1")

		/* Should NOT see intercept overlay */
		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible()
		cap.assertClean()
	})

	test("SPA nav from matching origin intercepts as overlay", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/products")

		/* Product list should be visible */
		await expect(page.locator("[data-testid=product-list]")).toBeVisible()

		/* Click product link — should intercept */
		await setNavMarker(page)
		await page.click("[data-testid=product-link-1]")
		await page.waitForURL("**/products/1", { timeout: 10_000 })
		await assertSPANavigation(page)

		/* URL updated to /products/1 */
		expect(page.url()).toContain("/products/1")

		/* Product list (background) should still be visible */
		await expect(page.locator("[data-testid=product-list]")).toBeVisible()

		/* Intercept overlay should be visible with product detail */
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible()
		await expect(
			page.locator("[data-testid=intercept-overlay] [data-testid=product-detail]"),
		).toBeVisible()
		await expect(
			page.locator("[data-testid=intercept-overlay] [data-testid=product-name]"),
		).toContainText("Product 1")

		/* Overlay should have render mode "modal" */
		await expect(page.locator("[data-testid=intercept-overlay]")).toHaveAttribute(
			"data-render-mode",
			"modal",
		)
		cap.assertClean()
	})

	test("dismiss button returns to list", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/products")
		await expect(page.locator("[data-testid=product-list]")).toBeVisible()

		/* Navigate to product via click */
		await setNavMarker(page)
		await page.click("[data-testid=product-link-2]")
		await page.waitForURL("**/products/2", { timeout: 10_000 })
		await assertSPANavigation(page)

		/* Overlay should be visible */
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible()

		/* Click dismiss */
		await page.click("[data-testid=intercept-dismiss]")
		await page.waitForURL("**/products", { timeout: 10_000 })

		/* Overlay should be gone */
		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible()

		/* Product list should still be visible */
		await expect(page.locator("[data-testid=product-list]")).toBeVisible()
		cap.assertClean()
	})

	test("browser back clears intercept", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/products")

		await setNavMarker(page)
		await page.click("[data-testid=product-link-1]")
		await page.waitForURL("**/products/1", { timeout: 10_000 })
		await assertSPANavigation(page)

		/* Overlay visible */
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible()

		/* Go back */
		await page.goBack()
		await page.waitForURL("**/products", { timeout: 10_000 })

		/* Overlay gone, list visible */
		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible()
		await expect(page.locator("[data-testid=product-list]")).toBeVisible()
		cap.assertClean()
	})

	test("non-matching origin = full page nav (no overlay)", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/about")

		/* Navigate to product from /about — should NOT intercept */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) throw new Error("__flareNavigate not available")
			return nav("/products/1")
		})
		await page.waitForURL("**/products/1", { timeout: 10_000 })

		/* Should see product detail as full page */
		await expect(page.locator("[data-testid=product-detail]")).toBeVisible()

		/* Should NOT see intercept overlay */
		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible()
		cap.assertClean()
	})

	test("SSR has no intercept state (intercepted is null)", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/products")

		/* On initial SSR load, no intercept overlay should exist */
		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible()

		/* Verify hydration happened */
		const hydrated = await page.evaluate(() =>
			document.documentElement.hasAttribute("data-hydrated"),
		)
		expect(hydrated).toBe(true)
		cap.assertClean()
	})
})
