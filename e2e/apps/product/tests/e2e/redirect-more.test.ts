import { expect, test } from "@playwright/test";

test.describe("redirect variants", () => {
	test("explicit 302", async ({ request }) => {
		const response = await request.get("/redirect-302", { maxRedirects: 0 });
		expect(response.status()).toBe(302);
		expect(response.headers().location).toBe("/about");
	});

	test("external href", async ({ request }) => {
		const response = await request.get("/redirect-external", { maxRedirects: 0 });
		expect(response.status()).toBeGreaterThanOrEqual(300);
		expect(response.status()).toBeLessThan(400);
		expect(response.headers().location).toMatch(/^https:\/\/example\.com\/?$/);
	});
});
