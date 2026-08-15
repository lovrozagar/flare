import { expect, test } from "@playwright/test";
import { assertSPANavigation, clickAndAssertSPA, loadPage, navigateSPA, setNavMarker } from "./helpers";

/**
 * Scrolls the page and returns the actual scrollY.
 * scroll-tall has 100 items at 30px min-height = 3000px+ content.
 */
async function scrollAndVerify(page: import("@playwright/test").Page, y: number): Promise<number> {
	await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
	await page.waitForTimeout(100);
	return page.evaluate(() => window.scrollY);
}

async function waitForScroll(page: import("@playwright/test").Page): Promise<number> {
	await page.waitForTimeout(500);
	return page.evaluate(() => window.scrollY);
}

test.describe("Scroll: forward navigation", () => {
	test("SPA link click scrolls to top", async ({ page }) => {
		await loadPage(page, "/");

		await page.evaluate(() => {
			const div = document.createElement("div");
			div.style.height = "3000px";
			document.body.appendChild(div);
			window.scrollTo(0, 500);
		});
		expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

		await clickAndAssertSPA(page, "a[href='/about']", "/about");
		await page.waitForTimeout(300);
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
	});

	test("programmatic navigate scrolls to top", async ({ page }) => {
		await loadPage(page, "/scroll-tall");
		await scrollAndVerify(page, 600);

		await navigateSPA(page, "/about");
		expect(await waitForScroll(page)).toBe(0);
	});

	test("scroll: false prevents scroll reset", async ({ page }) => {
		await loadPage(page, "/scroll-tall");
		const before = await scrollAndVerify(page, 400);
		if (before < 50) return;

		/* Ensure body stays tall after route change so scroll position can be maintained.
		 * Without this, the short /about page content would force the browser to
		 * reduce scrollY to fit the shorter page regardless of scroll:false. */
		await page.evaluate(() => {
			document.body.style.minHeight = "5000px";
		});

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string, opts?: Record<string, unknown>) => Promise<void>)
				| undefined;
			return nav?.("/about", { scroll: false });
		});
		await page.waitForURL("**/about", { timeout: 10_000 });
		/* Wait for view transition + DOM update to settle */
		await page.waitForTimeout(300);

		/* Scroll should NOT have changed */
		const after = await page.evaluate(() => window.scrollY);
		expect(after).toBeGreaterThan(50);
	});
});

test.describe("Scroll: hash navigation", () => {
	test("hash nav calls scrollIntoView", async ({ page }) => {
		await loadPage(page, "/about");

		const scrolled = await page.evaluate(() => {
			return new Promise<boolean>((resolve) => {
				const spacer = document.createElement("div");
				spacer.style.height = "2000px";
				document.body.appendChild(spacer);

				const target = document.createElement("div");
				target.id = "hash-target";
				target.textContent = "Target";
				document.body.appendChild(target);

				target.scrollIntoView = () => resolve(true);

				const nav = (window as unknown as Record<string, unknown>).__flareNavigate as (to: string) => Promise<void>;
				if (nav) {
					nav("/about#hash-target");
				} else {
					resolve(false);
				}
			});
		});
		expect(scrolled).toBe(true);
	});
});

test.describe("Scroll: back button", () => {
	test("back restores scroll position", async ({ page }) => {
		await loadPage(page, "/scroll-tall");

		const before = await scrollAndVerify(page, 800);
		if (before < 100) return;

		await navigateSPA(page, "/about");
		await page.waitForTimeout(300);

		await setNavMarker(page);
		await page.goBack();
		await page.waitForURL("**/scroll-tall", { timeout: 10_000 });
		await assertSPANavigation(page);

		expect(await waitForScroll(page)).toBeGreaterThan(100);
	});

	test("back to page with scroll 0 stays at 0", async ({ page }) => {
		await loadPage(page, "/about");
		/* Don't scroll — leave at 0 */

		await navigateSPA(page, "/scroll-tall");
		await scrollAndVerify(page, 500);

		await setNavMarker(page);
		await page.goBack();
		await page.waitForURL("**/about", { timeout: 10_000 });
		await assertSPANavigation(page);

		expect(await waitForScroll(page)).toBe(0);
	});
});

test.describe("Scroll: forward button", () => {
	test("forward restores scroll position", async ({ page }) => {
		await loadPage(page, "/scroll-tall");
		const scrollA = await scrollAndVerify(page, 800);
		if (scrollA < 100) return;

		await navigateSPA(page, "/about");
		await page.waitForTimeout(200);

		/* Now navigate forward to scroll-tall */
		await navigateSPA(page, "/scroll-tall");
		const scrollB = await scrollAndVerify(page, 400);
		if (scrollB < 50) return;

		/* Back to about (history: scroll-tall → about → scroll-tall, going to index 1) */
		await setNavMarker(page);
		await page.goBack();
		await page.waitForURL("**/about", { timeout: 10_000 });
		await assertSPANavigation(page);

		/* Forward to scroll-tall (the second visit, index 2) */
		await setNavMarker(page);
		await page.goForward();
		await page.waitForURL("**/scroll-tall", { timeout: 10_000 });
		await assertSPANavigation(page);

		/* Should restore the 400px scroll from the second visit */
		expect(await waitForScroll(page)).toBeGreaterThan(50);
	});
});

