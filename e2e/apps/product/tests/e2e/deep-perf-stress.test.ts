import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

/**
 * Performance stress tests.
 *
 * Tests framework behavior under high load scenarios:
 * - 1000 row table rendering and hydration
 * - Large payload serialization
 * - Rapid sequential navigations
 * - Memory stability under stress
 * - NDJSON efficiency with large datasets
 * - Deferred data under concurrent load
 * - Back/forward navigation with heavy state
 */

test.describe("Perf Stress — 1000 row rendering", () => {
	test("1000 row page loads and hydrates", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/perf-stress");

		const count = await page.locator("[data-testid=stress-count]").textContent();
		expect(count).toBe("1000");

		cap.assertClean();
	});

	test("1000 row SSR contains all rows", async ({ request }) => {
		const res = await request.get("/perf-stress");
		const html = await res.text();

		/* spot-check rows at various positions */
		expect(html).toContain("stress-row-0");
		expect(html).toContain("stress-row-99");
		expect(html).toContain("stress-row-500");
		expect(html).toContain("stress-row-999");
	});

	test("1000 row page has zero CLS", async ({ page }) => {
		await page.goto("/perf-stress", { waitUntil: "networkidle" });

		const cls = await page.evaluate(() => {
			return new Promise<number>((resolve) => {
				let clsValue = 0;
				const observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						clsValue += (entry as PerformanceEntry & { value: number }).value;
					}
				});
				observer.observe({ buffered: true, type: "layout-shift" });
				setTimeout(() => {
					observer.disconnect();
					resolve(clsValue);
				}, 1000);
			});
		});

		expect(cls).toBe(0);
	});

	test("1000 row SSR response time under 2s", async ({ request }) => {
		const start = Date.now();
		const res = await request.get("/perf-stress");
		const elapsed = Date.now() - start;

		expect(res.status()).toBe(200);
		expect(elapsed).toBeLessThan(2000);
	});
});

test.describe("Perf Stress — large payload", () => {
	test("10KB static payload serialized correctly", async ({ page }) => {
		await loadPage(page, "/perf-stress");

		const len = await page.locator("[data-testid=stress-payload-len]").textContent();
		expect(len).toBe("10000");
	});

	test("large NDJSON response size is reasonable", async ({ request }) => {
		const res = await request.get("/perf-stress", { headers: { "x-d": "1" } });
		const ndjson = await res.text();

		/* 1000 rows + 10KB payload — NDJSON should be under 200KB */
		expect(ndjson.length).toBeLessThan(200_000);
		expect(ndjson.length).toBeGreaterThan(0);
	});

	test("NDJSON for stress page is not larger than HTML", async ({ request }) => {
		const htmlRes = await request.get("/perf-stress");
		const ndjsonRes = await request.get("/perf-stress", { headers: { "x-d": "1" } });

		const htmlSize = (await htmlRes.text()).length;
		const ndjsonSize = (await ndjsonRes.text()).length;

		/* NDJSON skips the HTML shell but data payload dominates at this size */
		expect(ndjsonSize).toBeLessThanOrEqual(htmlSize);
	});
});

test.describe("Perf Stress — rapid navigation", () => {
	test("10 rapid SPA navigations complete without error", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		const routes = [
			"/about",
			"/perf-bench",
			"/perf-stress",
			"/a11y-test",
			"/",
			"/about",
			"/perf-bench",
			"/a11y-nav-test",
			"/perf-stress",
			"/",
		];

		for (const route of routes) {
			await navigateSPA(page, route);
		}

		/* final page should render correctly */
		await expect(page.locator("[data-testid=home]")).toBeVisible();
		cap.assertClean();
	});

	test("rapid nav timing doesn't degrade", async ({ page }) => {
		await loadPage(page, "/");

		const timings: number[] = [];
		const routes = ["/about", "/perf-bench", "/", "/about", "/perf-bench", "/"];

		for (const route of routes) {
			const start = Date.now();
			await navigateSPA(page, route);
			timings.push(Date.now() - start);
		}

		/* average should be under 500ms */
		const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
		expect(avg).toBeLessThan(500);

		/* last nav shouldn't be 3x slower than first */
		const first = timings[0];
		const last = timings[timings.length - 1];
		if (first && last) {
			expect(last).toBeLessThan(first * 3);
		}
	});

	test("rapid nav to heavy page then back stays fast", async ({ page }) => {
		await loadPage(page, "/");

		const start = Date.now();
		await navigateSPA(page, "/perf-stress");
		await navigateSPA(page, "/");
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(2000);
		await expect(page.locator("[data-testid=home]")).toBeVisible();
	});
});

