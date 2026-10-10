import { expect, test } from "@playwright/test";
import { clickAndAssertSPA, loadPage, setupConsoleCapture } from "./helpers";

test.describe("createPathSegment — layoutless param segments", () => {
	test("SSR: renders category from path segment param", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/path-segment-test/books/detail");
		await expect(page.getByTestId("path-seg-detail")).toBeVisible();
		await expect(page.getByTestId("path-seg-category")).toHaveText("books");
		console.assertClean();
	});

	test("SSR: different param value resolves correctly", async ({ page }) => {
		await loadPage(page, "/path-segment-test/music/detail");
		await expect(page.getByTestId("path-seg-category")).toHaveText("music");
	});

	test("SPA: navigate between path-segment routes", async ({ page }) => {
		await loadPage(page, "/path-segment-test/books/detail");
		await expect(page.getByTestId("path-seg-category")).toHaveText("books");

		await clickAndAssertSPA(page, '[data-testid="link-to-music"]', "/path-segment-test/music/detail");
		await expect(page.getByTestId("path-seg-category")).toHaveText("music");
	});

	test("SPA: navigate back from path-segment route", async ({ page }) => {
		await loadPage(page, "/path-segment-test/books/detail");
		await clickAndAssertSPA(page, '[data-testid="link-to-music"]', "/path-segment-test/music/detail");
		await expect(page.getByTestId("path-seg-category")).toHaveText("music");

		await clickAndAssertSPA(page, '[data-testid="link-to-books"]', "/path-segment-test/books/detail");
		await expect(page.getByTestId("path-seg-category")).toHaveText("books");
	});

	test("deep nesting: two path segments with cartesian params", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/path-seg-deep/acme/api/settings");
		await expect(page.getByTestId("path-seg-deep")).toBeVisible();
		await expect(page.getByTestId("path-seg-org")).toHaveText("acme");
		await expect(page.getByTestId("path-seg-repo")).toHaveText("api");
		console.assertClean();
	});

	test("deep nesting: different org/repo combination", async ({ page }) => {
		await loadPage(page, "/path-seg-deep/globex/main/settings");
		await expect(page.getByTestId("path-seg-org")).toHaveText("globex");
		await expect(page.getByTestId("path-seg-repo")).toHaveText("main");
	});

	test("deep nesting: second org combination", async ({ page }) => {
		await loadPage(page, "/path-seg-deep/acme/web/settings");
		await expect(page.getByTestId("path-seg-org")).toHaveText("acme");
		await expect(page.getByTestId("path-seg-repo")).toHaveText("web");
	});

	test("SSR: FlareState includes path-segment in match chain", async ({ page }) => {
		await loadPage(page, "/path-segment-test/books/detail");
		const state = await page.evaluate(() => (self as unknown as { flare: { m: unknown[] } }).flare);
		/* m array should have at least root + page = 2 entries (path-segment is transparent) */
		expect(state.m.length).toBeGreaterThanOrEqual(2);
	});
});
