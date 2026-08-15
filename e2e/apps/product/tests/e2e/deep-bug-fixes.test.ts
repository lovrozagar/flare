import { expect, test } from "@playwright/test";
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Bug 10: og:image:type handled during SPA navigation", () => {
	test("SSR renders og:image:type meta tag", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");

		await expect(page.locator('head meta[property="og:image:type"]')).toHaveCount(1);
		await expect(page.locator('head meta[property="og:image:type"]')).toHaveAttribute("content", "image/webp");

		cap.assertClean();
	});

	test("SPA nav creates og:image:type, then cleans on nav away", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-minimal");

		/* head-minimal has no OG images */
		expect(await page.locator('head meta[property="og:image:type"]').count()).toBe(0);

		/* SPA nav to head-full — should create og:image:type */
		await navigateSPA(page, "/head-full");
		await expect(page.locator('head meta[property="og:image:type"]')).toHaveCount(1);
		await expect(page.locator('head meta[property="og:image:type"]')).toHaveAttribute("content", "image/webp");

		/* SPA nav back to head-minimal — should clean og:image:type */
		await navigateSPA(page, "/head-minimal");
		expect(await page.locator('head meta[property="og:image:type"]').count()).toBe(0);

		cap.assertClean();
	});
});

test.describe("Bug 11: JSON-LD stale scripts from SSR cleaned on SPA nav", () => {
	test("SSR renders multiple JSON-LD scripts for head-full", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");

		/* head-full has 2 JSON-LD items — SSR renders each as separate script */
		const jsonLdCount = await page.locator('head script[type="application/ld+json"]').count();
		expect(jsonLdCount).toBeGreaterThanOrEqual(1);

		cap.assertClean();
	});

	test("SPA nav from JSON-LD page to no-JSON-LD page removes all scripts", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");

		/* Confirm JSON-LD present */
		const initialCount = await page.locator('head script[type="application/ld+json"]').count();
		expect(initialCount).toBeGreaterThanOrEqual(1);

		/* SPA nav to head-minimal (no JSON-LD) — all scripts must be removed */
		await navigateSPA(page, "/head-minimal");
		const afterCount = await page.locator('head script[type="application/ld+json"]').count();
		expect(afterCount).toBe(0);

		cap.assertClean();
	});

	test("SPA nav between JSON-LD pages replaces content (no stale duplicates)", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");

		/* SPA nav to head-demo (different JSON-LD) */
		await navigateSPA(page, "/head-demo");

		/* Should have exactly 1 JSON-LD script with head-demo content */
		const scripts = page.locator('head script[type="application/ld+json"]');
		expect(await scripts.count()).toBe(1);
		const content = await scripts.first().evaluate((el) => el.textContent);
		expect(content).toContain("WebPage");
		expect(content).toContain("Head Demo");
		/* Must NOT contain head-full's Organization data */
		expect(content).not.toContain("Test Org");

		cap.assertClean();
	});
});

test.describe("Bug 12: Robots meta format consistency (no spaces)", () => {
	test("SSR robots content uses comma-only (no spaces)", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-minimal");

		/* head-minimal: { follow: false, index: false } → "noindex,nofollow" */
		await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");

		cap.assertClean();
	});

	test("SPA nav robots content matches SSR format (comma-only)", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		/* SPA nav to head-minimal */
		await navigateSPA(page, "/head-minimal");
		const robotsContent = await page.locator('head meta[name="robots"]').getAttribute("content");
		expect(robotsContent).toBe("noindex,nofollow");
		/* Must NOT have spaces after commas */
		expect(robotsContent).not.toContain(", ");

		cap.assertClean();
	});

	test("SSR robots with advanced directives uses comma-only", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");

		/* head-full: index, follow, noarchive, max-snippet:160, max-image-preview:large */
		const robotsContent = await page.locator('head meta[name="robots"]').getAttribute("content");
		expect(robotsContent).toBe("index,follow,noarchive,max-snippet:160,max-image-preview:large");
		expect(robotsContent).not.toContain(", ");

		cap.assertClean();
	});
});

