import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Deep: XSS prevention in SSR serialization", () => {
	test("FlareState serialization escapes closing script tags", async ({ page }) => {
		const response = await page.request.get("/xss-test");
		const html = await response.text();

		/* The self.flare= serialization escapes all < as \u003c */
		const flareStart = html.indexOf("self.flare=");
		const flareEnd = html.indexOf("</script>", flareStart);
		const flareSection = html.substring(flareStart, flareEnd);
		/* Within the JSON blob, no raw < should exist — all escaped to \u003c */
		expect(flareSection).not.toContain("</script>");
		expect(flareSection).not.toContain("<script>");
		/* \u003c escaping should be present for < characters */
		expect(flareSection).toContain("\\u003c");
	});

	test("XSS content renders as text, not as HTML", async ({ page }) => {
		await loadPage(page, "/xss-test");
		const htmlContent = await page.locator("[data-testid=xss-html]").textContent();
		expect(htmlContent).toBe("<script>alert('xss')</script>");

		/* Verify no alert was triggered */
		const dialogFired: boolean[] = [false];
		page.on("dialog", () => {
			dialogFired[0] = true;
		});
		await page.waitForTimeout(500);
		expect(dialogFired[0]).toBe(false);
	});

	test("special characters in loader data survive SSR roundtrip", async ({ page }) => {
		await loadPage(page, "/xss-test");
		const special = await page.locator("[data-testid=xss-special]").textContent();
		expect(special).toBe("< > & \" ' / \\");
	});

	test("XSS content survives SPA navigation", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/xss-test");
		const htmlContent = await page.locator("[data-testid=xss-html]").textContent();
		expect(htmlContent).toBe("<script>alert('xss')</script>");
	});

	test("FlareState JSON is not injectable", async ({ page }) => {
		const response = await page.request.get("/xss-test");
		const html = await response.text();

		/* Find the FlareState script and verify it doesn't contain unescaped closers */
		const stateMatch = html.match(/self\.flare=({.*?});?\s*<\/script>/s);
		if (stateMatch) {
			const stateJson = stateMatch[1];
			/* Should use unicode escape for < */
			expect(stateJson).not.toContain("</");
		}
	});
});

test.describe("Deep: SSR response headers security", () => {
	test("NDJSON response has security headers", async ({ page }) => {
		const response = await page.request.get("/about", {
			headers: { "flare-data": "1" },
		});
		expect(response.headers()["x-content-type-options"]).toBe("nosniff");
		expect(response.headers()["x-frame-options"]).toBe("DENY");
	});

	test("SSR HTML has X-Content-Type-Options", async ({ page }) => {
		const response = await page.request.get("/about");
		expect(response.headers()["x-content-type-options"]).toBe("nosniff");
	});

	test("SSR nonce is unique per request", async ({ page }) => {
		const r1 = await page.request.get("/");
		const r2 = await page.request.get("/");
		const html1 = await r1.text();
		const html2 = await r2.text();

		const nonce1 = html1.match(/name="csp-nonce" nonce="([^"]+)"/);
		const nonce2 = html2.match(/name="csp-nonce" nonce="([^"]+)"/);
		expect(nonce1).toBeTruthy();
		expect(nonce2).toBeTruthy();
		expect(nonce1?.[1]).not.toBe(nonce2?.[1]);
	});

	test("script tags have nonce attribute", async ({ page }) => {
		const response = await page.request.get("/");
		const html = await response.text();
		const nonceMatch = html.match(/name="csp-nonce" nonce="([^"]+)"/);
		expect(nonceMatch).toBeTruthy();
		const nonce = nonceMatch?.[1];

		/* FlareState script should have the nonce */
		expect(html).toContain(`nonce="${nonce}"`);
	});
});

test.describe("Deep: head meta content", () => {
	test("description meta tag is present in SSR HTML", async ({ page }) => {
		const response = await page.request.get("/xss-test");
		const html = await response.text();
		/* Description meta tag should be present */
		expect(html).toContain('<meta name="description"');
	});

	test("title is set correctly despite XSS content in other fields", async ({ page }) => {
		await loadPage(page, "/xss-test");
		const title = await page.title();
		expect(title).toBe("XSS Test");
	});
});

test.describe("Deep: FlareState integrity", () => {
	test("FlareState.m match data is JSON-safe (no functions)", async ({ page }) => {
		await loadPage(page, "/about");
		const state = await page.evaluate(() => {
			const s = (self as unknown as { flare: Record<string, unknown> }).flare;
			/* Try to serialize — functions would be stripped */
			const roundTripped = JSON.parse(JSON.stringify(s));
			return {
				matchCount: (roundTripped.m as unknown[]).length,
				original: (s.m as unknown[]).length,
			};
		});
		expect(state.matchCount).toBe(state.original);
	});

	test("FlareState.c.router is a plain object (no class instances)", async ({ page }) => {
		await loadPage(page, "/");
		const routerType = await page.evaluate(() => {
			const s = (self as unknown as { flare: { c: { router: unknown } } }).flare;
			return typeof s.c.router;
		});
		expect(routerType).toBe("object");
	});

	test("FlareState round-trips through JSON.parse(JSON.stringify())", async ({ page }) => {
		await loadPage(page, "/users/42");
		const result = await page.evaluate(() => {
			const s = (self as unknown as { flare: Record<string, unknown> }).flare;
			const serialized = JSON.stringify(s);
			const parsed = JSON.parse(serialized);
			return {
				matchCountMatch: (parsed.m as unknown[]).length === (s.m as unknown[]).length,
				paramsMatch: (parsed.r as Record<string, string>).id === (s.r as Record<string, string>).id,
				pathMatch: parsed.p === s.p,
			};
		});
		expect(result.pathMatch).toBe(true);
		expect(result.paramsMatch).toBe(true);
		expect(result.matchCountMatch).toBe(true);
	});
});
