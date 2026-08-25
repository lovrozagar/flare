import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("Error Handling", () => {
	test("unknown URL returns 404", async ({ page }) => {
		const response = await page.goto("/nonexistent-page-xyz");
		expect(response).not.toBeNull();
		expect(response?.status()).toBe(404);
	});

	test("/broken returns 500 with error stacks stripped from FlareState", async ({ page }) => {
		const response = await page.goto("/broken", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(500);
		const flareState = await page.evaluate(() => (self as unknown as { flare?: Record<string, unknown> }).flare);
		expect(flareState).toBeDefined();
		/* Error stacks are stripped from serialized FlareState for security */
		expect(flareState?.e).toBeUndefined();
	});

	test("/dashboard without auth returns 401", async ({ page }) => {
		const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(401);
	});

	test("CSR nav to /broken navigates without page crash", async ({ page }) => {
		await loadPage(page, "/");
		/* Navigate to broken — loader error comes via NDJSON */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (nav) nav("/broken");
		});
		await page.waitForURL("**/broken", { timeout: 10_000 });
		/* URL changes — page doesn't crash */
		expect(page.url()).toContain("/broken");
	});

	test("CSR nav to /dashboard without auth shows unauthenticated boundary", async ({ page }) => {
		await loadPage(page, "/");
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (nav) nav("/dashboard");
		});
		await page.waitForURL("**/dashboard", { timeout: 10_000 });
		expect(page.url()).toContain("/dashboard");
		await expect(page.getByTestId("dashboard-unauthenticated")).toBeVisible();
	});
});
