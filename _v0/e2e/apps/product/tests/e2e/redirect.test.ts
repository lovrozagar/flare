import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("redirect", () => {
	test("default status is 303", async ({ request }) => {
		const response = await request.get("/old-page", { maxRedirects: 0 });
		expect(response.status()).toBe(303);
		expect(response.headers().location).toBe("/about");
	});

	test("SSR redirect lands on about", async ({ page }) => {
		await page.goto("/old-page");
		await page.waitForURL("**/about");
		await expect(page.getByTestId("about")).toBeVisible();
	});

	test("CSR redirect is SPA and lands on about", async ({ page }) => {
		await loadPage(page, "/");
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/old-page");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });
		await expect(page.getByTestId("about")).toBeVisible();
	});
});
