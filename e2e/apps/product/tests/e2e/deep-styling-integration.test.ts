import { expect, test } from "@playwright/test";
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Styling integration: all sources coexist", () => {
	test("combo page renders all 5 styling sources correctly", async ({ page }) => {
		await loadPage(page, "/styling-combo");

		/* 1. combo-global has background from head.css */
		const globalBg = await page.getByTestId("combo-global").evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(globalBg).not.toBe("rgba(0, 0, 0, 0)");

		/* 2. custom-inline has opacity from custom.styles */
		const inlineOpacity = await page.getByTestId("combo-inline").evaluate((el) => getComputedStyle(el).opacity);
		expect(inlineOpacity).toBe("0.9");

		/* 3. combo-scoped has margin from styles() */
		const scopedMargin = await page.getByTestId("combo-scoped").evaluate((el) => getComputedStyle(el).margin);
		expect(scopedMargin).toBe("10px");

		/* 4. combo-tw has color from tw="" */
		const twEl = page.getByTestId("combo-tw");
		await expect(twEl).toBeVisible();
		const twDataC = await twEl.getAttribute("data-c");
		expect(twDataC).toBeTruthy();

		/* 5. combo-css has font-style from css="" */
		const cssFontStyle = await page.getByTestId("combo-css").evaluate((el) => getComputedStyle(el).fontStyle);
		expect(cssFontStyle).toBe("italic");
	});
});

test.describe("Styling integration: SSR HTML complete", () => {
	test("SSR HTML has link, style, and data-c attrs", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-combo`);
		const html = await response.text();

		/* head.css link */
		expect(html).toContain('href="/combo-global.css"');

		/* custom.styles inline */
		expect(html).toContain(".custom-inline");

		/* scoped data-c attributes */
		expect(html).toContain("data-c=");

		/* data-testid markers present */
		expect(html).toContain('data-testid="combo-global"');
		expect(html).toContain('data-testid="combo-scoped"');
		expect(html).toContain('data-testid="combo-css"');
	});
});

test.describe("Styling integration: hydration no duplication", () => {
	test("no duplicate stylesheets or style tags after hydrate", async ({ page }) => {
		await loadPage(page, "/styling-combo");

		/* Only one combo-global.css link */
		const linkCount = await page.evaluate(() => document.querySelectorAll('link[href="/combo-global.css"]').length);
		expect(linkCount).toBe(1);

		/* Scoped style tag at most once */
		const scopedCount = await page.evaluate(() => document.querySelectorAll("style#__FLARE_SCOPED__").length);
		expect(scopedCount).toBeLessThanOrEqual(1);
	});
});

test.describe("Styling integration: SPA round-trip", () => {
	test("nav away and back preserves all styling sources", async ({ page }) => {
		await loadPage(page, "/styling-combo");

		/* Capture initial state */
		const initialOpacity = await page.getByTestId("combo-inline").evaluate((el) => getComputedStyle(el).opacity);

		await navigateSPA(page, "/about");
		await navigateSPA(page, "/styling-combo");

		/* Verify styles restored */
		const finalOpacity = await page.getByTestId("combo-inline").evaluate((el) => getComputedStyle(el).opacity);
		expect(finalOpacity).toBe(initialOpacity);

		const finalFontStyle = await page.getByTestId("combo-css").evaluate((el) => getComputedStyle(el).fontStyle);
		expect(finalFontStyle).toBe("italic");

		const finalMargin = await page.getByTestId("combo-scoped").evaluate((el) => getComputedStyle(el).margin);
		expect(finalMargin).toBe("10px");
	});
});

test.describe("Styling integration: multi-page nav chain", () => {
	test("styles appear and disappear correctly across navigation chain", async ({ page }) => {
		const cap = setupConsoleCapture(page);

		/* Start at home */
		await loadPage(page, "/");

		/* → styling-tw: tw styles applied */
		await navigateSPA(page, "/styling-tw");
		await expect(page.getByTestId("tw-box")).toBeVisible();
		const twDisplay = await page.getByTestId("tw-box").evaluate((el) => getComputedStyle(el).display);
		expect(twDisplay).toBe("flex");

		/* → styling-head-css: head.css link added */
		await navigateSPA(page, "/styling-head-css");
		await expect(page.getByTestId("head-css-box")).toBeVisible();
		const headCssLink = await page.evaluate(() => document.querySelectorAll('link[href="/test-styles.css"]').length);
		expect(headCssLink).toBe(1);

		/* → styling-combo: combo styles applied, head-css link removed */
		await navigateSPA(page, "/styling-combo");
		await expect(page.getByTestId("styling-combo")).toBeVisible();
		const oldHeadCss = await page.evaluate(() => document.querySelectorAll('link[href="/test-styles.css"]').length);
		expect(oldHeadCss).toBe(0);
		const comboCss = await page.evaluate(() => document.querySelectorAll('link[href="/combo-global.css"]').length);
		expect(comboCss).toBe(1);

		/* → home: combo styles cleaned up */
		await navigateSPA(page, "/");
		const comboAfter = await page.evaluate(() => document.querySelectorAll('link[href="/combo-global.css"]').length);
		expect(comboAfter).toBe(0);

		cap.assertClean();
	});
});

test.describe("Styling integration: console clean across chain", () => {
	test("no errors during full styling navigation chain", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-tw");
		await navigateSPA(page, "/styling-css-prop");
		await navigateSPA(page, "/styling-vars");
		await navigateSPA(page, "/styling-head-css");
		await navigateSPA(page, "/styling-child-a");
		await navigateSPA(page, "/styling-child-b");
		await navigateSPA(page, "/styling-combo");
		await navigateSPA(page, "/");
		cap.assertClean();
	});
});
