import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("rewrite", () => {
	test("vanity /vanity serves about", async ({ page }) => {
		await loadPage(page, "/vanity");
		await expect(page.getByTestId("about")).toBeVisible();
		expect(new URL(page.url()).pathname).toBe("/vanity");
	});

	test("/alt-target rewrites to rewrite-target", async ({ page }) => {
		await loadPage(page, "/alt-target");
		await expect(page.getByTestId("rewrite-target")).toBeVisible();
	});

	test("output rewrite: self link href is /alt-target", async ({ page }) => {
		await loadPage(page, "/alt-target");
		await expect(page.getByTestId("link-to-self")).toHaveAttribute("href", "/alt-target");
	});

	test("rewrite preserves search", async ({ request }) => {
		const response = await request.get("/rw-with-search?q=1");
		expect(response.status()).toBe(200);
		const html = await response.text();
		expect(html).toContain("Rewrite target page");
	});
});
