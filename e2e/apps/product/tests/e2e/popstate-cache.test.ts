import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test("back/forward uses cache — zero NDJSON requests", async ({ page }) => {
	const cap = setupConsoleCapture(page);
	await loadPage(page, "/");

	/* Track NDJSON requests via x-d header */
	const ndjsonRequests: string[] = [];
	await page.route("**/*", (route) => {
		if (route.request().headers()["x-d"] === "1") {
			ndjsonRequests.push(route.request().url());
		}
		return route.continue();
	});

	/* SPA navigate to /cache-test (staleTime: 2000) */
	await navigateSPA(page, "/cache-test");
	await expect(page.locator("[data-testid=cache-test]")).toBeVisible();
	const ts1 = await page.locator("[data-testid=cache-timestamp]").textContent();

	/* Clear request log — only care about back/forward */
	ndjsonRequests.length = 0;

	/* Back then forward */
	await page.goBack({ waitUntil: "networkidle" });
	await page.waitForTimeout(500);
	await page.goForward({ waitUntil: "networkidle" });
	await page.waitForTimeout(500);

	/* Assert: zero NDJSON fetches during back/forward */
	const cacheTestRequests = ndjsonRequests.filter((u) => u.includes("/cache-test"));
	expect(cacheTestRequests).toHaveLength(0);

	/* Assert: same data (cache hit) */
	const ts2 = await page.locator("[data-testid=cache-timestamp]").textContent();
	expect(ts2).toBe(ts1);

	cap.assertClean();
});
