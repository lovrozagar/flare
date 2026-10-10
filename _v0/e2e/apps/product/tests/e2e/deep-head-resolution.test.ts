import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 1: Title resolution — fallback, override, dynamic, layout
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("Title resolution across navigations", () => {
	test("page without .head() falls back to root layout title", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await expect(page).toHaveTitle("Home");

		await navigateSPA(page, "/empty-loader");
		await expect(page).toHaveTitle("Flare E2E");

		cap.assertClean();
	});

	test("page without .head() after head-full still falls back", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");
		await expect(page).toHaveTitle("Head Full");

		await navigateSPA(page, "/null-loader");
		await expect(page).toHaveTitle("Flare E2E");

		cap.assertClean();
	});

	test("title restores when navigating back to page with .head()", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await expect(page).toHaveTitle("Home");

		await navigateSPA(page, "/empty-loader");
		await expect(page).toHaveTitle("Flare E2E");

		await navigateSPA(page, "/");
		await expect(page).toHaveTitle("Home");

		cap.assertClean();
	});

	test("dynamic title from loader data", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/about");
		await expect(page).toHaveTitle("About - 2026");

		cap.assertClean();
	});

	test("dynamic title from route params", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/users/42");
		await expect(page).toHaveTitle("User 42");

		await navigateSPA(page, "/users/99");
		await expect(page).toHaveTitle("User 99");

		cap.assertClean();
	});

	test("5-hop title chain: home → head-full → empty → about → head-demo → null-loader", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await expect(page).toHaveTitle("Home");

		await navigateSPA(page, "/head-full");
		await expect(page).toHaveTitle("Head Full");

		await navigateSPA(page, "/empty-loader");
		await expect(page).toHaveTitle("Flare E2E");

		await navigateSPA(page, "/about");
		await expect(page).toHaveTitle("About - 2026");

		await navigateSPA(page, "/head-demo");
		await expect(page).toHaveTitle("Head Demo");

		await navigateSPA(page, "/null-loader");
		await expect(page).toHaveTitle("Flare E2E");

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 2: Full meta cleanup — every tag type dies on nav away
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("Full meta cleanup when navigating to page without .head()", () => {
	test("all head-full tags removed when navigating to empty-loader", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");
		await expect(page).toHaveTitle("Head Full");

		/* Verify all tags present */
		await expect(page.locator("head meta[name='description']")).toHaveCount(1);
		await expect(page.locator("head meta[name='keywords']")).toHaveCount(1);
		await expect(page.locator("head meta[name='robots']")).toHaveCount(1);
		await expect(page.locator("head link[rel='canonical']")).toHaveCount(1);
		await expect(page.locator("head meta[property='og:title']")).toHaveCount(1);
		await expect(page.locator("head meta[property='og:type']")).toHaveCount(1);
		await expect(page.locator("head meta[property='og:url']")).toHaveCount(1);
		await expect(page.locator("head meta[property='og:site_name']")).toHaveCount(1);
		await expect(page.locator("head meta[property='og:locale']")).toHaveCount(1);
		await expect(page.locator("head meta[property='og:image']")).toHaveCount(3);
		await expect(page.locator("head meta[name='twitter:card']")).toHaveCount(1);
		await expect(page.locator("head meta[name='twitter:site']")).toHaveCount(1);
		await expect(page.locator("head meta[name='twitter:creator']")).toHaveCount(1);
		/* SSR renders 2 scripts, client normalizes into 1 combined script during hydration */
		await expect(page.locator("head script[type='application/ld+json']")).toHaveCount(1);
		await expect(page.locator("head link[rel='icon'][sizes='any']")).toHaveCount(1);
		await expect(page.locator("head link[rel='icon'][type='image/svg+xml']")).toHaveCount(1);
		await expect(page.locator("head link[rel='apple-touch-icon']")).toHaveCount(1);
		await expect(page.locator("head link[rel='alternate'][hreflang='en']")).toHaveCount(1);
		await expect(page.locator("head link[rel='alternate'][hreflang='de']")).toHaveCount(1);
		await expect(page.locator("head link[rel='alternate'][hreflang='x-default']")).toHaveCount(1);

		/* Navigate to page with NO .head() */
		await navigateSPA(page, "/empty-loader");
		await expect(page).toHaveTitle("Flare E2E");

		/* EVERY tag from head-full must be gone */
		expect(await page.locator("head meta[name='description']").count()).toBe(0);
		expect(await page.locator("head meta[name='keywords']").count()).toBe(0);
		expect(await page.locator("head meta[name='robots']").count()).toBe(0);
		expect(await page.locator("head link[rel='canonical']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:title']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:type']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:description']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:url']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:site_name']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:locale']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:image']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:image:width']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:image:height']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:image:alt']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:card']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:title']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:description']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:site']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:creator']").count()).toBe(0);
		expect(await page.locator("head script[type='application/ld+json']").count()).toBe(0);

		/* Root layout meta (charset, viewport) should survive */
		await expect(page.locator("head meta[charset='utf-8']")).toHaveCount(1);
		await expect(page.locator("head meta[name='viewport']")).toHaveCount(1);

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 3: OG images — multi-value, replacement, cleanup
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("OG image handling across navigations", () => {
	test("multiple OG images rendered on SSR", async ({ page }) => {
		await loadPage(page, "/og-images");
		await expect(page).toHaveTitle("OG Images");

		const ogImages = page.locator("head meta[property='og:image']");
		await expect(ogImages).toHaveCount(2);

		await expect(ogImages.nth(0)).toHaveAttribute("content", "https://example.com/img1.jpg");
		await expect(ogImages.nth(1)).toHaveAttribute("content", "https://example.com/img2.jpg");

		await expect(page.locator("head meta[property='og:image:width']").nth(0)).toHaveAttribute("content", "800");
		await expect(page.locator("head meta[property='og:image:height']").nth(0)).toHaveAttribute("content", "400");
	});

	test("OG images replaced when navigating between pages", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/og-images");
		await expect(page.locator("head meta[property='og:image']")).toHaveCount(2);

		/* Navigate to head-full which also has OG images */
		await navigateSPA(page, "/head-full");

		/* head-full has 1 top-level image + 2 openGraph images = 3 total */
		const ogImages = page.locator("head meta[property='og:image']");
		await expect(ogImages).toHaveCount(3);
		await expect(ogImages.nth(0)).toHaveAttribute("content", "https://example.com/top-level.jpg");
		await expect(ogImages.nth(1)).toHaveAttribute("content", "https://example.com/og-hero.jpg");
		await expect(ogImages.nth(2)).toHaveAttribute("content", "https://example.com/og-thumb.jpg");

		/* Image alt tags present */
		await expect(page.locator("head meta[property='og:image:alt']").nth(0)).toHaveAttribute("content", "Top Level");

		cap.assertClean();
	});

	test("OG images fully removed when navigating to page without OG", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/og-images");
		await expect(page.locator("head meta[property='og:image']")).toHaveCount(2);

		await navigateSPA(page, "/about");
		expect(await page.locator("head meta[property='og:image']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:image:width']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:image:height']").count()).toBe(0);

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 4: Robots meta — noindex/nofollow directives
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("Robots meta resolution", () => {
	test("robots noindex nofollow on head-minimal SSR", async ({ page }) => {
		await loadPage(page, "/head-minimal");
		const content = (await page.locator("head meta[name='robots']").getAttribute("content")) ?? "";
		expect(content).toContain("noindex");
		expect(content).toContain("nofollow");
	});

	test("robots with index, follow, noarchive, max-snippet on head-full", async ({ page }) => {
		await loadPage(page, "/head-full");
		const content = (await page.locator("head meta[name='robots']").getAttribute("content")) ?? "";
		expect(content).toContain("index");
		expect(content).toContain("follow");
		expect(content).toContain("noarchive");
		expect(content).toContain("max-snippet:160");
		expect(content).toContain("max-image-preview:large");
	});

	test("robots meta removed on nav to page without robots", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-minimal");
		await expect(page.locator("head meta[name='robots']")).toHaveCount(1);

		await navigateSPA(page, "/about");
		expect(await page.locator("head meta[name='robots']").count()).toBe(0);

		cap.assertClean();
	});

	test("robots meta changes between pages", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-minimal");
		const minimalRobots = (await page.locator("head meta[name='robots']").getAttribute("content")) ?? "";
		expect(minimalRobots).toContain("noindex");

		await navigateSPA(page, "/head-full");
		const fullRobots = (await page.locator("head meta[name='robots']").getAttribute("content")) ?? "";
		/* head-full has index: true, so "noindex" should be gone */
		expect(fullRobots).toMatch(/(?<!\bno)index/);
		expect(fullRobots).toContain("noarchive");

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 5: Keywords meta
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("Keywords meta resolution", () => {
	test("keywords rendered on SSR", async ({ page }) => {
		await loadPage(page, "/head-full");
		await expect(page.locator("head meta[name='keywords']")).toHaveAttribute("content", "test, head, seo, flare");
	});

	test("keywords removed on nav to page without keywords", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");
		await expect(page.locator("head meta[name='keywords']")).toHaveCount(1);

		await navigateSPA(page, "/head-demo");
		expect(await page.locator("head meta[name='keywords']").count()).toBe(0);

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 6: Canonical link
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("Canonical link resolution", () => {
	test("canonical changes between pages", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-demo");
		await expect(page.locator("head link[rel='canonical']")).toHaveAttribute("href", "https://example.com/head-demo");

		await navigateSPA(page, "/head-full");
		await expect(page.locator("head link[rel='canonical']")).toHaveAttribute("href", "https://example.com/head-full");

		/* Only one canonical at any time */
		expect(await page.locator("head link[rel='canonical']").count()).toBe(1);

		cap.assertClean();
	});

	test("canonical removed on nav to page without canonical", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");
		await expect(page.locator("head link[rel='canonical']")).toHaveCount(1);

		await navigateSPA(page, "/about");
		expect(await page.locator("head link[rel='canonical']").count()).toBe(0);

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 7: Twitter card meta — all fields
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("Twitter card meta resolution", () => {
	test("full twitter card on head-full SSR", async ({ page }) => {
		await loadPage(page, "/head-full");
		await expect(page.locator("head meta[name='twitter:card']")).toHaveAttribute("content", "summary_large_image");
		await expect(page.locator("head meta[name='twitter:title']")).toHaveAttribute("content", "Head Full - Twitter");
		await expect(page.locator("head meta[name='twitter:description']")).toHaveAttribute(
			"content",
			"Full Twitter description",
		);
		await expect(page.locator("head meta[name='twitter:site']")).toHaveAttribute("content", "@flaresite");
		await expect(page.locator("head meta[name='twitter:creator']")).toHaveAttribute("content", "@flaredev");
	});

	test("twitter card type changes between pages", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");
		await expect(page.locator("head meta[name='twitter:card']")).toHaveAttribute("content", "summary_large_image");

		await navigateSPA(page, "/head-demo");
		await expect(page.locator("head meta[name='twitter:card']")).toHaveAttribute("content", "summary");

		cap.assertClean();
	});

	test("all twitter fields removed when nav to page without twitter", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");
		expect(await page.locator("head meta[name='twitter:card']").count()).toBe(1);
		expect(await page.locator("head meta[name='twitter:site']").count()).toBe(1);
		expect(await page.locator("head meta[name='twitter:creator']").count()).toBe(1);

		await navigateSPA(page, "/about");
		expect(await page.locator("head meta[name='twitter:card']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:title']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:description']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:site']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:creator']").count()).toBe(0);

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 8: JSON-LD structured data
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("JSON-LD resolution", () => {
	test("multiple JSON-LD items present on SSR", async ({ page }) => {
		await loadPage(page, "/head-full");
		/* SSR renders separate <script> tags per JSON-LD item */
		const scripts = page.locator("head script[type='application/ld+json']");
		const count = await scripts.count();
		expect(count).toBeGreaterThanOrEqual(1);

		/* Collect all JSON-LD from all script tags */
		const items: Array<Record<string, unknown>> = [];
		for (let i = 0; i < count; i++) {
			const text = await scripts.nth(i).evaluate((el) => el.textContent);
			const parsed: unknown = JSON.parse(text ?? "{}");
			if (Array.isArray(parsed)) {
				items.push(...(parsed as Array<Record<string, unknown>>));
			} else {
				items.push(parsed as Record<string, unknown>);
			}
		}
		const types = items.map((i) => i["@type"]);
		expect(types).toContain("WebPage");
		expect(types).toContain("Organization");
	});

	test("single JSON-LD item serialized as object", async ({ page }) => {
		await loadPage(page, "/head-demo");
		const jsonLd = await page.locator("head script[type='application/ld+json']").evaluate((el) => el.textContent);
		const parsed = JSON.parse(jsonLd ?? "{}") as Record<string, unknown>;
		expect(parsed["@type"]).toBe("WebPage");
		expect(parsed["name"]).toBe("Head Demo");
	});

	test("JSON-LD replaced when navigating between pages", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-demo");

		/* Single item */
		let jsonLd = await page.locator("head script[type='application/ld+json']").evaluate((el) => el.textContent);
		const parsed = JSON.parse(jsonLd ?? "{}") as Record<string, unknown>;
		expect(parsed["@type"]).toBe("WebPage");
		expect(parsed["name"]).toBe("Head Demo");

		/* Navigate to head-full — multiple items */
		await navigateSPA(page, "/head-full");
		jsonLd = await page.locator("head script[type='application/ld+json']").evaluate((el) => el.textContent);
		const arr = JSON.parse(jsonLd ?? "[]") as Array<Record<string, unknown>>;
		expect(arr.length).toBe(2);

		/* Only one script tag at any time */
		expect(await page.locator("head script[type='application/ld+json']").count()).toBe(1);

		cap.assertClean();
	});

	test("JSON-LD removed when nav to page without JSON-LD", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");
		expect(await page.locator("head script[type='application/ld+json']").count()).toBeGreaterThanOrEqual(1);

		await navigateSPA(page, "/about");
		expect(await page.locator("head script[type='application/ld+json']").count()).toBe(0);

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 9: Hreflang / language alternates
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("Hreflang alternate links", () => {
	test("hreflang links rendered on SSR", async ({ page }) => {
		await loadPage(page, "/head-full");
		await expect(page.locator("head link[rel='alternate'][hreflang='en']")).toHaveAttribute(
			"href",
			"https://example.com/en/head-full",
		);
		await expect(page.locator("head link[rel='alternate'][hreflang='de']")).toHaveAttribute(
			"href",
			"https://example.com/de/head-full",
		);
		await expect(page.locator("head link[rel='alternate'][hreflang='x-default']")).toHaveAttribute(
			"href",
			"https://example.com/head-full",
		);
	});

	test("hreflang links removed on nav to page without languages", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");
		expect(await page.locator("head link[rel='alternate'][hreflang]").count()).toBe(3);

		await navigateSPA(page, "/about");
		expect(await page.locator("head link[rel='alternate'][hreflang]").count()).toBe(0);

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 10: Favicons
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("Favicon resolution", () => {
	test("all favicon types rendered on SSR", async ({ page }) => {
		await loadPage(page, "/head-full");

		await expect(page.locator("head link[rel='icon'][sizes='any']")).toHaveAttribute("href", "/favicon.ico");
		await expect(page.locator("head link[rel='icon'][type='image/svg+xml']")).toHaveAttribute("href", "/icon.svg");
		await expect(page.locator("head link[rel='apple-touch-icon']")).toHaveAttribute("href", "/apple-touch-icon.png");
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 11: Description override & merge across levels
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("Description resolution across route hierarchy", () => {
	test("page description overrides layout description", async ({ page }) => {
		await loadPage(page, "/head-3-level/head-page");
		/* Page defines "Page desc", layout defines "Layout desc" — page wins */
		await expect(page.locator("head meta[name='description']")).toHaveAttribute("content", "Page desc");
		/* Only one description meta */
		expect(await page.locator("head meta[name='description']").count()).toBe(1);
	});

	test("description swaps cleanly between pages", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-demo");
		await expect(page.locator("head meta[name='description']")).toHaveAttribute(
			"content",
			"A page demonstrating complex head configuration",
		);

		await navigateSPA(page, "/head-full");
		await expect(page.locator("head meta[name='description']")).toHaveAttribute(
			"content",
			"Full head config page - 2026",
		);

		await navigateSPA(page, "/head-minimal");
		await expect(page.locator("head meta[name='description']")).toHaveAttribute(
			"content",
			"Minimal page with only description",
		);

		/* Only one description at each step */
		expect(await page.locator("head meta[name='description']").count()).toBe(1);

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 12: OpenGraph full field coverage
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("OpenGraph full field resolution", () => {
	test("all OG fields on head-full SSR", async ({ page }) => {
		await loadPage(page, "/head-full");
		await expect(page.locator("head meta[property='og:title']")).toHaveAttribute("content", "Head Full - OG");
		await expect(page.locator("head meta[property='og:description']")).toHaveAttribute(
			"content",
			"Full OG description",
		);
		await expect(page.locator("head meta[property='og:type']")).toHaveAttribute("content", "article");
		await expect(page.locator("head meta[property='og:url']")).toHaveAttribute(
			"content",
			"https://example.com/head-full",
		);
		await expect(page.locator("head meta[property='og:site_name']")).toHaveAttribute("content", "Flare Test");
		await expect(page.locator("head meta[property='og:locale']")).toHaveAttribute("content", "en_US");
	});

	test("OG fields swap on navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");
		await expect(page.locator("head meta[property='og:type']")).toHaveAttribute("content", "article");

		await navigateSPA(page, "/head-demo");
		await expect(page.locator("head meta[property='og:type']")).toHaveAttribute("content", "website");

		/* Fields head-demo doesn't have should be gone */
		expect(await page.locator("head meta[property='og:url']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:site_name']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:locale']").count()).toBe(0);

		cap.assertClean();
	});

	test("all OG fields removed when nav to page without OG", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");

		await navigateSPA(page, "/empty-loader");

		expect(await page.locator("head meta[property='og:title']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:description']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:type']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:url']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:site_name']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:locale']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:image']").count()).toBe(0);

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 13: No duplicate tags — rapid navigation
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("No duplicate tags across rapid navigations", () => {
	test("rapid 4-hop: head-full → head-demo → head-full → head-demo — no duplicates", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");

		await navigateSPA(page, "/head-demo");
		await navigateSPA(page, "/head-full");
		await navigateSPA(page, "/head-demo");

		/* Exactly one of each */
		expect(await page.locator("head meta[name='description']").count()).toBe(1);
		expect(await page.locator("head meta[property='og:title']").count()).toBe(1);
		expect(await page.locator("head meta[name='twitter:card']").count()).toBe(1);
		expect(await page.locator("head link[rel='canonical']").count()).toBe(1);
		expect(await page.locator("head script[type='application/ld+json']").count()).toBe(1);

		/* Values should be head-demo's, not head-full's */
		await expect(page.locator("head meta[name='description']")).toHaveAttribute(
			"content",
			"A page demonstrating complex head configuration",
		);
		await expect(page.locator("head meta[property='og:title']")).toHaveAttribute("content", "Head Demo - OG");

		cap.assertClean();
	});

	test("alternating head/no-head pages don't accumulate tags", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-full");

		/* head-full → empty → head-full → empty → head-full */
		await navigateSPA(page, "/empty-loader");
		await navigateSPA(page, "/head-full");
		await navigateSPA(page, "/empty-loader");
		await navigateSPA(page, "/head-full");

		/* Still exactly the right count */
		expect(await page.locator("head meta[name='description']").count()).toBe(1);
		expect(await page.locator("head meta[property='og:image']").count()).toBe(3);
		expect(await page.locator("head link[rel='alternate'][hreflang]").count()).toBe(3);

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 14: SSR head integrity
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("SSR head integrity", () => {
	test("head-full SSR HTML contains all meta in <head>", async ({ page }) => {
		const response = await page.goto("/head-full", { waitUntil: "commit" });
		const html = (await response?.text()) ?? "";

		/* Title */
		expect(html).toContain("<title>Head Full</title>");

		/* Description */
		expect(html).toContain('name="description"');
		expect(html).toContain("Full head config page - 2026");

		/* Keywords */
		expect(html).toContain('name="keywords"');
		expect(html).toContain("test, head, seo, flare");

		/* Robots */
		expect(html).toContain('name="robots"');

		/* Canonical */
		expect(html).toContain('rel="canonical"');
		expect(html).toContain("https://example.com/head-full");

		/* OG */
		expect(html).toContain('property="og:title"');
		expect(html).toContain("Head Full - OG");
		expect(html).toContain('property="og:type"');
		expect(html).toContain("article");

		/* Twitter */
		expect(html).toContain('name="twitter:card"');
		expect(html).toContain("summary_large_image");

		/* JSON-LD */
		expect(html).toContain("application/ld+json");
		expect(html).toContain("WebPage");

		/* Hreflang */
		expect(html).toContain('hreflang="en"');
		expect(html).toContain('hreflang="de"');
		expect(html).toContain('hreflang="x-default"');

		/* Favicons */
		expect(html).toContain("/favicon.ico");
		expect(html).toContain("/icon.svg");
		expect(html).toContain("/apple-touch-icon.png");
	});

	test("head-minimal SSR has robots noindex nofollow in HTML", async ({ page }) => {
		const response = await page.goto("/head-minimal", { waitUntil: "commit" });
		const html = (await response?.text()) ?? "";
		expect(html).toContain("<title>Head Minimal</title>");
		expect(html).toContain("noindex");
		expect(html).toContain("nofollow");
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 15: 3-level head hierarchy SPA transitions
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("3-level head hierarchy SPA transitions", () => {
	test("head-3-level → home → head-3-level round trip preserves 3-level config", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-3-level/head-page");
		await expect(page).toHaveTitle("Three Level Head");
		await expect(page.locator("head meta[name='description']")).toHaveAttribute("content", "Page desc");

		await navigateSPA(page, "/");
		await expect(page).toHaveTitle("Home");
		expect(await page.locator("head meta[name='description']").count()).toBe(0);

		await navigateSPA(page, "/head-3-level/head-page");
		await expect(page).toHaveTitle("Three Level Head");
		await expect(page.locator("head meta[name='description']")).toHaveAttribute("content", "Page desc");

		cap.assertClean();
	});

	test("head-3-level → head-full: page-level head completely swaps", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-3-level/head-page");
		await expect(page).toHaveTitle("Three Level Head");

		await navigateSPA(page, "/head-full");
		await expect(page).toHaveTitle("Head Full");

		/* 3-level description gone, head-full description present */
		await expect(page.locator("head meta[name='description']")).toHaveAttribute(
			"content",
			"Full head config page - 2026",
		);
		expect(await page.locator("head meta[name='description']").count()).toBe(1);

		/* head-full specific tags all present */
		expect(await page.locator("head meta[name='keywords']").count()).toBe(1);
		expect(await page.locator("head meta[property='og:title']").count()).toBe(1);
		expect(await page.locator("head meta[name='twitter:card']").count()).toBe(1);

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 16: Blog dynamic head + SPA slug change
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("Blog dynamic head with slug changes", () => {
	test("blog post title updates on param change", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog/hello-world");
		await expect(page).toHaveTitle("Post: hello-world");

		await navigateSPA(page, "/blog/another-post");
		await expect(page).toHaveTitle("Post: another-post");

		cap.assertClean();
	});

	test("blog index → blog post → blog index: title round-trips cleanly", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/blog");
		await expect(page).toHaveTitle("Blog");

		await navigateSPA(page, "/blog/hello-world");
		await expect(page).toHaveTitle("Post: hello-world");

		await navigateSPA(page, "/blog");
		await expect(page).toHaveTitle("Blog");

		cap.assertClean();
	});
});

/* ═══════════════════════════════════════════════════════════════════
 * SECTION 17: Extreme multi-hop stress test
 * ═══════════════════════════════════════════════════════════════════ */

test.describe("Extreme multi-hop head stress test", () => {
	test("10-hop chain: every head type appears and disappears correctly", async ({ page }) => {
		const cap = setupConsoleCapture(page);

		/* Hop 1: head-full (everything) */
		await loadPage(page, "/head-full");
		await expect(page).toHaveTitle("Head Full");
		expect(await page.locator("head meta[name='description']").count()).toBe(1);
		expect(await page.locator("head meta[property='og:title']").count()).toBe(1);

		/* Hop 2: empty-loader (nothing) */
		await navigateSPA(page, "/empty-loader");
		await expect(page).toHaveTitle("Flare E2E");
		expect(await page.locator("head meta[name='description']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:title']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:card']").count()).toBe(0);

		/* Hop 3: head-demo (OG + twitter + canonical + jsonLd) */
		await navigateSPA(page, "/head-demo");
		await expect(page).toHaveTitle("Head Demo");
		expect(await page.locator("head meta[property='og:title']").count()).toBe(1);
		expect(await page.locator("head meta[name='twitter:card']").count()).toBe(1);
		expect(await page.locator("head link[rel='canonical']").count()).toBe(1);
		expect(await page.locator("head script[type='application/ld+json']").count()).toBe(1);

		/* Hop 4: og-images (OG images, no twitter) */
		await navigateSPA(page, "/og-images");
		await expect(page).toHaveTitle("OG Images");
		expect(await page.locator("head meta[property='og:image']").count()).toBe(2);
		expect(await page.locator("head meta[name='twitter:card']").count()).toBe(0);
		expect(await page.locator("head link[rel='canonical']").count()).toBe(0);
		expect(await page.locator("head script[type='application/ld+json']").count()).toBe(0);

		/* Hop 5: head-minimal (robots noindex, description only) */
		await navigateSPA(page, "/head-minimal");
		await expect(page).toHaveTitle("Head Minimal");
		expect(await page.locator("head meta[name='robots']").count()).toBe(1);
		expect(await page.locator("head meta[property='og:image']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:title']").count()).toBe(0);

		/* Hop 6: about (description, title only) */
		await navigateSPA(page, "/about");
		await expect(page).toHaveTitle("About - 2026");
		await expect(page.locator("head meta[name='description']")).toHaveAttribute("content", "About this app");
		expect(await page.locator("head meta[name='robots']").count()).toBe(0);

		/* Hop 7: head-3-level (nested layout head) */
		await navigateSPA(page, "/head-3-level/head-page");
		await expect(page).toHaveTitle("Three Level Head");
		await expect(page.locator("head meta[name='description']")).toHaveAttribute("content", "Page desc");

		/* Hop 8: user page (dynamic param title) */
		await navigateSPA(page, "/users/42");
		await expect(page).toHaveTitle("User 42");

		/* Hop 9: back to head-full */
		await navigateSPA(page, "/head-full");
		await expect(page).toHaveTitle("Head Full");
		expect(await page.locator("head meta[name='keywords']").count()).toBe(1);
		expect(await page.locator("head link[rel='alternate'][hreflang]").count()).toBe(3);
		expect(await page.locator("head meta[property='og:image']").count()).toBe(3);

		/* Hop 10: null-loader (nothing — total cleanup) */
		await navigateSPA(page, "/null-loader");
		await expect(page).toHaveTitle("Flare E2E");
		expect(await page.locator("head meta[name='description']").count()).toBe(0);
		expect(await page.locator("head meta[name='keywords']").count()).toBe(0);
		expect(await page.locator("head meta[name='robots']").count()).toBe(0);
		expect(await page.locator("head link[rel='canonical']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:title']").count()).toBe(0);
		expect(await page.locator("head meta[property='og:image']").count()).toBe(0);
		expect(await page.locator("head meta[name='twitter:card']").count()).toBe(0);
		expect(await page.locator("head script[type='application/ld+json']").count()).toBe(0);
		expect(await page.locator("head link[rel='alternate'][hreflang]").count()).toBe(0);

		/* Root meta survives everything */
		await expect(page.locator("head meta[charset='utf-8']")).toHaveCount(1);
		await expect(page.locator("head meta[name='viewport']")).toHaveCount(1);

		cap.assertClean();
	});
});
