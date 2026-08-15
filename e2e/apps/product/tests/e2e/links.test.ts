import { expect, test } from "@playwright/test";
import { loadPage, setNavMarker } from "./helpers";

test.describe("Link features", () => {
	test("external href is not rewritten", async ({ page }) => {
		await loadPage(page, "/link-features");
		await expect(page.getByTestId("ext-plain")).toHaveAttribute("href", "https://example.com/page");
	});

	test("javascript: href is not a live script URL", async ({ page }) => {
		await loadPage(page, "/link-features");
		const href = await page.getByTestId("ext-xss").getAttribute("href");
		expect(href === null || !href.toLowerCase().startsWith("javascript:")).toBe(true);
	});

	test("self link is active with aria-current", async ({ page }) => {
		await loadPage(page, "/link-features");
		const self = page.getByTestId("ap-self");
		await expect(self).toHaveClass(/is-active/);
		await expect(self).toHaveAttribute("aria-current", "page");
		await expect(page.getByTestId("ap-other")).toHaveClass(/is-inactive/);
	});

	test("disabled link is not an anchor that navigates", async ({ page }) => {
		await loadPage(page, "/link-features");
		const el = page.getByTestId("disabled-link");
		await expect(el).toHaveAttribute("aria-disabled", "true");
		const tag = await el.evaluate((node) => node.tagName.toLowerCase());
		expect(tag).not.toBe("a");
	});

	test("replace does not grow history", async ({ page }) => {
		await loadPage(page, "/");
		await page.goto("/link-features");
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"));
		const before = await page.evaluate(() => history.length);
		await page.getByTestId("replace-about").click();
		await page.waitForURL("**/about");
		const after = await page.evaluate(() => history.length);
		expect(after).toBe(before);
	});

	test("hash link updates hash", async ({ page }) => {
		await loadPage(page, "/link-features");
		await page.getByTestId("hash-link").click();
		await page.waitForURL("**/about#section");
		expect(new URL(page.url()).hash).toBe("#section");
	});
});

test.describe("history", () => {
	test("back and forward keep SPA marker", async ({ page }) => {
		await loadPage(page, "/");
		await page.getByRole("link", { name: "About" }).click();
		await page.waitForURL("**/about");
		await setNavMarker(page);
		await page.goBack();
		await page.waitForURL("**/");
		const survived = await page.evaluate(
			() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ === "number",
		);
		expect(survived).toBe(true);
		await page.goForward();
		await page.waitForURL("**/about");
		await expect(page.getByTestId("about")).toBeVisible();
	});
});