test.describe("Bug 13: search signal initialized from hydrated state", () => {
	test("useRouter().search() has correct values on initial hydration", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/search-demo?page=2&sort=name");

		/* Client-side search signal should match URL search params on hydration */
		const signalText = await page.locator('[data-testid="search-signal"]').textContent();
		const signal = JSON.parse(signalText ?? "{}") as Record<string, unknown>;
		expect(signal["page"]).toBe("2");
		expect(signal["sort"]).toBe("name");

		cap.assertClean();
	});

	test("loader data and search signal agree on initial load", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/search-demo?foo=bar&baz=qux");

		/* Both loader data (server) and search signal (client) should match */
		const loaderText = await page.locator('[data-testid="search-all-params"]').textContent();
		const signalText = await page.locator('[data-testid="search-signal"]').textContent();
		expect(loaderText).toBe(signalText);

		cap.assertClean();
	});

	test("search signal not empty on hydration with query params", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/search-demo?x=1");

		const signalText = await page.locator('[data-testid="search-signal"]').textContent();
		expect(signalText).not.toBe("{}");
		expect(signalText).toContain('"x"');

		cap.assertClean();
	});
});

test.describe("Bug 14: Revalidation endpoint — malformed JSON returns JSON 400", () => {
	test("malformed JSON body returns 400 with JSON content-type (not HTML 500)", async ({ request }) => {
		const res = await request.post(`${BASE}/_flare/revalidate`, {
			data: "not valid json{{{",
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": "e2e-test-secret",
			},
		});

		expect(res.status()).toBe(400);
		expect(res.headers()["content-type"]).toBe("application/json; charset=utf-8");
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.error).toBeDefined();
	});
});

test.describe("Bug 15: Revalidation endpoint — security headers present", () => {
	test("successful revalidation response includes x-content-type-options", async ({ request }) => {
		const res = await request.post(`${BASE}/_flare/revalidate`, {
			data: JSON.stringify({ tags: ["products"], tiers: ["ssr"] }),
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": "e2e-test-secret",
			},
		});

		expect(res.status()).toBe(200);
		expect(res.headers()["x-content-type-options"]).toBe("nosniff");
	});

	test("401 revalidation response includes x-content-type-options", async ({ request }) => {
		const res = await request.post(`${BASE}/_flare/revalidate`, {
			data: JSON.stringify({ tags: ["x"], tiers: ["ssr"] }),
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": "wrong-secret",
			},
		});

		expect(res.status()).toBe(401);
		expect(res.headers()["x-content-type-options"]).toBe("nosniff");
	});
});

test.describe("Bug 16: Intercept overlay cleared after SPA navigation away", () => {
	test("intercept overlay appears on product click and clears on nav away", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/products");

		/* Click product link — should trigger intercept overlay */
		await page.click('[data-testid="product-link-1"]');
		await expect(page.locator('[data-testid="intercept-overlay"]')).toBeVisible({
			timeout: 5000,
		});

		/* SPA navigate away to a different route */
		await navigateSPA(page, "/");

		/* Overlay must be gone after navigating away */
		await expect(page.locator('[data-testid="intercept-overlay"]')).toHaveCount(0);

		cap.assertClean();
	});

	test("intercept dismiss button clears overlay without navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/products");

		/* Open intercept overlay */
		await page.click('[data-testid="product-link-2"]');
		await expect(page.locator('[data-testid="intercept-overlay"]')).toBeVisible({
			timeout: 5000,
		});

		/* Dismiss via button */
		await page.click('[data-testid="intercept-dismiss"]');
		await expect(page.locator('[data-testid="intercept-overlay"]')).toHaveCount(0);

		/* Should still be on /products (no navigation happened) */
		expect(page.url()).toContain("/products");

		cap.assertClean();
	});
});

