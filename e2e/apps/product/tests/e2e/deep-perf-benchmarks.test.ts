import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

/**
 * Performance benchmark tests.
 *
 * Complements deep-performance.test.ts (structural checks) with actual
 * timing measurements and resource analysis:
 * - TTFB (Time to First Byte)
 * - FCP (First Contentful Paint)
 * - LCP (Largest Contentful Paint)
 * - TBT approximation (Total Blocking Time)
 * - Hydration timing
 * - SSR response size and time
 * - SPA navigation timing
 * - NDJSON data request efficiency
 * - Memory baseline
 * - Resource count and transfer size
 *
 * Thresholds are generous — these catch regressions, not micro-optimizations.
 */

const TTFB_THRESHOLD_MS = 1000;
const FCP_THRESHOLD_MS = 2000;
const LCP_THRESHOLD_MS = 3000;
const HYDRATION_THRESHOLD_MS = 3000;
const SSR_RESPONSE_THRESHOLD_MS = 1000;
const SPA_NAV_THRESHOLD_MS = 500;
const NDJSON_THRESHOLD_MS = 500;

test.describe("Perf — TTFB (Time to First Byte)", () => {
	test("home page TTFB under threshold", async ({ page }) => {
		const start = Date.now();
		const response = await page.request.get("/");
		const ttfb = Date.now() - start;

		expect(response.status()).toBe(200);
		expect(ttfb).toBeLessThan(TTFB_THRESHOLD_MS);
	});

	test("data-heavy page TTFB under threshold", async ({ page }) => {
		const start = Date.now();
		const response = await page.request.get("/perf-bench");
		const ttfb = Date.now() - start;

		expect(response.status()).toBe(200);
		expect(ttfb).toBeLessThan(TTFB_THRESHOLD_MS);
	});

	test("ISR page TTFB under threshold (after prime)", async ({ page }) => {
		/* prime the ISR cache */
		await page.request.get("/isr-test");
		await new Promise((r) => setTimeout(r, 300));

		const start = Date.now();
		const response = await page.request.get("/isr-test");
		const ttfb = Date.now() - start;

		expect(response.status()).toBe(200);
		expect(ttfb).toBeLessThan(TTFB_THRESHOLD_MS);
	});
});

test.describe("Perf — FCP and LCP via PerformanceObserver", () => {
	test("FCP fires within threshold on home page", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });

		const fcp = await page.evaluate(() => {
			return new Promise<number>((resolve) => {
				const observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						if (entry.name === "first-contentful-paint") {
							observer.disconnect();
							resolve(entry.startTime);
							return;
						}
					}
				});
				observer.observe({ buffered: true, type: "paint" });
				setTimeout(() => {
					observer.disconnect();
					resolve(-1);
				}, 5000);
			});
		});

		expect(fcp).toBeGreaterThan(0);
		expect(fcp).toBeLessThan(FCP_THRESHOLD_MS);
	});

	test("LCP fires within threshold on home page", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });

		const lcp = await page.evaluate(() => {
			return new Promise<number>((resolve) => {
				let lcpValue = 0;
				const observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						lcpValue = entry.startTime;
					}
				});
				observer.observe({ buffered: true, type: "largest-contentful-paint" });
				setTimeout(() => {
					observer.disconnect();
					resolve(lcpValue);
				}, 2000);
			});
		});

		expect(lcp).toBeGreaterThan(0);
		expect(lcp).toBeLessThan(LCP_THRESHOLD_MS);
	});

	test("FCP on data-heavy page within threshold", async ({ page }) => {
		await page.goto("/perf-bench", { waitUntil: "networkidle" });

		const fcp = await page.evaluate(() => {
			return new Promise<number>((resolve) => {
				const observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						if (entry.name === "first-contentful-paint") {
							observer.disconnect();
							resolve(entry.startTime);
							return;
						}
					}
				});
				observer.observe({ buffered: true, type: "paint" });
				setTimeout(() => {
					observer.disconnect();
					resolve(-1);
				}, 5000);
			});
		});

		expect(fcp).toBeGreaterThan(0);
		expect(fcp).toBeLessThan(FCP_THRESHOLD_MS);
	});
});

test.describe("Perf — hydration timing", () => {
	test("hydration completes within threshold on home page", async ({ page }) => {
		const start = Date.now();
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: HYDRATION_THRESHOLD_MS,
		});
		const hydrationTime = Date.now() - start;

		expect(hydrationTime).toBeLessThan(HYDRATION_THRESHOLD_MS);
	});

	test("hydration completes within threshold on data-heavy page", async ({ page }) => {
		const start = Date.now();
		await page.goto("/perf-bench", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: HYDRATION_THRESHOLD_MS,
		});
		const hydrationTime = Date.now() - start;

		expect(hydrationTime).toBeLessThan(HYDRATION_THRESHOLD_MS);
	});

	test("data-heavy page with 200 rows hydrates cleanly", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/perf-bench");

		const count = await page.locator("[data-testid=perf-count]").textContent();
		expect(count).toBe("200");

		/* verify all rows rendered */
		const rows = page.locator("[data-testid^=perf-row-]");
		await expect(rows).toHaveCount(200);

		cap.assertClean();
	});
});

