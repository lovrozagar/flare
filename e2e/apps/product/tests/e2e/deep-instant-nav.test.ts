import { expect, test } from "@playwright/test";
import { assertInstantShell, assertSPANavigation, loadPage, setNavMarker, setupConsoleCapture } from "./helpers";

test.describe("Instant navigation", () => {
	test("prefetched shell paints on click before the slow enter NDJSON returns", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await setNavMarker(page);

		const link = page.locator("[data-testid=instant-nav-link]");
		await link.dispatchEvent("mouseenter");
		await page.waitForResponse(
			(resp) => resp.url().includes("/instant-nav") && resp.request().headers()["flare-data"] === "1",
		);
		/* Let prefetch apply matchCache before click. */
		await page.waitForTimeout(100);

		const enterNdjson = page.waitForResponse(
			(resp) =>
				resp.url().includes("/instant-nav") &&
				resp.request().headers()["flare-data"] === "1" &&
				resp.request().headers()["flare-prefetch"] !== "1",
		);

		await link.click({ force: true });
		await assertInstantShell(page, { shellTestId: "instant-title", timeout: 800 });
		expect(await page.getByTestId("instant-title").textContent()).toBe("Instant shell");
		await page.waitForURL("**/instant-nav", { timeout: 10_000 });
		await assertSPANavigation(page);
		await enterNdjson;

		cap.assertClean();
	});
});
