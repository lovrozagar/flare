import { expect, test } from "@playwright/test";

const BASE = "";

test.describe("External redirect — SSR", () => {
	test("returns 303 with Location to external URL", async ({ page }) => {
		const response = await page.request.get(`${BASE}/redirect-external`, {
			maxRedirects: 0,
		});
		expect(response.status()).toBe(303);
		expect(response.headers().location).toBe("https://example.com");
	});

	test("returns 307 with custom status", async ({ page }) => {
		const response = await page.request.get(`${BASE}/redirect-external-307`, {
			maxRedirects: 0,
		});
		expect(response.status()).toBe(307);
		expect(response.headers().location).toBe("https://example.com/path?q=test");
	});
});

test.describe("External redirect — data request", () => {
	test("external redirect returns NDJSON redirect for data request (Bug 76)", async ({ page }) => {
		/* Data requests MUST get NDJSON 200 — raw 3xx causes fetch() to follow
		 * cross-origin → CORS block → frozen UI. Client reads NDJSON and does hardNavigate(). */
		const response = await page.request.get(`${BASE}/redirect-external`, {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("application/x-ndjson");
		const body = await response.text();
		const line = JSON.parse(body.trim().split("\n")[0] ?? "{}") as Record<string, unknown>;
		expect(line.t).toBe("x");
		expect(line.xl).toBe(true);
		expect(line.u).toBe("https://example.com");
	});

	test("external redirect 307 returns NDJSON redirect for data request", async ({ page }) => {
		const response = await page.request.get(`${BASE}/redirect-external-307`, {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("application/x-ndjson");
		const body = await response.text();
		const line = JSON.parse(body.trim().split("\n")[0] ?? "{}") as Record<string, unknown>;
		expect(line.t).toBe("x");
		expect(line.xl).toBe(true);
		expect(line.u).toBe("https://example.com/path?q=test");
	});
});

test.describe("External redirect — no body", () => {
	test("redirect response has empty body", async ({ page }) => {
		const response = await page.request.get(`${BASE}/redirect-external`, {
			maxRedirects: 0,
		});
		const text = await response.text();
		expect(text).toBe("");
	});
});