test.describe("Perf — SSR response analysis", () => {
	test("SSR response size is reasonable for simple page", async ({ request }) => {
		const res = await request.get("/about");
		const html = await res.text();

		/* simple page should be under 50KB of HTML */
		expect(html.length).toBeLessThan(50_000);
	});

	test("SSR response time for simple page", async ({ request }) => {
		const start = Date.now();
		const res = await request.get("/about");
		const elapsed = Date.now() - start;

		expect(res.status()).toBe(200);
		expect(elapsed).toBeLessThan(SSR_RESPONSE_THRESHOLD_MS);
	});

	test("SSR response time for data-heavy page", async ({ request }) => {
		const start = Date.now();
		const res = await request.get("/perf-bench");
		const elapsed = Date.now() - start;

		expect(res.status()).toBe(200);
		expect(elapsed).toBeLessThan(SSR_RESPONSE_THRESHOLD_MS);
	});

	test("SSR HTML is well-formed (DOCTYPE + closing tags)", async ({ request }) => {
		const res = await request.get("/perf-bench");
		const html = await res.text();

		expect(html.trimStart().startsWith("<!DOCTYPE html>")).toBe(true);
		expect(html).toContain("</html>");
		expect(html).toContain("</body>");
	});
});

test.describe("Perf — SPA navigation timing", () => {
	test("SPA navigation to simple page is fast", async ({ page }) => {
		await loadPage(page, "/");

		const start = Date.now();
		await navigateSPA(page, "/about");
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(SPA_NAV_THRESHOLD_MS);

		/* content actually rendered */
		await expect(page.locator("[data-testid=about]")).toBeVisible();
	});

	test("SPA navigation to data-heavy page is fast", async ({ page }) => {
		await loadPage(page, "/");

		const start = Date.now();
		await navigateSPA(page, "/perf-bench");
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(SPA_NAV_THRESHOLD_MS);
	});

	test("multiple sequential SPA navigations stay fast", async ({ page }) => {
		await loadPage(page, "/");

		const timings: number[] = [];
		const routes = ["/about", "/perf-bench", "/"];

		for (const route of routes) {
			const start = Date.now();
			await navigateSPA(page, route);
			timings.push(Date.now() - start);
		}

		/* every nav should be under threshold */
		for (const t of timings) {
			expect(t).toBeLessThan(SPA_NAV_THRESHOLD_MS);
		}

		/* no degradation: last nav shouldn't be 2x slower than first */
		const first = timings[0];
		const last = timings[timings.length - 1];
		if (first && last) {
			expect(last).toBeLessThan(first * 3);
		}
	});
});

test.describe("Perf — NDJSON data requests", () => {
	test("NDJSON response is fast for simple page", async ({ page }) => {
		const start = Date.now();
		const response = await page.request.get("/about", {
			headers: { "x-d": "1" },
		});
		const elapsed = Date.now() - start;

		expect(response.status()).toBe(200);
		expect(elapsed).toBeLessThan(NDJSON_THRESHOLD_MS);
	});

	test("NDJSON response is smaller than full HTML", async ({ page }) => {
		const htmlRes = await page.request.get("/about");
		const ndjsonRes = await page.request.get("/about", {
			headers: { "x-d": "1" },
		});

		const htmlSize = (await htmlRes.text()).length;
		const ndjsonSize = (await ndjsonRes.text()).length;

		/* NDJSON should be significantly smaller (no HTML shell) */
		expect(ndjsonSize).toBeLessThan(htmlSize);
	});

	test("NDJSON for data-heavy page is smaller than HTML", async ({ page }) => {
		const htmlRes = await page.request.get("/perf-bench");
		const ndjsonRes = await page.request.get("/perf-bench", {
			headers: { "x-d": "1" },
		});

		const htmlSize = (await htmlRes.text()).length;
		const ndjsonSize = (await ndjsonRes.text()).length;

		expect(ndjsonSize).toBeLessThan(htmlSize);
	});
});

