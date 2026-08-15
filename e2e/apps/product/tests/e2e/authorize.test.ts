import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("authorize", () => {
	test("admin passes", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "admin" });
		await loadPage(page, "/authorize-pass");
		await expect(page.getByTestId("authorize-message")).toHaveText("Authorized");
		await expect(page.getByTestId("authorize-user")).toHaveText("admin");
	});

	test("non-admin is 403", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "user1" });
		const response = await page.goto("/authorize-pass");
		expect(response?.status()).toBe(403);
		await expect(page.getByTestId("authorize-unauthorized")).toBeVisible();
	});

	test("no auth is 401", async ({ page }) => {
		const response = await page.goto("/authorize-pass");
		expect(response?.status()).toBe(401);
	});

	test("authorize-fail always 403 when authed", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "admin" });
		const response = await page.goto("/authorize-fail");
		expect(response?.status()).toBe(403);
		await expect(page.getByTestId("authorize-fail-unauthorized")).toBeVisible();
	});
});
