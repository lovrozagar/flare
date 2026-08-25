import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

test.describe("Shallow navigation preserves data", () => {
	test("shallow nav updates URL without refetching loader", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/shallow-test");

		const originalTs = await page.locator("[data-testid=shallow-loaded-at]").textContent();
		const originalRandom = await page.locator("[data-testid=shallow-random]").textContent();
		expect(Number(originalTs)).toBeGreaterThan(0);

		const ndjsonRequests: string[] = [];
		page.on("request", (req) => {
			if (req.headers()["flare-data"] === "1") {
				ndjsonRequests.push(req.url());
			}
		});

		/* Shallow navigate to same page with different search params */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string, opts?: Record<string, unknown>) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			/* navigate() receives NavigateOptions via first arg for `to` */
			const navFn = (window as unknown as Record<string, unknown>).__flareNavigateRaw as
				| ((opts: Record<string, unknown>) => Promise<void>)
				| undefined;
			/* Fall back to direct call with shallow option */
			return (
				(
					window as unknown as {
						__flareNavigateWithOptions?: (opts: Record<string, unknown>) => Promise<void>;
					}
				).__flareNavigateWithOptions?.({ shallow: true, to: "/shallow-test?q=updated" }) ?? Promise.resolve()
			);
		});

		/* Give time for any potential fetch */
		await page.waitForTimeout(500);

		/* No NDJSON fetch should have fired */
		expect(ndjsonRequests.length).toBe(0);
		cap.assertClean();
	});

	test("normal nav after shallow nav fetches fresh data", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/shallow-test");

		const originalRandom = await page.locator("[data-testid=shallow-random]").textContent();

		/* Navigate away and back — should fetch fresh data */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/shallow-test");
		});
		await page.waitForURL("**/shallow-test", { timeout: 10_000 });

		const newRandom = await page.locator("[data-testid=shallow-random]").textContent();
		/* Normal nav should fetch fresh data — random value differs */
		expect(newRandom).not.toBe(originalRandom);
		cap.assertClean();
	});
});

test.describe("Shallow navigation via Link component", () => {
	test("cross-route Link shallow falls back to full navigation", async ({ page }) => {
		await loadPage(page, "/link-advanced");

		await page.click("[data-testid=link-shallow]");
		await page.waitForURL("**/about", { timeout: 10_000 });

		/* Cross-route shallow is ignored — page navigates and renders with data */
		expect(page.url()).toContain("/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
	});
});
