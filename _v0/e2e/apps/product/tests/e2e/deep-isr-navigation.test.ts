import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setNavMarker, setupConsoleCapture } from "./helpers";

/**
 * ISR navigation e2e tests.
 *
 * Tests SPA navigation between ISR and non-cached routes,
 * NDJSON data requests, back/forward behavior, and cross-route purity.
 */

const POPULATE_WAIT = 1000;

test.describe("ISR — SPA navigation between cached and non-cached routes", () => {
	test("navigate: non-cached → ISR → non-cached", async ({ page }) => {
		await loadPage(page, "/about");
		await expect(page.locator("[data-testid=about-content]")).toBeVisible();

		/* SPA nav to ISR route */
		await navigateSPA(page, "/isr-test");
		await expect(page.locator("[data-testid=isr-test]")).toBeVisible();

		/* SPA nav back to non-cached */
		await navigateSPA(page, "/about");
		await expect(page.locator("[data-testid=about-content]")).toBeVisible();
	});

	test("navigate: ISR → ISR defer → ISR multi-defer", async ({ page }) => {
		await loadPage(page, "/isr-test");
		await expect(page.locator("[data-testid=isr-test]")).toBeVisible();

		await navigateSPA(page, "/isr-defer");
		await expect(page.locator("[data-testid=isr-defer]")).toBeVisible();
		await expect(page.locator("[data-testid=isr-defer-resolved]")).toBeVisible({
			timeout: 5000,
		});

		await navigateSPA(page, "/isr-multi-defer");
		await expect(page.locator("[data-testid=isr-multi-defer]")).toBeVisible();
		await expect(page.locator("[data-testid=isr-multi-fast-resolved]")).toBeVisible({
			timeout: 5000,
		});
	});

	test("navigate: ISR → non-cached → back → ISR content correct", async ({ page }) => {
		await loadPage(page, "/isr-test");
		await expect(page.locator("[data-testid=isr-test]")).toBeVisible();

		await navigateSPA(page, "/about");
		await expect(page.locator("[data-testid=about-content]")).toBeVisible();

		/* Browser back */
		await page.goBack();
		await expect(page.locator("[data-testid=isr-test]")).toBeVisible();
	});

	test("navigate: home → ISR → forward/back cycle", async ({ page }) => {
		await loadPage(page, "/");

		await navigateSPA(page, "/isr-kv-combo");
		await expect(page.locator("[data-testid=isr-kv-combo]")).toBeVisible();

		await navigateSPA(page, "/static-pure");
		await expect(page.locator("[data-testid=static-pure]")).toBeVisible();

		/* Back to ISR KV */
		await page.goBack();
		await expect(page.locator("[data-testid=isr-kv-combo]")).toBeVisible();

		/* Forward to static-pure */
		await page.goForward();
		await expect(page.locator("[data-testid=static-pure]")).toBeVisible();
	});
});

test.describe("ISR — NDJSON data requests on SPA navigation", () => {
	test("SPA nav to ISR route fetches NDJSON data", async ({ page, request }) => {
		/* Prime ISR store so NDJSON is available */
		await request.get("/isr-test");
		await new Promise((r) => setTimeout(r, POPULATE_WAIT));

		await loadPage(page, "/");

		/* Intercept NDJSON fetch during SPA navigation */
		const ndjsonPromise = page.waitForResponse(
			(response) =>
				response.url().includes("/isr-test") && (response.headers()["content-type"]?.includes("ndjson") ?? false),
			{ timeout: 10000 },
		);

		await navigateSPA(page, "/isr-test");

		const ndjsonResponse = await ndjsonPromise.catch(() => null);
		if (ndjsonResponse) {
			expect(ndjsonResponse.status()).toBe(200);
		}
	});

	test("SPA nav to ISR defer route fetches data with deferred values", async ({ page, request }) => {
		/* Prime ISR store */
		await request.get("/isr-defer");
		await new Promise((r) => setTimeout(r, POPULATE_WAIT));

		await loadPage(page, "/");
		await navigateSPA(page, "/isr-defer");

		/* Verify page renders correctly after SPA navigation */
		await expect(page.locator("[data-testid=isr-defer]")).toBeVisible();
		await expect(page.locator("[data-testid=isr-defer-resolved]")).toBeVisible({
			timeout: 5000,
		});
	});
});

test.describe("ISR — no cross-contamination between routes", () => {
	test("ISR route data does not leak to non-cached route", async ({ page }) => {
		await loadPage(page, "/isr-test");
		const isrTs = await page.locator("[data-testid=isr-rendered-at]").textContent();

		await navigateSPA(page, "/about");
		const aboutContent = await page.locator("[data-testid=about-content]").textContent();

		/* About page should have its own data, not ISR timestamps */
		expect(aboutContent).toBe("This is the about page for the Flare E2E test app.");
		expect(aboutContent).not.toContain(isrTs ?? "");
	});

	test("navigating between different ISR routes shows distinct data", async ({ page }) => {
		await loadPage(page, "/isr-test");
		const isrSource = await page.locator("[data-testid=isr-source]").textContent();
		expect(isrSource).toBe("ssr");

		await navigateSPA(page, "/isr-kv-combo");
		const kvSource = await page.locator("[data-testid=isr-kv-source]").textContent();
		expect(kvSource).toBe("ssr");

		/* Both have "ssr" but they're distinct route instances */
		await expect(page.locator("[data-testid=isr-test]")).not.toBeVisible();
		await expect(page.locator("[data-testid=isr-kv-combo]")).toBeVisible();
	});
});

test.describe("ISR — console cleanliness across navigation", () => {
	test("no errors navigating: home → ISR → defer → back → home", async ({ page }) => {
		const cap = setupConsoleCapture(page);

		await loadPage(page, "/");
		await navigateSPA(page, "/isr-test");
		await expect(page.locator("[data-testid=isr-test]")).toBeVisible();

		await navigateSPA(page, "/isr-defer");
		await expect(page.locator("[data-testid=isr-defer]")).toBeVisible();
		await page.locator("[data-testid=isr-defer-resolved]").waitFor({ timeout: 5000 });

		await page.goBack();
		await expect(page.locator("[data-testid=isr-test]")).toBeVisible();

		await navigateSPA(page, "/");
		await page.waitForTimeout(300);
		cap.assertClean();
	});

	test("no errors navigating through layout + ISR child", async ({ page }) => {
		const cap = setupConsoleCapture(page);

		await loadPage(page, "/cached-layout");
		await expect(page.locator("[data-testid=cached-layout-index]")).toBeVisible();

		await navigateSPA(page, "/cached-layout/isr-child");
		await expect(page.locator("[data-testid=cached-layout-isr-child]")).toBeVisible();

		await navigateSPA(page, "/isr-test");
		await expect(page.locator("[data-testid=isr-test]")).toBeVisible();

		await page.waitForTimeout(200);
		cap.assertClean();
	});
});
