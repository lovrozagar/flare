import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { assertSPANavigation, loadPage, navigateSPA, setNavMarker, setupConsoleCapture } from "./helpers";

/**
 * @prod-only
 *
 * Pre-render e2e tests — validate build-time prerender pipeline.
 *
 * These tests run against `vite preview` after `vite build` with prerender: true.
 * The build produces dist/static/ with manifest.json, .html, .ndjson, .headers.json
 * files. server.ts loads these into the in-memory FlareStore at startup.
 */

const STATIC_DIR = join(import.meta.dirname, "../../dist/static");
const MANIFEST_PATH = join(STATIC_DIR, "manifest.json");

function readManifest(): Array<{ mode: string; pathname: string; revalidate?: number }> {
	return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
}

/* ── Group 1: Build output verification ──────────────────────────────── */

/**
 * Every route with static/ISR cache config in the e2e app.
 * If a route is added/removed, update this list.
 */
const EXPECTED_ROUTES = [
	"/cached-layout/isr-child",
	"/deep-cache",
	"/en/ssg-about",
	"/fr/ssg-about",
	"/isr-defer",
	"/isr-defer-error",
	"/isr-fallback-false",
	"/isr-kv-combo",
	"/isr-multi-defer",
	"/isr-test",
	"/ssg-dynamic/hello",
	"/ssg-dynamic/world",
	"/static-cache-test",
	"/static-pure",
];

test.describe("@prod-only Prerender build output", () => {
	test("manifest.json exists with all expected routes", () => {
		expect(existsSync(MANIFEST_PATH)).toBe(true);
		const manifest = readManifest();
		const pathnames = manifest.map((r) => r.pathname).sort();

		expect(pathnames).toEqual(EXPECTED_ROUTES);
	});

	test("manifest mode matches route config", () => {
		const manifest = readManifest();
		const byPath = Object.fromEntries(manifest.map((r) => [r.pathname, r]));

		for (const path of ["/static-pure", "/static-cache-test"]) {
			expect(byPath[path]?.mode).toBe("static");
			expect(byPath[path]?.revalidate).toBeUndefined();
		}

		for (const path of ["/isr-test", "/isr-kv-combo", "/isr-defer", "/isr-fallback-false"]) {
			expect(byPath[path]?.mode).toBe("isr");
			expect(byPath[path]?.revalidate).toBeGreaterThan(0);
		}
	});

	test("each manifest entry has corresponding .html, .ndjson, .headers.json files", () => {
		const manifest = readManifest();

		for (const entry of manifest) {
			const base = entry.pathname === "/" ? "/index" : entry.pathname;
			expect(existsSync(join(STATIC_DIR, `${base}.html`))).toBe(true);
			expect(existsSync(join(STATIC_DIR, `${base}.ndjson`))).toBe(true);
			expect(existsSync(join(STATIC_DIR, `${base}.headers.json`))).toBe(true);
		}
	});

	test("all pre-rendered HTML contains __FLARE_NONCE__ placeholder", () => {
		const manifest = readManifest();

		for (const entry of manifest) {
			const base = entry.pathname === "/" ? "/index" : entry.pathname;
			const html = readFileSync(join(STATIC_DIR, `${base}.html`), "utf-8");
			expect(html).toContain("__FLARE_NONCE__");
		}
	});

	test("all pre-rendered HTML has valid document structure", () => {
		const manifest = readManifest();

		for (const entry of manifest) {
			const base = entry.pathname === "/" ? "/index" : entry.pathname;
			const html = readFileSync(join(STATIC_DIR, `${base}.html`), "utf-8");
			expect(html).toContain("<!DOCTYPE html>");
			expect(html).toContain("<html");
			expect(html).toContain("</html>");
		}
	});

	test("all NDJSON files are non-empty", () => {
		const manifest = readManifest();

		for (const entry of manifest) {
			const base = entry.pathname === "/" ? "/index" : entry.pathname;
			const ndjson = readFileSync(join(STATIC_DIR, `${base}.ndjson`), "utf-8");
			expect(ndjson.length).toBeGreaterThan(0);
		}
	});

	test("all headers.json files contain content-type", () => {
		const manifest = readManifest();

		for (const entry of manifest) {
			const base = entry.pathname === "/" ? "/index" : entry.pathname;
			const headers: Record<string, string> = JSON.parse(
				readFileSync(join(STATIC_DIR, `${base}.headers.json`), "utf-8"),
			);
			expect(headers["content-type"]).toBeDefined();
		}
	});
});

