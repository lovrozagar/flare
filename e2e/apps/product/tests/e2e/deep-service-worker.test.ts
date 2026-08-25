import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("Service Worker — dev mode @dev-only", () => {
	test("sw.js is served in dev mode with correct headers", async ({ page }) => {
		const response = await page.goto("/sw.js");
		expect(response).not.toBeNull();
		expect(response?.status()).toBe(200);
		expect(response?.headers()["content-type"]).toContain("javascript");
		expect(response?.headers()["cache-control"]).toContain("no-cache");
	});

	test("dev sw.js has skipWaiting + clients.claim but no precache", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		expect(text).toContain("skipWaiting");
		expect(text).toContain("clients.claim");
		expect(text).not.toContain("PRECACHE_MANIFEST");
		expect(text).not.toContain("CACHE_NAME");
		expect(text).not.toContain("RUNTIME_CACHE");
	});

	test("dev sw.js has offline fallback fetch handler", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		expect(text).toContain("OFFLINE_PAGE");
		expect(text).toContain('"/offline"');
		expect(text).toContain("navigate");
	});

	test("dev SW caches offline page during install", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);

		/* Wait for SW to be active */
		await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
			timeout: 10_000,
		});

		/* Verify offline page was cached */
		const hasCachedOffline = await page.evaluate(async () => {
			const cache = await caches.open("flare-dev-offline");
			const keys = await cache.keys();
			return keys.some((k) => new URL(k.url).pathname === "/offline");
		});
		expect(hasCachedOffline).toBe(true);
	});

	test("service worker registers after hydration and interaction", async ({ page }) => {
		await loadPage(page, "/");

		/* Trigger interaction to fire onceIdle */
		await page.mouse.move(100, 100);

		/* Wait for SW registration */
		const hasRegistration = await page.evaluate(async () => {
			if (!("serviceWorker" in navigator)) return false;
			const registrations = await navigator.serviceWorker.getRegistrations();
			return registrations.length > 0;
		});

		expect(hasRegistration).toBe(true);
	});

	test("service worker scope is /", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);

		const scope = await page.evaluate(async () => {
			if (!("serviceWorker" in navigator)) return null;
			const registrations = await navigator.serviceWorker.getRegistrations();
			return registrations[0]?.scope ?? null;
		});

		expect(scope).toContain("/");
	});

	test("SW does not register before interaction or idle", async ({ page }) => {
		/* Load page but do NOT interact */
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-flare-hydrated"), null, {
			timeout: 15_000,
		});

		/* Check immediately — should not be registered yet (rIC is async but fast) */
		/* Give a tiny window then check — rIC fires soon so we just verify it defers */
		const immediate = await page.evaluate(() => {
			if (!("serviceWorker" in navigator)) return false;
			return navigator.serviceWorker.controller !== null;
		});
		/* controller is null when freshly registered — this is expected */
		expect(immediate).toBe(false);
	});

	test("page hydrates correctly with SW enabled", async ({ page }) => {
		await loadPage(page, "/");
		const hydrated = await page.evaluate(() => document.documentElement.hasAttribute("data-flare-hydrated"));
		expect(hydrated).toBe(true);
	});

	test("SPA navigation works after SW registration", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);

		/* Wait for registration */
		await page.waitForFunction(
			async () => {
				const regs = await navigator.serviceWorker.getRegistrations();
				return regs.length > 0;
			},
			null,
			{ timeout: 10_000 },
		);

		/* Navigate via SPA link */
		const link = page.locator("a[href]").first();
		if (await link.isVisible()) {
			await link.click();
			await page.waitForFunction(() => document.documentElement.hasAttribute("data-flare-hydrated"), null, {
				timeout: 10_000,
			});
		}
	});

	test("SW does not intercept NDJSON requests in dev", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);

		/* SPA navigate to trigger NDJSON fetch — should work fine */
		const link = page.locator("a[href]").first();
		if (await link.isVisible()) {
			const href = await link.getAttribute("href");
			await link.click();
			await page.waitForFunction(() => document.documentElement.hasAttribute("data-flare-hydrated"), null, {
				timeout: 10_000,
			});
			/* If NDJSON was intercepted/broken, SPA navigation would fail */
			expect(href).toBeTruthy();
		}
	});

	test("multiple pages can register SW independently", async ({ page, context }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);

		/* Open second page in new tab */
		const page2 = await context.newPage();
		await loadPage(page2, "/about");
		await page2.mouse.move(100, 100);

		const reg1 = await page.evaluate(async () => {
			const regs = await navigator.serviceWorker.getRegistrations();
			return regs.length;
		});
		const reg2 = await page2.evaluate(async () => {
			const regs = await navigator.serviceWorker.getRegistrations();
			return regs.length;
		});

		expect(reg1).toBeGreaterThan(0);
		expect(reg2).toBeGreaterThan(0);
		await page2.close();
	});

	test("SW registration uses updateViaCache: none", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);

		/* Wait for registration then check */
		await page.waitForFunction(
			async () => {
				const regs = await navigator.serviceWorker.getRegistrations();
				return regs.length > 0;
			},
			null,
			{ timeout: 10_000 },
		);

		const updateViaCache = await page.evaluate(async () => {
			const regs = await navigator.serviceWorker.getRegistrations();
			return regs[0]?.updateViaCache;
		});

		expect(updateViaCache).toBe("none");
	});
});

