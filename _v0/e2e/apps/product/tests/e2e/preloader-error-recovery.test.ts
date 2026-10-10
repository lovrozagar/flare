import { expect, test } from "@playwright/test";
import { loadPage, setNavMarker } from "./helpers";

/**
 * SPA navigate to an error route where __flareNavigate may reject.
 * Sets nav marker before and waits for URL change.
 */
async function spaNavToErrorRoute(page: import("@playwright/test").Page, path: string): Promise<void> {
	await setNavMarker(page);
	await page.evaluate((p) => {
		const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
			| ((to: string) => Promise<void>)
			| undefined;
		if (!nav) throw new Error("__flareNavigate not available");
		return nav(p).catch(() => {});
	}, path);
	await page.waitForURL(`**${path}`, { timeout: 10_000 });
}

test.describe("SSR preloader error recovery", () => {
	test("page preloader throws → 500 + page errorRender boundary renders", async ({ page }) => {
		const response = await page.goto("/preloader-throw", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(500);
		await expect(page.locator("[data-testid=preloader-error-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=preloader-error-message]")).toContainText("Preloader exploded");
	});

	test("page preloader throws → loader not reached (render not visible)", async ({ page }) => {
		await page.goto("/preloader-throw", { waitUntil: "domcontentloaded" });
		const renderCount = await page.locator("[data-testid=preloader-render]").count();
		expect(renderCount).toBe(0);
	});

	test("preloader redirect → redirects to target page", async ({ page }) => {
		const response = await page.goto("/preloader-redirect", { waitUntil: "domcontentloaded" });
		expect(page.url()).toContain("/redirect-target");
		expect(response?.status()).toBe(200);
	});

	test("layout preloader throws → layout errorRender boundary catches", async ({ page }) => {
		const response = await page.goto("/layout-preloader-throw", {
			waitUntil: "domcontentloaded",
		});
		expect(response?.status()).toBe(500);
		await expect(page.locator("[data-testid=layout-preloader-error-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=layout-preloader-error-message]")).toContainText(
			"Layout preloader exploded",
		);
	});

	test("layout preloader throws → child page not rendered (cascade)", async ({ page }) => {
		await page.goto("/layout-preloader-throw", { waitUntil: "domcontentloaded" });
		const childCount = await page.locator("[data-testid=layout-preloader-child]").count();
		expect(childCount).toBe(0);
		const wrapperCount = await page.locator("[data-testid=layout-preloader-throw-wrapper]").count();
		expect(wrapperCount).toBe(0);
	});
});

test.describe("SPA preloader error recovery", () => {
	test("SPA nav to /preloader-throw → page error boundary renders", async ({ page }) => {
		await loadPage(page, "/");
		await spaNavToErrorRoute(page, "/preloader-throw");

		await expect(page.locator("[data-testid=preloader-error-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=preloader-error-message]")).toContainText("Preloader exploded");
	});

	test("SPA nav to /layout-preloader-throw → layout error boundary renders", async ({ page }) => {
		await loadPage(page, "/");
		await spaNavToErrorRoute(page, "/layout-preloader-throw");

		await expect(page.locator("[data-testid=layout-preloader-error-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=layout-preloader-error-message]")).toContainText(
			"Layout preloader exploded",
		);
	});

	test("recovery: SPA nav from preloader error route to valid page", async ({ page }) => {
		await loadPage(page, "/");
		await spaNavToErrorRoute(page, "/preloader-throw");
		await expect(page.locator("[data-testid=preloader-error-boundary]")).toBeVisible();

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });
		await expect(page.locator("[data-testid=about-content]")).toBeVisible();
	});

	test("recovery: SPA nav from layout preloader error to valid page", async ({ page }) => {
		await loadPage(page, "/");
		await spaNavToErrorRoute(page, "/layout-preloader-throw");
		await expect(page.locator("[data-testid=layout-preloader-error-boundary]")).toBeVisible();

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });
		await expect(page.locator("[data-testid=about-content]")).toBeVisible();
	});
});

test.describe("preloader error boundary walk-up", () => {
	test("/preloader-throw stops at page errorRender (not root)", async ({ page }) => {
		await page.goto("/preloader-throw", { waitUntil: "domcontentloaded" });
		await expect(page.locator("[data-testid=preloader-error-boundary]")).toBeVisible();
		const rootBoundary = await page.locator("[data-testid=root-error-boundary]").count();
		expect(rootBoundary).toBe(0);
	});

	test("/layout-preloader-throw stops at layout errorRender (not root)", async ({ page }) => {
		await page.goto("/layout-preloader-throw", { waitUntil: "domcontentloaded" });
		await expect(page.locator("[data-testid=layout-preloader-error-boundary]")).toBeVisible();
		const rootBoundary = await page.locator("[data-testid=root-error-boundary]").count();
		expect(rootBoundary).toBe(0);
	});
});
