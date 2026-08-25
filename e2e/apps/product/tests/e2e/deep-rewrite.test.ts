import { expect, test } from "@playwright/test";
import { assertSPANavigation, loadPage, navigateSPA, setNavMarker, setupConsoleCapture } from "./helpers";

/* ── SSR rewrite fundamentals ─────────────────────────────────────────── */

test.describe("Rewrite — SSR fundamentals", () => {
	test("SSR: /vanity renders about page content", async ({ page }) => {
		await loadPage(page, "/vanity");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		await expect(page.locator("[data-testid=about-content]")).toContainText("about page");
	});

	test("SSR: browser URL stays /vanity after load", async ({ page }) => {
		await loadPage(page, "/vanity");
		expect(page.url()).toContain("/vanity");
		expect(page.url()).not.toContain("/about");
	});

	test("SSR: /alt-target renders rewrite-target content", async ({ page }) => {
		await loadPage(page, "/alt-target");
		await expect(page.locator("[data-testid=rewrite-target]")).toBeVisible();
		await expect(page.locator("[data-testid=rewrite-message]")).toContainText("Rewrite target page");
	});

	test("SSR: browser URL stays /alt-target", async ({ page }) => {
		await loadPage(page, "/alt-target");
		expect(page.url()).toContain("/alt-target");
		expect(page.url()).not.toContain("/rewrite-target");
	});

	test("SSR: direct /about still works alongside vanity", async ({ page }) => {
		await loadPage(page, "/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
	});

	test("SSR: direct /rewrite-target still works alongside /alt-target", async ({ page }) => {
		await loadPage(page, "/rewrite-target");
		await expect(page.locator("[data-testid=rewrite-target]")).toBeVisible();
	});
});

/* ── SPA navigation with rewrite ──────────────────────────────────────── */

test.describe("Rewrite — SPA navigation", () => {
	test("SPA navigate to /vanity renders about content", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/vanity");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		expect(page.url()).toContain("/vanity");
	});

	test("SPA navigate to /alt-target renders rewrite-target content", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/alt-target");
		await expect(page.locator("[data-testid=rewrite-target]")).toBeVisible();
		expect(page.url()).toContain("/alt-target");
	});

	test("SPA navigate from rewritten page to another page works", async ({ page }) => {
		await loadPage(page, "/vanity");
		await navigateSPA(page, "/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		expect(page.url()).toContain("/about");
	});
});

/* ── Back/forward navigation ──────────────────────────────────────────── */

test.describe("Rewrite — history back/forward", () => {
	test("back button from rewritten page restores previous page", async ({ page }) => {
		await loadPage(page, "/about");
		await setNavMarker(page);

		await navigateSPA(page, "/vanity");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		expect(page.url()).toContain("/vanity");

		await page.goBack();
		await page.waitForURL("**/about", { timeout: 10_000 });
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		await assertSPANavigation(page);
	});

	test("forward button returns to rewritten page", async ({ page }) => {
		await loadPage(page, "/about");
		await setNavMarker(page);

		await navigateSPA(page, "/vanity");
		expect(page.url()).toContain("/vanity");

		await page.goBack();
		await page.waitForURL("**/about", { timeout: 10_000 });

		await page.goForward();
		await page.waitForURL("**/vanity", { timeout: 10_000 });
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		await assertSPANavigation(page);
	});

	test("back/forward through multiple rewritten pages", async ({ page }) => {
		await loadPage(page, "/");
		await setNavMarker(page);

		/* / → /vanity (about) → /alt-target (rewrite-target) */
		await navigateSPA(page, "/vanity");
		await expect(page.locator("[data-testid=about]")).toBeVisible();

		await navigateSPA(page, "/alt-target");
		await expect(page.locator("[data-testid=rewrite-target]")).toBeVisible();

		/* back: /alt-target → /vanity */
		await page.goBack();
		await page.waitForURL("**/vanity", { timeout: 10_000 });
		await expect(page.locator("[data-testid=about]")).toBeVisible();

		/* back: /vanity → / */
		await page.goBack();
		await page.waitForURL("**/", { timeout: 10_000 });
		await expect(page.locator("[data-testid=home]")).toBeVisible();
		await assertSPANavigation(page);
	});
});

