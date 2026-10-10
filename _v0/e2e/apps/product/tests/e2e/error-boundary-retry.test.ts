import { expect, test } from "@playwright/test";

test.describe("Error boundary retry/reset", () => {
	test.beforeEach(async ({ request }) => {
		/* Reset the server-side counter before each test */
		await request.get("/api/retry-reset");
	});

	test("error boundary renders retry button on loader failure", async ({ page }) => {
		await page.goto("/retry-test", { waitUntil: "domcontentloaded" });
		await expect(page.locator("[data-testid=retry-error-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=retry-error-message]")).toContainText("Transient failure");
		await expect(page.locator("[data-testid=retry-button]")).toBeVisible();
	});

	test("clicking retry re-runs loader and page renders on success", async ({ page }) => {
		/* First load fails (callCount=1) */
		await page.goto("/retry-test", { waitUntil: "networkidle" });
		await expect(page.locator("[data-testid=retry-error-boundary]")).toBeVisible();

		/* Click retry — SPA nav with revalidate, second attempt (callCount=2) succeeds */
		await page.locator("[data-testid=retry-button]").click();
		await expect(page.locator("[data-testid=retry-success]")).toBeVisible({ timeout: 5_000 });
		await expect(page.locator("[data-testid=attempt-count]")).toContainText("Attempt:");
	});

	test("errorRender receives error.message from thrown error", async ({ page }) => {
		await page.goto("/retry-test", { waitUntil: "domcontentloaded" });
		const msg = await page.locator("[data-testid=retry-error-message]").textContent();
		expect(msg).toBe("Transient failure");
	});

	test("SSR returns 500 for error route", async ({ page }) => {
		const response = await page.goto("/retry-test", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(500);
	});
});