/* ── Group 2: Static pages served from store, not SSR ────────────────── */

test.describe("@prod-only Prerender static pages — served from store", () => {
	test("/static-pure timestamp matches build artifact exactly", async ({ request }) => {
		/*
		 * Read the build artifact directly and compare to served response.
		 * If served via fresh SSR, timestamp would differ from artifact.
		 */
		const artifactHtml = readFileSync(join(STATIC_DIR, "/static-pure.html"), "utf-8");
		const artifactTs = artifactHtml.match(/data-testid="static-pure-built-at">(\d+)</);
		expect(artifactTs).not.toBeNull();

		const res = await request.get("/static-pure");
		const servedHtml = await res.text();
		const servedTs = servedHtml.match(/data-testid="static-pure-built-at">(\d+)</);
		expect(servedTs).not.toBeNull();

		expect(servedTs?.[1]).toBe(artifactTs?.[1]);
	});

	test("/static-cache-test timestamp matches build artifact exactly", async ({ request }) => {
		const artifactHtml = readFileSync(join(STATIC_DIR, "/static-cache-test.html"), "utf-8");
		const artifactTs = artifactHtml.match(/data-testid="static-built-at">(\d+)</);
		expect(artifactTs).not.toBeNull();

		const res = await request.get("/static-cache-test");
		const servedHtml = await res.text();
		const servedTs = servedHtml.match(/data-testid="static-built-at">(\d+)</);
		expect(servedTs).not.toBeNull();

		expect(servedTs?.[1]).toBe(artifactTs?.[1]);
	});

	test("static timestamp is frozen — identical across multiple requests", async ({ request }) => {
		const res1 = await request.get("/static-pure");
		const html1 = await res1.text();
		const ts1 = html1.match(/data-testid="static-pure-built-at">(\d+)</);

		const res2 = await request.get("/static-pure");
		const html2 = await res2.text();
		const ts2 = html2.match(/data-testid="static-pure-built-at">(\d+)</);

		expect(ts1).not.toBeNull();
		expect(ts2).not.toBeNull();
		expect(ts1?.[1]).toBe(ts2?.[1]);
	});

	test("static timestamp is from build, not request time", async ({ request }) => {
		const res = await request.get("/static-pure");
		const html = await res.text();
		const ts = html.match(/data-testid="static-pure-built-at">(\d+)</);
		expect(ts).not.toBeNull();

		const buildTs = Number(ts?.[1]);
		const now = Date.now();
		expect(buildTs).toBeLessThan(now);
		expect(now - buildTs).toBeLessThan(3_600_000);
	});
});

/* ── Group 3: Nonce replacement ──────────────────────────────────────── */

test.describe("@prod-only Prerender nonce replacement", () => {
	test("served HTML has no __FLARE_NONCE__ placeholder", async ({ request }) => {
		const res = await request.get("/static-pure");
		const html = await res.text();
		expect(html).not.toContain("__FLARE_NONCE__");
	});

	test("each request gets a unique nonce", async ({ request }) => {
		const res1 = await request.get("/static-pure");
		const html1 = await res1.text();
		const nonce1 = html1.match(/nonce="([a-fA-F0-9]+)"/);

		const res2 = await request.get("/static-pure");
		const html2 = await res2.text();
		const nonce2 = html2.match(/nonce="([a-fA-F0-9]+)"/);

		expect(nonce1).not.toBeNull();
		expect(nonce2).not.toBeNull();
		expect(nonce1?.[1]).not.toBe(nonce2?.[1]);
	});

	test("CSP header nonce matches script nonces in HTML", async ({ request }) => {
		const res = await request.get("/static-pure");
		const html = await res.text();
		const csp = res.headers()["content-security-policy"] ?? "";

		const htmlNonce = html.match(/nonce="([a-fA-F0-9]+)"/);
		expect(htmlNonce).not.toBeNull();

		expect(csp).toContain(`nonce-${htmlNonce?.[1]}`);
	});
});

/* ── Group 4: ISR routes pre-populated from build ────────────────────── */

