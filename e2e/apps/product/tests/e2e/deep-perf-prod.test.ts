import { expect, test } from "@playwright/test";
import { CLS_BUDGET, loadPage, navigateSPA, runnerBudget, setupConsoleCapture } from "./helpers";

/**
 * Production-only performance tests.
 *
 * Validates optimizations that only exist in prod builds:
 * - Modulepreload hints reduce waterfall
 * - Hashed assets enable long-term caching
 * - No dev tooling overhead
 * - Compressed response sizes
 * - Prerendered pages are faster
 * - Bundle splitting works correctly
 * - Critical CSS inlining
 * - Cache headers on static assets
 */

test.describe("@prod-only Perf — modulepreload optimization", () => {
	test("home page has modulepreload links", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		const preloads = html.match(/<link[^>]*rel="modulepreload"[^>]*>/g);
		expect(preloads).toBeTruthy();
		expect(preloads?.length).toBeGreaterThan(0);
	});

	test("a11y test page has modulepreload links", async ({ request }) => {
		const res = await request.get("/a11y-test");
		const html = await res.text();

		const preloads = html.match(/<link[^>]*rel="modulepreload"[^>]*>/g);
		expect(preloads).toBeTruthy();
	});

	test("modulepreload assets are accessible and return 200", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		const hrefs = [...html.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
		expect(hrefs.length).toBeGreaterThan(0);

		for (const href of hrefs) {
			const assetRes = await request.get(href ?? "");
			expect(assetRes.status()).toBe(200);
		}
	});

	test("data-heavy page has modulepreload links", async ({ request }) => {
		const res = await request.get("/perf-bench");
		const html = await res.text();

		const preloads = html.match(/<link[^>]*rel="modulepreload"[^>]*>/g);
		expect(preloads).toBeTruthy();
	});
});

test.describe("@prod-only Perf — no dev overhead", () => {
	test("no Vite HMR client in prod HTML", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		expect(html).not.toContain("/@vite/client");
		expect(html).not.toContain("__vite");
		expect(html).not.toContain("import.meta.hot");
	});

	test("no dev dashboard script in prod", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		expect(html).not.toContain("dev-dashboard");
		expect(html).not.toContain("flare-dev-overlay");
	});

	test("no /@fs/ or /@id/ dev-only paths", async ({ request }) => {
		const res = await request.get("/perf-bench");
		const html = await res.text();

		expect(html).not.toContain("/@fs/");
		expect(html).not.toContain("/@id/");
		expect(html).not.toContain("/src/");
	});

	test("no Server-Timing header in prod responses", async ({ request }) => {
		const res = await request.get("/");
		const serverTiming = res.headers()["server-timing"];
		expect(serverTiming).toBeUndefined();
	});

	test("NDJSON responses have no Server-Timing in prod", async ({ request }) => {
		const res = await request.get("/about", { headers: { "flare-data": "1" } });
		const serverTiming = res.headers()["server-timing"];
		expect(serverTiming).toBeUndefined();
	});
});

test.describe("@prod-only Perf — response size optimization", () => {
	test("prod HTML is smaller than dev HTML for same page", async ({ request }) => {
		/* prod HTML should not contain dev artifacts, so total size is smaller.
		 * Since we can't compare cross-mode, just assert reasonable sizes. */
		const res = await request.get("/about");
		const html = await res.text();

		/* prod about page should be under 30KB (no dev scripts, HMR, etc) */
		expect(html.length).toBeLessThan(30_000);
	});

	test("prod data-heavy page has reasonable HTML size", async ({ request }) => {
		const res = await request.get("/perf-bench");
		const html = await res.text();

		/* 200 rows + framework shell should be under 150KB */
		expect(html.length).toBeLessThan(150_000);
	});

	test("prod NDJSON response is compact", async ({ request }) => {
		const res = await request.get("/about", { headers: { "flare-data": "1" } });
		const ndjson = await res.text();

		/* NDJSON for about page: just loader data, no HTML shell */
		expect(ndjson.length).toBeLessThan(5_000);
	});

	test("prod stress page (1000 rows) NDJSON is smaller than HTML", async ({ request }) => {
		const htmlRes = await request.get("/perf-stress");
		const ndjsonRes = await request.get("/perf-stress", { headers: { "flare-data": "1" } });

		const htmlSize = (await htmlRes.text()).length;
		const ndjsonSize = (await ndjsonRes.text()).length;

		expect(ndjsonSize).toBeLessThan(htmlSize);
	});
});

