import { expect, test } from "@playwright/test";
import { assertSPANavigation, loadPage, navigateSPA, setNavMarker, setupConsoleCapture } from "./helpers";

test.describe("Intercept routes — advanced", () => {
	test("dismiss and switch to different product", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/products");

		/* Open product 1 as modal */
		await setNavMarker(page);
		await page.click("[data-testid=product-link-1]");
		await page.waitForURL("**/products/1", { timeout: 10_000 });
		await assertSPANavigation(page);
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible();
		await expect(page.locator("[data-testid=intercept-overlay] [data-testid=product-name]")).toContainText("Product 1");

		/* Dismiss modal, then open product 2 */
		await page.click("[data-testid=intercept-dismiss]");
		await page.waitForURL("**/products", { timeout: 10_000 });
		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible();

		await page.click("[data-testid=product-link-2]");
		await page.waitForURL("**/products/2", { timeout: 10_000 });

		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible();
		await expect(page.locator("[data-testid=intercept-overlay] [data-testid=product-name]")).toContainText("Product 2");

		/* Background list still there */
		await expect(page.locator("[data-testid=product-list]")).toBeVisible();
		cap.assertClean();
	});

	test("programmatic nav switches intercepted product", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/products");

		/* Open product 1 as modal */
		await setNavMarker(page);
		await page.click("[data-testid=product-link-1]");
		await page.waitForURL("**/products/1", { timeout: 10_000 });
		await assertSPANavigation(page);
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible();

		/* Programmatically navigate to product 3 while overlay is open */
		await navigateSPA(page, "/products/3");

		/* Should navigate to full page (from non-/products origin) or re-intercept */
		await expect(page.locator("[data-testid=product-detail]")).toBeVisible();
		await expect(page.locator("[data-testid=product-name]")).toContainText("Product 3");
		cap.assertClean();
	});

	test("back through dismiss → open → dismiss cycle", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/products");

		/*
		 * Dismiss uses history.back(), so each dismiss pops the entry.
		 * After dismiss + new click, forward history is replaced.
		 * Stack after all ops: /products → /products/3
		 */

		/* Open product 1, dismiss (pops /products/1) */
		await page.click("[data-testid=product-link-1]");
		await page.waitForURL("**/products/1", { timeout: 10_000 });
		await page.click("[data-testid=intercept-dismiss]");
		await page.waitForURL("**/products", { timeout: 10_000 });

		/* Open product 2, dismiss (pops /products/2) */
		await page.click("[data-testid=product-link-2]");
		await page.waitForURL("**/products/2", { timeout: 10_000 });
		await page.click("[data-testid=intercept-dismiss]");
		await page.waitForURL("**/products", { timeout: 10_000 });

		/* Open product 3 */
		await page.click("[data-testid=product-link-3]");
		await page.waitForURL("**/products/3", { timeout: 10_000 });
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible();

		/* Back should dismiss product 3 → /products (start of stack) */
		await page.goBack();
		await page.waitForURL("**/products", { timeout: 10_000 });
		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible();
		await expect(page.locator("[data-testid=product-list]")).toBeVisible();
		cap.assertClean();
	});

	test("forward after back restores product page", async ({ page }) => {
		await loadPage(page, "/products");

		/* Open product 1 */
		await setNavMarker(page);
		await page.click("[data-testid=product-link-1]");
		await page.waitForURL("**/products/1", { timeout: 10_000 });
		await assertSPANavigation(page);
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible();

		/* Back to list */
		await page.goBack();
		await page.waitForURL("**/products", { timeout: 10_000 });
		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible();

		/* Forward */
		await page.goForward();
		await page.waitForURL("**/products/1", { timeout: 10_000 });

		/* Product detail visible (forward is popstate — renders product detail) */
		await expect(page.locator("[data-testid=product-detail]")).toBeVisible();
		await expect(page.locator("[data-testid=product-name]")).toContainText("Product 1");
	});

	test("intercept then navigate to unrelated page clears overlay", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/products");

		await setNavMarker(page);
		await page.click("[data-testid=product-link-1]");
		await page.waitForURL("**/products/1", { timeout: 10_000 });
		await assertSPANavigation(page);
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible();

		/* Navigate away to /about */
		await navigateSPA(page, "/about");

		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible();
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		cap.assertClean();
	});

	test("dismiss then re-intercept same product", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/products");

		await setNavMarker(page);
		await page.click("[data-testid=product-link-1]");
		await page.waitForURL("**/products/1", { timeout: 10_000 });
		await assertSPANavigation(page);
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible();

		/* Dismiss */
		await page.click("[data-testid=intercept-dismiss]");
		await page.waitForURL("**/products", { timeout: 10_000 });
		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible();

		/* Re-open same product */
		await page.click("[data-testid=product-link-1]");
		await page.waitForURL("**/products/1", { timeout: 10_000 });
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible();
		await expect(page.locator("[data-testid=intercept-overlay] [data-testid=product-name]")).toContainText("Product 1");
		cap.assertClean();
	});

	test("loader data isolation: background vs intercepted", async ({ page }) => {
		await loadPage(page, "/products");

		const listCount = await page.locator("[data-testid=product-list] li").count();
		expect(listCount).toBe(3);

		await setNavMarker(page);
		await page.click("[data-testid=product-link-2]");
		await page.waitForURL("**/products/2", { timeout: 10_000 });
		await assertSPANavigation(page);

		/* Modal shows product 2 data */
		await expect(page.locator("[data-testid=intercept-overlay] [data-testid=product-id]")).toContainText("ID: 2");

		/* Background list still shows all 3 products */
		const listCountAfter = await page.locator("[data-testid=product-list] li").count();
		expect(listCountAfter).toBe(3);
	});

	test("URL reflects intercepted state", async ({ page }) => {
		await loadPage(page, "/products");

		await setNavMarker(page);
		await page.click("[data-testid=product-link-2]");
		await page.waitForURL("**/products/2", { timeout: 10_000 });
		await assertSPANavigation(page);

		expect(new URL(page.url()).pathname).toBe("/products/2");
		await expect(page.locator("[data-testid=product-list]")).toBeVisible();
	});

	test("intercept overlay has correct render mode attribute", async ({ page }) => {
		await loadPage(page, "/products");

		await setNavMarker(page);
		await page.click("[data-testid=product-link-1]");
		await page.waitForURL("**/products/1", { timeout: 10_000 });
		await assertSPANavigation(page);

		await expect(page.locator("[data-testid=intercept-overlay]")).toHaveAttribute("data-render-mode", "modal");
	});

	test("escape key does not auto-dismiss overlay", async ({ page }) => {
		await loadPage(page, "/products");

		await setNavMarker(page);
		await page.click("[data-testid=product-link-1]");
		await page.waitForURL("**/products/1", { timeout: 10_000 });
		await assertSPANavigation(page);
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible();

		await page.keyboard.press("Escape");
		await page.waitForTimeout(500);
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible();
		expect(page.url()).toContain("/products/1");
	});

	test("direct load then SPA to list shows no overlay", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/products/1");
		await expect(page.locator("[data-testid=product-detail]")).toBeVisible();
		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible();

		await navigateSPA(page, "/products");
		await expect(page.locator("[data-testid=product-list]")).toBeVisible();
		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible();
		cap.assertClean();
	});

	test("hard reload while intercepted renders as full page", async ({ page }) => {
		await loadPage(page, "/products");

		await setNavMarker(page);
		await page.click("[data-testid=product-link-1]");
		await page.waitForURL("**/products/1", { timeout: 10_000 });
		await assertSPANavigation(page);
		await expect(page.locator("[data-testid=intercept-overlay]")).toBeVisible();

		/* Hard reload */
		await page.reload({ waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-flare-hydrated"), null, {
			timeout: 15_000,
		});

		await expect(page.locator("[data-testid=product-detail]")).toBeVisible();
		await expect(page.locator("[data-testid=intercept-overlay]")).not.toBeVisible();
	});

	test("no console errors through full intercept lifecycle", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/products");

		/* Open modal */
		await page.click("[data-testid=product-link-1]");
		await page.waitForURL("**/products/1", { timeout: 10_000 });

		/* Dismiss */
		await page.click("[data-testid=intercept-dismiss]");
		await page.waitForURL("**/products", { timeout: 10_000 });

		/* Open another product */
		await page.click("[data-testid=product-link-3]");
		await page.waitForURL("**/products/3", { timeout: 10_000 });

		/* Navigate away */
		await navigateSPA(page, "/about");

		/* Back */
		await page.goBack();
		await page.waitForURL("**/products/3", { timeout: 10_000 });

		cap.assertClean();
	});
});
