import { expect, test } from "@playwright/test";
import { BASE, loadPage, setupConsoleCapture } from "./helpers";

test.describe("@prod-only CSP on HTML responses", () => {
	test("SSR HTML response includes CSP header", async ({ request }) => {
		const response = await request.get("/");
		const csp = response.headers()["content-security-policy"];
		expect(csp).toBeDefined();
		expect(csp).toContain("script-src");
		expect(csp).toContain("nonce-");
	});

	test("CSP nonce in header matches script nonces in HTML", async ({ request }) => {
		const response = await request.get("/");
		const csp = response.headers()["content-security-policy"] ?? "";
		const headerNonce = csp.match(/nonce-([a-f0-9]+)/)?.[1];
		expect(headerNonce).toBeTruthy();

		const html = await response.text();
		const scriptNonces = [...html.matchAll(/nonce="([a-f0-9]+)"/g)].map((m) => m[1]);
		expect(scriptNonces.length).toBeGreaterThan(0);
		for (const sn of scriptNonces) {
			expect(sn).toBe(headerNonce);
		}
	});

	test("404 HTML response includes CSP header", async ({ request }) => {
		const response = await request.get("/nonexistent-prod-test");
		expect(response.status()).toBe(404);
		const csp = response.headers()["content-security-policy"];
		expect(csp).toBeDefined();
		expect(csp).toContain("nonce-");
	});

	test("500 HTML response includes CSP header", async ({ request }) => {
		const response = await request.get("/broken");
		expect(response.status()).toBe(500);
		const csp = response.headers()["content-security-policy"];
		expect(csp).toBeDefined();
		expect(csp).toContain("nonce-");
	});

	test("CSP does not include dev-mode relaxations", async ({ request }) => {
		const response = await request.get("/");
		const csp = response.headers()["content-security-policy"] ?? "";
		expect(csp).not.toContain("unsafe-eval");
	});
});

test.describe("@prod-only module preloads", () => {
	test("HTML contains modulepreload link tags", async ({ request }) => {
		const response = await request.get("/");
		const html = await response.text();
		const preloads = html.match(/<link[^>]*rel="modulepreload"[^>]*>/g);
		expect(preloads).toBeTruthy();
		expect(preloads?.length).toBeGreaterThan(0);
	});

	test("modulepreload hrefs point to hashed assets", async ({ request }) => {
		const response = await request.get("/");
		const html = await response.text();
		const hrefs = [...html.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
		expect(hrefs.length).toBeGreaterThan(0);
		for (const href of hrefs) {
			expect(href).toMatch(/\/assets\//);
		}
	});
});

test.describe("@prod-only asset hashing", () => {
	test("JS assets served with correct content-type", async ({ request }) => {
		const response = await request.get("/");
		const html = await response.text();
		const jsAsset =
			html.match(/href="(\/assets\/[^"]+\.js)"/)?.[1] ?? html.match(/import\("(\/assets\/[^"]+\.js)"\)/)?.[1];
		expect(jsAsset).toBeTruthy();

		const assetResponse = await request.get(jsAsset ?? "");
		expect(assetResponse.status()).toBe(200);
		expect(assetResponse.headers()["content-type"]).toContain("javascript");
	});

	test("all modulepreload assets are accessible", async ({ request }) => {
		const response = await request.get("/");
		const html = await response.text();
		const hrefs = [...html.matchAll(/href="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
		expect(hrefs.length).toBeGreaterThan(0);

		for (const href of hrefs) {
			const r = await request.get(href ?? "");
			expect(r.status()).toBe(200);
		}
	});
});

test.describe("@prod-only hashed entry files", () => {
	test("client entry script has content hash in filename", async ({ request }) => {
		const response = await request.get("/");
		const html = await response.text();
		const entryPath =
			html.match(/import\("(\/assets\/[^"]+\.js)"\)/)?.[1] ?? html.match(/href="(\/assets\/client[^"]+\.js)"/)?.[1];
		expect(entryPath).toBeTruthy();
		expect(entryPath).toMatch(/\/assets\/[\w-]+[-.][\w]+\.js/);
	});

	test("no bare /src/ paths in HTML", async ({ request }) => {
		const response = await request.get("/");
		const html = await response.text();
		expect(html).not.toContain('src="/src/');
		expect(html).not.toContain('href="/src/');
	});
});

test.describe("@prod-only error pages", () => {
	test("500 page does not contain dev stack trace", async ({ request }) => {
		const response = await request.get("/broken");
		const html = await response.text();
		expect(html).not.toContain("at Object.");
		expect(html).not.toContain("at Module.");
		expect(html).not.toContain("node_modules");
	});

	test("404 page renders without dev overlay", async ({ page }) => {
		await page.goto("/nonexistent-prod-check");
		const overlay = await page.locator("[data-flare-dev-overlay]").count();
		expect(overlay).toBe(0);
	});
});

test.describe("@prod-only no dev artifacts", () => {
	test("no /@vite/client script in HTML", async ({ request }) => {
		const response = await request.get("/");
		const html = await response.text();
		expect(html).not.toContain("/@vite/client");
	});

	test("no HMR websocket references in HTML", async ({ request }) => {
		const response = await request.get("/");
		const html = await response.text();
		expect(html).not.toContain("__vite_plugin_react");
		expect(html).not.toContain("import.meta.hot");
	});

	test("no /@fs/ or /@id/ dev paths in HTML", async ({ request }) => {
		const response = await request.get("/");
		const html = await response.text();
		expect(html).not.toContain("/@fs/");
		expect(html).not.toContain("/@id/");
	});

	test("page hydrates correctly in production", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		cap.assertClean();
	});

	test("SPA navigation works in production", async ({ page }) => {
		await loadPage(page, "/");
		await page.evaluate((path) => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav(path);
		}, "/about");
		await page.waitForURL("**/about", { timeout: 10_000 });
		const hydrated = await page.evaluate(() => document.documentElement.hasAttribute("data-flare-hydrated"));
		expect(hydrated).toBe(true);
	});

	test("NDJSON data requests work in production", async ({ request }) => {
		const response = await request.get("/about", {
			headers: { "flare-data": "1" },
		});
		expect(response.headers()["content-type"]).toContain("application/x-ndjson");
		const text = await response.text();
		expect(text.length).toBeGreaterThan(0);
	});

	test("server functions work in production", async ({ request }) => {
		const response = await request.post(`${BASE}/_flare/server-fn/echo/echo`, {
			data: { message: "prod-test" },
		});
		expect(response.status()).toBe(200);
		const json = (await response.json()) as { data: { echo: string } };
		expect(json.data.echo).toBe("prod-test");
	});
});
