import { expect, test } from "@playwright/test";

test.describe("dev security", () => {
	test("X-Content-Type-Options nosniff", async ({ page }) => {
		const response = await page.goto("/");
		expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
	});

	test("dev CSP uses unsafe-inline, not nonce @dev-only", async ({ request }) => {
		const response = await request.get("/", {
			headers: { "flare-data": "1" },
		});
		const csp = response.headers()["content-security-policy"];
		expect(csp).toBeDefined();
		expect(csp).toContain("'unsafe-inline'");
		expect(csp).not.toContain("nonce-");
		expect(csp).not.toContain("strict-dynamic");
	});

	test("Strict-Transport-Security skipped in dev @dev-only", async ({ page }) => {
		const response = await page.goto("/");
		expect(response?.headers()["strict-transport-security"]).toBeUndefined();
	});

	test("X-Frame-Options DENY", async ({ page }) => {
		const response = await page.goto("/");
		expect(response?.headers()["x-frame-options"]).toBe("DENY");
	});
});
