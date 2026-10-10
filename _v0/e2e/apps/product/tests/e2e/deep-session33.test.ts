import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Head XSS: script/style children escaping in SSR", () => {
	test("custom script children does not contain raw </script>", async ({ page }) => {
		const response = await page.request.get("/head-scripts");
		const html = await response.text();

		/* The custom script children should escape </script> to <\/script> */
		const scriptBlocks = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) ?? [];
		let foundHeadScript = false;
		for (const block of scriptBlocks) {
			/* Skip FlareState block — it uses \u003c escaping and contains head config JSON */
			if (block.includes("data-flare-state") || block.includes("self.flare=")) continue;
			/* Find the actual inline head script with __HEAD_SCRIPT_RAN__ */
			if (block.includes("__HEAD_SCRIPT_RAN__")) {
				foundHeadScript = true;
				const inner = block.replace(/<script[^>]*>/, "").replace(/<\/script>$/i, "");
				expect(inner).toContain("<\\/script>");
				expect(inner).not.toContain("</script>");
			}
		}
		expect(foundHeadScript).toBe(true);
	});

	test("custom style children does not contain raw </style>", async ({ page }) => {
		const response = await page.request.get("/head-scripts");
		const html = await response.text();

		const styleBlocks = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? [];
		let foundHeadStyle = false;
		for (const block of styleBlocks) {
			if (block.includes("body::after")) {
				foundHeadStyle = true;
				const inner = block.replace(/<style[^>]*>/, "").replace(/<\/style>$/i, "");
				expect(inner).toContain("<\\/style>");
				expect(inner).not.toContain("</style>");
			}
		}
		expect(foundHeadStyle).toBe(true);
	});

	test("JSON-LD with </script> in values is escaped in SSR", async ({ page }) => {
		const response = await page.request.get("/xss-test");
		const html = await response.text();

		/* Verify no unescaped </script> inside ld+json script tag */
		const ldJsonMatch = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
		if (ldJsonMatch) {
			expect(ldJsonMatch[1]).not.toContain("</script>");
		}
	});

	test("custom script src URL with & is HTML-escaped", async ({ page }) => {
		const response = await page.request.get("/head-scripts");
		const html = await response.text();

		/* The src="...?v=1&t=2" should have & escaped to &amp; */
		expect(html).toContain("cdn.example.com/lib.js?v=1&amp;t=2");
	});

	test("head-scripts page hydrates without errors", async ({ page }) => {
		await loadPage(page, "/head-scripts");
		await expect(page.locator("[data-testid=head-scripts-page]")).toBeVisible();
		await expect(page).toHaveTitle("Head Scripts");

		/* The inline script with __HEAD_SCRIPT_RAN__ should have executed */
		const ran = await page.evaluate(() => {
			return (window as unknown as Record<string, unknown>).__HEAD_SCRIPT_RAN__;
		});
		expect(ran).toBe(true);
	});
});

test.describe("OG images: multiple values in SSR and client", () => {
	test("SSR renders multiple og:image meta tags", async ({ page }) => {
		const response = await page.request.get("/og-images");
		const html = await response.text();

		const ogImageMatches = html.match(/property="og:image"/g) ?? [];
		expect(ogImageMatches.length).toBe(2);

		expect(html).toContain('content="https://example.com/img1.jpg"');
		expect(html).toContain('content="https://example.com/img2.jpg"');
	});

	test("SSR renders og:image:width and og:image:height per image", async ({ page }) => {
		const response = await page.request.get("/og-images");
		const html = await response.text();

		const widthMatches = html.match(/property="og:image:width"/g) ?? [];
		const heightMatches = html.match(/property="og:image:height"/g) ?? [];
		expect(widthMatches.length).toBe(2);
		expect(heightMatches.length).toBe(2);
	});

	test("client-side OG images present after hydration", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/og-images");

		const ogImages = page.locator("head meta[property='og:image']");
		await expect(ogImages).toHaveCount(2);

		const widths = page.locator("head meta[property='og:image:width']");
		await expect(widths).toHaveCount(2);

		cap.assertClean();
	});

	test("SPA nav to og-images shows multiple og:image tags", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");

		await navigateSPA(page, "/og-images");

		const ogImages = page.locator("head meta[property='og:image']");
		await expect(ogImages).toHaveCount(2);

		cap.assertClean();
	});

	test("SPA nav away from og-images removes OG image tags", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/og-images");

		await expect(page.locator("head meta[property='og:image']")).toHaveCount(2);

		await navigateSPA(page, "/about");

		/* About has no OG images — all should be removed */
		await expect(page.locator("head meta[property='og:image']")).toHaveCount(0);
		await expect(page.locator("head meta[property='og:image:width']")).toHaveCount(0);
		await expect(page.locator("head meta[property='og:image:height']")).toHaveCount(0);

		cap.assertClean();
	});

	test("SPA round-trip: og-images → about → og-images restores images", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/og-images");
		await expect(page.locator("head meta[property='og:image']")).toHaveCount(2);

		await navigateSPA(page, "/about");
		await expect(page.locator("head meta[property='og:image']")).toHaveCount(0);

		await navigateSPA(page, "/og-images");
		await expect(page.locator("head meta[property='og:image']")).toHaveCount(2);

		cap.assertClean();
	});
});

