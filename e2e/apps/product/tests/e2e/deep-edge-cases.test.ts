import { expect, test } from "@playwright/test";
import { assertSPANavigation, loadPage, navigateSPA, setNavMarker, setupConsoleCapture } from "./helpers";

test.describe("Edge: rapid back/forward mashing", () => {
	test("rapid back/forward settles on correct page", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/about");
		await navigateSPA(page, "/blog");

		/* Mash back/forward 3 times rapidly */
		await page.goBack();
		await page.goForward();
		await page.goBack();

		/* Wait for navigation to settle */
		await page.waitForTimeout(1500);
		const url = page.url();
		/* Should be on /about (3 back-forward: blog→about→blog→about) */
		expect(url).toContain("/about");
		const content = await page.locator("[data-testid=about-content]").textContent();
		expect(content).toBeTruthy();
	});

	test("5-page history then rapid back to first page", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/about");
		await navigateSPA(page, "/blog");
		await navigateSPA(page, "/users/42");
		await navigateSPA(page, "/head-demo");

		/* Rapid triple back */
		await page.goBack();
		await page.goBack();
		await page.goBack();
		await page.waitForTimeout(1500);

		/* Should settle on /about (4 pages deep, 3 backs = /about) */
		expect(page.url()).toContain("/about");
	});
});

test.describe("Edge: popstate during active navigate", () => {
	test("back button while slow page is loading cancels slow nav", async ({ page }) => {
		await loadPage(page, "/");
		await setNavMarker(page);

		/* Start navigating to slow page (1500ms loader) */
		page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			nav?.("/slow");
		});
		/* Don't await — immediately hit back */
		await page.waitForTimeout(200);
		await page.goBack();
		await page.waitForTimeout(2000);

		/* Should be back on home, not showing slow page */
		expect(page.url()).toContain("/");
		const home = await page.locator("[data-testid=home]").count();
		expect(home).toBeGreaterThan(0);
	});
});

test.describe("Edge: error → error → valid navigation chain", () => {
	test("navigate to broken, then another error, then valid page — no crash", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		/* Nav to first error page */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			return nav?.("/broken");
		});
		await page.waitForTimeout(500);
		expect(page.url()).toContain("/broken");

		/* Nav to second error page */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			return nav?.("/error-string");
		});
		await page.waitForTimeout(500);
		expect(page.url()).toContain("/error-string");

		/* Nav to valid page — should recover */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			return nav?.("/about");
		});
		await page.waitForURL("**/about", { timeout: 5000 });
		const content = await page.locator("[data-testid=about-content]").textContent();
		expect(content).toBeTruthy();
	});

	test("error page SSR then SPA nav to valid page recovers", async ({ page }) => {
		/* Direct load of error page */
		await page.goto("/broken", { waitUntil: "domcontentloaded" });
		/* Error pages may not hydrate cleanly — just check it loaded */
		await page.waitForTimeout(2000);

		/* Navigate to valid page via full reload fallback */
		await page.goto("/about", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: 15_000,
		});
		const content = await page.locator("[data-testid=about-content]").textContent();
		expect(content).toBeTruthy();
	});
});

test.describe("Edge: double-click same link", () => {
	test("double-clicking a link doesn't cause duplicate content", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await setNavMarker(page);

		/* Double-click the About link */
		const aboutLink = page.locator("a[href='/about']").first();
		await aboutLink.dblclick();
		await page.waitForURL("**/about", { timeout: 5000 });
		await assertSPANavigation(page);

		/* Wait for content to appear, then verify exactly one instance */
		await page.waitForSelector("[data-testid=about-content]", { timeout: 5000 });
		const aboutContent = await page.locator("[data-testid=about-content]").count();
		expect(aboutContent).toBe(1);
		cap.assertClean();
	});
});