test.describe("Bug 22: Top-level head.images handled during SPA navigation", () => {
	test("SSR renders og:image from top-level images AND openGraph.images", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");

		/* head-full has 1 top-level image + 2 openGraph images = 3 total og:image tags */
		await expect(page.locator('head meta[property="og:image"]')).toHaveCount(3);

		/* Top-level image should be first (SSR renders head.images before openGraph.images) */
		const urls = await page
			.locator('head meta[property="og:image"]')
			.evaluateAll((els) => els.map((el) => el.getAttribute("content")));
		expect(urls).toContain("https://example.com/top-level.jpg");
		expect(urls).toContain("https://example.com/og-hero.jpg");

		cap.assertClean();
	});

	test("SPA nav creates top-level images, cleans on nav away", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-minimal");

		/* head-minimal has no images */
		expect(await page.locator('head meta[property="og:image"]').count()).toBe(0);

		/* SPA nav to head-full — should create all 3 og:image tags */
		await navigateSPA(page, "/head-full");
		await expect(page.locator('head meta[property="og:image"]')).toHaveCount(3);

		/* SPA nav back — all images cleaned */
		await navigateSPA(page, "/head-minimal");
		expect(await page.locator('head meta[property="og:image"]').count()).toBe(0);

		cap.assertClean();
	});
});

test.describe("Bug 25: Revalidation endpoint filters non-string array elements", () => {
	const SECRET = "e2e-test-secret";
	const REVALIDATE_URL = "/_flare/revalidate";

	test("non-string tags are filtered, valid tags still revalidate", async ({ request }) => {
		const res = await request.post(REVALIDATE_URL, {
			data: { tags: [123, "kv-test", null, true], tiers: ["ssr"] },
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": SECRET,
			},
		});
		expect(res.status()).toBe(200);
		const json = await res.json();
		expect(json.revalidated).toBe(true);
		expect(json.tags).toEqual(["kv-test"]);
	});

	test("all-non-string tags returns 400", async ({ request }) => {
		const res = await request.post(REVALIDATE_URL, {
			data: { tags: [123, null, {}], tiers: ["ssr"] },
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": SECRET,
			},
		});
		expect(res.status()).toBe(400);
	});
});

test.describe("Bug 26+27: ISR bg re-render produces fresh content with nonce placeholders", () => {
	test("ISR page content updates after revalidation window", async ({ request }) => {
		/* First request — populates ISR cache */
		const res1 = await request.get("/isr-test");
		expect(res1.status()).toBe(200);
		const html1 = await res1.text();
		const ts1 = html1.match(/data-testid="isr-rendered-at">(\d+)</);
		expect(ts1).not.toBeNull();

		/* Wait for revalidation window (isr-test has revalidate: 5) */
		await new Promise((r) => setTimeout(r, 6000));

		/* Second request — serves stale but triggers bg re-render */
		const res2 = await request.get("/isr-test");
		expect(res2.status()).toBe(200);

		/* Wait for bg re-render to complete */
		await new Promise((r) => setTimeout(r, 2000));

		/* Third request — should get fresh content from bg re-render */
		const res3 = await request.get("/isr-test");
		expect(res3.status()).toBe(200);
		const html3 = await res3.text();
		const ts3 = html3.match(/data-testid="isr-rendered-at">(\d+)</);
		expect(ts3).not.toBeNull();

		/* Timestamp should have changed — proves bg re-render stored fresh content */
		expect(ts3?.[1]).not.toBe(ts1?.[1]);
	});

	test("ISR cached response has fresh nonce per request", async ({ request }) => {
		/* First request — populates cache */
		const res1 = await request.get("/isr-test");
		const html1 = await res1.text();
		const nonce1 = html1.match(/nonce="([a-f0-9]+)"/)?.[1];
		expect(nonce1).toBeTruthy();

		/* Second request — should get DIFFERENT nonce (per-request) */
		const res2 = await request.get("/isr-test");
		const html2 = await res2.text();
		const nonce2 = html2.match(/nonce="([a-f0-9]+)"/)?.[1];
		expect(nonce2).toBeTruthy();

		/* Nonces must differ — proves placeholder replacement works */
		expect(nonce1).not.toBe(nonce2);
	});
});