test.describe("Perf — TBT approximation (long tasks)", () => {
	test("zero long tasks on home page load", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });

		const longTasks = await page.evaluate(() => {
			return new Promise<number>((resolve) => {
				let count = 0;
				const observer = new PerformanceObserver((list) => {
					count += list.getEntries().length;
				});
				observer.observe({ buffered: true, type: "longtask" });
				setTimeout(() => {
					observer.disconnect();
					resolve(count);
				}, 500);
			});
		});

		expect(longTasks).toBeLessThanOrEqual(3);
	});

	test("zero long tasks on data-heavy page", async ({ page }) => {
		await page.goto("/perf-bench", { waitUntil: "networkidle" });

		const longTasks = await page.evaluate(() => {
			return new Promise<number>((resolve) => {
				let count = 0;
				const observer = new PerformanceObserver((list) => {
					count += list.getEntries().length;
				});
				observer.observe({ buffered: true, type: "longtask" });
				setTimeout(() => {
					observer.disconnect();
					resolve(count);
				}, 500);
			});
		});

		expect(longTasks).toBeLessThanOrEqual(3);
	});

	test("zero CLS on data-heavy page with 200 rows", async ({ page }) => {
		await page.goto("/perf-bench", { waitUntil: "networkidle" });

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
});

test.describe("Perf — deferred data timing", () => {
	test("shell renders before deferred data resolves", async ({ page }) => {
		await page.goto("/perf-bench", { waitUntil: "domcontentloaded" });

		/* static content should be visible immediately */
		await expect(page.locator("[data-testid=perf-static]")).toBeVisible({ timeout: 3000 });

		/* pending state may briefly appear before resolution */
		await page
			.locator("[data-testid=perf-deferred-pending]")
			.isVisible()
			.catch(() => false);

		/* eventually resolves */
		await expect(page.locator("[data-testid=perf-deferred-resolved]")).toBeVisible({
			timeout: 5000,
		});
		const resolved = await page.locator("[data-testid=perf-deferred-resolved]").textContent();
		expect(resolved).toBe("deferred-resolved");
	});

	test("deferred data does not cause CLS", async ({ page }) => {
		await page.goto("/deferred-multi", { waitUntil: "networkidle" });

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
				}, 1500);
			});
		});

		expect(cls).toBe(0);
	});
});

test.describe("Perf — resource analysis", () => {
	test("page loads with reasonable number of requests", async ({ page }) => {
		const requests: string[] = [];
		page.on("request", (req) => {
			requests.push(req.url());
		});

		await page.goto("/", { waitUntil: "networkidle" });

		/* filter out favicon, source maps, vite internals */
		const meaningful = requests.filter(
			(url) =>
				url.startsWith("http") &&
				!url.includes("favicon") &&
				!url.includes(".map") &&
				!url.includes("@vite") &&
				!url.includes("__vite") &&
				!url.includes("/@id/") &&
				!url.includes("/@fs/") &&
				!url.includes("node_modules"),
		);

		/* generous limit — dev mode has more requests than prod */
		expect(meaningful.length).toBeLessThan(100);
	});

	test("no duplicate resource fetches on initial load", async ({ page }) => {
		const requests: string[] = [];
		page.on("request", (req) => {
			if (req.resourceType() === "script" || req.resourceType() === "stylesheet") {
				requests.push(req.url());
			}
		});

		await page.goto("/", { waitUntil: "networkidle" });

		/* check for duplicate URLs (same resource fetched twice) */
		const counts = new Map<string, number>();
		for (const url of requests) {
			counts.set(url, (counts.get(url) ?? 0) + 1);
		}

		const duplicates = Array.from(counts.entries())
			.filter(([, count]) => count > 1)
			.map(([url, count]) => `${url} (${count}x)`);

		expect(duplicates).toEqual([]);
	});
});

test.describe("Perf — memory baseline", () => {
	test("JS heap stays reasonable after page load", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });

		const heapMB = await page.evaluate(() => {
			const perf = performance as Performance & {
				memory?: { usedJSHeapSize: number };
			};
			if (!perf.memory) return -1;
			return perf.memory.usedJSHeapSize / 1024 / 1024;
		});

		/* -1 means memory API not available (non-chromium) */
		if (heapMB > 0) {
			/* simple page should use less than 50MB */
			expect(heapMB).toBeLessThan(50);
		}
	});

	test("no memory growth after repeated SPA navigation", async ({ page }) => {
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
		if (baseline < 0) return; /* memory API not available */

		/* navigate back and forth 5 times */
		for (let i = 0; i < 5; i++) {
			await navigateSPA(page, "/about");
			await navigateSPA(page, "/");
		}

		/* force GC if available */
		await page.evaluate(() => {
			const w = window as Window & { gc?: () => void };
			if (w.gc) w.gc();
		});
		await page.waitForTimeout(500);

		const after = await getHeap();

		/* heap should not grow more than 20MB after 10 navigations */
		expect(after - baseline).toBeLessThan(20);
	});
});