test.describe("Per-route stale head tag cleanup", () => {
	test("head-demo → og-images: head-demo twitter tags removed", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-demo");

		/* head-demo has twitter tags */
		await expect(page.locator("head meta[name='twitter:card']")).toHaveCount(1);
		await expect(page.locator("head meta[name='twitter:title']")).toHaveCount(1);

		await navigateSPA(page, "/og-images");

		/* og-images has no twitter tags, they should be cleaned up */
		await expect(page.locator("head meta[name='twitter:card']")).toHaveCount(0);
		await expect(page.locator("head meta[name='twitter:title']")).toHaveCount(0);

		cap.assertClean();
	});

	test("head-demo → about: canonical link removed", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-demo");

		await expect(page.locator("head link[rel='canonical']")).toHaveCount(1);

		await navigateSPA(page, "/about");

		/* About has no canonical — should be removed */
		await expect(page.locator("head link[rel='canonical']")).toHaveCount(0);

		cap.assertClean();
	});

	test("three hops: head-demo → og-images → about — no leftover tags", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/head-demo");

		await navigateSPA(page, "/og-images");
		await expect(page).toHaveTitle("OG Images");

		await navigateSPA(page, "/about");
		await expect(page).toHaveTitle("About - 2026");

		/* No leftover OG images from og-images page */
		await expect(page.locator("head meta[property='og:image']")).toHaveCount(0);
		await expect(page.locator("head meta[property='og:image:width']")).toHaveCount(0);

		/* No leftover twitter from head-demo */
		await expect(page.locator("head meta[name='twitter:card']")).toHaveCount(0);

		/* No leftover canonical from head-demo */
		await expect(page.locator("head link[rel='canonical']")).toHaveCount(0);

		cap.assertClean();
	});
});

test.describe("Body tag with attributes hydration", () => {
	test("SSR HTML contains _$HY hydration init in <head>", async ({ page }) => {
		const response = await page.request.get("/");
		const html = await response.text();

		/* _$HY hydration init is in <head> to avoid disrupting body DOM traversal */
		const headStart = html.indexOf("<head");
		const headEnd = html.indexOf("</head>");
		const hyInit = html.indexOf("_$HY", headStart);
		expect(headStart).toBeGreaterThan(-1);
		expect(hyInit).toBeGreaterThan(headStart);
		expect(hyInit).toBeLessThan(headEnd);
	});

	test("page hydrates correctly (data-flare-hydrated present)", async ({ page }) => {
		await loadPage(page, "/");
		const hydrated = await page.evaluate(() => document.documentElement.hasAttribute("data-flare-hydrated"));
		expect(hydrated).toBe(true);
	});
});

test.describe("SPA navigation head lifecycle (integration)", () => {
	test("full cycle: home → head-demo → og-images → head-scripts → home", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await expect(page).toHaveTitle("Home");

		/* Step 1: head-demo (OG + Twitter + canonical + JSON-LD) */
		await navigateSPA(page, "/head-demo");
		await expect(page).toHaveTitle("Head Demo");
		await expect(page.locator("head meta[property='og:title']")).toHaveCount(1);
		await expect(page.locator("head meta[name='twitter:card']")).toHaveCount(1);
		await expect(page.locator("head link[rel='canonical']")).toHaveCount(1);
		await expect(page.locator("head script[type='application/ld+json']")).toHaveCount(1);

		/* Step 2: og-images (OG images, no twitter/canonical/JSON-LD) */
		await navigateSPA(page, "/og-images");
		await expect(page).toHaveTitle("OG Images");
		await expect(page.locator("head meta[property='og:image']")).toHaveCount(2);
		await expect(page.locator("head meta[name='twitter:card']")).toHaveCount(0);
		await expect(page.locator("head link[rel='canonical']")).toHaveCount(0);
		await expect(page.locator("head script[type='application/ld+json']")).toHaveCount(0);

		/* Step 3: head-scripts (custom scripts/styles, no OG images) */
		await navigateSPA(page, "/head-scripts");
		await expect(page).toHaveTitle("Head Scripts");
		await expect(page.locator("head meta[property='og:image']")).toHaveCount(0);

		/* Step 4: back to home (clean slate) */
		await navigateSPA(page, "/");
		await expect(page).toHaveTitle("Home");
		await expect(page.locator("head meta[property='og:title']")).toHaveCount(0);
		await expect(page.locator("head meta[property='og:image']")).toHaveCount(0);
		await expect(page.locator("head meta[name='twitter:card']")).toHaveCount(0);

		cap.assertClean();
	});
});
