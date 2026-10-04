import { expect, test } from "@playwright/test";

/* The demo server adds `data:` to style-src. Flare's nonce'd style-src-elem must keep that source,
 * or the browser applies style-src-elem alone and blocks a widget's injected sheet. */
test.use({ bypassCSP: false });

test("an app style-src source loads stylesheets injected without a nonce", async ({ page }) => {
	const violations: string[] = [];
	page.on("console", (m) => {
		if (m.type() === "error" && /Content Security Policy/.test(m.text())) violations.push(m.text());
	});
	await page.goto("/about");
	await page.waitForSelector("html[data-flare-hydrated]", { timeout: 10_000 });
	await expect(page.getByTestId("csp-style-probe")).toHaveCSS("outline-color", "rgb(1, 2, 3)");
	expect(violations).toEqual([]);
});