test.describe("@prod-only Prerender ISR pre-population", () => {
	test("/isr-test serves 200 immediately (pre-populated)", async ({ request }) => {
		const res = await request.get("/isr-test");
		expect(res.status()).toBe(200);

		const html = await res.text();
		expect(html).toContain('data-testid="isr-test"');
	});

	test("/isr-test timestamp matches build artifact", async ({ request }) => {
		const artifactHtml = readFileSync(join(STATIC_DIR, "/isr-test.html"), "utf-8");
		const artifactTs = artifactHtml.match(/data-testid="isr-rendered-at">(\d+)</);
		expect(artifactTs).not.toBeNull();

		const res = await request.get("/isr-test");
		const servedHtml = await res.text();
		const servedTs = servedHtml.match(/data-testid="isr-rendered-at">(\d+)</);
		expect(servedTs).not.toBeNull();

		expect(servedTs?.[1]).toBe(artifactTs?.[1]);
	});

	test("/isr-test timestamp is frozen across requests", async ({ request }) => {
		const res1 = await request.get("/isr-test");
		const html1 = await res1.text();
		const ts1 = html1.match(/data-testid="isr-rendered-at">(\d+)</);

		const res2 = await request.get("/isr-test");
		const html2 = await res2.text();
		const ts2 = html2.match(/data-testid="isr-rendered-at">(\d+)</);

		expect(ts1).not.toBeNull();
		expect(ts2).not.toBeNull();
		expect(ts1?.[1]).toBe(ts2?.[1]);
	});

	test("/isr-fallback-false returns 200 (pre-populated from build)", async ({ request }) => {
		const res = await request.get("/isr-fallback-false");
		expect(res.status()).toBe(200);

		const html = await res.text();
		expect(html).toContain('data-testid="isr-fallback-false"');
	});
});

/* ── Group 5: NDJSON data requests from store ────────────────────────── */

test.describe("@prod-only Prerender NDJSON data serving", () => {
	test("/static-pure x-d:1 returns pre-rendered NDJSON", async ({ request }) => {
		const res = await request.get("/static-pure", {
			headers: { "x-d": "1" },
		});
		expect(res.status()).toBe(200);

		const ct = res.headers()["content-type"] ?? "";
		expect(ct).toContain("x-ndjson");

		const body = await res.text();
		expect(body.length).toBeGreaterThan(0);
	});

	test("/isr-test x-d:1 returns pre-rendered NDJSON", async ({ request }) => {
		const res = await request.get("/isr-test", {
			headers: { "x-d": "1" },
		});
		expect(res.status()).toBe(200);

		const ct = res.headers()["content-type"] ?? "";
		expect(ct).toContain("x-ndjson");

		const body = await res.text();
		expect(body.length).toBeGreaterThan(0);
	});
});

/* ── Group 6: Hydration from pre-rendered HTML ───────────────────────── */

test.describe("@prod-only Prerender hydration", () => {
	test("/static-pure hydrates with correct content", async ({ page }) => {
		await loadPage(page, "/static-pure");
		await expect(page.locator("[data-testid=static-pure]")).toBeVisible();
		await expect(page.locator("[data-testid=static-pure-source]")).toHaveText("ssr");
	});

	test("/static-cache-test hydrates with correct content", async ({ page }) => {
		await loadPage(page, "/static-cache-test");
		await expect(page.locator("[data-testid=static-cache-test]")).toBeVisible();
		await expect(page.locator("[data-testid=static-message]")).toHaveText("This page has ssg: true cache config");
	});

	test("/isr-test hydrates with correct content", async ({ page }) => {
		await loadPage(page, "/isr-test");
		await expect(page.locator("[data-testid=isr-test]")).toBeVisible();
		await expect(page.locator("[data-testid=isr-source]")).toHaveText("ssr");
	});

	test("no console errors on pre-rendered pages", async ({ page }) => {
		const routes = ["/static-pure", "/static-cache-test", "/isr-test"];

		for (const route of routes) {
			const cap = setupConsoleCapture(page);
			await loadPage(page, route);
			await page.waitForTimeout(200);
			cap.assertClean();
		}
	});
});

/* ── Group 7: Serving hierarchy — store beats SSR ─────────────────────── */

