import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

async function colorOf(page: import("@playwright/test").Page, testId: string): Promise<string> {
	return page.getByTestId(testId).evaluate((el) => getComputedStyle(el).color);
}

test.describe("sx visual: basic static object", () => {
	test("sx-basic-box computed styles", async ({ page }) => {
		await loadPage(page, "/styling-sx-basic");
		const box = page.getByTestId("sx-basic-box");
		await expect(box).toBeVisible();
		expect(await colorOf(page, "sx-basic-box")).toBe("rgb(0, 0, 255)");
		expect(await box.evaluate((el) => getComputedStyle(el).fontSize)).toBe("24px");
	});

	test("sx-basic-text computed styles", async ({ page }) => {
		await loadPage(page, "/styling-sx-basic");
		expect(await colorOf(page, "sx-basic-text")).toBe("rgb(100, 100, 100)");
	});
});

test.describe("sx visual: nested selectors", () => {
	test("sx-hover-box base color", async ({ page }) => {
		await loadPage(page, "/styling-sx-nested");
		expect(await colorOf(page, "sx-hover-box")).toBe("rgb(0, 0, 0)");
	});

	test("sx-media-box renders", async ({ page }) => {
		await loadPage(page, "/styling-sx-nested");
		await expect(page.getByTestId("sx-media-box")).toBeVisible();
		const size = await page.getByTestId("sx-media-box").evaluate((el) => getComputedStyle(el).fontSize);
		expect(Number.parseFloat(size)).toBeGreaterThan(0);
	});
});

test.describe("sx visual: variants", () => {
	test("variant primary color", async ({ page }) => {
		await loadPage(page, "/styling-sx-variants");
		expect(await colorOf(page, "sx-variants-box")).toBe("rgb(0, 100, 200)");
	});

	test("variant secondary after one click", async ({ page }) => {
		await loadPage(page, "/styling-sx-variants");
		await page.getByTestId("cycle-variant").click();
		expect(await colorOf(page, "sx-variants-box")).toBe("rgb(100, 100, 100)");
	});

	test("variant danger after two clicks", async ({ page }) => {
		await loadPage(page, "/styling-sx-variants");
		await page.getByTestId("cycle-variant").click();
		await page.getByTestId("cycle-variant").click();
		expect(await colorOf(page, "sx-variants-box")).toBe("rgb(200, 0, 0)");
	});
});

test.describe("sx visual: dynamic signal color", () => {
	test("dynamic box initial color", async ({ page }) => {
		await loadPage(page, "/styling-sx-dynamic");
		expect(await colorOf(page, "sx-dynamic-box")).toBe("rgb(0, 128, 0)");
	});

	test("dynamic box after one cycle", async ({ page }) => {
		await loadPage(page, "/styling-sx-dynamic");
		await page.getByTestId("cycle-color").click();
		expect(await colorOf(page, "sx-dynamic-box")).toBe("rgb(200, 0, 100)");
	});
});

test.describe("sx visual: lazy component", () => {
	test("lazy sx box after mount", async ({ page }) => {
		await loadPage(page, "/styling-sx-lazy");
		await page.getByTestId("mount-lazy").click();
		await page.getByTestId("lazy-sx-box").waitFor({ state: "visible", timeout: 10_000 });
		expect(await colorOf(page, "lazy-sx-box")).toBe("rgb(0, 100, 200)");
	});
});

test.describe("sx visual: dialog composition", () => {
	test("dialog content visible when open", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-dialog");
		await page.getByTestId("open-dialog").click();
		await expect(page.getByTestId("sx-dialog-backdrop")).toBeVisible();
		await expect(page.getByTestId("sx-dialog-content")).toBeVisible();
	});
});

test.describe("sx visual: custom button", () => {
	test("default button is visible", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-button");
		await expect(page.getByTestId("btn-default")).toBeVisible();
	});

	test("style-override button uses the override color", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-button");
		const bg = await page.getByTestId("btn-style-override").evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).toBe("rgb(200, 0, 0)");
	});
});

test.describe("sx visual: cross-package prebuilt lib", () => {
	test("prebuilt button and card render", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt");
		await expect(page.getByTestId("prebuilt-btn")).toBeVisible();
		await expect(page.getByTestId("prebuilt-card")).toBeVisible();
	});
});

test.describe("sx visual: cross-package source lib", () => {
	test("source button and card render", async ({ page }) => {
		await loadPage(page, "/styling-sx-source");
		await expect(page.getByTestId("source-btn")).toBeVisible();
		await expect(page.getByTestId("source-card")).toBeVisible();
	});

	test("no console errors during capture", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-source");
		cap.assertClean();
	});
});