test.describe("Scroll: back-forward-back-forward chain", () => {
	test("A(500) → B → back → forward restores B scroll(0)", async ({ page }) => {
		await loadPage(page, "/scroll-tall");
		const scrollA = await scrollAndVerify(page, 500);
		if (scrollA < 100) return;

		/* Navigate to B (about) — scroll is 0 */
		await navigateSPA(page, "/about");
		await page.waitForTimeout(200);

		/* Back to A */
		await setNavMarker(page);
		await page.goBack();
		await page.waitForURL("**/scroll-tall", { timeout: 10_000 });
		await assertSPANavigation(page);
		expect(await waitForScroll(page)).toBeGreaterThan(100);

		/* Forward to B — should be at 0 */
		await setNavMarker(page);
		await page.goForward();
		await page.waitForURL("**/about", { timeout: 10_000 });
		await assertSPANavigation(page);
		expect(await waitForScroll(page)).toBe(0);
	});

	test("A(500) → B(300) → back → forward → back → forward", async ({ page }) => {
		await loadPage(page, "/scroll-tall");
		const scrollA = await scrollAndVerify(page, 500);
		if (scrollA < 100) return;

		/* Navigate to B — a different tall page via users */
		await navigateSPA(page, "/users/42");
		await page.waitForTimeout(200);

		/* Back to A */
		await setNavMarker(page);
		await page.goBack();
		await page.waitForURL("**/scroll-tall", { timeout: 10_000 });
		await assertSPANavigation(page);
		expect(await waitForScroll(page)).toBeGreaterThan(100);

		/* Forward to B */
		await setNavMarker(page);
		await page.goForward();
		await page.waitForURL("**/users/42", { timeout: 10_000 });
		await assertSPANavigation(page);

		/* Back to A again */
		await setNavMarker(page);
		await page.goBack();
		await page.waitForURL("**/scroll-tall", { timeout: 10_000 });
		await assertSPANavigation(page);
		expect(await waitForScroll(page)).toBeGreaterThan(100);

		/* Forward to B again */
		await setNavMarker(page);
		await page.goForward();
		await page.waitForURL("**/users/42", { timeout: 10_000 });
		await assertSPANavigation(page);

		/* All navigations should be SPA */
	});

	test("A → B → C → back → back → forward → forward", async ({ page }) => {
		await loadPage(page, "/scroll-tall");
		const scrollA = await scrollAndVerify(page, 700);
		if (scrollA < 100) return;

		/* A → B */
		await navigateSPA(page, "/about");
		await page.waitForTimeout(200);

		/* B → C */
		await navigateSPA(page, "/users/42");
		await page.waitForTimeout(200);

		/* C → B (back) */
		await setNavMarker(page);
		await page.goBack();
		await page.waitForURL("**/about", { timeout: 10_000 });
		await assertSPANavigation(page);

		/* B → A (back) */
		await setNavMarker(page);
		await page.goBack();
		await page.waitForURL("**/scroll-tall", { timeout: 10_000 });
		await assertSPANavigation(page);
		expect(await waitForScroll(page)).toBeGreaterThan(100);

		/* A → B (forward) */
		await setNavMarker(page);
		await page.goForward();
		await page.waitForURL("**/about", { timeout: 10_000 });
		await assertSPANavigation(page);

		/* B → C (forward) */
		await setNavMarker(page);
		await page.goForward();
		await page.waitForURL("**/users/42", { timeout: 10_000 });
		await assertSPANavigation(page);
	});
});

test.describe("Scroll: view transitions + back/forward", () => {
	test("back button with view transitions still restores scroll", async ({ page }) => {
		await loadPage(page, "/scroll-tall");
		const scrollA = await scrollAndVerify(page, 600);
		if (scrollA < 100) return;

		/* Navigate with explicit VT */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string, opts?: Record<string, unknown>) => Promise<void>)
				| undefined;
			return nav?.("/about", { viewTransition: true });
		});
		await page.waitForURL("**/about", { timeout: 10_000 });
		await page.waitForTimeout(300);

		/* Back */
		await setNavMarker(page);
		await page.goBack();
		await page.waitForURL("**/scroll-tall", { timeout: 10_000 });
		await assertSPANavigation(page);

		expect(await waitForScroll(page)).toBeGreaterThan(100);
	});

	test("startViewTransition called on back/forward when default enabled", async ({ page, browserName }) => {
		test.skip(browserName !== "chromium", "startViewTransition is Chromium-only");

		await loadPage(page, "/");
		await navigateSPA(page, "/about");
		await page.waitForTimeout(200);

		/* Intercept startViewTransition for the back navigation */
		const called = await page.evaluate(() => {
			return new Promise<boolean>((resolve) => {
				const doc = document as unknown as Record<string, unknown>;
				if (typeof doc.startViewTransition !== "function") {
					resolve(false);
					return;
				}

				const original = doc.startViewTransition as (...args: unknown[]) => unknown;
				doc.startViewTransition = (...args: unknown[]) => {
					resolve(true);
					return original.apply(document, args);
				};

				window.history.back();
			});
		});

		expect(called).toBe(true);
	});
});
