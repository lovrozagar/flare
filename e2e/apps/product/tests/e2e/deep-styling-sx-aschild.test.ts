import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

test.describe("sx: ButtonSlot — polymorphic as prop with sx cascade", () => {
	test("default: renders native button with lib background", async ({ page }) => {
		await loadPage(page, "/styling-sx-aschild");
		const btn = page.getByTestId("btn-default");
		await expect(btn).toBeVisible();

		const tag = await btn.evaluate((el) => el.tagName.toLowerCase());
		expect(tag).toBe("button");

		const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).toBe("rgb(0, 120, 200)");
	});

	test("default: lib text color applied", async ({ page }) => {
		await loadPage(page, "/styling-sx-aschild");
		const color = await page.getByTestId("btn-default").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(255, 255, 255)");
	});

	test("as=a: renders anchor tag with lib background", async ({ page }) => {
		await loadPage(page, "/styling-sx-aschild");
		const link = page.getByTestId("btn-as-link");
		await expect(link).toBeVisible();

		const tag = await link.evaluate((el) => el.tagName.toLowerCase());
		expect(tag).toBe("a");

		const bg = await link.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).toBe("rgb(0, 120, 200)");
	});

	test("consumer style override wins over lib sx (highest specificity)", async ({ page }) => {
		await loadPage(page, "/styling-sx-aschild");
		const bg = await page.getByTestId("btn-style-override").evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).toBe("rgb(200, 50, 50)");
	});

	test("consumer class override: class attr present on rendered element", async ({ page }) => {
		await loadPage(page, "/styling-sx-aschild");
		const cls = await page.getByTestId("btn-class-override").getAttribute("class");
		expect(cls).toContain("btn-override-red");
	});

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-aschild");
		cap.assertClean();
	});
});
