import { expect, test } from "@playwright/test";
import { clickAndAssertSPA, loadPage, setupConsoleCapture } from "./helpers";

test.describe("Head Management", () => {
	test("SSR renders correct title on /", async ({ page }) => {
		await loadPage(page, "/");
		await expect(page).toHaveTitle("Home");
	});

	test("SSR renders correct title on /about", async ({ page }) => {
		await loadPage(page, "/about");
		await expect(page).toHaveTitle("About - 2026");
	});

	test("head-demo has all meta tags", async ({ page }) => {
		await loadPage(page, "/head-demo");

		const head = page.locator("head");
		await expect(head.locator("meta[name='description']")).toHaveAttribute("content", /complex head configuration/);
		await expect(head.locator("meta[property='og:title']")).toHaveAttribute("content", "Head Demo - OG");
		await expect(head.locator("meta[property='og:type']")).toHaveAttribute("content", "website");
		await expect(head.locator("meta[name='twitter:card']")).toHaveAttribute("content", "summary");
		await expect(head.locator("link[rel='canonical']")).toHaveAttribute("href", "https://example.com/head-demo");

		/* script innerHTML not readable via textContent — check attribute */
		const jsonLd = head.locator("script[type='application/ld+json']");
		const content = await jsonLd.evaluate((el) => el.innerHTML);
		expect(content).toContain("WebPage");
	});

	test("CSR nav updates title (SPA)", async ({ page }) => {
		await loadPage(page, "/about");
		await expect(page).toHaveTitle("About - 2026");
		await clickAndAssertSPA(page, "a[href='/head-demo']", "/head-demo");
		await expect(page).toHaveTitle("Head Demo");
	});

	test("CSR nav updates meta tags (SPA)", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/about");
		await clickAndAssertSPA(page, "a[href='/head-demo']", "/head-demo");
		/* Scope to head to avoid stale <span data-flare-head> in body */
		await expect(page.locator("head meta[name='description']")).toHaveAttribute(
			"content",
			/complex head configuration/,
		);
		cap.assertClean();
	});

	test("root head merges with page head", async ({ page }) => {
		await loadPage(page, "/");
		/* charset from root layout head applied (browser parses it regardless of DOM location) */
		const charset = await page.evaluate(() => document.characterSet);
		expect(charset).toBe("UTF-8");
		/* title from page head */
		await expect(page).toHaveTitle("Home");
	});

	test("title updates through multi-hop SPA chain", async ({ page }) => {
		await loadPage(page, "/");
		await expect(page).toHaveTitle("Home");

		await clickAndAssertSPA(page, "a[href='/about']", "/about");
		await expect(page).toHaveTitle("About - 2026");

		await clickAndAssertSPA(page, "a[href='/blog']", "/blog");
		await expect(page).toHaveTitle("Blog");
	});
});
