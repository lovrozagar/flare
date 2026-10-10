import { expect, test } from "@playwright/test";
import { assertHydrated, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("server context", () => {
	test("SSR page reads serverContext in loader", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/server-context-test");

		const requestId = await page.getByTestId("request-id").textContent();
		expect(requestId).toBeTruthy();
		expect(requestId?.length).toBeGreaterThan(0);
		console.assertClean();
	});

	test("SSR with custom x-request-id header uses that value", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await page.setExtraHTTPHeaders({ "x-request-id": "custom-req-42" });
		await loadPage(page, "/server-context-test");

		const requestId = await page.getByTestId("request-id").textContent();
		expect(requestId).toBe("custom-req-42");
		console.assertClean();
	});

	test("SPA navigation NDJSON request has serverContext in loader", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/");

		await navigateSPA(page, "/server-context-test");

		const requestId = await page.getByTestId("request-id").textContent();
		expect(requestId).toBeTruthy();
		expect(requestId?.length).toBeGreaterThan(0);
		console.assertClean();
	});

	test("each request gets fresh serverContext", async ({ page }) => {
		const console = setupConsoleCapture(page);

		await loadPage(page, "/server-context-test");
		const first = await page.getByTestId("request-id").textContent();

		await page.reload();
		await assertHydrated(page);
		const second = await page.getByTestId("request-id").textContent();

		expect(first).toBeTruthy();
		expect(second).toBeTruthy();
		expect(first).not.toBe(second);
		console.assertClean();
	});
});