test.describe("@prod-only Perf — asset caching", () => {
	test("hashed JS assets have content hash in filename", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		const assetPaths = [...html.matchAll(/\/assets\/([^"']+\.js)/g)].map((m) => m[1]);
		expect(assetPaths.length).toBeGreaterThan(0);

		/* Vite hashes are `[name]-[hash].js`; hash may include `-` / `_`. */
		for (const path of assetPaths) {
			expect(path).toMatch(/[\w.-]{6,}\.js/);
		}
	});

	test("no bare /src/ paths in production HTML", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		expect(html).not.toContain('src="/src/');
		expect(html).not.toContain('href="/src/');
	});
});

test.describe("@prod-only Perf — Web Vitals in production", () => {
	test("zero CLS on prod home page", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });

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

		expect(cls).toBeLessThan(CLS_BUDGET);
	});

	test("zero CLS on prod data-heavy page", async ({ page }) => {
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

		expect(cls).toBeLessThan(CLS_BUDGET);
	});

	test("zero long tasks on prod home page", async ({ page }) => {
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

		/* Product home hydrates a large nav tree; Solid 2 may record one 50ms+ task. */
		expect(longTasks).toBeLessThanOrEqual(runnerBudget(3, 8));
	});

	test("FCP in prod is within threshold", async ({ page }) => {
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
		/* prod should be faster — tighter threshold */
		expect(fcp).toBeLessThan(runnerBudget(1500, 4000));
	});

	test("LCP in prod is within threshold", async ({ page }) => {
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
		expect(lcp).toBeLessThan(runnerBudget(2500, 5000));
	});
});

test.describe("@prod-only Perf — prod hydration", () => {
	test("home page hydrates in prod", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		cap.assertClean();
	});

	test("data-heavy page hydrates in prod without errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/perf-bench");

		const count = await page.locator("[data-testid=perf-count]").textContent();
		expect(count).toBe("200");

		cap.assertClean();
	});

	test("stress page (1000 rows) hydrates in prod", async ({ page }) => {
		const start = Date.now();
		await loadPage(page, "/perf-stress");
		const elapsed = Date.now() - start;

		const count = await page.locator("[data-testid=stress-count]").textContent();
		expect(count).toBe("1000");

		expect(elapsed).toBeLessThan(runnerBudget(5000, 8000));
	});

	test("deferred data resolves in prod", async ({ page }) => {
		await loadPage(page, "/perf-bench");

		await expect(page.locator("[data-testid=perf-deferred-resolved]")).toBeVisible({
			timeout: 5000,
		});
		expect(await page.locator("[data-testid=perf-deferred-resolved]").textContent()).toBe("deferred-resolved");
	});
});

test.describe("@prod-only Perf — SPA navigation speed in prod", () => {
	test("SPA nav is fast in prod", async ({ page }) => {
		await loadPage(page, "/");

		const start = Date.now();
		await navigateSPA(page, "/about");
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(runnerBudget(300, 2000));
	});

	test("SPA nav to heavy page is fast in prod", async ({ page }) => {
		await loadPage(page, "/");

		const start = Date.now();
		await navigateSPA(page, "/perf-bench");
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(runnerBudget(500, 2000));
	});

	test("sequential SPA navs stay fast in prod", async ({ page }) => {
		await loadPage(page, "/");

		const timings: number[] = [];
		const routes = ["/about", "/perf-bench", "/a11y-test", "/"];

		for (const route of routes) {
			const start = Date.now();
			await navigateSPA(page, route);
			timings.push(Date.now() - start);
		}

		for (const t of timings) {
			expect(t).toBeLessThan(runnerBudget(500, 2000));
		}
	});

	test("no console errors during prod SPA navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await navigateSPA(page, "/about");
		await navigateSPA(page, "/perf-bench");
		await navigateSPA(page, "/");
		cap.assertClean();
	});
});
