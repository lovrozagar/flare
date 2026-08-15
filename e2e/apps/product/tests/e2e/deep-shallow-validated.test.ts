import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

test.describe("Shallow navigation with input validation", () => {
	test("SSR applies input defaults to loaderData", async ({ page }) => {
		await loadPage(page, "/shallow-validated");

		await expect(page.locator("[data-testid=loader-page]")).toHaveText("1");
		await expect(page.locator("[data-testid=loader-sort]")).toHaveText("name");
		await expect(page.locator("[data-testid=loader-filter]")).toHaveText("");
	});

	test("shallow applies defaults when search params removed", async ({ page }) => {
		await loadPage(page, "/shallow-validated?page=5");

		/* loaderData reflects validated search on initial load */
		await expect(page.locator("[data-testid=loader-page]")).toHaveText("5");

		await page.click("[data-testid=shallow-defaults]");
		await page.waitForTimeout(500);

		/* search signal updated with validated defaults */
		await expect(page.locator("[data-testid=search-page]")).toHaveText("1");
		await expect(page.locator("[data-testid=search-sort]")).toHaveText("name");

		/* loaderData stays from initial load */
		await expect(page.locator("[data-testid=loader-page]")).toHaveText("5");
	});

	test("shallow transforms values via validator", async ({ page }) => {
		await loadPage(page, "/shallow-validated");

		await page.click("[data-testid=shallow-transform]");
		await page.waitForTimeout(500);

		/* validator trims whitespace and lowercases */
		await expect(page.locator("[data-testid=search-filter]")).toHaveText("hello");
	});

	test("shallow preserves explicit values", async ({ page }) => {
		await loadPage(page, "/shallow-validated");

		await page.click("[data-testid=shallow-explicit]");
		await page.waitForTimeout(500);

		await expect(page.locator("[data-testid=search-page]")).toHaveText("3");
		await expect(page.locator("[data-testid=search-sort]")).toHaveText("date");
	});

	test("no hydration mismatch on initial load", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/shallow-validated");
		cap.assertClean();
	});
});
