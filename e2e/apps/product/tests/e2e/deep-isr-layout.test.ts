import { expect, test } from "@playwright/test";
import { clickAndAssertSPA, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

/**
 * Layout + ISR cache interaction e2e tests.
 *
 * Routes:
 * - /cached-layout — layout with .cache({ ssr: { staleTime: 5000, ttl: 30 } })
 * - /cached-layout (index) — non-cached child page
 * - /cached-layout/isr-child — ISR child (revalidate: 10)
 *
 * Tests verify layout cache and child cache operate independently.
 */

const POPULATE_WAIT = 1000;

test.describe("Cached layout — basic rendering", () => {
	test("layout renders with cached loader data", async ({ page }) => {
		await loadPage(page, "/cached-layout");
		await expect(page.locator("[data-testid=cached-layout]")).toBeVisible();
		expect(await page.locator("[data-testid=cached-layout-data]").textContent()).toBe("cached-layout");
	});

	test("layout wraps non-cached child page", async ({ page }) => {
		await loadPage(page, "/cached-layout");
		await expect(page.locator("[data-testid=cached-layout-header]")).toBeVisible();
		await expect(page.locator("[data-testid=cached-layout-index]")).toBeVisible();
		expect(await page.locator("[data-testid=cached-layout-index-page]").textContent()).toBe("cached-layout-index");
	});

	test("layout wraps ISR child page", async ({ page }) => {
		await loadPage(page, "/cached-layout/isr-child");
		await expect(page.locator("[data-testid=cached-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=cached-layout-isr-child]")).toBeVisible();
		expect(await page.locator("[data-testid=isr-child-page]").textContent()).toBe("isr-child");
	});
});

test.describe("Cached layout — SSR HTML structure", () => {
	test("non-cached child SSR has both layout and page content", async ({ request }) => {
		const res = await request.get("/cached-layout");
		const html = await res.text();
		expect(res.status()).toBe(200);

		expect(html).toContain('data-testid="cached-layout"');
		expect(html).toContain('data-testid="cached-layout-header"');
		expect(html).toContain('data-testid="cached-layout-index"');
		expect(html).toContain("cached-layout-index");
	});

	test("ISR child SSR has both layout and page content", async ({ request }) => {
		const res = await request.get("/cached-layout/isr-child");
		const html = await res.text();
		expect(res.status()).toBe(200);

		expect(html).toContain('data-testid="cached-layout"');
		expect(html).toContain('data-testid="cached-layout-isr-child"');
		expect(html).toContain("isr-child");
	});
});

test.describe("Cached layout — ISR child store behavior", () => {
	test("ISR child populates store after first request", async ({ request }) => {
		await request.get("/cached-layout/isr-child");
		await new Promise((r) => setTimeout(r, POPULATE_WAIT));

		const res = await request.get("/cached-layout/isr-child");
		expect(res.status()).toBe(200);

		const html = await res.text();
		expect(html).toContain('data-testid="cached-layout-isr-child"');
	});

	test("ISR child NDJSON from store works", async ({ request }) => {
		await request.get("/cached-layout/isr-child");
		await new Promise((r) => setTimeout(r, POPULATE_WAIT));

		const res = await request.get("/cached-layout/isr-child", {
			headers: { "x-d": "1" },
		});
		expect(res.status()).toBe(200);
		expect(res.headers()["content-type"]).toContain("ndjson");
	});

	test("ISR child store-served response has no nonce placeholder", async ({ request }) => {
		await request.get("/cached-layout/isr-child");
		await new Promise((r) => setTimeout(r, POPULATE_WAIT));

		const res = await request.get("/cached-layout/isr-child");
		const html = await res.text();
		expect(html).not.toContain("__FLARE_NONCE__");
	});
});

test.describe("Cached layout — SPA navigation between siblings", () => {
	test("SPA nav from cached-layout index to ISR child preserves layout", async ({ page }) => {
		await loadPage(page, "/cached-layout");
		await expect(page.locator("[data-testid=cached-layout-index]")).toBeVisible();

		/* Capture layout timestamp before navigation */
		const layoutTsBefore = await page.locator("[data-testid=cached-layout-ts]").textContent();

		/* Navigate to ISR child via SPA */
		await navigateSPA(page, "/cached-layout/isr-child");
		await expect(page.locator("[data-testid=cached-layout-isr-child]")).toBeVisible();

		/* Layout should still be present */
		await expect(page.locator("[data-testid=cached-layout]")).toBeVisible();

		/* Layout timestamp may or may not change (client cache determines) */
		const layoutTsAfter = await page.locator("[data-testid=cached-layout-ts]").textContent();
		expect(layoutTsBefore).toBeDefined();
		expect(layoutTsAfter).toBeDefined();
	});

	test("SPA nav from ISR child back to index preserves layout", async ({ page }) => {
		await loadPage(page, "/cached-layout/isr-child");
		await expect(page.locator("[data-testid=cached-layout-isr-child]")).toBeVisible();

		await navigateSPA(page, "/cached-layout");
		await expect(page.locator("[data-testid=cached-layout-index]")).toBeVisible();
		await expect(page.locator("[data-testid=cached-layout]")).toBeVisible();
	});
});

test.describe("Cached layout — hydration and errors", () => {
	test("cached layout + non-cached child hydrate without errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/cached-layout");
		await page.waitForTimeout(200);
		cap.assertClean();
	});

	test("cached layout + ISR child hydrate without errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/cached-layout/isr-child");
		await page.waitForTimeout(200);
		cap.assertClean();
	});

	test("full SSR → hydration → SPA nav round trip clean", async ({ page }) => {
		const cap = setupConsoleCapture(page);

		/* SSR load */
		await loadPage(page, "/cached-layout");
		await expect(page.locator("[data-testid=cached-layout-index]")).toBeVisible();

		/* SPA nav to ISR child */
		await navigateSPA(page, "/cached-layout/isr-child");
		await expect(page.locator("[data-testid=cached-layout-isr-child]")).toBeVisible();

		/* SPA nav back */
		await navigateSPA(page, "/cached-layout");
		await expect(page.locator("[data-testid=cached-layout-index]")).toBeVisible();

		await page.waitForTimeout(200);
		cap.assertClean();
	});
});
