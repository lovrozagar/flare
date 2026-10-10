import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture, BASE } from "./helpers";

/* ── Custom Button ──────────────────────────────────────────────────── */

test.describe("sx: custom button — base lib styles", () => {
	test("default button renders with lib background color", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-button");
		const btn = page.getByTestId("btn-default");
		await expect(btn).toBeVisible();

		const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).toBe("rgb(0, 80, 200)");
	});

	test("default button renders with lib text color", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-button");
		const color = await page.getByTestId("btn-default").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(255, 255, 255)");
	});

	test("style override wins over sx lib background", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-button");
		const bg = await page.getByTestId("btn-style-override").evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).toBe("rgb(200, 0, 0)");
	});

	test("consumer class coexists with lib classes", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-button");
		const cls = await page.getByTestId("btn-class-override").getAttribute("class");
		expect(cls).toContain("consumer-btn-class");
		/* lib anchor class also present */
		expect(cls).toContain("sx-custom-btn");
	});

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-custom-button");
		cap.assertClean();
	});
});

/* ── Card + Button composition ──────────────────────────────────────── */

test.describe("sx: custom composition — Card wrapping Button", () => {
	test("card outer element is visible", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-composition");
		await expect(page.getByTestId("card-outer")).toBeVisible();
	});

	test("card text has correct sx color", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-composition");
		const color = await page.getByTestId("card-text").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(40, 40, 40)");
	});

	test("nested button inside card has lib background", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-composition");
		const bg = await page.getByTestId("card-btn").evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).toBe("rgb(0, 80, 200)");
	});

	test("card consumer style override applies", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-composition");
		const bg = await page.getByTestId("card-override").evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).toBe("rgb(230, 240, 255)");
	});

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-custom-composition");
		cap.assertClean();
	});
});

/* ── Mapped list ────────────────────────────────────────────────────── */

test.describe("sx: custom list — mapped items with per-item sx", () => {
	test("even-index items have blue color", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-list");
		const color = await page.getByTestId("sx-list-item-0").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(0, 0, 180)");
	});

	test("odd-index items have red color", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-list");
		const color = await page.getByTestId("sx-list-item-1").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(180, 0, 0)");
	});

	test("all four items rendered", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-list");
		for (let i = 0; i < 4; i++) {
			await expect(page.getByTestId(`sx-list-item-${i}`)).toBeVisible();
		}
	});

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-custom-list");
		cap.assertClean();
	});
});

/* ── Tabs: interactive active state ────────────────────────────────── */

test.describe("sx: custom tabs — data-active variant switching", () => {
	test("first tab has data-active on load", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-tabs");
		const attr = await page.getByTestId("sx-tab-0").getAttribute("data-active");
		expect(attr).toBe("true");
	});

	test("clicking second tab moves data-active", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-tabs");
		await page.getByTestId("sx-tab-1").click();

		expect(await page.getByTestId("sx-tab-1").getAttribute("data-active")).toBe("true");
		expect(await page.getByTestId("sx-tab-0").getAttribute("data-active")).toBeNull();
	});

	test("active tab has distinct color from inactive", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-tabs");

		const activeColor = await page.getByTestId("sx-tab-0").evaluate((el) => getComputedStyle(el).color);
		const inactiveColor = await page.getByTestId("sx-tab-1").evaluate((el) => getComputedStyle(el).color);

		/* active tab uses rgb(0, 80, 200); inactive uses rgb(100, 100, 100) */
		expect(activeColor).not.toBe(inactiveColor);
	});

	test("panel content updates on tab click", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-tabs");
		await page.getByTestId("sx-tab-2").click();

		const text = await page.getByTestId("sx-tab-panel").textContent();
		expect(text).toContain("Settings");
	});

	test("no console errors with tab switching", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-custom-tabs");
		await page.getByTestId("sx-tab-1").click();
		await page.getByTestId("sx-tab-2").click();
		cap.assertClean();
	});
});

/* ── Dialog: portal + backdrop + content styling ───────────────────── */

test.describe("sx: custom dialog — portal styling", () => {
	test("dialog not visible on load", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-dialog");
		await expect(page.getByTestId("sx-dialog-backdrop")).not.toBeVisible();
	});

	test("clicking open renders backdrop", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-dialog");
		await page.getByTestId("open-dialog").click();
		await expect(page.getByTestId("sx-dialog-backdrop")).toBeVisible();
	});

	test("dialog content is visible after open", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-dialog");
		await page.getByTestId("open-dialog").click();
		await expect(page.getByTestId("sx-dialog-content")).toBeVisible();
	});

	test("dialog content has white background from sx", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-dialog");
		await page.getByTestId("open-dialog").click();

		const bg = await page.getByTestId("sx-dialog-content").evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).toBe("rgb(255, 255, 255)");
	});

	test("close button dismisses dialog", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-dialog");
		await page.getByTestId("open-dialog").click();
		await expect(page.getByTestId("sx-dialog-backdrop")).toBeVisible();

		await page.getByTestId("close-dialog").click();
		await expect(page.getByTestId("sx-dialog-backdrop")).not.toBeVisible();
	});

	test("SSR renders main element without open dialog", async ({ page }) => {
		const res = await page.request.get(`${BASE}/styling-sx-custom-dialog`);
		const html = await res.text();
		expect(html).toContain('data-testid="styling-sx-custom-dialog"');
		/* backdrop not rendered server-side (signal starts false) */
		expect(html).not.toContain('data-testid="sx-dialog-backdrop"');
	});

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-custom-dialog");
		await page.getByTestId("open-dialog").click();
		await page.getByTestId("close-dialog").click();
		cap.assertClean();
	});
});
