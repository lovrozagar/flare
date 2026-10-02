import { expect, type Page, test } from "@playwright/test";
import { assertSPANavigation, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

const ROOT_CSS = ":root { --flare-root-sheet: on; }";

async function rootSheet(page: Page): Promise<{ count: number; value: string }> {
	return page.evaluate((css) => {
		const count = [...document.querySelectorAll("style")].filter((el) => el.textContent === css).length;
		const value = getComputedStyle(document.documentElement).getPropertyValue("--flare-root-sheet").trim();
		return { count, value };
	}, ROOT_CSS);
}

async function expectRootSheet(page: Page): Promise<void> {
	await expect.poll(() => rootSheet(page)).toEqual({ count: 1, value: "on" });
}

async function goBack(page: Page, path: string): Promise<void> {
	await page.goBack();
	await page.waitForURL(`**${path}`, { timeout: 10_000 });
	await assertSPANavigation(page);
}

test.describe("Root layout head CSS survives history navigation", () => {
	test("back to a cached page after a different-params target keeps the root sheet", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/about");
		await expectRootSheet(page);

		await navigateSPA(page, "/blog/hello-world");
		await expect(page.getByTestId("blog-post")).toBeVisible();
		await expectRootSheet(page);

		await goBack(page, "/about");
		await expect(page.getByTestId("about")).toBeVisible();
		await expectRootSheet(page);
		cap.assertClean();
	});

	test("back to a cached page after a same-params target keeps the root sheet", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/about");

		await navigateSPA(page, "/styling-custom-a");
		await expect(page.getByTestId("custom-styles-a")).toBeVisible();
		await expectRootSheet(page);

		await goBack(page, "/about");
		await expect(page.getByTestId("about")).toBeVisible();
		await expectRootSheet(page);
		cap.assertClean();
	});

	test("forward after back keeps the root sheet", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/about");
		await navigateSPA(page, "/styling-custom-a");
		await expect(page.getByTestId("custom-styles-a")).toBeVisible();

		await goBack(page, "/about");
		await expectRootSheet(page);

		await page.goForward();
		await page.waitForURL("**/styling-custom-a", { timeout: 10_000 });
		await assertSPANavigation(page);
		await expect(page.getByTestId("custom-styles-a")).toBeVisible();
		await expectRootSheet(page);
		cap.assertClean();
	});
});
