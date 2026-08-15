import { expect, test } from "@playwright/test";
import { assertFlareState, assertHydrated, loadPage, setupConsoleCapture } from "./helpers";

test.describe("Hydration", () => {
	test("SSR returns HTML with correct content-type", async ({ page }) => {
		const response = await page.goto("/");
		expect(response).not.toBeNull();
		expect(response?.headers()["content-type"]).toContain("text/html");
	});

	test("FlareState embedded and valid", async ({ page }) => {
		await page.goto("/");
		await assertFlareState(page);
	});

	test("data-hydrated present after load", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await assertHydrated(page);
	});

	test("body has content after hydration", async ({ page }) => {
		await loadPage(page, "/");
		await expect(page.locator("body")).toBeVisible();
		const bodyText = await page.locator("body").textContent();
		expect(bodyText?.length).toBeGreaterThan(0);
	});

	test("no console errors during hydration", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/");
		console.assertClean();
	});

	test("no console errors on /about", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/about");
		console.assertClean();
	});

	test("no console errors on /blog", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/blog");
		console.assertClean();
	});

	test("no console errors on /users/42", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/users/42");
		console.assertClean();
	});

	test("no console errors on /head-demo", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/head-demo");
		console.assertClean();
	});

	test("multiple routes produce correct match count", async ({ page }) => {
		await page.goto("/about");
		const flare = await page.evaluate(() => (self as unknown as { flare?: unknown }).flare);
		const state = flare as { m: unknown[] };
		expect(state.m.length).toBeGreaterThanOrEqual(2);
	});

	test("FlareState.p matches pathname on every page", async ({ page }) => {
		for (const path of ["/", "/about", "/blog", "/users/1", "/head-demo"]) {
			await page.goto(path);
			const flare = (await page.evaluate(() => (self as unknown as { flare?: unknown }).flare)) as {
				p: string;
			};
			expect(flare.p).toBe(path);
		}
	});
});
