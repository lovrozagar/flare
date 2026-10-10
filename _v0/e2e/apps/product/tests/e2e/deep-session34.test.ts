import { expect, test } from "@playwright/test";
import { loadPage, setNavMarker, setupConsoleCapture } from "./helpers";

/**
 * Session 34: Tests for 6 client-side audit fixes.
 * - Fix 1: Link disabled reactivity (Show-based toggling)
 * - Fix 2: lazy/clientLazy error surfacing to ErrorBoundary
 * - Fix 3: useBlocker SPA navigation blocking
 * - Fix 4: lazy global pending set cleanup
 * - Fix 5: preload generation token (unit-only)
 * - Fix 6: cache maxSize LRU eviction (unit-only)
 */

/* ------------------------------------------------------------------ */
/*  Fix 1: Link disabled reactivity                                    */
/* ------------------------------------------------------------------ */
test.describe("Link disabled reactive toggling", () => {
	test("disabled link renders as span initially", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/disabled-toggle");

		const link = page.locator("[data-testid=toggle-link]");
		const tag = await link.evaluate((el) => el.tagName.toLowerCase());
		expect(tag).toBe("span");
		await expect(link).toHaveAttribute("aria-disabled", "true");

		cap.assertClean();
	});

	test("toggling disabled switches span to anchor", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/disabled-toggle");

		/* Initially disabled → span */
		const link = page.locator("[data-testid=toggle-link]");
		expect(await link.evaluate((el) => el.tagName.toLowerCase())).toBe("span");

		/* Click toggle → enabled → should become <a> */
		await page.click("[data-testid=toggle-btn]");
		await expect(page.locator("[data-testid=disabled-state]")).toHaveText("enabled");

		const linkAfter = page.locator("[data-testid=toggle-link]");
		expect(await linkAfter.evaluate((el) => el.tagName.toLowerCase())).toBe("a");
		expect(await linkAfter.getAttribute("href")).toContain("/about");

		cap.assertClean();
	});

	test("re-disabling switches anchor back to span", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/disabled-toggle");

		/* Enable */
		await page.click("[data-testid=toggle-btn]");
		await expect(page.locator("[data-testid=disabled-state]")).toHaveText("enabled");

		/* Re-disable */
		await page.click("[data-testid=toggle-btn]");
		await expect(page.locator("[data-testid=disabled-state]")).toHaveText("disabled");

		const link = page.locator("[data-testid=toggle-link]");
		expect(await link.evaluate((el) => el.tagName.toLowerCase())).toBe("span");
		await expect(link).toHaveAttribute("aria-disabled", "true");

		cap.assertClean();
	});

	test("enabled link navigates on click", async ({ page }) => {
		await loadPage(page, "/disabled-toggle");

		/* Enable the link */
		await page.click("[data-testid=toggle-btn]");
		await expect(page.locator("[data-testid=disabled-state]")).toHaveText("enabled");

		/* Set SPA marker and click */
		await setNavMarker(page);
		await page.click("[data-testid=toggle-link]");
		await page.waitForURL("**/about", { timeout: 10_000 });
		expect(page.url()).toContain("/about");
	});
});

/* ------------------------------------------------------------------ */
/*  Fix 3: useBlocker SPA navigation blocking                         */
/* ------------------------------------------------------------------ */
test.describe("useBlocker SPA navigation blocking", () => {
	test("clean state allows navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blocker-test");

		/* Should be clean initially */
		await expect(page.locator("[data-testid=dirty-state]")).toHaveText("clean");

		/* Click nav link — should navigate */
		await page.click("[data-testid=nav-link]");
		await page.waitForURL("**/about", { timeout: 10_000 });
		expect(page.url()).toContain("/about");

		cap.assertClean();
	});

	test("dirty state blocks navigation and sets blocked signal", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blocker-test");

		/* Make dirty */
		await page.click("[data-testid=toggle-dirty]");
		await expect(page.locator("[data-testid=dirty-state]")).toHaveText("dirty");

		/* Try to navigate — should be blocked */
		await page.click("[data-testid=nav-link]");
		await page.waitForTimeout(500);

		/* URL should NOT change */
		expect(page.url()).toContain("/blocker-test");

		/* Blocked signal should be true */
		await expect(page.locator("[data-testid=blocked-state]")).toHaveText("blocked");

		cap.assertClean();
	});

	test("proceed allows blocked navigation to continue", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blocker-test");

		/* Make dirty */
		await page.click("[data-testid=toggle-dirty]");
		await expect(page.locator("[data-testid=dirty-state]")).toHaveText("dirty");

		/* Attempt blocked navigation */
		await page.click("[data-testid=nav-link]");
		await page.waitForTimeout(300);
		expect(page.url()).toContain("/blocker-test");

		/* Clear dirty state first (otherwise blocker fires again on proceed) */
		await page.click("[data-testid=toggle-dirty]");
		await expect(page.locator("[data-testid=dirty-state]")).toHaveText("clean");

		/* Click proceed — navigation should resume */
		await page.click("[data-testid=proceed-btn]");
		await page.waitForURL("**/about", { timeout: 10_000 });
		expect(page.url()).toContain("/about");

		cap.assertClean();
	});

	test("reset cancels blocked navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blocker-test");

		/* Make dirty */
		await page.click("[data-testid=toggle-dirty]");

		/* Attempt blocked navigation */
		await page.click("[data-testid=nav-link]");
		await page.waitForTimeout(300);
		await expect(page.locator("[data-testid=blocked-state]")).toHaveText("blocked");

		/* Reset — should clear blocked state and discard navigation */
		await page.click("[data-testid=reset-btn]");
		await expect(page.locator("[data-testid=blocked-state]")).toHaveText("not-blocked");
		await page.waitForTimeout(300);

		/* Still on blocker-test page */
		expect(page.url()).toContain("/blocker-test");

		cap.assertClean();
	});

	test("blocker does not affect programmatic navigate when clean", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blocker-test");

		/* Ensure clean state */
		await expect(page.locator("[data-testid=dirty-state]")).toHaveText("clean");

		/* Programmatic navigation should work */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (nav) return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });
		expect(page.url()).toContain("/about");

		cap.assertClean();
	});

	test("dirty state blocks programmatic navigation too", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blocker-test");

		/* Make dirty */
		await page.click("[data-testid=toggle-dirty]");
		await expect(page.locator("[data-testid=dirty-state]")).toHaveText("dirty");

		/* Programmatic navigate — should be blocked */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (nav) return nav("/about");
		});
		await page.waitForTimeout(500);

		expect(page.url()).toContain("/blocker-test");
		await expect(page.locator("[data-testid=blocked-state]")).toHaveText("blocked");

		cap.assertClean();
	});
});
