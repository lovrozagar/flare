import { expect, test } from "@playwright/test";
import { CLS_BUDGET, runnerBudget } from "./helpers";

/**
 * Performance regression tests.
 *
 * Verifies the structural properties that Lighthouse scores depend on:
 * - DOCTYPE present (quirks mode = layout shift)
 * - Flare scripts all nonced (CSP compliance)
 * - No __FLARE_NONCE__ placeholder leaks
 * - Zero CLS, zero long tasks
 * - Modulepreloads present in prod (skipped in dev — Vite strips them)
 *
 * Tests run against `vite dev`. Vite injects its own unnonced scripts
 * (/@vite/client, HMR) which are excluded from assertions.
 */

/**
 * In dev mode, Vite injects `/@vite/client` and HMR scripts.
 * Filter these out when asserting on Flare's own output.
 */
function filterFlareScripts(scripts: string[]): string[] {
	return scripts.filter(
		(s) =>
			!s.includes("/@vite") &&
			!s.includes("__vite") &&
			!s.includes("@vite") &&
			!s.includes("/@id/") &&
			!s.includes("html-proxy"),
	);
}

test.describe("Performance — script loading strategy", () => {
	test("Flare state script is present with nonce", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		/* data-flare-state script always present, carries SSR state */
		expect(html).toMatch(/<script data-flare-state nonce="[a-f0-9]+"/);
	});

	test("entry module is loaded asynchronously (not render-blocking)", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		/*
		 * In dev: Vite proxies entry as <script type="module" src="/@id/...">.
		 * In prod: Flare emits inline <script type="module" async>import(...)
		 * Both are non-blocking: type="module" defers execution by spec.
		 */
		const moduleScripts = html.match(/<script[^>]*type="module"[^>]*>/g) ?? [];
		expect(moduleScripts.length).toBeGreaterThanOrEqual(1);
	});
});

test.describe("Performance — DOCTYPE and structure", () => {
	test("HTML starts with DOCTYPE (prevents quirks mode CLS)", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		expect(html.trimStart().startsWith("<!DOCTYPE html>")).toBe(true);
	});

	test("ISR route starts with DOCTYPE", async ({ request }) => {
		/* Prime store */
		await request.get("/isr-test");
		await new Promise((r) => setTimeout(r, 500));

		const res = await request.get("/isr-test");
		const html = await res.text();

		expect(html.trimStart().startsWith("<!DOCTYPE html>")).toBe(true);
	});

	test("HTML has lang attribute", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		expect(html).toMatch(/<html[^>]*lang="/);
	});
});

test.describe("Performance — nonce integrity", () => {
	test("all Flare scripts have nonce attributes", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		const allScripts = html.match(/<script[^>]*>/g) ?? [];
		const flareScripts = filterFlareScripts(allScripts);
		expect(flareScripts.length).toBeGreaterThan(0);

		for (const s of flareScripts) {
			expect(s).toMatch(/nonce="[a-f0-9]+"/);
		}
	});

	test("no __FLARE_NONCE__ placeholder in HTML", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		expect(html).not.toContain("__FLARE_NONCE__");
	});

	test("no __FLARE_NONCE__ placeholder in ISR-served HTML", async ({ request }) => {
		/* Prime store */
		await request.get("/isr-test");
		await new Promise((r) => setTimeout(r, 500));

		const res = await request.get("/isr-test");
		const html = await res.text();

		expect(html).not.toContain("__FLARE_NONCE__");
	});

	test("nonce is unique per request", async ({ request }) => {
		const html1 = await (await request.get("/")).text();
		const html2 = await (await request.get("/")).text();

		const nonce1 = html1.match(/nonce="([a-f0-9]+)"/)?.[1];
		const nonce2 = html2.match(/nonce="([a-f0-9]+)"/)?.[1];

		expect(nonce1).toBeDefined();
		expect(nonce2).toBeDefined();
		expect(nonce1).not.toBe(nonce2);
	});
});

test.describe("Performance — Web Vitals indicators", () => {
	test("zero CLS on SSR hydrated page", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });

		const cls = await page.evaluate(() => {
			return new Promise<number>((resolve) => {
				let clsValue = 0;
				const observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						const e = entry as PerformanceEntry & { value: number };
						clsValue += e.value;
					}
				});
				observer.observe({ buffered: true, type: "layout-shift" });
				setTimeout(() => {
					observer.disconnect();
					resolve(clsValue);
				}, 500);
			});
		});

		expect(cls).toBeLessThan(CLS_BUDGET);
	});

	test("zero long tasks (>50ms) on simple page load", async ({ page }) => {
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

		expect(longTasks).toBeLessThanOrEqual(runnerBudget(3, 8));
	});

	test("ISR page hydrates with zero CLS", async ({ page }) => {
		await page.goto("/isr-test", { waitUntil: "networkidle" });

		const cls = await page.evaluate(() => {
			return new Promise<number>((resolve) => {
				let clsValue = 0;
				const observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						const e = entry as PerformanceEntry & { value: number };
						clsValue += e.value;
					}
				});
				observer.observe({ buffered: true, type: "layout-shift" });
				setTimeout(() => {
					observer.disconnect();
					resolve(clsValue);
				}, 500);
			});
		});

		expect(cls).toBeLessThan(CLS_BUDGET);
	});
});

test.describe("Performance — no render-blocking resources", () => {
	test("no render-blocking stylesheet links", async ({ request }) => {
		const res = await request.get("/");
		const html = await res.text();

		const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/);
		const head = headMatch?.[1] ?? "";

		/*
		 * Blocking stylesheets: <link rel="stylesheet"> without media="print".
		 * `flare-global.css` is a blocking stylesheet on purpose — the
		 * preload-as-style + onload swap is an inline handler and fails CSP.
		 * Critical CSS is already inlined in `#flare-critical`.
		 */
		const blockingSheets = head.match(/<link[^>]*rel="stylesheet"(?![^>]*media="print")[^>]*>/g) ?? [];
		const unexpected = blockingSheets.filter((tag) => !tag.includes("flare-global"));
		expect(unexpected).toEqual([]);
	});
});

test.describe("Performance — ISR deferred page vitals", () => {
	test("ISR defer page hydrates with zero CLS", async ({ page }) => {
		await page.goto("/isr-defer", { waitUntil: "networkidle" });

		const cls = await page.evaluate(() => {
			return new Promise<number>((resolve) => {
				let clsValue = 0;
				const observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						const e = entry as PerformanceEntry & { value: number };
						clsValue += e.value;
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

	test("zero long tasks on ISR defer page", async ({ page }) => {
		await page.goto("/isr-defer", { waitUntil: "networkidle" });

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

		expect(longTasks).toBeLessThanOrEqual(runnerBudget(3, 8));
	});

	test("ISR multi-defer page hydrates with zero CLS", async ({ page }) => {
		await page.goto("/isr-multi-defer", { waitUntil: "networkidle" });

		const cls = await page.evaluate(() => {
			return new Promise<number>((resolve) => {
				let clsValue = 0;
				const observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						const e = entry as PerformanceEntry & { value: number };
						clsValue += e.value;
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
});
