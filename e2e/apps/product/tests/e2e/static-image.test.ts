import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("Static image (auto-optimized import)", () => {
	test("renders with auto-derived dimensions from static data", async ({ page }) => {
		await loadPage(page, "/static-image-test");

		const img = page.locator("[data-testid=img-static-responsive]");
		await expect(img).toHaveAttribute("width", "200");
		await expect(img).toHaveAttribute("height", "150");
	});

	test("static data has correct shape", async ({ page }) => {
		await loadPage(page, "/static-image-test");

		const raw = await page.locator("[data-testid=static-data]").textContent();
		const data = JSON.parse(raw ?? "{}");
		expect(data.width).toBe(200);
		expect(data.height).toBe(150);
		expect(data.blurDataURL).toMatch(/^data:image\/webp;base64,/);
		expect(typeof data.src).toBe("string");
		expect(typeof data.variants).toBe("object");
		expect(Object.keys(data.variants).length).toBeGreaterThan(0);
	});

	test("auto blur placeholder applied", async ({ page }) => {
		await loadPage(page, "/static-image-test");

		const img = page.locator("[data-testid=img-static-responsive]");
		const style = await img.getAttribute("style");
		expect(style).toContain("background-image");
		expect(style).toContain("data:image/webp;base64,");
	});

	test("placeholder=none suppresses blur", async ({ page }) => {
		await loadPage(page, "/static-image-test");

		const img = page.locator("[data-testid=img-static-no-blur]");
		const style = await img.getAttribute("style");
		expect(style).not.toContain("background-image");
	});

	test("maxWidth override constrains display", async ({ page }) => {
		await loadPage(page, "/static-image-test");

		const img = page.locator("[data-testid=img-static-constrained]");
		const style = await img.getAttribute("style");
		expect(style).toMatch(/max-width:\s*100px/);
	});

	test("fill mode has absolute positioning", async ({ page }) => {
		await loadPage(page, "/static-image-test");

		const img = page.locator("[data-testid=img-static-fill]");
		const style = await img.getAttribute("style");
		expect(style).toMatch(/position:\s*absolute/);
		expect(style).toMatch(/inset:\s*0/);
	});

	test("srcset has width descriptors from variants", async ({ page }) => {
		await loadPage(page, "/static-image-test");

		const img = page.locator("[data-testid=img-static-responsive]");
		const srcset = await img.getAttribute("srcset");
		expect(srcset).toBeTruthy();
		expect(srcset).toContain("w");
	});

	test("dev middleware serves variant images", async ({ page }) => {
		await loadPage(page, "/static-image-test");

		const raw = await page.locator("[data-testid=static-data]").textContent();
		const data = JSON.parse(raw ?? "{}");
		const variantUrls = Object.values(data.variants) as string[];
		expect(variantUrls.length).toBeGreaterThan(0);

		/* fetch first variant — should return webp */
		const firstUrl = variantUrls[0];
		const response = await page.request.get(firstUrl);
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toBe("image/webp");
	});
});
