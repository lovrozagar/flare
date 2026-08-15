import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

/**
 * Accessibility during SPA navigation, async content, and dynamic state.
 *
 * Tests patterns that static a11y audits miss:
 * - Focus management across route transitions
 * - Async content loading announcements
 * - Table semantics (caption, scope, labelledby)
 * - Dynamic content a11y (deferred data, error boundaries)
 * - Navigation a11y after multiple hops
 */

test.describe("A11y Nav — async content loading", () => {
	test("pending state has aria-busy=true", async ({ page }) => {
		await page.goto("/a11y-nav-test", { waitUntil: "domcontentloaded" });

		/* check if pending state appears (may resolve quickly in SSR) */
		const pending = page.locator("[data-testid=async-pending]");
		const resolved = page.locator("[data-testid=async-resolved]");

		/* one of these must be visible */
		const pendingVisible = await pending.isVisible().catch(() => false);
		const resolvedVisible = await resolved.isVisible().catch(() => false);
		expect(pendingVisible || resolvedVisible).toBe(true);

		if (pendingVisible) {
			expect(await pending.getAttribute("aria-busy")).toBe("true");
			/* <output> element implicitly has role=status */
			const tag = await pending.evaluate((el) => el.tagName.toLowerCase());
			expect(tag).toBe("output");
		}
	});

	test("resolved state has aria-busy=false", async ({ page }) => {
		await loadPage(page, "/a11y-nav-test");

		/* wait for deferred to resolve */
		await expect(page.locator("[data-testid=async-resolved]")).toBeVisible({ timeout: 5000 });
		const resolved = page.locator("[data-testid=async-resolved]");
		expect(await resolved.getAttribute("aria-busy")).toBe("false");
		expect(await resolved.textContent()).toBe("Async content loaded");
	});

	test("deferred error page has accessible error UI", async ({ page }) => {
		await loadPage(page, "/deferred-error");

		/* wait for the error boundary to show */
		await expect(page.locator("[data-testid=failing-error]")).toBeVisible({ timeout: 5000 });

		/* error message is readable */
		const msg = await page.locator("[data-testid=error-message]").textContent();
		expect(msg).toBe("Deferred failed intentionally");

		/* retry button exists and is focusable */
		const resetBtn = page.locator("[data-testid=error-reset]");
		await expect(resetBtn).toBeVisible();
		expect(await resetBtn.evaluate((el) => (el as HTMLElement).tabIndex >= 0)).toBe(true);
	});
});

test.describe("A11y Nav — table semantics", () => {
	test("table has caption for screen readers", async ({ page }) => {
		await loadPage(page, "/a11y-nav-test");

		const caption = page.locator("[data-testid=a11y-table] caption");
		expect(await caption.textContent()).toBeTruthy();
	});

	test("table has aria-labelledby pointing to heading", async ({ page }) => {
		await loadPage(page, "/a11y-nav-test");

		const table = page.locator("[data-testid=a11y-table]");
		expect(await table.getAttribute("aria-labelledby")).toBe("table-heading");

		const heading = page.locator("#table-heading");
		expect(await heading.textContent()).toBe("Data Table");
	});

	test("table headers have scope=col", async ({ page }) => {
		await loadPage(page, "/a11y-nav-test");

		const ths = page.locator("[data-testid=a11y-table] th");
		const count = await ths.count();
		expect(count).toBeGreaterThan(0);

		for (let i = 0; i < count; i++) {
			expect(await ths.nth(i).getAttribute("scope")).toBe("col");
		}
	});

	test("table structure is present in SSR HTML", async ({ request }) => {
		const res = await request.get("/a11y-nav-test");
		const html = await res.text();

		expect(html).toContain("<caption>");
		expect(html).toContain("<thead>");
		expect(html).toContain("<tbody>");
		expect(html).toContain('scope="col"');
	});
});

test.describe("A11y Nav — multi-hop focus management", () => {
	test("focus resets after navigating through multiple routes", async ({ page }) => {
		await loadPage(page, "/a11y-nav-test");

		/* navigate through 3 routes */
		await navigateSPA(page, "/about");
		await navigateSPA(page, "/");
		await navigateSPA(page, "/a11y-nav-test");

		/* focus should be on body or document, not stuck somewhere */
		const focusedTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? "none");
		expect(["body", "html", "main"]).toContain(focusedTag);
	});

	test("keyboard navigation works after SPA transition", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/a11y-nav-test");

		/* tab until we reach an interactive element (up to 10 tabs) */
		let activeTag = "none";
		for (let i = 0; i < 10; i++) {
			await page.keyboard.press("Tab");
			activeTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? "none");
			if (["a", "button", "input"].includes(activeTag)) break;
		}

		/* should have reached a link or button — proves no focus trap */
		expect(["a", "button", "input"]).toContain(activeTag);
	});

	test("back navigation preserves page accessibility", async ({ page }) => {
		await loadPage(page, "/a11y-nav-test");
		await navigateSPA(page, "/about");

		/* go back */
		await page.goBack();
		await page.waitForURL("**/a11y-nav-test");

		/* page should still have proper structure */
		await expect(page.locator("[data-testid=a11y-nav-page]")).toBeVisible();
		await expect(page.locator("h1")).toBeVisible();
	});
});

test.describe("A11y Nav — navigation links", () => {
	test("all nav links have visible text content", async ({ page }) => {
		await loadPage(page, "/a11y-nav-test");

		const emptyLinks = await page.evaluate(() => {
			const links = document.querySelectorAll("[data-testid=test-nav] a");
			return Array.from(links)
				.filter((a) => !a.textContent?.trim())
				.map((a) => a.getAttribute("href") ?? "unknown");
		});

		expect(emptyLinks).toEqual([]);
	});

	test("nav links are distinguishable (unique text)", async ({ page }) => {
		await loadPage(page, "/a11y-nav-test");

		const linkTexts = await page.evaluate(() => {
			const links = document.querySelectorAll("[data-testid=test-nav] a");
			return Array.from(links).map((a) => a.textContent?.trim() ?? "");
		});

		/* no duplicate link text */
		const unique = new Set(linkTexts);
		expect(unique.size).toBe(linkTexts.length);
	});
});

test.describe("A11y Nav — SSR structure for screen readers", () => {
	test("async section has aria-labelledby", async ({ request }) => {
		const res = await request.get("/a11y-nav-test");
		const html = await res.text();

		expect(html).toContain('aria-labelledby="async-heading"');
		expect(html).toContain('id="async-heading"');
	});

	test("nav element has aria-label", async ({ request }) => {
		const res = await request.get("/a11y-nav-test");
		const html = await res.text();

		expect(html).toContain('aria-label="Test navigation"');
	});

	test("heading hierarchy maintained", async ({ page }) => {
		await loadPage(page, "/a11y-nav-test");

		const headings = await page.evaluate(() => {
			const els = document.querySelectorAll(
				"[data-testid=a11y-nav-page] h1, [data-testid=a11y-nav-page] h2, [data-testid=a11y-nav-page] h3",
			);
			return Array.from(els).map((el) => ({
				level: Number.parseInt(el.tagName.replace("H", ""), 10),
				text: el.textContent?.trim() ?? "",
			}));
		});

		/* h1 first, then h2s */
		expect(headings[0]?.level).toBe(1);
		for (let i = 1; i < headings.length; i++) {
			expect(headings[i]?.level).toBe(2);
		}
	});

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/a11y-nav-test");
		await expect(page.locator("[data-testid=async-resolved]")).toBeVisible({ timeout: 5000 });
		cap.assertClean();
	});
});
