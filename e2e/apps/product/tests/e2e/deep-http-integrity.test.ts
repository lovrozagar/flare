import { expect, test } from "@playwright/test";
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

/* ------------------------------------------------------------------ */
/*  Content-Type verification                                          */
/* ------------------------------------------------------------------ */

test.describe("Content-Type headers", () => {
	test("SSR response has text/html content-type", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		const ct = response?.headers()["content-type"];
		expect(ct).toContain("text/html");
	});

	test("NDJSON data response has application/x-ndjson content-type", async ({ request }) => {
		const response = await request.get("/about", {
			headers: { "x-d": "1" },
		});
		expect(response.headers()["content-type"]).toContain("application/x-ndjson");
	});

	test("404 SSR response has text/html content-type", async ({ page }) => {
		const response = await page.goto("/nonexistent-path-xyz", {
			waitUntil: "domcontentloaded",
		});
		expect(response?.status()).toBe(404);
		const ct = response?.headers()["content-type"];
		expect(ct).toContain("text/html");
	});

	test("500 SSR response has text/html content-type", async ({ page }) => {
		const response = await page.goto("/broken", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(500);
		const ct = response?.headers()["content-type"];
		expect(ct).toContain("text/html");
	});

	test("401 SSR response has text/html content-type", async ({ page }) => {
		const response = await page.goto("/throw-unauthenticated", {
			waitUntil: "domcontentloaded",
		});
		expect(response?.status()).toBe(401);
		const ct = response?.headers()["content-type"];
		expect(ct).toContain("text/html");
	});

	test("403 SSR response has text/html content-type", async ({ page }) => {
		const response = await page.goto("/throw-unauthorized", {
			waitUntil: "domcontentloaded",
		});
		expect(response?.status()).toBe(403);
		const ct = response?.headers()["content-type"];
		expect(ct).toContain("text/html");
	});
});

/* ------------------------------------------------------------------ */
/*  CSP — header on NDJSON, nonce in HTML meta (CSP stripped from      */
/*  HTML in dev because Vite injects nonce-less HMR scripts)           */
/* ------------------------------------------------------------------ */

test.describe("CSP and nonce verification", () => {
	test("NDJSON CSP includes script-src with nonce @prod-only", async ({ request }) => {
		const response = await request.get("/about", {
			headers: { "x-d": "1" },
		});
		const csp = response.headers()["content-security-policy"];
		expect(csp).toBeDefined();
		expect(csp).toContain("script-src");
		expect(csp).toContain("nonce-");
	});

	test("NDJSON CSP nonce differs between requests @prod-only", async ({ request }) => {
		const r1 = await request.get("/", { headers: { "x-d": "1" } });
		const csp1 = r1.headers()["content-security-policy"] ?? "";
		const nonce1 = csp1.match(/nonce-([a-f0-9]+)/)?.[1];

		const r2 = await request.get("/about", { headers: { "x-d": "1" } });
		const csp2 = r2.headers()["content-security-policy"] ?? "";
		const nonce2 = csp2.match(/nonce-([a-f0-9]+)/)?.[1];

		expect(nonce1).toBeTruthy();
		expect(nonce2).toBeTruthy();
		expect(nonce1).not.toBe(nonce2);
	});

	test("HTML has csp-nonce meta tag with valid nonce", async ({ request }) => {
		const response = await request.get("/");
		const html = await response.text();
		const nonceMatch = html.match(/name="csp-nonce" nonce="([a-f0-9]+)"/);
		expect(nonceMatch).toBeTruthy();
		expect(nonceMatch?.[1]?.length).toBeGreaterThan(8);
	});

	test("HTML nonce in meta differs between requests", async ({ request }) => {
		const r1 = await request.get("/");
		const html1 = await r1.text();
		const nonce1 = html1.match(/name="csp-nonce" nonce="([a-f0-9]+)"/)?.[1];

		const r2 = await request.get("/about");
		const html2 = await r2.text();
		const nonce2 = html2.match(/name="csp-nonce" nonce="([a-f0-9]+)"/)?.[1];

		expect(nonce1).toBeTruthy();
		expect(nonce2).toBeTruthy();
		expect(nonce1).not.toBe(nonce2);
	});

	test("HTML script tags have matching nonce attribute", async ({ request }) => {
		const response = await request.get("/");
		const html = await response.text();
		const metaNonce = html.match(/name="csp-nonce" nonce="([a-f0-9]+)"/)?.[1];
		expect(metaNonce).toBeTruthy();

		const scriptNonces = [...html.matchAll(/nonce="([a-f0-9]+)"/g)].map((m) => m[1]);
		expect(scriptNonces.length).toBeGreaterThan(0);
		for (const sn of scriptNonces) {
			expect(sn).toBe(metaNonce);
		}
	});

	test("error NDJSON response includes CSP header @prod-only", async ({ request }) => {
		const response = await request.get("/broken", {
			headers: { "x-d": "1" },
		});
		const csp = response.headers()["content-security-policy"];
		expect(csp).toBeDefined();
		expect(csp).toContain("nonce-");
	});
});

/* ------------------------------------------------------------------ */
/*  Cross-Origin-Opener-Policy header                                  */
/* ------------------------------------------------------------------ */

test.describe("COOP header", () => {
	test("SSR response omits COOP in dev mode @dev-only", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["cross-origin-opener-policy"]).toBeUndefined();
	});

	test("SSR response includes COOP in prod @prod-only", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
	});
});

/* ------------------------------------------------------------------ */
/*  Set-Cookie from loader headers                                     */
/* ------------------------------------------------------------------ */

