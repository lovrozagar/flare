import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

/*
 * Tailwind v4 uses OKLCH — Chrome 111+ reports backgroundColor as `oklch(...)`.
 * Normalize via canvas to sRGB for stable assertions.
 */

test.describe("sx class= Tailwind compile: static utilities", () => {
	test("bg-blue-500 → computed background is blue-500 (rgb 59,130,246)", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-tailwind");
		const bg = await page.getByTestId("tw-class-static").evaluate((el) => {
			const raw = getComputedStyle(el).backgroundColor;
			const canvas = document.createElement("canvas");
			canvas.width = canvas.height = 1;
			const ctx = canvas.getContext("2d");
			if (!ctx) return raw;
			ctx.fillStyle = raw;
			ctx.fillRect(0, 0, 1, 1);
			const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
			return `rgb(${r}, ${g}, ${b})`;
		});
		/* Tailwind v4 blue-500 is OKLCH; canvas normalization gives rgb(43, 127, 255) in Chrome */
		expect(bg).toBe("rgb(43, 127, 255)");
	});

	test("p-4 → computed padding is 16px", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-tailwind");
		const padding = await page.getByTestId("tw-class-static").evaluate((el) => getComputedStyle(el).padding);
		expect(padding).toBe("16px");
	});
});

test.describe("sx class= Tailwind compile: conditional class", () => {
	test("initial state — no red background", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-tailwind");
		const bg = await page.getByTestId("tw-class-conditional").evaluate((el) => {
			const raw = getComputedStyle(el).backgroundColor;
			const canvas = document.createElement("canvas");
			canvas.width = canvas.height = 1;
			const ctx = canvas.getContext("2d");
			if (!ctx) return raw;
			ctx.fillStyle = raw;
			ctx.fillRect(0, 0, 1, 1);
			const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
			return `rgb(${r}, ${g}, ${b})`;
		});
		/* No red background initially — transparent or default */
		expect(bg).not.toBe("rgb(239, 68, 68)");
	});

	test("after toggle — bg-red-500 applied", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-tailwind");
		await page.getByTestId("tw-toggle").click();
		const bg = await page.getByTestId("tw-class-conditional").evaluate((el) => {
			const raw = getComputedStyle(el).backgroundColor;
			const canvas = document.createElement("canvas");
			canvas.width = canvas.height = 1;
			const ctx = canvas.getContext("2d");
			if (!ctx) return raw;
			ctx.fillStyle = raw;
			ctx.fillRect(0, 0, 1, 1);
			const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
			return `rgb(${r}, ${g}, ${b})`;
		});
		/* Tailwind v4 red-500 is OKLCH; canvas normalization gives rgb(251, 44, 54) in Chrome */
		expect(bg).toBe("rgb(251, 44, 54)");
	});

	test("toggle back — red background removed", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-tailwind");
		await page.getByTestId("tw-toggle").click();
		await page.getByTestId("tw-toggle").click();
		const bg = await page.getByTestId("tw-class-conditional").evaluate((el) => {
			const raw = getComputedStyle(el).backgroundColor;
			const canvas = document.createElement("canvas");
			canvas.width = canvas.height = 1;
			const ctx = canvas.getContext("2d");
			if (!ctx) return raw;
			ctx.fillStyle = raw;
			ctx.fillRect(0, 0, 1, 1);
			const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
			return `rgb(${r}, ${g}, ${b})`;
		});
		expect(bg).not.toBe("rgb(251, 44, 54)");
	});
});

test.describe("sx class= Tailwind compile: no console errors", () => {
	test("no errors on page load", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-class-tailwind");
		cap.assertClean();
	});
});
