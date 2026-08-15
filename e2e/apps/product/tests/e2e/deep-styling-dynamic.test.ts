import { expect, test } from "@playwright/test";
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Dynamic styles: Show toggle", () => {
	test("show-box appears with correct styles on toggle", async ({ page }) => {
		await loadPage(page, "/styling-dynamic");

		/* initially hidden */
		await expect(page.getByTestId("show-box")).not.toBeVisible();

		await page.getByTestId("toggle-show").click();

		const box = page.getByTestId("show-box");
		await expect(box).toBeVisible();

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { color: cs.color, fontWeight: cs.fontWeight };
		});
		expect(computed.color).toBe("rgb(0, 100, 200)");
		expect(Number(computed.fontWeight)).toBeGreaterThanOrEqual(700);
	});

	test("show-box disappears on second toggle", async ({ page }) => {
		await loadPage(page, "/styling-dynamic");
		const btn = page.getByTestId("toggle-show");

		await btn.click();
		await expect(page.getByTestId("show-box")).toBeVisible();

		await btn.click();
		await expect(page.getByTestId("show-box")).not.toBeVisible();
	});
});

test.describe("Dynamic styles: For list", () => {
	test("initial For items each have data-c and correct computed color", async ({ page }) => {
		await loadPage(page, "/styling-dynamic");

		const colors: Record<string, string> = {
			"for-item-1": "rgb(255, 0, 0)",
			"for-item-2": "rgb(0, 128, 0)",
			"for-item-3": "rgb(0, 0, 255)",
		};

		for (const [testid, expected] of Object.entries(colors)) {
			const el = page.getByTestId(testid);
			await expect(el).toBeVisible();
			const dataC = await el.getAttribute("data-c");
			expect(dataC).toBeTruthy();
			const color = await el.evaluate((e) => getComputedStyle(e).color);
			expect(color).toBe(expected);
		}
	});

	test("add item creates new styled element", async ({ page }) => {
		await loadPage(page, "/styling-dynamic");

		await page.getByTestId("add-item").click();

		const newItem = page.getByTestId("for-item-4");
		await expect(newItem).toBeVisible();

		const dataC = await newItem.getAttribute("data-c");
		expect(dataC).toBeTruthy();

		const color = await newItem.evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(255, 165, 0)");
	});

	test("remove item removes element, remaining styles intact", async ({ page }) => {
		await loadPage(page, "/styling-dynamic");

		await page.getByTestId("remove-item").click();

		await expect(page.getByTestId("for-item-3")).not.toBeVisible();

		/* remaining items still styled */
		const color1 = await page.getByTestId("for-item-1").evaluate((el) => getComputedStyle(el).color);
		expect(color1).toBe("rgb(255, 0, 0)");

		const color2 = await page.getByTestId("for-item-2").evaluate((el) => getComputedStyle(el).color);
		expect(color2).toBe("rgb(0, 128, 0)");
	});
});

test.describe("Dynamic styles: dynamic color override", () => {
	test("inline style override changes computed color", async ({ page }) => {
		await loadPage(page, "/styling-dynamic");
		const box = page.getByTestId("dynamic-color-box");

		const initial = await box.evaluate((el) => getComputedStyle(el).color);
		expect(initial).toBe("rgb(128, 0, 128)");

		await page.getByTestId("change-color").click();

		const updated = await box.evaluate((el) => getComputedStyle(el).color);
		expect(updated).toBe("rgb(255, 165, 0)");
	});
});

test.describe("Dynamic styles: SPA round-trip", () => {
	test("nav away and back restores initial state", async ({ page }) => {
		await loadPage(page, "/styling-dynamic");

		/* show box, add item */
		await page.getByTestId("toggle-show").click();
		await page.getByTestId("add-item").click();
		await expect(page.getByTestId("show-box")).toBeVisible();
		await expect(page.getByTestId("for-item-4")).toBeVisible();

		await navigateSPA(page, "/about");
		await navigateSPA(page, "/styling-dynamic");

		/* initial state: hidden, 3 items */
		await expect(page.getByTestId("show-box")).not.toBeVisible();
		await expect(page.getByTestId("for-item-4")).not.toBeVisible();
		await expect(page.getByTestId("for-item-3")).toBeVisible();
	});
});

test.describe("Dynamic styles: SSR correctness", () => {
	test("SSR HTML contains for-list items with data-c", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-dynamic`);
		const html = await response.text();
		expect(html).toContain('data-testid="for-item-1"');
		expect(html).toContain('data-testid="for-item-2"');
		expect(html).toContain('data-testid="for-item-3"');
		expect(html).toContain("data-c=");
	});
});

test.describe("Dynamic styles: console clean", () => {
	test("no console errors with dynamic operations", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-dynamic");
		await page.getByTestId("toggle-show").click();
		await page.getByTestId("add-item").click();
		await page.getByTestId("remove-item").click();
		await page.getByTestId("change-color").click();
		cap.assertClean();
	});
});
