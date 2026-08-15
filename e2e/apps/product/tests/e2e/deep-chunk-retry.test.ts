import { expect, test } from "@playwright/test";
import { loadPage, setNavMarker } from "./helpers";

test.describe("@prod-only chunk load retry", () => {
	test("retry succeeds after transient chunk failure", async ({ page }) => {
		await loadPage(page, "/");

		let aboutChunkUrl: string | null = null;
		let requestCount = 0;

		/* Intercept JS chunks — fail the about route chunk on first request */
		await page.route("**/*.js", async (route) => {
			const url = route.request().url();
			/* Identify about chunk by URL containing "about" */
			if (url.includes("about")) {
				requestCount++;
				if (!aboutChunkUrl) aboutChunkUrl = url;
				if (requestCount === 1) {
					await route.abort("connectionfailed");
					return;
				}
			}
			await route.continue();
		});

		await setNavMarker(page);
		await page.click("a[href='/about']");
		await page.waitForURL("**/about", { timeout: 15_000 });

		await expect(page.locator("[data-testid=about]")).toBeVisible({ timeout: 10_000 });
		/* Proves retry happened: chunk was requested more than once */
		expect(requestCount).toBeGreaterThan(1);
	});

	test("all retries fail triggers page reload", async ({ page }) => {
		await loadPage(page, "/");
		await setNavMarker(page);

		/* Intercept JS chunks — fail ALL about chunk requests */
		await page.route("**/*.js", async (route) => {
			const url = route.request().url();
			if (url.includes("about")) {
				await route.abort("connectionfailed");
				return;
			}
			await route.continue();
		});

		await page.click("a[href='/about']");

		/* Wait for reload — the nav marker should be destroyed */
		await page.waitForFunction(
			() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ !== "number",
			null,
			{ timeout: 15_000 },
		);

		/* Page reloaded — marker is gone */
		const markerGone = await page.evaluate(
			() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ !== "number",
		);
		expect(markerGone).toBe(true);
	});
});