test.describe("Perf Stress — memory under load", () => {
	test("heap stays stable after navigating to heavy pages", async ({ page }) => {
		await loadPage(page, "/");

		const getHeap = () =>
			page.evaluate(() => {
				const perf = performance as Performance & {
					memory?: { usedJSHeapSize: number };
				};
				if (!perf.memory) return -1;
				return perf.memory.usedJSHeapSize / 1024 / 1024;
			});

		const baseline = await getHeap();
		if (baseline < 0) return;

		/* navigate to heavy pages and back */
		await navigateSPA(page, "/perf-stress");
		await navigateSPA(page, "/");
		await navigateSPA(page, "/perf-stress");
		await navigateSPA(page, "/");

		/* attempt GC */
		await page.evaluate(() => {
			const w = window as Window & { gc?: () => void };
			if (w.gc) w.gc();
		});
		await page.waitForTimeout(500);

		const after = await getHeap();

		/* should not grow more than 30MB after visiting 1000-row page twice */
		expect(after - baseline).toBeLessThan(30);
	});

	test("heap stays stable after visiting many pages", async ({ page }) => {
		await loadPage(page, "/");

		const getHeap = () =>
			page.evaluate(() => {
				const perf = performance as Performance & {
					memory?: { usedJSHeapSize: number };
				};
				if (!perf.memory) return -1;
				return perf.memory.usedJSHeapSize / 1024 / 1024;
			});

		const baseline = await getHeap();
		if (baseline < 0) return;

		/* visit 8 different pages */
		const routes = [
			"/about",
			"/perf-bench",
			"/a11y-test",
			"/a11y-nav-test",
			"/perf-stress",
			"/perf-bench",
			"/about",
			"/",
		];

		for (const route of routes) {
			await navigateSPA(page, route);
		}

		await page.evaluate(() => {
			const w = window as Window & { gc?: () => void };
			if (w.gc) w.gc();
		});
		await page.waitForTimeout(500);

		const after = await getHeap();

		/* no more than 40MB growth after 8 navigations */
		expect(after - baseline).toBeLessThan(40);
	});
});

test.describe("Perf Stress — deferred under load", () => {
	test("deferred resolves on heavy page", async ({ page }) => {
		await loadPage(page, "/perf-stress");

		await expect(page.locator("[data-testid=stress-deferred-resolved]")).toBeVisible({
			timeout: 5000,
		});
		expect(await page.locator("[data-testid=stress-deferred-resolved]").textContent()).toBe("stress-deferred-resolved");
	});

	test("navigate away during deferred on heavy page — no crash", async ({ page }) => {
		await page.goto("/perf-stress", { waitUntil: "domcontentloaded" });

		/* immediately navigate away before deferred resolves */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (nav) return nav("/");
		});

		await page.waitForTimeout(1000);

		/* page should still work */
		const hydrated = await page.evaluate(() => document.documentElement.hasAttribute("data-hydrated"));
		expect(hydrated).toBe(true);
	});
});

test.describe("Perf Stress — back/forward with heavy state", () => {
	test("back button from heavy page works", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/perf-stress");

		/* verify heavy page loaded */
		await expect(page.locator("[data-testid=stress-count]")).toHaveText("1000");

		/* go back */
		await page.goBack();
		await page.waitForURL("**/");

		await expect(page.locator("[data-testid=home]")).toBeVisible();
	});

	test("forward button to heavy page works", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/perf-stress");
		await page.goBack();
		await page.waitForURL("**/");

		/* forward */
		await page.goForward();
		await page.waitForURL("**/perf-stress");

		await expect(page.locator("[data-testid=stress-count]")).toHaveText("1000");
	});
});