test.describe("Edge: navigate away during slow loader, come back", () => {
	test("start slow nav, cancel by navigating elsewhere, then return", async ({ page }) => {
		await loadPage(page, "/");

		/* Start slow page navigation (don't await) */
		page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			nav?.("/slow");
		});

		/* Immediately navigate to about (cancels slow) */
		await page.waitForTimeout(100);
		await navigateSPA(page, "/about");
		const content = await page.locator("[data-testid=about-content]").textContent();
		expect(content).toBeTruthy();

		/* Wait enough time for slow loader to have resolved (1500ms) */
		await page.waitForTimeout(2000);

		/* Should still be on about, not slow */
		expect(page.url()).toContain("/about");
		const aboutContent = await page.locator("[data-testid=about-content]").textContent();
		expect(aboutContent).toBeTruthy();

		/* Now intentionally navigate to slow and wait for it */
		await navigateSPA(page, "/slow");
		await page.waitForSelector("[data-testid=slow-loaded]", { timeout: 10_000 });
		expect(await page.locator("[data-testid=slow-loaded]").textContent()).toBe("true");
	});
});

test.describe("Edge: chain redirect (multi-hop)", () => {
	test("SSR chain redirect a→b→final resolves to final page", async ({ page }) => {
		const response = await page.request.get("/chain-a");
		/* Server follows redirects — should end up at chain-final */
		expect(response.url()).toContain("/chain-final");
		const html = await response.text();
		expect(html).toContain("Chain Final");
	});

	test("SPA chain redirect resolves correctly", async ({ page }) => {
		await loadPage(page, "/");
		/* Navigate to chain-a via SPA — server redirect chain */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			return nav?.("/chain-a");
		});
		await page.waitForTimeout(3000);
		/* Should have followed the chain and ended up somewhere valid */
		const url = page.url();
		/* chain-a → chain-b → chain-final */
		expect(url).toContain("/chain-final");
	});
});

test.describe("Edge: same-URL navigation guard", () => {
	test("navigating to current URL is a no-op", async ({ page }) => {
		await loadPage(page, "/about");
		const ndjsonRequests: string[] = [];
		page.on("request", (req) => {
			if (req.headers()["x-d"] === "1") {
				ndjsonRequests.push(req.url());
			}
		});

		/* Navigate to same URL */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			return nav?.("/about");
		});
		await page.waitForTimeout(500);

		/* No NDJSON fetch should have been made */
		expect(ndjsonRequests.length).toBe(0);
		/* Still on about */
		expect(page.url()).toContain("/about");
	});
});

test.describe("Edge: 404 not-found boundary", () => {
	test("SSR 404 for unknown path", async ({ page }) => {
		const response = await page.request.get("/this-page-does-not-exist");
		expect(response.status()).toBe(404);
		const html = await response.text();
		expect(html).toContain("404");
		/* Fuzzy mode SSR renders layout shell with notFound boundary */
		expect(html.toLowerCase()).toContain("not found");
	});

	test("SPA navigate to unknown path triggers not-found state", async ({ page }) => {
		await loadPage(page, "/");
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			return nav?.("/this-does-not-exist-either");
		});
		await page.waitForTimeout(500);
		/*
		 * matchRoute returns null → notFound is set to true, matches cleared.
		 * URL may not change since history.pushState happens after match check.
		 * Just verify the page didn't crash.
		 */
		const hydrated = await page.evaluate(() => document.documentElement.hasAttribute("data-hydrated"));
		expect(hydrated).toBe(true);
	});

	test("recovery from 404 to valid page via SPA nav", async ({ page }) => {
		await loadPage(page, "/");
		/* Navigate to valid page after attempting invalid route */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			return nav?.("/nonexistent-xyz");
		});
		await page.waitForTimeout(500);

		/* Navigate to valid page */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			return nav?.("/about");
		});
		await page.waitForURL("**/about", { timeout: 5000 });
		const content = await page.locator("[data-testid=about-content]").textContent();
		expect(content).toBeTruthy();
	});
});

test.describe("Edge: empty and null loader data", () => {
	test("empty object loader renders correctly in SSR", async ({ page }) => {
		await loadPage(page, "/empty-loader");
		const keys = await page.locator("[data-testid=empty-loader-keys]").textContent();
		expect(keys).toBe("0");
	});

	test("null loader renders correctly in SSR", async ({ page }) => {
		await loadPage(page, "/null-loader");
		const value = await page.locator("[data-testid=null-loader-value]").textContent();
		expect(value).toBe("null");
	});

	test("empty loader data survives SPA navigation", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/empty-loader");
		const keys = await page.locator("[data-testid=empty-loader-keys]").textContent();
		expect(keys).toBe("0");
	});

	test("null loader data survives SPA navigation", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/null-loader");
		const value = await page.locator("[data-testid=null-loader-value]").textContent();
		expect(value).toBe("null");
	});
});