test.describe("@prod-only Prerender serving hierarchy", () => {
	test("static route: store entry used, not fresh SSR", async ({ request }) => {
		/*
		 * Static routes have no on-demand population. If the store entry
		 * is being used, the timestamp is frozen from build. If SSR ran,
		 * each request would produce a different (newer) timestamp.
		 */
		const artifactHtml = readFileSync(join(STATIC_DIR, "/static-pure.html"), "utf-8");
		const artifactTs = artifactHtml.match(/data-testid="static-pure-built-at">(\d+)</);
		expect(artifactTs).not.toBeNull();

		/* Multiple requests, all must match artifact */
		for (let i = 0; i < 3; i++) {
			const res = await request.get("/static-pure");
			const html = await res.text();
			const ts = html.match(/data-testid="static-pure-built-at">(\d+)</);
			expect(ts?.[1]).toBe(artifactTs?.[1]);
		}
	});

	test("ISR route: store entry used on first request (no SSR miss)", async ({ request }) => {
		/*
		 * Without prerender, first ISR request is a store miss → blocking SSR.
		 * With prerender, the store is pre-populated → first request serves
		 * from store with build-time timestamp.
		 */
		const artifactHtml = readFileSync(join(STATIC_DIR, "/isr-test.html"), "utf-8");
		const artifactTs = artifactHtml.match(/data-testid="isr-rendered-at">(\d+)</);
		expect(artifactTs).not.toBeNull();

		const res = await request.get("/isr-test");
		const html = await res.text();
		const servedTs = html.match(/data-testid="isr-rendered-at">(\d+)</);
		expect(servedTs?.[1]).toBe(artifactTs?.[1]);
	});

	test("dynamic route: NOT served from store (fresh SSR each time)", async ({ request }) => {
		/*
		 * Routes without static config always go through SSR.
		 * The home page (/) has no cache.static, so timestamps differ.
		 */
		const res1 = await request.get("/");
		const html1 = await res1.text();
		const ts1 = html1.match(/data-testid="timestamp">(\d+)</);

		/* Small delay to ensure timestamp differs */
		await new Promise((r) => setTimeout(r, 50));

		const res2 = await request.get("/");
		const html2 = await res2.text();
		const ts2 = html2.match(/data-testid="timestamp">(\d+)</);

		expect(ts1).not.toBeNull();
		expect(ts2).not.toBeNull();
		expect(ts1?.[1]).not.toBe(ts2?.[1]);
	});

	test("nonce differs between store-served and dynamic responses", async ({ request }) => {
		/* Both static-pure (store) and / (SSR) should get unique nonces */
		const staticRes = await request.get("/static-pure");
		const staticHtml = await staticRes.text();
		const staticNonce = staticHtml.match(/nonce="([a-fA-F0-9]+)"/);

		const dynamicRes = await request.get("/");
		const dynamicHtml = await dynamicRes.text();
		const dynamicNonce = dynamicHtml.match(/nonce="([a-fA-F0-9]+)"/);

		expect(staticNonce).not.toBeNull();
		expect(dynamicNonce).not.toBeNull();
		expect(staticNonce?.[1]).not.toBe(dynamicNonce?.[1]);
	});

	test("middleware runs on store-served responses (not bypassed)", async ({ request }) => {
		/*
		 * Even when served from store, middleware chain must execute.
		 * x-request-id differs per request (proves middleware ran fresh).
		 */
		const res1 = await request.get("/static-pure");
		const id1 = res1.headers()["x-request-id"];

		const res2 = await request.get("/static-pure");
		const id2 = res2.headers()["x-request-id"];

		expect(id1).toBeDefined();
		expect(id2).toBeDefined();
		expect(id1).not.toBe(id2);
	});

	test("NDJSON also served from store for static routes", async ({ request }) => {
		/*
		 * x-d:1 data requests for static routes should also hit the store.
		 * Verify NDJSON content matches the build artifact.
		 */
		const artifactNdjson = readFileSync(join(STATIC_DIR, "/static-pure.ndjson"), "utf-8");

		const res = await request.get("/static-pure", {
			headers: { "x-d": "1" },
		});
		const servedNdjson = await res.text();

		expect(servedNdjson).toBe(artifactNdjson);
	});
});

/* ── Group 8: Security + middleware headers ───────────────────────────── */

test.describe("@prod-only Prerender security headers", () => {
	test("security headers present on pre-rendered responses", async ({ page }) => {
		const routes = ["/static-pure", "/static-cache-test", "/isr-test"];

		for (const route of routes) {
			const res = await page.goto(route);
			expect(res?.headers()["x-content-type-options"]).toBe("nosniff");
			expect(res?.headers()["x-frame-options"]).toBe("DENY");
		}
	});

	test("middleware headers present on pre-rendered responses", async ({ request }) => {
		const routes = ["/static-pure", "/isr-test"];

		for (const route of routes) {
			const res = await request.get(route);
			expect(res.headers()["x-middleware-ran"]).toBe("true");
			expect(res.headers()["x-request-id"]).toBeDefined();
		}
	});
});

/* ── Group 8: SPA navigation ─────────────────────────────────────────── */

