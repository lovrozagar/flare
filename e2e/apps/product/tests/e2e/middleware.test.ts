import { expect, test } from "@playwright/test";

test.describe("middleware", () => {
	test("global marker + path headers", async ({ page }) => {
		const response = await page.goto("/about");
		expect(response?.headers()["x-middleware-ran"]).toBe("true");
		expect(response?.headers()["x-matched-path"]).toBe("/about");
		expect(response?.headers()["x-has-query"]).toBe("false");
	});

	test("query flag", async ({ page }) => {
		const response = await page.goto("/search?q=x");
		expect(response?.headers()["x-has-query"]).toBe("true");
	});

	test("server-timing present @dev-only", async ({ page }) => {
		const response = await page.goto("/");
		const timing = response?.headers()["server-timing"] ?? "";
		expect(timing).toMatch(/flare\.pipeline\.loaders/);
	});

	test("dashboard path-scoped middleware", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "admin" });
		const dash = await page.goto("/dashboard");
		expect(dash?.headers()["x-dash-scoped"]).toBe("true");
		const home = await page.goto("/");
		expect(home?.headers()["x-dash-scoped"]).toBeUndefined();
	});

	test("virtualPath users/[id] scoped", async ({ page }) => {
		const user = await page.goto("/users/42");
		expect(user?.headers()["x-virtual-matched"]).toBe("true");
		const about = await page.goto("/about");
		expect(about?.headers()["x-virtual-matched"]).toBeUndefined();
	});

	test("onPage runs for HTML and NDJSON, not mount", async ({ page, request }) => {
		const html = await page.goto("/about");
		expect(html?.headers()["x-route-only"]).toBe("true");
		const ndjson = await request.get("/about", { headers: { "x-d": "1" } });
		expect(ndjson.headers()["x-route-only"]).toBe("true");
		const api = await request.get("/api/health");
		expect(api.headers()["x-route-only"]).toBeUndefined();
	});
});
