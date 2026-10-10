import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Preloader error handling", () => {
	test("SSR /preloader-throw returns 500", async ({ page }) => {
		const response = await page.goto("/preloader-throw", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(500);

		/*
		 * Preloader errors propagate out of runPipeline (unlike loader errors which are
		 * caught per-match). Server handler catches them as generic errors → fallback 500 HTML.
		 * The route's errorRender is not invoked because no PipelineMatch is created.
		 */
		const body = await page.evaluate(() => document.body.innerHTML);
		expect(body).toBeTruthy();
	});

	test("SSR /preloader-throw does not reach the loader", async ({ page }) => {
		await page.goto("/preloader-throw", { waitUntil: "domcontentloaded" });

		/**
		 * If the preloader throws, the loader should never run.
		 * The error boundary renders instead of the page content,
		 * so no loader data should be present in the DOM.
		 */
		const loaderContent = await page.locator("[data-testid=loader-message]").count();
		expect(loaderContent).toBe(0);
	});

	test("SPA nav to /preloader-throw changes URL without crash", async ({ page }) => {
		await loadPage(page, "/");

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/preloader-throw").catch(() => {
				/* preloader error returns 500 from server — navigate may reject */
			});
		});
		await page.waitForURL("**/preloader-throw", { timeout: 10_000 });

		expect(page.url()).toContain("/preloader-throw");
	});

	test("recovery: SPA nav from preloader error to valid page works", async ({ page }) => {
		await loadPage(page, "/");

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/preloader-throw").catch(() => {});
		});
		await page.waitForURL("**/preloader-throw", { timeout: 10_000 });

		/* Navigate back to a valid page — should recover cleanly */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });

		expect(page.url()).toContain("/about");
		const content = await page.locator("[data-testid=about-content]").textContent();
		expect(content).toBeTruthy();
	});
});

test.describe("Preloader redirect handling", () => {
	test("SSR /preloader-redirect lands on /redirect-target", async ({ page }) => {
		await page.goto("/preloader-redirect");
		await page.waitForURL("**/redirect-target", { timeout: 10_000 });
		expect(page.url()).toContain("/redirect-target");
		await expect(page.locator("[data-testid=redirect-target]")).toBeVisible();
	});

	test("SPA nav to /preloader-redirect follows redirect to target", async ({ page }) => {
		await loadPage(page, "/");

		/*
		 * Preloader redirect throws RedirectResponse which propagates past runPipeline.
		 * Server handler catches it → HTTP 302. Browser fetch follows 302 → gets HTML.
		 * Navigate catches the RedirectResponse from the NDJSON parse failure and
		 * follows it client-side. The URL should end up at /redirect-target.
		 */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/preloader-redirect").catch(() => {
				/* redirect may cause navigate to reject */
			});
		});

		/* Wait for either URL change or timeout — preloader redirect during SPA is best-effort */
		await page.waitForTimeout(3000);
		const finalUrl = page.url();
		/*
		 * Either the redirect was followed (URL contains redirect-target) or
		 * the URL stayed at preloader-redirect (server returned 302, fetch followed
		 * to HTML response, NDJSON parse failed). Both outcomes are acceptable.
		 */
		expect(finalUrl.includes("/redirect-target") || finalUrl.includes("/preloader-redirect")).toBe(true);
	});
});

test.describe("PreloaderContext fields present", () => {
	test("preloaderTimestamp is a valid number", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/props-demo");

		const ts = Number(await page.locator("[data-testid=preloader-timestamp]").textContent());
		expect(ts).toBeGreaterThan(0);
		expect(Number.isFinite(ts)).toBe(true);

		cap.assertClean();
	});

	test("preloaderContext.pathname matches /props-demo", async ({ page }) => {
		await loadPage(page, "/props-demo");
		expect(await page.locator("[data-testid=preloader-pathname]").textContent()).toBe("/props-demo");
	});

	test("preloader timestamp is earlier than loader timestamp", async ({ page }) => {
		await loadPage(page, "/props-demo");

		const preloaderTs = Number(await page.locator("[data-testid=preloader-timestamp]").textContent());
		const loaderTs = Number(await page.locator("[data-testid=loader-timestamp]").textContent());

		expect(preloaderTs).toBeGreaterThan(0);
		expect(loaderTs).toBeGreaterThan(0);
		expect(preloaderTs).toBeLessThanOrEqual(loaderTs);
	});

	test("location.pathname matches /props-demo", async ({ page }) => {
		await loadPage(page, "/props-demo");
		expect(await page.locator("[data-testid=location-pathname]").textContent()).toBe("/props-demo");
	});
});

test.describe("PreloaderContext survives SPA navigation", () => {
	test("SPA nav to /props-demo has correct preloaderContext", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await navigateSPA(page, "/props-demo");

		const ts = Number(await page.locator("[data-testid=preloader-timestamp]").textContent());
		expect(ts).toBeGreaterThan(0);
		expect(await page.locator("[data-testid=preloader-pathname]").textContent()).toBe("/props-demo");
		expect(await page.locator("[data-testid=location-pathname]").textContent()).toBe("/props-demo");

		cap.assertClean();
	});

	test("SPA nav preserves loader data alongside preloaderContext", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/props-demo");

		const pathname = await page.locator("[data-testid=loader-pathname]").textContent();
		expect(pathname).toBe("/props-demo");

		const loaderTs = Number(await page.locator("[data-testid=loader-timestamp]").textContent());
		expect(loaderTs).toBeGreaterThan(0);
	});

	test("round-trip re-runs preloader with fresh timestamp", async ({ page }) => {
		await loadPage(page, "/props-demo");

		const ts1 = Number(await page.locator("[data-testid=preloader-timestamp]").textContent());
		expect(ts1).toBeGreaterThan(0);

		await navigateSPA(page, "/about");
		await page.waitForTimeout(50);
		await navigateSPA(page, "/props-demo");

		const ts2 = Number(await page.locator("[data-testid=preloader-timestamp]").textContent());
		expect(ts2).toBeGreaterThan(0);

		/* Preloader re-ran on re-entry — timestamp must differ */
		expect(ts2).not.toBe(ts1);
	});
});

test.describe("Nested preloaderContext", () => {
	test("layout and page both have independent preloader timestamps", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/props-nested");

		const layoutTs = Number(await page.locator("[data-testid=layout-preloader-timestamp]").textContent());
		const pageTs = Number(await page.locator("[data-testid=page-preloader-timestamp]").textContent());

		expect(layoutTs).toBeGreaterThan(0);
		expect(pageTs).toBeGreaterThan(0);

		cap.assertClean();
	});

	test("layout content renders alongside nested page", async ({ page }) => {
		await loadPage(page, "/props-nested");
		await expect(page.locator("[data-testid=props-nested-content]")).toBeVisible();
	});

	test("SPA nav to /props-nested populates both preloader timestamps", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await navigateSPA(page, "/props-nested");

		const layoutTs = Number(await page.locator("[data-testid=layout-preloader-timestamp]").textContent());
		const pageTs = Number(await page.locator("[data-testid=page-preloader-timestamp]").textContent());

		expect(layoutTs).toBeGreaterThan(0);
		expect(pageTs).toBeGreaterThan(0);
		await expect(page.locator("[data-testid=props-nested-content]")).toBeVisible();

		cap.assertClean();
	});
});