test.describe("@prod-only Prerender SPA navigation", () => {
	test("SPA nav from pre-rendered page to dynamic page", async ({ page }) => {
		await loadPage(page, "/static-pure");
		await navigateSPA(page, "/");
		await expect(page.locator("[data-testid=home]")).toBeVisible();
	});

	test("SPA nav from dynamic page to pre-rendered page", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/static-pure");
		await expect(page.locator("[data-testid=static-pure]")).toBeVisible();
	});

	test("SPA nav between two pre-rendered pages", async ({ page }) => {
		await loadPage(page, "/static-pure");
		await setNavMarker(page);
		await navigateSPA(page, "/static-cache-test");
		await assertSPANavigation(page);
		await expect(page.locator("[data-testid=static-cache-test]")).toBeVisible();
	});

	test("no console errors during SPA nav to/from pre-rendered pages", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/static-pure");
		await navigateSPA(page, "/");
		await navigateSPA(page, "/static-cache-test");
		await page.waitForTimeout(200);
		cap.assertClean();
	});
});

/* ── Group 9: Dynamic params prerender ────────────────────────────────── */

test.describe("@prod-only Prerender dynamic params expansion", () => {
	test("page-level params expanded: /ssg-dynamic/hello and /ssg-dynamic/world", () => {
		const manifest = readManifest();
		const pathnames = manifest.map((r) => r.pathname);

		expect(pathnames).toContain("/ssg-dynamic/hello");
		expect(pathnames).toContain("/ssg-dynamic/world");
	});

	test("layout-level params expanded: /en/ssg-about and /fr/ssg-about", () => {
		const manifest = readManifest();
		const pathnames = manifest.map((r) => r.pathname);

		expect(pathnames).toContain("/en/ssg-about");
		expect(pathnames).toContain("/fr/ssg-about");
	});

	test("expanded routes have .html, .ndjson, .headers.json files", () => {
		const dynamicPaths = ["/ssg-dynamic/hello", "/ssg-dynamic/world", "/en/ssg-about", "/fr/ssg-about"];

		for (const pathname of dynamicPaths) {
			expect(existsSync(join(STATIC_DIR, `${pathname}.html`))).toBe(true);
			expect(existsSync(join(STATIC_DIR, `${pathname}.ndjson`))).toBe(true);
			expect(existsSync(join(STATIC_DIR, `${pathname}.headers.json`))).toBe(true);
		}
	});

	test("expanded HTML contains correct content", () => {
		const helloHtml = readFileSync(join(STATIC_DIR, "/ssg-dynamic/hello.html"), "utf-8");
		expect(helloHtml).toContain("hello");

		const worldHtml = readFileSync(join(STATIC_DIR, "/ssg-dynamic/world.html"), "utf-8");
		expect(worldHtml).toContain("world");

		const enHtml = readFileSync(join(STATIC_DIR, "/en/ssg-about.html"), "utf-8");
		expect(enHtml).toContain("en");

		const frHtml = readFileSync(join(STATIC_DIR, "/fr/ssg-about.html"), "utf-8");
		expect(frHtml).toContain("fr");
	});

	test("/ssg-dynamic/hello serves pre-rendered content", async ({ request }) => {
		const artifactHtml = readFileSync(join(STATIC_DIR, "/ssg-dynamic/hello.html"), "utf-8");
		const res = await request.get("/ssg-dynamic/hello");
		expect(res.status()).toBe(200);
		const html = await res.text();
		expect(html).toContain('data-testid="ssg-dynamic-slug"');
	});

	test("/en/ssg-about serves pre-rendered content with locale", async ({ request }) => {
		const res = await request.get("/en/ssg-about");
		expect(res.status()).toBe(200);
		const html = await res.text();
		expect(html).toContain('data-testid="ssg-about-locale"');
	});

	test("/ssg-dynamic/hello hydrates correctly", async ({ page }) => {
		await loadPage(page, "/ssg-dynamic/hello");
		await expect(page.locator("[data-testid=ssg-dynamic-slug]")).toHaveText("hello");
	});

	test("/en/ssg-about hydrates with correct locale", async ({ page }) => {
		await loadPage(page, "/en/ssg-about");
		await expect(page.locator("[data-testid=ssg-about-locale]")).toHaveText("en");
	});

	test("/fr/ssg-about hydrates with correct locale", async ({ page }) => {
		await loadPage(page, "/fr/ssg-about");
		await expect(page.locator("[data-testid=ssg-about-locale]")).toHaveText("fr");
	});
});
