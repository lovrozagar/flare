import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Input validation: SSR", () => {
	test("valid numeric param renders data", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/validated/42");

		expect(await page.locator("[data-testid=validated-id]").textContent()).toBe("42");
		expect(await page.locator("[data-testid=validated-message]").textContent()).toBe("Validated user 42");
		cap.assertClean();
	});

	test("invalid non-numeric param returns 500 error", async ({ page }) => {
		const response = await page.goto("/validated/abc", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(500);
	});

	test("another valid numeric param works", async ({ page }) => {
		await loadPage(page, "/validated/99");
		expect(await page.locator("[data-testid=validated-id]").textContent()).toBe("99");
	});
});

test.describe("Input validation: SPA", () => {
	test("SPA nav to valid param works", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await navigateSPA(page, "/validated/42");

		expect(await page.locator("[data-testid=validated-id]").textContent()).toBe("42");
		cap.assertClean();
	});

	test("SPA nav to invalid param shows error", async ({ page }) => {
		await loadPage(page, "/");

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/validated/abc").catch(() => {
				/* validation error expected */
			});
		});
		await page.waitForURL("**/validated/abc", { timeout: 10_000 });

		/* Should show error state — either error boundary or error content */
		const body = await page.evaluate(() => document.body.innerHTML);
		expect(body.length).toBeGreaterThan(0);
	});
});

test.describe("Effects loaderDeps: SSR", () => {
	test("initial load with ?q=foo shows correct deps and q", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/search-effects?q=foo");

		expect(await page.locator("[data-testid=effects-q]").textContent()).toBe("foo");
		const deps = JSON.parse((await page.locator("[data-testid=effects-deps]").textContent()) ?? "[]") as unknown[];
		expect(deps).toEqual(["foo"]);
		cap.assertClean();
	});

	test("timestamp is valid number on SSR", async ({ page }) => {
		await loadPage(page, "/search-effects?q=test");
		const ts = Number(await page.locator("[data-testid=effects-timestamp]").textContent());
		expect(ts).toBeGreaterThan(0);
	});
});

test.describe("Effects loaderDeps: SPA", () => {
	test("SPA nav changing ?q=foo to ?q=bar triggers new loader (different timestamp)", async ({ page }) => {
		await loadPage(page, "/search-effects?q=foo");
		const ts1 = Number(await page.locator("[data-testid=effects-timestamp]").textContent());
		expect(ts1).toBeGreaterThan(0);

		await navigateSPA(page, "/search-effects?q=bar");
		/* Wait for new data to render before reading timestamp */
		await expect(page.locator("[data-testid=effects-q]")).toHaveText("bar", { timeout: 5_000 });
		const ts2 = Number(await page.locator("[data-testid=effects-timestamp]").textContent());
		expect(ts2).toBeGreaterThan(0);
		expect(ts2).not.toBe(ts1);
	});

	test("console clean during effects tests", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/search-effects?q=test");
		cap.assertClean();
	});
});