test.describe("Bug 28: head.meta fields handled during SPA navigation", () => {
	test("SSR renders author and creator meta tags", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");

		await expect(page.locator('head meta[name="author"]')).toHaveAttribute("content", "Flare Team");
		await expect(page.locator('head meta[name="creator"]')).toHaveAttribute("content", "Flare Framework");

		cap.assertClean();
	});

	test("SPA nav creates meta tags, cleans on nav away", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-minimal");

		/* head-minimal has no meta.author */
		expect(await page.locator('head meta[name="author"]').count()).toBe(0);

		/* SPA nav to head-full — should create author + creator */
		await navigateSPA(page, "/head-full");
		await expect(page.locator('head meta[name="author"]')).toHaveAttribute("content", "Flare Team");

		/* SPA nav back — author cleaned */
		await navigateSPA(page, "/head-minimal");
		expect(await page.locator('head meta[name="author"]').count()).toBe(0);

		cap.assertClean();
	});
});

test.describe("Bug 29: custom.meta handled during SPA navigation", () => {
	test("SSR renders custom meta tag", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");

		await expect(page.locator('head meta[name="custom-verify"]')).toHaveAttribute("content", "flare-e2e-verify");

		cap.assertClean();
	});

	test("SPA nav creates custom meta, cleans on nav away", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-minimal");

		expect(await page.locator('head meta[name="custom-verify"]').count()).toBe(0);

		await navigateSPA(page, "/head-full");
		await expect(page.locator('head meta[name="custom-verify"]')).toHaveAttribute("content", "flare-e2e-verify");

		await navigateSPA(page, "/head-minimal");
		expect(await page.locator('head meta[name="custom-verify"]').count()).toBe(0);

		cap.assertClean();
	});
});

test.describe("Bug 30: sized favicons handled during SPA navigation", () => {
	test("SSR renders sized favicon link tags", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");

		await expect(page.locator('head link[rel="icon"][sizes="96x96"]')).toHaveAttribute("href", "/icons/icon-96.png");
		await expect(page.locator('head link[rel="icon"][sizes="192x192"]')).toHaveAttribute("href", "/icons/icon-192.png");
		await expect(page.locator('head link[rel="icon"][sizes="512x512"]')).toHaveAttribute("href", "/icons/icon-512.png");

		cap.assertClean();
	});

	test("SPA nav creates sized favicons, cleans on nav away", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-minimal");

		expect(await page.locator('head link[rel="icon"][sizes="96x96"]').count()).toBe(0);
		expect(await page.locator('head link[rel="icon"][sizes="192x192"]').count()).toBe(0);
		expect(await page.locator('head link[rel="icon"][sizes="512x512"]').count()).toBe(0);

		await navigateSPA(page, "/head-full");
		await expect(page.locator('head link[rel="icon"][sizes="96x96"]')).toHaveAttribute("href", "/icons/icon-96.png");
		await expect(page.locator('head link[rel="icon"][sizes="192x192"]')).toHaveAttribute("href", "/icons/icon-192.png");
		await expect(page.locator('head link[rel="icon"][sizes="512x512"]')).toHaveAttribute("href", "/icons/icon-512.png");

		await navigateSPA(page, "/head-minimal");
		expect(await page.locator('head link[rel="icon"][sizes="96x96"]').count()).toBe(0);
		expect(await page.locator('head link[rel="icon"][sizes="192x192"]').count()).toBe(0);
		expect(await page.locator('head link[rel="icon"][sizes="512x512"]').count()).toBe(0);

		cap.assertClean();
	});
});
