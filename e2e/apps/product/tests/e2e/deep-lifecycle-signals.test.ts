import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("lifecycle signals", () => {
	test("interacted starts false after hydration (no user input yet)", async ({ page }) => {
		await loadPage(page, "/");

		const interacted = await page.evaluate("window.__flareInteracted?.()");
		expect(interacted).toBe(false);
	});

	test("interacted flips to true on mousemove", async ({ page }) => {
		await loadPage(page, "/");

		expect(await page.evaluate("window.__flareInteracted?.()")).toBe(false);

		await page.mouse.move(100, 100);

		expect(await page.evaluate("window.__flareInteracted?.()")).toBe(true);
	});

	test("interacted flips to true on keydown", async ({ page }) => {
		await loadPage(page, "/");

		expect(await page.evaluate("window.__flareInteracted?.()")).toBe(false);

		await page.keyboard.press("Tab");

		expect(await page.evaluate("window.__flareInteracted?.()")).toBe(true);
	});

	test("interacted stays true after multiple events", async ({ page }) => {
		await loadPage(page, "/");

		await page.mouse.move(50, 50);
		expect(await page.evaluate("window.__flareInteracted?.()")).toBe(true);

		await page.keyboard.press("Tab");
		expect(await page.evaluate("window.__flareInteracted?.()")).toBe(true);
	});

	test("idled eventually becomes true", async ({ page }) => {
		await loadPage(page, "/");

		/* requestIdleCallback fires when browser is idle — wait for it */
		await page.waitForFunction("window.__flareIdled?.()", { timeout: 10_000 });

		expect(await page.evaluate("window.__flareIdled?.()")).toBe(true);
	});
});
