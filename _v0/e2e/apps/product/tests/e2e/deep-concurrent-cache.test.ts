import { expect, test } from "@playwright/test";
import { assertSPANavigation, loadPage, setNavMarker, setupConsoleCapture } from "./helpers";

test.describe("Deep: concurrent navigation abort isolation", () => {
	test("slow→fast race: only fast page data renders, slow never appears", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await setNavMarker(page);

		/* Fire nav to /slow (1.5s loader) then immediately /about */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			nav("/slow");
			nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });
		await assertSPANavigation(page);

		/* Verify ABOUT data is correct (not slow's data) */
		const content = await page.locator("[data-testid=about-content]").textContent();
		expect(content).toBe("This is the about page for the Flare E2E test app.");

		const year = await page.locator("[data-testid=about-year]").textContent();
		expect(year).toBe("2026");

		/* Slow page never appeared */
		const slowVisible = await page
			.locator("[data-testid=slow-page]")
			.isVisible()
			.catch(() => false);
		expect(slowVisible).toBe(false);

		/* Wait for slow loader to have resolved (1.5s) — still shouldn't appear */
		await page.waitForTimeout(2000);
		const slowVisibleLater = await page
			.locator("[data-testid=slow-page]")
			.isVisible()
			.catch(() => false);
		expect(slowVisibleLater).toBe(false);

		/* Page should still show about content */
		expect(await page.locator("[data-testid=about-content]").textContent()).toBe(
			"This is the about page for the Flare E2E test app.",
		);

		cap.assertClean();
	});

	test("fast→slow race: slow page eventually renders (not aborted)", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await setNavMarker(page);

		/* Fire nav to /about (instant) then /slow (1.5s) */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			nav("/about");
			nav("/slow");
		});

		/* Slow page should eventually render since it was the LAST nav */
		await page.waitForURL("**/slow", { timeout: 15_000 });
		await assertSPANavigation(page);

		await expect(page.locator("[data-testid=slow-page]")).toBeVisible({ timeout: 10_000 });
		const loaded = await page.locator("[data-testid=slow-loaded]").textContent();
		expect(loaded).toBe("true");

		cap.assertClean();
	});

	test("triple concurrent: only last navigation wins", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await setNavMarker(page);

		/* Fire 3 navigations rapidly: /slow, /about, /blog */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			nav("/slow");
			nav("/about");
			nav("/blog");
		});

		await page.waitForURL("**/blog", { timeout: 10_000 });
		await assertSPANavigation(page);

		/* Blog is the winner */
		await expect(page.locator("[data-testid=blog-list]")).toBeVisible();
		const links = page.locator("[data-testid=blog-list] a");
		await expect(links).toHaveCount(3);

		/* Slow and about should not be visible */
		const slowVisible = await page
			.locator("[data-testid=slow-page]")
			.isVisible()
			.catch(() => false);
		expect(slowVisible).toBe(false);
		const aboutVisible = await page
			.locator("[data-testid=about]")
			.isVisible()
			.catch(() => false);
		expect(aboutVisible).toBe(false);

		cap.assertClean();
	});
});

test.describe("Deep: NDJSON abort on concurrent nav", () => {
	test("aborted NDJSON request does not produce console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		/* Track aborted requests */
		const abortedUrls: string[] = [];
		page.on("requestfailed", (req) => {
			if (req.failure()?.errorText === "net::ERR_ABORTED") {
				abortedUrls.push(req.url());
			}
		});

		await setNavMarker(page);
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			nav("/slow");
			nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });
		await assertSPANavigation(page);

		/* Wait for potential delayed errors */
		await page.waitForTimeout(500);
		cap.assertClean();
	});
});

test.describe("Deep: cache freshness on revisit", () => {
	test("home timestamp changes on SPA revisit (not cached)", async ({ page }) => {
		await loadPage(page, "/");

		const ts1 = Number(await page.locator("[data-testid=timestamp]").textContent());
		expect(ts1).toBeGreaterThan(0);

		/* Navigate away and back */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });

		/* Wait a bit for timestamp to differ */
		await page.waitForTimeout(50);

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/");
		});
		await page.waitForURL("**/", { timeout: 10_000 });

		const ts2 = Number(await page.locator("[data-testid=timestamp]").textContent());
		expect(ts2).toBeGreaterThan(0);

		/* Timestamps should differ (fresh NDJSON fetch, not cached) */
		expect(ts2).not.toBe(ts1);
	});

	test("each SPA nav fires a separate NDJSON request (not cached)", async ({ page }) => {
		await loadPage(page, "/");

		let aboutNdjsonCount = 0;
		page.on("request", (req) => {
			if (req.headers()["flare-data"] === "1" && req.url().includes("/about")) {
				aboutNdjsonCount++;
			}
		});

		/* Navigate to about */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });
		expect(aboutNdjsonCount).toBe(1);

		/* Navigate away */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/");
		});
		await page.waitForURL("**/", { timeout: 10_000 });

		/* Navigate to about again — should fire NEW NDJSON request */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });
		expect(aboutNdjsonCount).toBe(2);
	});
});

test.describe("Deep: slow page eventually loads correctly", () => {
	test("direct SSR to /slow waits and renders", async ({ page }) => {
		await loadPage(page, "/slow");
		await expect(page.locator("[data-testid=slow-page]")).toBeVisible();
		const loaded = await page.locator("[data-testid=slow-loaded]").textContent();
		expect(loaded).toBe("true");
	});

	test("SPA nav to /slow loads after delay", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await setNavMarker(page);

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/slow");
		});
		await page.waitForURL("**/slow", { timeout: 15_000 });
		await assertSPANavigation(page);

		await expect(page.locator("[data-testid=slow-page]")).toBeVisible({ timeout: 10_000 });
		expect(await page.locator("[data-testid=slow-loaded]").textContent()).toBe("true");

		cap.assertClean();
	});
});
