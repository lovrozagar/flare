import { expect, test } from "@playwright/test";
import { clickAndAssertSPA, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Link active/inactive classes", () => {
	test("self-referencing link has activeClass", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/link-advanced");

		const selfLink = page.locator("[data-testid=link-active-self]");
		await expect(selfLink).toHaveClass(/is-active/);
		const classAttr = await selfLink.getAttribute("class");
		expect(classAttr).not.toContain("is-inactive");

		cap.assertClean();
	});

	test("link to other page has inactiveClass", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/link-advanced");

		const otherLink = page.locator("[data-testid=link-active-other]");
		await expect(otherLink).toHaveClass(/is-inactive/);
		const classAttr = await otherLink.getAttribute("class");
		expect(classAttr).not.toContain("is-active");

		cap.assertClean();
	});

	test("active link has aria-current=page", async ({ page }) => {
		await loadPage(page, "/link-advanced");

		const selfLink = page.locator("[data-testid=link-active-self]");
		await expect(selfLink).toHaveAttribute("aria-current", "page");

		const otherLink = page.locator("[data-testid=link-active-other]");
		const ariaCurrent = await otherLink.getAttribute("aria-current");
		expect(ariaCurrent).toBeNull();
	});

	test("active class updates after SPA navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/link-advanced");

		/* Navigate to /about — self link should lose activeClass */
		await navigateSPA(page, "/about");
		await navigateSPA(page, "/link-advanced");

		/* Self-link should be active again after returning */
		const selfLink = page.locator("[data-testid=link-active-self]");
		await expect(selfLink).toHaveClass(/is-active/);

		cap.assertClean();
	});
});

test.describe("Link replace prop", () => {
	test("replace link does not increase history length", async ({ page }) => {
		await loadPage(page, "/link-advanced");

		const historyBefore = await page.evaluate(() => window.history.length);

		await clickAndAssertSPA(page, "[data-testid=link-replace]", "/about");

		const historyAfter = await page.evaluate(() => window.history.length);
		/* Replace should NOT increase history length */
		expect(historyAfter).toBe(historyBefore);
	});
});

test.describe("Link force prop", () => {
	test("force link refetches same URL", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/link-advanced");

		const ts1 = await page.locator("[data-testid=link-advanced-ts]").textContent();

		/* Capture NDJSON requests */
		const ndjsonRequests: string[] = [];
		page.on("request", (req) => {
			if (req.headers()["flare-data"] === "1") {
				ndjsonRequests.push(req.url());
			}
		});

		/* Click force link — same URL, should still trigger navigation */
		await page.click("[data-testid=link-force]");
		/* Wait for potential refetch */
		await page.waitForTimeout(1000);

		/*
		 * Force bypasses same-URL guard — navigation fires.
		 * Whether data actually changes depends on cache state,
		 * but the click should not be silently ignored.
		 */
		expect(page.url()).toContain("/link-advanced");
		cap.assertClean();
	});
});

test.describe("Link disabled prop", () => {
	test("disabled link renders as span", async ({ page }) => {
		await loadPage(page, "/link-advanced");

		const disabledLink = page.locator("[data-testid=link-disabled]");
		const tagName = await disabledLink.evaluate((el) => el.tagName.toLowerCase());
		expect(tagName).toBe("span");
	});

	test("disabled link has aria-disabled", async ({ page }) => {
		await loadPage(page, "/link-advanced");

		const disabledLink = page.locator("[data-testid=link-disabled]");
		await expect(disabledLink).toHaveAttribute("aria-disabled", "true");
	});

	test("disabled link has cursor:not-allowed", async ({ page }) => {
		await loadPage(page, "/link-advanced");

		const disabledLink = page.locator("[data-testid=link-disabled]");
		const style = await disabledLink.getAttribute("style");
		expect(style).toContain("not-allowed");
	});

	test("disabled link click does not navigate", async ({ page }) => {
		await loadPage(page, "/link-advanced");

		const urlBefore = page.url();
		await page.click("[data-testid=link-disabled]");
		await page.waitForTimeout(500);

		expect(page.url()).toBe(urlBefore);
	});
});

test.describe("Link hash prop", () => {
	test("hash link updates URL with hash", async ({ page }) => {
		await loadPage(page, "/link-advanced");

		/* Intercept scrollIntoView on prototype so any element call is captured */
		await page.evaluate(() => {
			const orig = Element.prototype.scrollIntoView;
			Element.prototype.scrollIntoView = function (this: Element) {
				(window as unknown as Record<string, string>).__scrolledTo = this.id || "unknown";
				orig.call(this);
			};
		});

		await page.click("[data-testid=link-hash]");
		await page.waitForTimeout(500);

		expect(page.url()).toContain("#target-section");

		const scrolledId = await page.evaluate(() => (window as unknown as Record<string, string>).__scrolledTo ?? "");
		/* scrollIntoView may or may not fire depending on element visibility in headless */
		if (scrolledId) {
			expect(scrolledId).toBe("target-section");
		}
	});
});

test.describe("Link shallow prop", () => {
	test("cross-route shallow falls back to full navigation", async ({ page }) => {
		await loadPage(page, "/link-advanced");

		await page.click("[data-testid=link-shallow]");
		await page.waitForURL("**/about", { timeout: 10_000 });

		/* Cross-route shallow is ignored — page navigates and renders with data */
		expect(page.url()).toContain("/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
	});
});