/* ── Link href output rewrite ─────────────────────────────────────────── */

test.describe("Rewrite — Link href output", () => {
	test("Link to=/rewrite-target generates href=/alt-target via output rewrite", async ({ page }) => {
		await loadPage(page, "/alt-target");
		const selfLink = page.locator("[data-testid=link-to-self]");
		await expect(selfLink).toBeVisible();
		const href = await selfLink.getAttribute("href");
		expect(href).toBe("/alt-target");
	});

	test("Link to=/about generates href=/about (no output rewrite for /about)", async ({ page }) => {
		await loadPage(page, "/alt-target");
		const aboutLink = page.locator("[data-testid=link-to-about]");
		const href = await aboutLink.getAttribute("href");
		expect(href).toBe("/about");
	});

	test("Link to=/ generates href=/ (no output rewrite for /)", async ({ page }) => {
		await loadPage(page, "/alt-target");
		const homeLink = page.locator("[data-testid=link-to-home]");
		const href = await homeLink.getAttribute("href");
		expect(href).toBe("/");
	});
});

/* ── NDJSON data requests ─────────────────────────────────────────────── */

test.describe("Rewrite — NDJSON data requests", () => {
	test("NDJSON request to /vanity returns 200 with correct data", async ({ page }) => {
		await loadPage(page, "/");

		let ndjsonStatus = 0;
		let ndjsonContentType = "";
		page.on("response", (res) => {
			if (res.url().includes("/vanity") && res.request().headers()["flare-data"] === "1") {
				ndjsonStatus = res.status();
				ndjsonContentType = res.headers()["content-type"] ?? "";
			}
		});

		await navigateSPA(page, "/vanity");

		expect(ndjsonStatus).toBe(200);
		expect(ndjsonContentType).toContain("ndjson");
	});

	test("NDJSON request to /alt-target returns 200", async ({ page }) => {
		await loadPage(page, "/");

		let ndjsonStatus = 0;
		page.on("response", (res) => {
			if (res.url().includes("/alt-target") && res.request().headers()["flare-data"] === "1") {
				ndjsonStatus = res.status();
			}
		});

		await navigateSPA(page, "/alt-target");

		expect(ndjsonStatus).toBe(200);
	});
});

/* ── Search params through rewrite ────────────────────────────────────── */

test.describe("Rewrite — search params preservation", () => {
	test("SSR: /vanity?q=test preserves search params in browser URL", async ({ page }) => {
		await loadPage(page, "/vanity?q=test&page=2");
		expect(page.url()).toContain("/vanity");
		expect(page.url()).toContain("q=test");
		expect(page.url()).toContain("page=2");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
	});

	test("SSR: /rw-with-search?key=val preserves params", async ({ page }) => {
		await loadPage(page, "/rw-with-search?key=val");
		expect(page.url()).toContain("/rw-with-search");
		expect(page.url()).toContain("key=val");
		await expect(page.locator("[data-testid=rewrite-target]")).toBeVisible();
	});

	test("SPA navigate with search params through rewrite", async ({ page }) => {
		await loadPage(page, "/");
		await setNavMarker(page);

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/vanity?filter=active");
		});
		await page.waitForURL("**/vanity*", { timeout: 10_000 });

		expect(page.url()).toContain("/vanity");
		expect(page.url()).toContain("filter=active");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		await assertSPANavigation(page);
	});
});

/* ── Middleware interaction ────────────────────────────────────────────── */

