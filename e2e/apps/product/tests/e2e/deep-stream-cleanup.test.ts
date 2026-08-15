import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Deep: NDJSON stream cleanup on navigation cancel", () => {
	test("navigate away during deferred then back → no stale state", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		/* Navigate to deferred page */
		await navigateSPA(page, "/deferred-multi");
		await expect(page.locator("[data-testid=instant-data]")).toHaveText("instant-value");

		/* Immediately navigate away before slow deferred resolves */
		await navigateSPA(page, "/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();

		/* Navigate back to deferred page — should get fresh data, not stale */
		await navigateSPA(page, "/deferred-multi");
		await expect(page.locator("[data-testid=instant-data]")).toHaveText("instant-value");
		await expect(page.locator("[data-testid=fast-resolved]")).toBeVisible({ timeout: 5_000 });
		await expect(page.locator("[data-testid=slow-resolved]")).toBeVisible({ timeout: 5_000 });

		cap.assertClean();
	});

	test("rapid navigation through deferred pages → no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		/* Rapid fire: deferred → about → deferred-error → about → deferred */
		await navigateSPA(page, "/deferred-multi");
		await navigateSPA(page, "/about");
		await navigateSPA(page, "/deferred-error");
		await navigateSPA(page, "/about");
		await navigateSPA(page, "/deferred-multi");

		await expect(page.locator("[data-testid=instant-data]")).toHaveText("instant-value");
		await expect(page.locator("[data-testid=fast-resolved]")).toBeVisible({ timeout: 5_000 });

		cap.assertClean();
	});

	test("navigate away during deferred error → no unhandled rejection", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		/* Navigate to deferred error page */
		await navigateSPA(page, "/deferred-error");
		await expect(page.locator("[data-testid=status-data]")).toHaveText("ok");

		/* Navigate away before the deferred error resolves (200ms delay) */
		await navigateSPA(page, "/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();

		/* Wait to ensure background deferred rejection doesn't surface */
		await page.waitForTimeout(500);
		cap.assertClean();
	});
});
