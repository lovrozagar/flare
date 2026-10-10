import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("custom headers", () => {
	test("SSR custom headers", async ({ page }) => {
		const response = await page.goto("/custom-headers");
		expect(response?.headers()["x-custom-header"]).toBe("flare-test-value");
		expect(response?.headers()["x-powered-by"]).toBe("flare-e2e");
		const customData = response?.headers()["x-custom-data"];
		expect(customData?.startsWith("ts-")).toBe(true);
	});

	test("NDJSON custom headers", async ({ request }) => {
		const response = await request.get("/custom-headers", { headers: { "flare-data": "1" } });
		expect(response.headers()["x-custom-header"]).toBe("flare-test-value");
		expect(response.headers()["x-custom-data"]?.startsWith("ts-")).toBe(true);
	});

	test("page content with custom headers", async ({ page }) => {
		await loadPage(page, "/custom-headers");
		await expect(page.getByTestId("custom-headers-content")).toHaveText("Page with custom headers");
	});
});

test.describe("header chain", () => {
	test("dashboard merges layout + page headers", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "admin" });
		const response = await page.goto("/dashboard");
		expect(response?.headers()["x-dashboard-layout"]).toBe("true");
		expect(response?.headers()["x-dashboard-page"]).toBe("overview");
	});

	test("NDJSON also merges", async ({ request }) => {
		const response = await request.get("/dashboard", {
			headers: { "flare-data": "1", "x-test-auth": "admin" },
		});
		expect(response.headers()["x-dashboard-layout"]).toBe("true");
		expect(response.headers()["x-dashboard-page"]).toBe("overview");
	});
});

test.describe("head HTML", () => {
	test("about title and description in SSR", async ({ page }) => {
		await page.goto("/about");
		await expect(page).toHaveTitle("About - 2026");
		const desc = await page.locator('meta[name="description"]').getAttribute("content");
		expect(desc).toBe("About this app");
	});
});