test.describe("Set-Cookie from route headers", () => {
	test("SSR response sets cookie via Set-Cookie header", async ({ request }) => {
		const response = await request.get("/cookie-test");
		const setCookie = response.headers()["set-cookie"];
		expect(setCookie).toBeTruthy();
		expect(setCookie).toContain("flare-session=tok-");
		expect(setCookie).toContain("Path=/");
		expect(setCookie).toContain("HttpOnly");
	});

	test("cookie token matches value in HTML", async ({ request }) => {
		const response = await request.get("/cookie-test");
		const setCookie = response.headers()["set-cookie"] ?? "";
		const headerToken = setCookie.match(/flare-session=([^;]+)/)?.[1];
		expect(headerToken).toBeTruthy();

		const html = await response.text();
		expect(html).toContain(`data-testid="cookie-token">${headerToken}<`);
	});

	test("cookie persists on subsequent request", async ({ request }) => {
		const r1 = await request.get("/cookie-test");
		const setCookie = r1.headers()["set-cookie"] ?? "";
		const token = setCookie.match(/flare-session=([^;]+)/)?.[1];
		expect(token).toBeTruthy();

		const r2 = await request.get("/cookie-test", {
			headers: { cookie: `flare-session=${token}` },
		});
		const body = await r2.text();
		expect(body).toContain(`>${token}<`);
	});

	test("NDJSON response includes Set-Cookie header", async ({ request }) => {
		const response = await request.get("/cookie-test", {
			headers: { "x-d": "1" },
		});
		const setCookie = response.headers()["set-cookie"];
		expect(setCookie).toBeTruthy();
		expect(setCookie).toContain("flare-session=tok-");
	});

	test("first visit shows existing session as none", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/cookie-test");
		await expect(page.locator("[data-testid=cookie-existing]")).toHaveText("none");
		cap.assertClean();
	});
});

/* ------------------------------------------------------------------ */
/*  Cache-Control headers from CDN cache config                        */
/* ------------------------------------------------------------------ */

test.describe("Cache-Control from CDN config", () => {
	test("route with cdn.maxAge has Cache-Control header", async ({ request }) => {
		const response = await request.get("/cache-headers-test");
		const cc = response.headers()["cache-control"];
		expect(cc).toBeDefined();
		expect(cc).toContain("max-age=300");
	});

	test("Cache-Control includes stale-while-revalidate from cdn.swr", async ({ request }) => {
		const response = await request.get("/cache-headers-test");
		const cc = response.headers()["cache-control"];
		expect(cc).toContain("stale-while-revalidate=60");
	});

	test("Cache-Control scope is public by default", async ({ request }) => {
		const response = await request.get("/cache-headers-test");
		const cc = response.headers()["cache-control"];
		expect(cc).toContain("public");
		expect(cc).not.toContain("private");
	});

	test("Surrogate-Key header from cdn.tags", async ({ request }) => {
		const response = await request.get("/cache-headers-test");
		const sk = response.headers()["surrogate-key"];
		expect(sk).toBeDefined();
		expect(sk).toContain("page");
		expect(sk).toContain("cache-test");
	});

	test("NDJSON also receives Cache-Control from cdn config", async ({ request }) => {
		const response = await request.get("/cache-headers-test", {
			headers: { "x-d": "1" },
		});
		const cc = response.headers()["cache-control"];
		expect(cc).toBeDefined();
		expect(cc).toContain("max-age=300");
	});

	test("route without cdn config has no Cache-Control", async ({ request }) => {
		const response = await request.get("/about");
		const cc = response.headers()["cache-control"];
		expect(cc).toBeUndefined();
	});

	test("page content renders with CDN cache config", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/cache-headers-test");
		await expect(page.locator("[data-testid=cache-message]")).toHaveText("Page with CDN cache config");
		cap.assertClean();
	});
});

/* ------------------------------------------------------------------ */
/*  Security headers on all response types                             */
/* ------------------------------------------------------------------ */

test.describe("Security headers completeness", () => {
	test("dev-safe security headers present on SSR response @dev-only", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
		expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
		expect(response?.headers()["x-frame-options"]).toBe("DENY");
		expect(response?.headers()["x-powered-by"]).toBe("flare");
		expect(response?.headers()["cross-origin-resource-policy"]).toBe("same-origin");
		/* HSTS and COOP skipped in dev */
		expect(response?.headers()["strict-transport-security"]).toBeUndefined();
		expect(response?.headers()["cross-origin-opener-policy"]).toBeUndefined();
	});

	test("all security headers present on SSR response @prod-only", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
		expect(response?.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
		expect(response?.headers()["strict-transport-security"]).toContain("max-age=");
		expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
		expect(response?.headers()["x-frame-options"]).toBe("DENY");
		expect(response?.headers()["x-powered-by"]).toBe("flare");
		expect(response?.headers()["cross-origin-resource-policy"]).toBe("same-origin");
	});

	test("security headers present on NDJSON response @dev-only", async ({ request }) => {
		const response = await request.get("/about", {
			headers: { "x-d": "1" },
		});
		expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
		expect(response.headers()["x-content-type-options"]).toBe("nosniff");
		expect(response.headers()["x-frame-options"]).toBe("DENY");
	});

	test("security headers present on 404 response", async ({ page }) => {
		const response = await page.goto("/nonexistent-xyz", {
			waitUntil: "domcontentloaded",
		});
		expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
		expect(response?.headers()["x-frame-options"]).toBe("DENY");
	});

	test("security headers present on 500 response", async ({ page }) => {
		const response = await page.goto("/broken", { waitUntil: "domcontentloaded" });
		expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
		expect(response?.headers()["x-frame-options"]).toBe("DENY");
	});
});
