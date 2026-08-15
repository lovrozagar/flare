import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

test.describe("Custom response headers (SSR)", () => {
	test("/custom-headers has x-custom-header in response", async ({ page }) => {
		const response = await page.goto("/custom-headers", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["x-custom-header"]).toBe("flare-test-value");
	});

	test("/custom-headers has x-powered-by header", async ({ page }) => {
		const response = await page.goto("/custom-headers", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["x-powered-by"]).toBe("flare-e2e");
	});

	test("/custom-headers has x-custom-data with timestamp", async ({ page }) => {
		const response = await page.goto("/custom-headers", { waitUntil: "domcontentloaded" });
		const customData = response?.headers()["x-custom-data"];
		expect(customData).toBeTruthy();
		expect(customData?.startsWith("ts-")).toBe(true);
		const ts = Number(customData?.replace("ts-", ""));
		expect(ts).toBeGreaterThan(0);
	});

	test("page content renders correctly with custom headers", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/custom-headers");
		await expect(page.locator("[data-testid=custom-headers-content]")).toHaveText("Page with custom headers");
		const ts = Number(await page.locator("[data-testid=custom-headers-timestamp]").textContent());
		expect(ts).toBeGreaterThan(0);
		cap.assertClean();
	});
});

test.describe("Custom headers via NDJSON", () => {
	test("NDJSON response includes custom headers", async ({ request }) => {
		const response = await request.get("/custom-headers", {
			headers: { "x-d": "1" },
		});
		expect(response.status()).toBe(200);
		expect(response.headers()["x-custom-header"]).toBe("flare-test-value");
		expect(response.headers()["x-powered-by"]).toBe("flare-e2e");
	});

	test("NDJSON x-custom-data header has timestamp", async ({ request }) => {
		const response = await request.get("/custom-headers", {
			headers: { "x-d": "1" },
		});
		const customData = response.headers()["x-custom-data"];
		expect(customData).toBeTruthy();
		expect(customData?.startsWith("ts-")).toBe(true);
	});
});

test.describe("Headers chain (layout + page merge)", () => {
	test("child page inherits layout headers", async ({ page }) => {
		const response = await page.goto("/headers-chain/headers-child", {
			waitUntil: "domcontentloaded",
		});
		expect(response?.headers()["x-layout-header"]).toBe("from-layout");
		expect(response?.headers()["x-child-header"]).toBe("from-child");
	});

	test("child overrides shared header from layout", async ({ page }) => {
		const response = await page.goto("/headers-chain/headers-child", {
			waitUntil: "domcontentloaded",
		});
		/* child sets x-shared: "child-override", overriding layout's "layout-value" */
		expect(response?.headers()["x-shared"]).toBe("child-override");
	});

	test("headers chain NDJSON also merges", async ({ request }) => {
		const response = await request.get("/headers-chain/headers-child", {
			headers: { "x-d": "1" },
		});
		expect(response.headers()["x-layout-header"]).toBe("from-layout");
		expect(response.headers()["x-child-header"]).toBe("from-child");
		expect(response.headers()["x-shared"]).toBe("child-override");
	});

	test("headers chain page content renders", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/headers-chain/headers-child");
		await expect(page.locator("[data-testid=headers-child-content]")).toHaveText("Headers chain child");
		cap.assertClean();
	});
});

test.describe("Routes without .headers() have no custom headers", () => {
	test("/about has no x-custom-header", async ({ page }) => {
		const response = await page.goto("/about", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["x-custom-header"]).toBeUndefined();
	});

	test("/about has x-powered-by from security defaults", async ({ page }) => {
		const response = await page.goto("/about", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["x-powered-by"]).toBe("flare");
	});
});