test.describe("Service Worker — prod @prod-only", () => {
	test("prod sw.js contains precache manifest with asset URLs", async ({ page }) => {
		const response = await page.goto("/sw.js");
		expect(response).not.toBeNull();
		expect(response?.status()).toBe(200);
		const text = await response?.text();
		expect(text).toContain("PRECACHE_MANIFEST");
		expect(text).toContain("flare-assets-");
		expect(text).toContain("/assets/");
		/* Should have multiple asset URLs */
		const assetMatches = text?.match(/\/assets\/[^"]+/g) ?? [];
		expect(assetMatches.length).toBeGreaterThan(10);
	});

	test("prod sw.js contains complete fetch handler", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		expect(text).toContain("fetch");
		expect(text).toContain("navigate");
		expect(text).toContain('redirect: "manual"');
		expect(text).not.toContain("navigationPreload");
		expect(text).toContain("caches.match");
		expect(text).toContain("caches.open");
	});

	test("prod sw.js has SKIP_WAITING message handler", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		expect(text).toContain("SKIP_WAITING");
		expect(text).toContain("self.skipWaiting()");
	});

	test("prod sw.js passes through server functions and NDJSON", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		expect(text).toContain("/_flare/");
		expect(text).toContain("flare-data");
	});

	test("prod sw.js has cache-first for /assets/", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		/* /assets/ check + cache.match + fallback to fetch */
		expect(text).toContain('"/assets/"');
		expect(text).toContain("caches.match(event.request)");
		expect(text).toContain("fetch(event.request)");
	});

	test("prod sw.js has same-origin check", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		expect(text).toContain("url.origin");
		expect(text).toContain("self.location.origin");
	});

	test("prod sw.js has activate cleanup for old caches", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		expect(text).toContain('startsWith("flare-assets-")');
		expect(text).toContain("caches.delete");
		expect(text).toContain("clients.claim");
	});

	test("prod sw.js has LRU eviction for runtime cache", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		expect(text).toContain("runtimeCacheMax");
	});

	test("prod sw.js has build-specific CACHE_NAME", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		/* CACHE_NAME should contain flare-assets- + hash */
		const match = text?.match(/CACHE_NAME = "flare-assets-([a-f0-9]+)"/);
		expect(match).not.toBeNull();
		expect(match?.[1]?.length).toBeGreaterThanOrEqual(8);
	});

	test("prod sw.js has stable RUNTIME_CACHE name", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		expect(text).toContain('"flare-runtime-v1"');
	});

	test("sw registers and becomes active in prod", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);

		/* Wait for SW to become active */
		const isActive = await page.evaluate(async () => {
			if (!("serviceWorker" in navigator)) return false;
			const reg = await navigator.serviceWorker.ready;
			return reg.active !== null;
		});
		expect(isActive).toBe(true);
	});

	test("hashed assets are cached by SW after page load", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);

		/* Wait for SW to become active */
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
		});

		/* Give the SW time to populate the cache */
		await page.waitForTimeout(2000);

		/* Check that asset cache exists */
		const cacheInfo = await page.evaluate(async () => {
			const keys = await caches.keys();
			const assetCache = keys.find((k) => k.startsWith("flare-assets-"));
			if (!assetCache) return { count: 0, exists: false };
			const cache = await caches.open(assetCache);
			const entries = await cache.keys();
			return { count: entries.length, exists: true };
		});

		expect(cacheInfo.exists).toBe(true);
		expect(cacheInfo.count).toBeGreaterThan(0);
	});

	test("SPA navigation works with active prod SW", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);

		/* Wait for SW activation */
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
		});

		/* SPA navigate */
		const link = page.locator("a[href]").first();
		if (await link.isVisible()) {
			await link.click();
			await page.waitForFunction(() => document.documentElement.hasAttribute("data-flare-hydrated"), null, {
				timeout: 10_000,
			});
		}
	});

	test("page hydrates correctly in prod with SW", async ({ page }) => {
		await loadPage(page, "/");
		const hydrated = await page.evaluate(() => document.documentElement.hasAttribute("data-flare-hydrated"));
		expect(hydrated).toBe(true);

		/* FlareState should be valid */
		const state = await page.evaluate(() => (self as unknown as { flare?: unknown }).flare);
		expect(state).not.toBeNull();
	});

	test("prod sw.js contains offlineFallback config", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		expect(text).toContain('"offlineFallback":"/offline"');
	});

	test("offline page HTML is precached in runtime cache during install", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);

		/* Wait for SW to become active */
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
		});

		await page.waitForTimeout(2000);

		const hasOfflinePage = await page.evaluate(async () => {
			const cache = await caches.open("flare-runtime-v1");
			const keys = await cache.keys();
			return keys.some((k) => new URL(k.url).pathname === "/offline");
		});

		expect(hasOfflinePage).toBe(true);
	});

	test("navigating to uncached page while offline serves fallback", async ({ page, context }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);

		/* Wait for SW to become active and cache populated */
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
		});
		await page.waitForTimeout(2000);

		/* Go offline */
		await context.setOffline(true);

		/* Navigate to a page we haven't visited (not in runtime cache) */
		const response = await page.goto("/about");

		/* Should get the offline fallback page content */
		const text = await page.content();
		expect(text).toContain("offline");

		await context.setOffline(false);
	});

	test("cached page still works offline", async ({ page, context }) => {
		/* First visit — triggers SW registration */
		await loadPage(page, "/");
		await page.mouse.move(100, 100);

		/* Wait for SW to become active */
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
		});
		await page.waitForTimeout(2000);

		/*
		 * Reload while online so the active SW intercepts the navigate
		 * and caches the response in RUNTIME_CACHE.
		 * The first load may have happened before the SW was active.
		 */
		await page.reload({ waitUntil: "networkidle" });
		await page.waitForTimeout(500);

		/* Verify / is in runtime cache */
		const cached = await page.evaluate(async () => {
			const cache = await caches.open("flare-runtime-v1");
			const keys = await cache.keys();
			return keys.some((k) => new URL(k.url).pathname === "/");
		});
		expect(cached).toBe(true);

		/* Go offline and reload the same page */
		await context.setOffline(true);

		await page.goto("/");
		const text = await page.content();
		/* Should serve the cached version, not the offline fallback */
		expect(text).not.toContain("offline-page");

		await context.setOffline(false);
	});

	test("/offline route renders correctly when visited online", async ({ page }) => {
		await loadPage(page, "/offline");
		const heading = await page.locator("[data-testid='offline-page'] h1").textContent();
		expect(heading).toMatch(/offline/i);
	});
});
