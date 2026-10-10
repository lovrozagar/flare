import { expect, test } from "@playwright/test";

test.describe("not found", () => {
	test("unknown URL returns 404 and root boundary", async ({ page }) => {
		const response = await page.goto("/does-not-exist");
		expect(response).not.toBeNull();
		expect(response?.status()).toBe(404);
		await expect(page.getByTestId("not-found-boundary")).toBeVisible();
		await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
	});
});
