import { expect, type Page, test } from "@playwright/test";
import { loadPage } from "./helpers";

/**
 * @prod-only
 *
 * The app ships src/service-worker.ts; Flare bundles it to /service-worker.js with this build's
 * facts and registers it. Flare's old built-in worker at /sw.js is replaced by one that clears
 * its caches and unregisters.
 */

async function waitForControl(page: Page): Promise<void> {
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
		polling: 100,
		timeout: 15_000,
	});
}

test.describe("@prod-only app service worker", () => {
	test("is bundled to /service-worker.js with no unresolved imports", async ({ request }) => {
		const res = await request.get("/service-worker.js");
		const code = await res.text();

		expect(res.status()).toBe(200);
		expect(res.headers()["content-type"]).toContain("javascript");
		expect(code).not.toContain("@lovrozagar/flare/service-worker");
		expect(code).toMatch(/\/assets\/[^"]+\.js/);
	});

	test("registers after load with scope / and controls the page", async ({ page }) => {
		await loadPage(page, "/");
		await page.reload();
		await waitForControl(page);

		const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
		expect(new URL(scope).pathname).toBe("/");
		const url = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? "");
		expect(new URL(url).pathname).toBe("/service-worker.js");
	});

	test("precaches this build's files from the `build` list", async ({ page }) => {
		await loadPage(page, "/");
		await page.reload();
		await waitForControl(page);

		const cached = await page.evaluate(async () => {
			const names = await caches.keys();
			const cache = await caches.open(names.find((n) => n.startsWith("product-")) ?? "");
			return (await cache.keys()).map((r) => new URL(r.url).pathname);
		});
		expect(cached.some((p) => p.startsWith("/assets/") && p.endsWith(".js"))).toBe(true);
		expect(cached).toContain("/offline");
	});

	test("serves the offline page when a navigation fails", async ({ context, page }) => {
		await loadPage(page, "/");
		await page.reload();
		await waitForControl(page);

		await context.setOffline(true);
		try {
			await page.goto("/about", { waitUntil: "domcontentloaded" });
			await expect(page.getByTestId("offline-page")).toBeVisible();
		} finally {
			await context.setOffline(false);
		}
	});
});

test.describe("@prod-only old built-in worker cleanup", () => {
	test("a browser still running Flare's old /sw.js clears its caches and unregisters", async ({ page }) => {
		await loadPage(page, "/");
		const before = await page.evaluate(async () => {
			await caches.open("flare-assets-oldbuild");
			await caches.open("flare-runtime-v1");
			const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
			return Boolean(reg);
		});
		expect(before).toBe(true);

		await expect
			.poll(
				() =>
					page.evaluate(async () => {
						const regs = await navigator.serviceWorker.getRegistrations();
						const old = regs.some((r) => (r.active ?? r.installing ?? r.waiting)?.scriptURL.endsWith("/sw.js"));
						const names = await caches.keys();
						return { cachesLeft: names.filter((n) => n.startsWith("flare-")), old };
					}),
				{ timeout: 15_000 },
			)
			.toEqual({ cachesLeft: [], old: false });
	});
});
