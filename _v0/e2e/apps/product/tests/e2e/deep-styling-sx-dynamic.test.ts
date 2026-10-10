import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture, BASE } from "./helpers";

/* ── Signal color: CSS var update path ─────────────────────────────── */

test.describe("sx: signal color — CSS var live update", () => {
	test("initial color is first in cycle", async ({ page }) => {
		await loadPage(page, "/styling-sx-signal-color");
		const color = await page.getByTestId("signal-color-box").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(200, 0, 0)");
	});

	test("first cycle updates to second color", async ({ page }) => {
		await loadPage(page, "/styling-sx-signal-color");
		await page.getByTestId("cycle-color").click();

		const color = await page.getByTestId("signal-color-box").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(0, 200, 0)");
	});

	test("second cycle updates to third color", async ({ page }) => {
		await loadPage(page, "/styling-sx-signal-color");
		const btn = page.getByTestId("cycle-color");
		await btn.click();
		await btn.click();

		const color = await page.getByTestId("signal-color-box").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(0, 0, 200)");
	});

	test("cycling wraps back to first color", async ({ page }) => {
		await loadPage(page, "/styling-sx-signal-color");
		const btn = page.getByTestId("cycle-color");
		await btn.click();
		await btn.click();
		await btn.click();

		const color = await page.getByTestId("signal-color-box").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(200, 0, 0)");
	});

	test("flare-runtime sheet is NOT re-registered on each update (no duplicates)", async ({ page }) => {
		await loadPage(page, "/styling-sx-signal-color");

		const rulesBeforeCycle = await page.evaluate(() => {
			const el = document.getElementById("flare-runtime") as HTMLStyleElement | null;
			return el?.sheet?.cssRules.length ?? 0;
		});

		await page.getByTestId("cycle-color").click();
		await page.getByTestId("cycle-color").click();

		const rulesAfterCycle = await page.evaluate(() => {
			const el = document.getElementById("flare-runtime") as HTMLStyleElement | null;
			return el?.sheet?.cssRules.length ?? 0;
		});

		/* CSS var update must NOT add new rules — same class, just inline style changes */
		expect(rulesAfterCycle).toBeLessThanOrEqual(rulesBeforeCycle + 1);
	});

	test("no console errors with color cycling", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-signal-color");
		await page.getByTestId("cycle-color").click();
		await page.getByTestId("cycle-color").click();
		cap.assertClean();
	});
});

/* ── Signal variant: data-attr switching ───────────────────────────── */

test.describe("sx: signal variant — data-attr activates variant class", () => {
	test("initial info variant background", async ({ page }) => {
		await loadPage(page, "/styling-sx-signal-variant");
		const box = page.getByTestId("signal-variant-box");

		expect(await box.getAttribute("data-variant")).toBe("info");
		const bg = await box.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).toBe("rgb(220, 235, 255)");
	});

	test("cycling to success changes background", async ({ page }) => {
		await loadPage(page, "/styling-sx-signal-variant");
		await page.getByTestId("cycle-variant").click();

		const box = page.getByTestId("signal-variant-box");
		expect(await box.getAttribute("data-variant")).toBe("success");
		const bg = await box.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).toBe("rgb(220, 255, 220)");
	});

	test("cycling to error changes background", async ({ page }) => {
		await loadPage(page, "/styling-sx-signal-variant");
		const btn = page.getByTestId("cycle-variant");
		await btn.click();
		await btn.click();

		const box = page.getByTestId("signal-variant-box");
		expect(await box.getAttribute("data-variant")).toBe("error");
		const bg = await box.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).toBe("rgb(255, 220, 220)");
	});

	test("variant color changes alongside background", async ({ page }) => {
		await loadPage(page, "/styling-sx-signal-variant");

		const infoColor = await page.getByTestId("signal-variant-box").evaluate((el) => getComputedStyle(el).color);
		expect(infoColor).toBe("rgb(0, 50, 180)");

		await page.getByTestId("cycle-variant").click();
		const successColor = await page.getByTestId("signal-variant-box").evaluate((el) => getComputedStyle(el).color);
		expect(successColor).toBe("rgb(0, 130, 0)");
	});

	test("SSR renders box with data-variant=info", async ({ page }) => {
		const res = await page.request.get(`${BASE}/styling-sx-signal-variant`);
		const html = await res.text();
		expect(html).toContain('data-variant="info"');
		expect(html).toContain('data-testid="signal-variant-box"');
	});

	test("no console errors with variant cycling", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-signal-variant");
		await page.getByTestId("cycle-variant").click();
		await page.getByTestId("cycle-variant").click();
		cap.assertClean();
	});
});
