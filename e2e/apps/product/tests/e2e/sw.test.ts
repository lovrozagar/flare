import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("Service Worker — dev @dev-only", () => {
	test("sw.js is served with javascript and no-cache", async ({ page }) => {
		const response = await page.goto("/sw.js");
		expect(response?.status()).toBe(200);
		expect(response?.headers()["content-type"]).toContain("javascript");
		expect(response?.headers()["cache-control"]).toContain("no-cache");
	});

	test("dev sw.js has skipWaiting, claim, and offline fallback", async ({ page }) => {
		const response = await page.goto("/sw.js");
		const text = await response?.text();
		expect(text).toContain("skipWaiting");
		expect(text).toContain("clients.claim");
		expect(text).toContain("OFFLINE_PAGE");
		expect(text).toContain('"/offline"');
		expect(text).not.toContain("PRECACHE_MANIFEST");
	});

	test("SW registers after hydration and interaction", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);
		const hasRegistration = await page.evaluate(async () => {
			if (!("serviceWorker" in navigator)) return false;
			const registrations = await navigator.serviceWorker.getRegistrations();
			return registrations.length > 0;
		});
		expect(hasRegistration).toBe(true);
	});

	test("dev SW caches offline page during install", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);
		await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
			timeout: 10_000,
		});
		const hasCachedOffline = await page.evaluate(async () => {
			const cache = await caches.open("flare-dev-offline");
			const keys = await cache.keys();
			return keys.some((k) => new URL(k.url).pathname === "/offline");
		});
		expect(hasCachedOffline).toBe(true);
	});

	test("updateViaCache is none", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);
		await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length > 0, null, {
			timeout: 10_000,
		});
		const updateViaCache = await page.evaluate(async () => {
			const regs = await navigator.serviceWorker.getRegistrations();
			return regs[0]?.updateViaCache;
		});
		expect(updateViaCache).toBe("none");
	});
});

test.describe("Service Worker — prod @prod-only", () => {
	test("prod sw.js contains precache and asset URLs", async ({ page }) => {
		const response = await page.goto("/sw.js");
		expect(response?.status()).toBe(200);
		const text = await response?.text();
		expect(text).toContain("PRECACHE_MANIFEST");
		expect(text).toContain("flare-assets-");
		expect(text).toContain("/assets/");
	});

	test("prod sw.js passes through server functions and NDJSON", async ({ page }) => {
		const text = await (await page.goto("/sw.js"))?.text();
		expect(text).toContain("/_fn/");
		expect(text).toContain("x-d");
	});

	test("sw registers and becomes active in prod", async ({ page }) => {
		await loadPage(page, "/");
		await page.mouse.move(100, 100);
		const isActive = await page.evaluate(async () => {
			if (!("serviceWorker" in navigator)) return false;
			const reg = await navigator.serviceWorker.ready;
			return reg.active !== null;
		});
		expect(isActive).toBe(true);
	});
});
