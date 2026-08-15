import { expect, test } from "@playwright/test";
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("State switch: variant cycling", () => {
	test("initial variant=primary has correct color", async ({ page }) => {
		await loadPage(page, "/styling-state-switch");
		const box = page.getByTestId("variant-box");

		const color = await box.evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(0, 100, 200)");
		expect(await box.getAttribute("data-variant")).toBe("primary");
	});

	test("cycle to secondary changes color", async ({ page }) => {
		await loadPage(page, "/styling-state-switch");
		await page.getByTestId("cycle-variant").click();

		const box = page.getByTestId("variant-box");
		const color = await box.evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(100, 100, 100)");
		expect(await box.getAttribute("data-variant")).toBe("secondary");
	});

	test("cycle to danger changes color", async ({ page }) => {
		await loadPage(page, "/styling-state-switch");
		const btn = page.getByTestId("cycle-variant");
		await btn.click();
		await btn.click();

		const box = page.getByTestId("variant-box");
		const color = await box.evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(200, 0, 0)");
		expect(await box.getAttribute("data-variant")).toBe("danger");
	});

	test("full cycle back to primary", async ({ page }) => {
		await loadPage(page, "/styling-state-switch");
		const btn = page.getByTestId("cycle-variant");
		await btn.click();
		await btn.click();
		await btn.click();

		const box = page.getByTestId("variant-box");
		const color = await box.evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(0, 100, 200)");
		expect(await box.getAttribute("data-variant")).toBe("primary");
	});
});

test.describe("State switch: size cycling", () => {
	test("initial size=md has font-size 16px", async ({ page }) => {
		await loadPage(page, "/styling-state-switch");
		const box = page.getByTestId("size-box");

		const fontSize = await box.evaluate((el) => getComputedStyle(el).fontSize);
		expect(fontSize).toBe("16px");
		expect(await box.getAttribute("data-size")).toBe("md");
	});

	test("cycle to lg changes font-size to 24px", async ({ page }) => {
		await loadPage(page, "/styling-state-switch");
		await page.getByTestId("cycle-size").click();

		const box = page.getByTestId("size-box");
		const fontSize = await box.evaluate((el) => getComputedStyle(el).fontSize);
		expect(fontSize).toBe("24px");
		expect(await box.getAttribute("data-size")).toBe("lg");
	});

	test("cycle to sm changes font-size to 12px", async ({ page }) => {
		await loadPage(page, "/styling-state-switch");
		const btn = page.getByTestId("cycle-size");
		await btn.click();
		await btn.click();

		const box = page.getByTestId("size-box");
		const fontSize = await box.evaluate((el) => getComputedStyle(el).fontSize);
		expect(fontSize).toBe("12px");
		expect(await box.getAttribute("data-size")).toBe("sm");
	});
});

test.describe("State switch: combo box", () => {
	test("combo box reflects both variant and size simultaneously", async ({ page }) => {
		await loadPage(page, "/styling-state-switch");
		const variantBtn = page.getByTestId("cycle-variant");
		const sizeBtn = page.getByTestId("cycle-size");

		/* variant=secondary, size=lg */
		await variantBtn.click();
		await sizeBtn.click();

		const box = page.getByTestId("combo-box");
		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { color: cs.color, fontSize: cs.fontSize };
		});
		expect(computed.color).toBe("rgb(100, 100, 100)");
		expect(computed.fontSize).toBe("24px");
		expect(await box.getAttribute("data-variant")).toBe("secondary");
		expect(await box.getAttribute("data-size")).toBe("lg");
	});

	test("combo danger+sm produces correct styles", async ({ page }) => {
		await loadPage(page, "/styling-state-switch");
		const variantBtn = page.getByTestId("cycle-variant");
		const sizeBtn = page.getByTestId("cycle-size");

		/* variant: primary→secondary→danger */
		await variantBtn.click();
		await variantBtn.click();
		/* size: md→lg→sm */
		await sizeBtn.click();
		await sizeBtn.click();

		const box = page.getByTestId("combo-box");
		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { color: cs.color, fontSize: cs.fontSize };
		});
		expect(computed.color).toBe("rgb(200, 0, 0)");
		expect(computed.fontSize).toBe("12px");
	});
});

test.describe("State switch: SSR initial", () => {
	test("SSR HTML has data-variant=primary and data-size=md", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-state-switch`);
		const html = await response.text();
		expect(html).toContain('data-variant="primary"');
		expect(html).toContain('data-size="md"');
	});
});

test.describe("State switch: rapid cycling", () => {
	test("5 full variant cycles end at correct state", async ({ page }) => {
		await loadPage(page, "/styling-state-switch");
		const btn = page.getByTestId("cycle-variant");

		/* 5 * 3 = 15 clicks = 5 full cycles = back to primary */
		for (let i = 0; i < 15; i++) {
			await btn.click();
		}

		const box = page.getByTestId("variant-box");
		const color = await box.evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(0, 100, 200)");
		expect(await box.getAttribute("data-variant")).toBe("primary");
	});
});

test.describe("State switch: SPA round-trip", () => {
	test("nav away and back resets to initial state", async ({ page }) => {
		await loadPage(page, "/styling-state-switch");
		await page.getByTestId("cycle-variant").click();
		await page.getByTestId("cycle-size").click();

		await navigateSPA(page, "/about");
		await navigateSPA(page, "/styling-state-switch");

		const variantColor = await page.getByTestId("variant-box").evaluate((el) => getComputedStyle(el).color);
		expect(variantColor).toBe("rgb(0, 100, 200)");

		const sizeFont = await page.getByTestId("size-box").evaluate((el) => getComputedStyle(el).fontSize);
		expect(sizeFont).toBe("16px");
	});
});

test.describe("State switch: console clean", () => {
	test("no console errors during state switching", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-state-switch");
		const variantBtn = page.getByTestId("cycle-variant");
		const sizeBtn = page.getByTestId("cycle-size");

		for (let i = 0; i < 6; i++) {
			await variantBtn.click();
			await sizeBtn.click();
		}
		cap.assertClean();
	});
});
