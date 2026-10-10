import { expect, test } from "@playwright/test";
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

const LAYOUT_CSS = ".layout-inline-sheet { color: rgb(1, 2, 3); }";

test.describe("Head custom.styles: layout sheet is unique after hydrate", () => {
	test("SSR HTML contains the layout sheet once", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-custom-a`);
		const html = await response.text();
		const styleTags =
			html.match(/<style nonce="[^"]*">\.layout-inline-sheet \{ color: rgb\(1, 2, 3\); \}<\/style>/g) ?? [];
		expect(styleTags).toHaveLength(1);
	});

	test("after hydration the layout CSS is a single style tag with the request nonce", async ({ page }) => {
		await loadPage(page, "/styling-custom-a");
		await expect(page.getByTestId("custom-styles-a")).toBeVisible();

		const result = await page.evaluate((css) => {
			const styles = [...document.querySelectorAll("style")].filter((el) => el.textContent === css);
			const nonceMeta = document.querySelector('meta[name="csp-nonce"]');
			const nonce = nonceMeta?.getAttribute("content") || "";
			const tag = styles[0];
			return {
				count: styles.length,
				nonce,
				tagNonce: tag?.nonce || tag?.getAttribute("nonce") || "",
			};
		}, LAYOUT_CSS);

		expect(result.count).toBe(1);
		expect(result.nonce.length).toBeGreaterThan(0);
		expect(result.tagNonce).toBe(result.nonce);
	});

	test("sibling navigation keeps one sheet; leaving the layout removes it", async ({ page }) => {
		await loadPage(page, "/styling-custom-a");
		expect(
			await page.evaluate(
				(css) => [...document.querySelectorAll("style")].filter((el) => el.textContent === css).length,
				LAYOUT_CSS,
			),
		).toBe(1);

		await navigateSPA(page, "/styling-custom-b");
		await expect(page.getByTestId("custom-styles-b")).toBeVisible();
		expect(
			await page.evaluate(
				(css) => [...document.querySelectorAll("style")].filter((el) => el.textContent === css).length,
				LAYOUT_CSS,
			),
		).toBe(1);

		await navigateSPA(page, "/about");
		expect(
			await page.evaluate(
				(css) => [...document.querySelectorAll("style")].filter((el) => el.textContent === css).length,
				LAYOUT_CSS,
			),
		).toBe(0);
	});

	test("no console errors across custom.styles layout pages", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-custom-a");
		await navigateSPA(page, "/styling-custom-b");
		await navigateSPA(page, "/about");
		cap.assertClean();
	});
});
