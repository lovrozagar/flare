import { expect, test } from "@playwright/test";
import { assertFlareState, loadPage } from "./helpers";

test.describe("XSS", () => {
	test("script payload renders as text", async ({ page }) => {
		const dialogs: string[] = [];
		page.on("dialog", (d) => {
			dialogs.push(d.message());
			void d.dismiss();
		});
		await loadPage(page, "/xss");
		await expect(page.getByTestId("xss-html")).toHaveText("<script>alert('xss')</script>");
		expect(dialogs).toHaveLength(0);
	});

	test("special characters survive SSR", async ({ page }) => {
		await loadPage(page, "/xss");
		await expect(page.getByTestId("xss-special")).toHaveText("< > & \" ' / \\");
	});

	test("FlareState is JSON-safe", async ({ page }) => {
		await page.goto("/xss");
		await assertFlareState(page);
		const ok = await page.evaluate(() => {
			const state = (self as unknown as { flare: unknown }).flare;
			JSON.parse(JSON.stringify(state));
			return true;
		});
		expect(ok).toBe(true);
	});
});