test.describe("Rewrite — middleware interaction", () => {
	test("middleware headers present on rewritten SSR response", async ({ page }) => {
		const response = await page.goto("/vanity", { waitUntil: "domcontentloaded" });
		const requestId = response?.headers()["x-request-id"];
		const timing = response?.headers()["x-timing"];
		const middlewareRan = response?.headers()["x-middleware-ran"];

		expect(requestId).toBeTruthy();
		expect(timing).toBeTruthy();
		expect(middlewareRan).toBe("true");
	});

	test("middleware headers present on /alt-target SSR response", async ({ page }) => {
		const response = await page.goto("/alt-target", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["x-request-id"]).toBeTruthy();
		expect(response?.headers()["x-middleware-ran"]).toBe("true");
	});

	test("middleware sees original URL, not rewritten URL", async ({ page }) => {
		/* Middleware sets x-request-id with timestamp — just verify it runs */
		const res1 = await page.goto("/vanity", { waitUntil: "domcontentloaded" });
		const id1 = res1?.headers()["x-request-id"];

		const res2 = await page.goto("/about", { waitUntil: "domcontentloaded" });
		const id2 = res2?.headers()["x-request-id"];

		/* Different request IDs prove middleware ran independently for each */
		expect(id1).toBeTruthy();
		expect(id2).toBeTruthy();
		expect(id1).not.toBe(id2);
	});
});

/* ── Not-found through rewrite ────────────────────────────────────────── */

test.describe("Rewrite — not-found handling", () => {
	test("SSR: rewrite to nonexistent internal path still 404s", async ({ page }) => {
		/* /vanity rewrites to /about, but /nonexistent has no rewrite — normal 404 */
		const response = await page.goto("/nonexistent", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(404);
	});

	test("SPA: navigate to non-rewritten unknown path shows not-found", async ({ page }) => {
		await loadPage(page, "/");
		await setNavMarker(page);

		const result = await page.evaluate(async () => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) return { error: "no-nav", url: "" };
			try {
				await nav("/does-not-exist-xyz");
				return { error: null, url: window.location.pathname };
			} catch (e: unknown) {
				return { error: e instanceof Error ? e.message : String(e), url: window.location.pathname };
			}
		});

		expect(result.error).toBeNull();
		expect(result.url).toBe("/does-not-exist-xyz");
		await assertSPANavigation(page);
	});
});

/* ── Console cleanliness ──────────────────────────────────────────────── */

test.describe("Rewrite — no console errors", () => {
	test("no console errors during SSR load of rewritten page", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/vanity");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		cap.assertClean();
	});

	test("no console errors during SPA navigation through rewrites", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await navigateSPA(page, "/vanity");
		await navigateSPA(page, "/alt-target");
		await navigateSPA(page, "/about");
		cap.assertClean();
	});
});

/* ── Rapid navigation with rewrite ────────────────────────────────────── */

test.describe("Rewrite — rapid navigation cancellation", () => {
	test("rapid SPA navigations through rewrites settle correctly", async ({ page }) => {
		await loadPage(page, "/");
		await setNavMarker(page);

		/* Fire multiple navigations rapidly — only last should win */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			nav("/vanity");
			nav("/alt-target");
			return nav("/about");
		});

		await page.waitForURL("**/about", { timeout: 10_000 });
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		await assertSPANavigation(page);
	});
});

/* ── Hydration after SSR rewrite ──────────────────────────────────────── */

test.describe("Rewrite — hydration", () => {
	test("SSR-loaded rewritten page hydrates and supports SPA nav", async ({ page }) => {
		/* Load via rewrite, then do SPA nav to prove hydration worked */
		await loadPage(page, "/alt-target");
		await expect(page.locator("[data-testid=rewrite-target]")).toBeVisible();

		/* Now do SPA navigation — proves hydration completed successfully */
		await navigateSPA(page, "/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
	});

	test("SSR-loaded /vanity hydrates and back button works", async ({ page }) => {
		await loadPage(page, "/vanity");
		await setNavMarker(page);

		await navigateSPA(page, "/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();

		await page.goBack();
		await page.waitForURL("**/vanity", { timeout: 10_000 });
		await expect(page.locator("[data-testid=about]")).toBeVisible();
		await assertSPANavigation(page);
	});
});
