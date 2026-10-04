import { expect, test } from "@playwright/test";

/* The demo router declares no `theme`, so a dark OS must not switch the page to a dark scheme. */
test.describe("app without a theme config", () => {
	test.use({ colorScheme: "dark" });

	test("SSR HTML carries no theme script or color-scheme style", async ({ request }) => {
		const html = await (await request.get("/")).text();
		expect(html).not.toContain("flare.theme");
		expect(html).not.toContain("color-scheme:light dark");
	});

	test("a dark OS leaves <html> untouched after hydration", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("html[data-flare-hydrated]", { timeout: 10_000 });
		const snap = await page.evaluate(() => ({
			colorScheme: getComputedStyle(document.documentElement).colorScheme,
			inline: document.documentElement.style.colorScheme,
			theme: document.documentElement.getAttribute("data-theme"),
		}));
		expect(snap).toEqual({ colorScheme: "normal", inline: "", theme: null });
	});
});
