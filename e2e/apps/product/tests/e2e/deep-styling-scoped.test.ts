import { expect, test } from "@playwright/test";
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Scoped styles: styles() SSR", () => {
	test("styles() element has data-c attribute in SSR HTML", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-tw`);
		const html = await response.text();
		expect(html).toContain('data-testid="tw-box"');
		expect(html).toContain('data-c="tw-box"');
	});

	test("styles() SSR HTML contains scoped CSS in style tag", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-tw`);
		const html = await response.text();
		expect(html).toContain('[data-c="tw-box"]');
		expect(html).toContain("display:flex");
	});
});

test.describe("Scoped styles: styles() computed", () => {
	test("styles() renders correct computed styles", async ({ page }) => {
		await loadPage(page, "/styling-tw");
		const box = page.getByTestId("tw-box");
		await expect(box).toBeVisible();

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el);
			return {
				color: cs.color,
				display: cs.display,
			};
		});
		expect(computed.display).toBe("flex");
		expect(computed.color).toBe("rgb(255, 255, 255)");
	});
});

test.describe("Scoped styles: css-box SSR", () => {
	test("css-box has data-c attribute in SSR HTML", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-css-prop`);
		const html = await response.text();
		expect(html).toContain('data-testid="css-box"');
		expect(html).toContain('data-c="css-box"');
		expect(html).toContain('[data-c="css-box"]');
	});
});

test.describe("Scoped styles: css-box computed", () => {
	test("css-box renders correct computed color and font-size", async ({ page }) => {
		await loadPage(page, "/styling-css-prop");
		const box = page.getByTestId("css-box");
		await expect(box).toBeVisible();

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el);
			return {
				color: cs.color,
				fontSize: cs.fontSize,
				padding: cs.padding,
			};
		});
		expect(computed.color).toBe("rgb(255, 0, 0)");
		expect(computed.fontSize).toBe("24px");
		expect(computed.padding).toBe("16px");
	});
});

test.describe("Scoped styles: styles() vars SSR", () => {
	test("styles() vars produce inline style in SSR HTML", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-vars`);
		const html = await response.text();
		expect(html).toContain("--_0");
		expect(html).toContain("green");
	});
});

test.describe("Scoped styles: styles() vars computed", () => {
	test("styles() vars produce correct computed color", async ({ page }) => {
		await loadPage(page, "/styling-vars");
		const box = page.getByTestId("var-box");
		await expect(box).toBeVisible();

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { color: cs.color };
		});
		expect(computed.color).toBe("rgb(0, 128, 0)");
	});
});

test.describe("Scoped styles: styles() state attrs", () => {
	test("data-active attribute present and font-weight bold", async ({ page }) => {
		await loadPage(page, "/styling-vars");
		const box = page.getByTestId("var-box");

		const dataActive = await box.getAttribute("data-active");
		expect(dataActive).toBe("true");

		const fontWeight = await box.evaluate((el) => getComputedStyle(el).fontWeight);
		expect(Number(fontWeight)).toBeGreaterThanOrEqual(700);
	});
});

test.describe("Scoped styles: isolation", () => {
	test("different styled components get different data-c values", async ({ page }) => {
		await loadPage(page, "/styles-demo");
		const box = page.getByTestId("styled-box");
		const sm = page.getByTestId("styled-sm");

		const boxC = await box.getAttribute("data-c");
		const smC = await sm.getAttribute("data-c");

		expect(boxC).toBeTruthy();
		expect(smC).toBeTruthy();
		expect(boxC).not.toBe(smC);
	});
});

test.describe("Scoped styles: SPA navigation", () => {
	test("SPA nav preserves data-c and computed styles", async ({ page }) => {
		await loadPage(page, "/styling-css-prop");
		const originalC = await page.getByTestId("css-box").getAttribute("data-c");

		await navigateSPA(page, "/about");
		await navigateSPA(page, "/styling-css-prop");

		const newC = await page.getByTestId("css-box").getAttribute("data-c");
		expect(newC).toBe(originalC);

		const color = await page.getByTestId("css-box").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(255, 0, 0)");
	});
});

test.describe("Scoped styles: SSR hydration no duplication", () => {
	test("scoped style tag count stays at most 1 after hydrate", async ({ page }) => {
		await loadPage(page, "/styling-css-prop");
		const scopedCount = await page.evaluate(() => document.querySelectorAll("style#__FLARE_SCOPED__").length);
		expect(scopedCount).toBeLessThanOrEqual(1);
	});
});

test.describe("Scoped styles: console clean", () => {
	test("no console errors across scoped style pages", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-tw");
		await navigateSPA(page, "/styling-css-prop");
		await navigateSPA(page, "/styling-vars");
		await navigateSPA(page, "/styles-demo");
		cap.assertClean();
	});
});
