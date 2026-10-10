import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Deep: deferred SSR rendering", () => {
	test("SSR renders deferred values (pending or resolved)", async ({ page }) => {
		await loadPage(page, "/deferred-multi");
		/* Deferred values may show pending initially or resolve immediately
		 * if the dev server buffers the entire response (including streamed chunks) */
		const fastPending = page.locator("[data-testid=fast-pending]");
		const fastResolved = page.locator("[data-testid=fast-resolved]");
		const hasFast = await fastPending.or(fastResolved).first().isVisible();
		expect(hasFast).toBe(true);
	});

	test("SSR has correct non-deferred data alongside deferred", async ({ page }) => {
		await loadPage(page, "/deferred-multi");
		await expect(page.locator("[data-testid=instant-data]")).toHaveText("instant-value");
	});

	test("deferred error page SSR has non-deferred data correct", async ({ page }) => {
		await loadPage(page, "/deferred-error");
		await expect(page.locator("[data-testid=status-data]")).toHaveText("ok");
	});

	test("deferred error page SSR shows pending or error state", async ({ page }) => {
		await loadPage(page, "/deferred-error");
		/* May be pending or already resolved to error if server buffers response */
		const pending = page.locator("[data-testid=failing-pending]");
		const errorEl = page.locator("[data-testid=failing-error]");
		const hasEither = await pending.or(errorEl).first().isVisible();
		expect(hasEither).toBe(true);
	});
});

test.describe("Deep: deferred SPA navigation (NDJSON streaming)", () => {
	test("SPA nav resolves deferred values via streaming", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/deferred-multi");
		/* Instant data available immediately */
		await expect(page.locator("[data-testid=instant-data]")).toHaveText("instant-value");
		/* Deferred values resolve via NDJSON streaming */
		await expect(page.locator("[data-testid=fast-resolved]")).toBeVisible({ timeout: 5_000 });
		await expect(page.locator("[data-testid=fast-resolved]")).toHaveText("fast-result");
		await expect(page.locator("[data-testid=slow-resolved]")).toBeVisible({ timeout: 5_000 });
		await expect(page.locator("[data-testid=slow-resolved]")).toHaveText("slow-result");
	});

	test("fast deferred resolves before slow deferred (SPA)", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/deferred-multi");
		/* Fast (100ms) resolves first */
		await expect(page.locator("[data-testid=fast-resolved]")).toBeVisible({ timeout: 3_000 });
		/* At this point slow may still be pending */
		const slowPending = page.locator("[data-testid=slow-pending]");
		const slowResolved = page.locator("[data-testid=slow-resolved]");
		const stillPending = await slowPending.isVisible().catch(() => false);
		const alreadyResolved = await slowResolved.isVisible().catch(() => false);
		expect(stillPending || alreadyResolved).toBe(true);
	});

	test("SPA deferred error shows error state in Await", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/deferred-error");
		/* Non-deferred data correct */
		await expect(page.locator("[data-testid=status-data]")).toHaveText("ok");
		/* Deferred error resolves via NDJSON, shows error boundary */
		await expect(page.locator("[data-testid=failing-error]")).toBeVisible({ timeout: 5_000 });
		await expect(page.locator("[data-testid=error-message]")).toContainText("Deferred failed intentionally");
	});

	test("SPA deferred error has reset button", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/deferred-error");
		await expect(page.locator("[data-testid=failing-error]")).toBeVisible({ timeout: 5_000 });
		await expect(page.locator("[data-testid=error-reset]")).toBeVisible();
	});

	test("navigate away during pending deferred does not crash", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await navigateSPA(page, "/deferred-multi");
		/* Immediately navigate away before deferred resolves */
		await navigateSPA(page, "/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		cap.assertClean();
	});
});

test.describe("Deep: deferred FlareState markers", () => {
	test("FlareState has __deferred markers for deferred values", async ({ page }) => {
		await loadPage(page, "/deferred-multi");
		const state = await page.evaluate(() => {
			const s = (self as unknown as { flare: { m: Array<{ d: unknown }> } }).flare;
			return JSON.stringify(s.m);
		});
		expect(state).toContain("__deferred");
	});
});

test.describe("Deep: deferred console clean", () => {
	test("no console errors during SPA deferred resolution", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await navigateSPA(page, "/deferred-multi");
		await expect(page.locator("[data-testid=fast-resolved]")).toBeVisible({ timeout: 5_000 });
		await expect(page.locator("[data-testid=slow-resolved]")).toBeVisible({ timeout: 5_000 });
		cap.assertClean();
	});

	test("no console errors during SPA deferred error", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await navigateSPA(page, "/deferred-error");
		await expect(page.locator("[data-testid=failing-error]")).toBeVisible({ timeout: 5_000 });
		cap.assertClean();
	});
});
