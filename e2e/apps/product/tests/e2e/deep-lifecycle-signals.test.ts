import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

type FlareWin = Window & {
	__flareIdled?: () => boolean;
	__flareInteracted?: () => boolean;
};

test.describe("lifecycle signals", () => {
	test("interacted starts false after hydration (no user input yet)", async ({ page }) => {
		await loadPage(page, "/");
		expect(await page.evaluate(() => (window as unknown as FlareWin).__flareInteracted?.())).toBe(false);
	});

	test("interacted flips to true on mousemove", async ({ page }) => {
		await loadPage(page, "/");
		expect(await page.evaluate(() => (window as unknown as FlareWin).__flareInteracted?.())).toBe(false);
		await page.mouse.move(100, 100);
		expect(await page.evaluate(() => (window as unknown as FlareWin).__flareInteracted?.())).toBe(true);
	});

	test("interacted flips to true on keydown", async ({ page }) => {
		await loadPage(page, "/");
		expect(await page.evaluate(() => (window as unknown as FlareWin).__flareInteracted?.())).toBe(false);
		await page.keyboard.press("Tab");
		expect(await page.evaluate(() => (window as unknown as FlareWin).__flareInteracted?.())).toBe(true);
	});

	test("interacted stays true after multiple events", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(50, 50);
		expect(await page.evaluate(() => (window as unknown as FlareWin).__flareInteracted?.())).toBe(true);
		await page.keyboard.press("Tab");
		expect(await page.evaluate(() => (window as unknown as FlareWin).__flareInteracted?.())).toBe(true);
	});

	test("idled eventually becomes true", async ({ page }) => {
		await loadPage(page, "/");
		await page.waitForFunction(() => (window as unknown as FlareWin).__flareIdled?.() === true, null, {
			timeout: 10_000,
		});
		expect(await page.evaluate(() => (window as unknown as FlareWin).__flareIdled?.())).toBe(true);
	});
});