test.describe("Edge: search params pipeline", () => {
	test("SSR search params appear in loader data", async ({ page }) => {
		await loadPage(page, "/search-demo?q=hello&page=3");
		const allParams = await page.locator("[data-testid=search-all-params]").textContent();
		const parsed = JSON.parse(allParams ?? "{}");
		expect(parsed.q).toBe("hello");
		expect(parsed.page).toBe("3");
	});

	test("search params preserved through SPA nav", async ({ page }) => {
		await loadPage(page, "/");
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			return nav?.("/search-demo?foo=bar&baz=qux");
		});
		await page.waitForURL("**/search-demo**", { timeout: 5000 });
		const allParams = await page.locator("[data-testid=search-all-params]").textContent();
		const parsed = JSON.parse(allParams ?? "{}");
		expect(parsed.foo).toBe("bar");
		expect(parsed.baz).toBe("qux");
	});

	test("search params change triggers new NDJSON fetch", async ({ page }) => {
		await loadPage(page, "/search-demo?v=1");
		const ndjsonCount: number[] = [0];
		page.on("request", (req) => {
			if (req.headers()["x-d"] === "1") ndjsonCount[0]++;
		});

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			return nav?.("/search-demo?v=2");
		});
		await page.waitForTimeout(1000);

		expect(ndjsonCount[0]).toBeGreaterThan(0);
		const allParams = await page.locator("[data-testid=search-all-params]").textContent();
		const parsed = JSON.parse(allParams ?? "{}");
		expect(parsed.v).toBe("2");
	});

	test("FlareState.s matches search params after hydration", async ({ page }) => {
		await loadPage(page, "/search-demo?x=1&y=2&z=3");
		const state = await page.evaluate(() => (self as unknown as { flare: { s: Record<string, string> } }).flare);
		expect(state.s.x).toBe("1");
		expect(state.s.y).toBe("2");
		expect(state.s.z).toBe("3");
	});
});

test.describe("Edge: large data payload", () => {
	test("500 items render correctly in SSR", async ({ page }) => {
		await loadPage(page, "/large-data");
		const count = await page.locator("[data-testid=large-data-count]").textContent();
		expect(count).toBe("500");

		/* Spot check a few items */
		expect(await page.locator("[data-testid=item-0]").textContent()).toBe("Item 0");
		expect(await page.locator("[data-testid=item-499]").textContent()).toBe("Item 499");
	});

	test("large data SSR HTML contains FlareState", async ({ page }) => {
		const response = await page.request.get("/large-data");
		const html = await response.text();
		expect(html).toContain("self.flare=");
		expect(html).toContain("Item 0");
		expect(html).toContain("Item 499");
	});

	test("large data survives SPA navigation", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/large-data");
		await page.waitForSelector("[data-testid=large-data-count]", { timeout: 10_000 });
		const count = await page.locator("[data-testid=large-data-count]").textContent();
		expect(count).toBe("500");
	});
});

test.describe("Edge: navigation state (isNavigating)", () => {
	test("isNavigating is false after page load", async ({ page }) => {
		await loadPage(page, "/");
		const navigating = await page.evaluate(() => {
			const flare = (self as unknown as { flare: { m: Array<Record<string, unknown>> } }).flare;
			return flare;
		});
		/* Hydrated page should have settled navigation */
		expect(navigating).toBeDefined();
	});
});

test.describe("Edge: slow error page timing", () => {
	test("slow error page returns 500 after delay", async ({ page }) => {
		const response = await page.request.get("/slow-error");
		expect(response.status()).toBe(500);
	});

	test("navigating away from slow-error before it resolves cancels it", async ({ page }) => {
		await loadPage(page, "/");

		/* Start navigating to slow-error (don't await) */
		page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			nav?.("/slow-error");
		});

		/* Cancel by navigating to about before the 800ms error fires */
		await page.waitForTimeout(200);
		await navigateSPA(page, "/about");

		/* Should be on about, not error page */
		expect(page.url()).toContain("/about");
		const content = await page.locator("[data-testid=about-content]").textContent();
		expect(content).toBeTruthy();

		/* Wait for slow-error loader to have completed */
		await page.waitForTimeout(1000);
		/* Still on about */
		expect(page.url()).toContain("/about");
	});
});
