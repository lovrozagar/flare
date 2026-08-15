import { expect, test } from "@playwright/test";
import { navigateSPA } from "./helpers";

test.describe("Search params: multi-value preservation", () => {
	test("SSR preserves all values for repeated query keys", async ({ page }) => {
		await page.goto("/search-demo?tag=a&tag=b&tag=c");
		const text = await page.locator('[data-testid="search-all-params"]').textContent();
		const parsed = JSON.parse(text ?? "{}");
		expect(parsed.tag).toEqual(["a", "b", "c"]);
	});

	test("SSR single-value keys remain strings", async ({ page }) => {
		await page.goto("/search-demo?q=hello&page=1");
		const text = await page.locator('[data-testid="search-all-params"]').textContent();
		const parsed = JSON.parse(text ?? "{}");
		expect(parsed.q).toBe("hello");
		expect(parsed.page).toBe("1");
	});

	test("SSR mixed single and multi-value params", async ({ page }) => {
		await page.goto("/search-demo?q=search&tag=a&tag=b&page=1");
		const text = await page.locator('[data-testid="search-all-params"]').textContent();
		const parsed = JSON.parse(text ?? "{}");
		expect(parsed.q).toBe("search");
		expect(parsed.tag).toEqual(["a", "b"]);
		expect(parsed.page).toBe("1");
	});

	test("client hydration preserves multi-value search params", async ({ page }) => {
		await page.goto("/search-demo?tag=x&tag=y");
		await page.waitForSelector("[data-hydrated]");
		const text = await page.locator('[data-testid="search-all-params"]').textContent();
		const parsed = JSON.parse(text ?? "{}");
		expect(parsed.tag).toEqual(["x", "y"]);
	});

	test("SPA navigation preserves multi-value search params", async ({ page }) => {
		await page.goto("/search-demo?q=initial");
		await page.waitForSelector("[data-hydrated]");
		await navigateSPA(page, "/search-demo?color=red&color=blue&color=green");
		/* Wait for loader data to reflect the new search params */
		await page.waitForFunction(() => {
			const el = document.querySelector('[data-testid="search-all-params"]');
			return el?.textContent?.includes("color");
		});
		const text = await page.locator('[data-testid="search-all-params"]').textContent();
		const parsed = JSON.parse(text ?? "{}");
		expect(parsed.color).toEqual(["red", "blue", "green"]);
	});
});
