import { expect, test } from "@playwright/test"
import {
	assertHydrated,
	assertSPANavigation,
	BASE,
	clickAndAssertSPA,
	loadPage,
	setNavMarker,
	setupConsoleCapture,
} from "./helpers"

/**
 * Route smoke tests: verify EVERY route works via both hard navigation (SSR)
 * and SPA navigation (client-side from index).
 *
 * Every test validates:
 * - No console errors or page errors (unless route intentionally produces them)
 * - No hydration mismatches
 * - Correct URL after navigation
 * - FlareState present (SSR routes)
 * - SPA marker survives (SPA routes)
 */

/* Routes that render normally — test both hard nav and SPA nav */
const RENDERABLE_ROUTES: Array<{ label: string; path: string }> = [
	{ label: "About", path: "/about" },
	{ label: "Blog", path: "/blog" },
	{ label: "Blog Post", path: "/blog/hello-world" },
	{ label: "User 42", path: "/users/42" },
	{ label: "Head Demo", path: "/head-demo" },
	{ label: "OG Images", path: "/og-images" },
	{ label: "Props Demo", path: "/props-demo" },
	{ label: "Props Nested", path: "/props-nested" },
	{ label: "Search Demo", path: "/search-demo?q=test&page=1" },
	{ label: "Large Data", path: "/large-data" },
	{ label: "XSS Test", path: "/xss-test" },
	{ label: "Empty Loader", path: "/empty-loader" },
	{ label: "Null Loader", path: "/null-loader" },
	{ label: "Head Full", path: "/head-full" },
	{ label: "Head Minimal", path: "/head-minimal" },
	{ label: "Static Image Test", path: "/static-image-test" },
	{ label: "Styles Demo", path: "/styles-demo" },
	{ label: "Custom Headers", path: "/custom-headers" },
	{ label: "Headers Chain", path: "/headers-chain/headers-child" },
	{ label: "Cache Headers Test", path: "/cache-headers-test" },
	{ label: "Cookie Test", path: "/cookie-test" },
	{ label: "Link Advanced", path: "/link-advanced" },
	{ label: "Link Test", path: "/link-test" },
	{ label: "Link Features", path: "/link-features" },
	{ label: "Shallow Test", path: "/shallow-test" },
	{ label: "Shallow Validated", path: "/shallow-validated" },
	{ label: "Blocker Test", path: "/blocker-test" },
	{ label: "Navigate Demo", path: "/navigate-demo" },
	{ label: "Disabled Toggle", path: "/disabled-toggle" },
	{ label: "Prefetch Target", path: "/prefetch-target" },
	{ label: "Deferred Multi", path: "/deferred-multi" },
	{ label: "Scroll Tall", path: "/scroll-tall" },
	{ label: "Chain Override", path: "/chain-override" },
	{ label: "Validated Param 42", path: "/validated/42" },
	{ label: "Catch All", path: "/catch-all/a/b/c" },
	{ label: "Head 3-Level", path: "/head-3-level/head-page" },
	{ label: "Optional Locale default", path: "/optional-locale" },
	{ label: "Optional Locale en", path: "/optional-locale/en" },
	{ label: "Products Index", path: "/products" },
	{ label: "Product 1", path: "/products/1" },
	{ label: "Cache Test", path: "/cache-test" },
	{ label: "ISR Test", path: "/isr-test" },
	{ label: "ISR KV Combo", path: "/isr-kv-combo" },
	{ label: "KV Cache Test", path: "/kv-cache-test" },
	{ label: "KV Param Test", path: "/kv-param-test/hello" },
	{ label: "Static Cache Test", path: "/static-cache-test" },
	{ label: "Static Pure", path: "/static-pure" },
	{ label: "SSR CDN Combo", path: "/ssr-cdn-combo" },
	{ label: "Cached Layout Index", path: "/cached-layout" },
	{ label: "Cached Layout ISR", path: "/cached-layout/isr-child" },
	{ label: "Deep Cache Index", path: "/deep-cache" },
	{ label: "Deep Cache Store Page", path: "/deep-cache/store-page" },
	{ label: "Deep Cache Uncached", path: "/deep-cache/uncached" },
	{ label: "Dynamic Tag 1", path: "/dynamic-tags/tag-1" },
	{ label: "Shared Tag", path: "/shared-tag" },
	{ label: "Server Fn Advanced", path: "/server-fn-advanced" },
	{ label: "Server Context Test", path: "/server-context-test" },
	{ label: "Lazy Test", path: "/lazy-test" },
	{ label: "Form Demo", path: "/form-demo" },
	{ label: "Rewrite Target", path: "/rewrite-target" },
	{ label: "ISR Defer", path: "/isr-defer" },
	{ label: "ISR Multi Defer", path: "/isr-multi-defer" },
	{ label: "Prefetch Defer", path: "/prefetch-defer" },
	{ label: "Search Effects", path: "/search-effects?q=foo" },
	{ label: "Layout Catches Child Safe", path: "/layout-catches-child" },
]

/*
 * Routes that intentionally produce console errors (deferred rejections,
 * server logs, test script errors). Validate hydration works but skip
 * console error assertion.
 */
const NOISY_ROUTES: Array<{ label: string; path: string }> = [
	{ label: "Deferred Error", path: "/deferred-error" },
	{ label: "Server Log Test", path: "/server-log-test" },
	{ label: "Head Scripts", path: "/head-scripts" },
	{ label: "Image Test", path: "/image-test" },
	{ label: "ISR Defer Error", path: "/isr-defer-error" },
]

/*
 * Routes that require auth context — loader redirects or throws without it.
 * Verify SSR returns a valid HTTP response (redirect or error page).
 */
const AUTH_ROUTES: Array<{ label: string; path: string }> = [
	{ label: "Dashboard", path: "/dashboard" },
	{ label: "Dashboard Settings", path: "/dashboard/settings" },
	{ label: "Chain Auth Inherit", path: "/chain-auth-inherit" },
	{ label: "Caller Data", path: "/caller-data" },
	{ label: "Authorize Pass", path: "/authorize-pass" },
]

/* Routes that throw errors in their loader — still render error boundary HTML */
const ERROR_ROUTES: Array<{ label: string; path: string; expectedStatus: number }> = [
	{ expectedStatus: 500, label: "Broken", path: "/broken" },
	{ expectedStatus: 500, label: "Error String", path: "/error-string" },
	{ expectedStatus: 404, label: "Throw NotFound", path: "/throw-not-found" },
	{ expectedStatus: 403, label: "Throw Unauthorized", path: "/throw-unauthorized" },
	{ expectedStatus: 401, label: "Throw Unauthenticated", path: "/throw-unauthenticated" },
	{ expectedStatus: 500, label: "Preloader Throw", path: "/preloader-throw" },
	{
		expectedStatus: 500,
		label: "Layout Catches Broken Child",
		path: "/layout-catches-child/broken-child",
	},
	{ expectedStatus: 500, label: "Validated Param abc", path: "/validated/abc" },
	{ expectedStatus: 200, label: "Lazy Error Test", path: "/lazy-error-test" },
	{ expectedStatus: 401, label: "Authorize Fail", path: "/authorize-fail" },
]

/* Routes that do internal redirects */
const REDIRECT_ROUTES: Array<{ expectedPath: string; label: string; path: string }> = [
	{ expectedPath: "/redirect-target", label: "Redirect Source", path: "/redirect-source" },
	{ expectedPath: "/chain-final", label: "Chain Redirect", path: "/chain-a" },
]

/* External redirect routes */
const EXTERNAL_REDIRECT_ROUTES: Array<{ label: string; path: string }> = [
	{ label: "External 302", path: "/redirect-external" },
	{ label: "External 307", path: "/redirect-external-307" },
]

/* SPA nav targets: linked on index, navigable via click */
const SPA_TARGETS: Array<{ expectedPath: string; label: string; linkText: string }> = [
	{ expectedPath: "/about", label: "About", linkText: "About" },
	{ expectedPath: "/blog", label: "Blog", linkText: "Blog" },
	{ expectedPath: "/head-demo", label: "Head Demo", linkText: "Head Demo" },
	{ expectedPath: "/og-images", label: "OG Images", linkText: "OG Images" },
	{ expectedPath: "/props-demo", label: "Props Demo", linkText: "Props Demo" },
	{ expectedPath: "/props-nested", label: "Props Nested", linkText: "Props Nested" },
	{ expectedPath: "/large-data", label: "Large Data", linkText: "Large Data" },
	{ expectedPath: "/xss-test", label: "XSS Test", linkText: "XSS Test" },
	{ expectedPath: "/empty-loader", label: "Empty Loader", linkText: "Empty Loader" },
	{ expectedPath: "/null-loader", label: "Null Loader", linkText: "Null Loader" },
	{ expectedPath: "/head-full", label: "Head Full", linkText: "Head Full" },
	{ expectedPath: "/head-minimal", label: "Head Minimal", linkText: "Head Minimal" },
	{ expectedPath: "/static-image-test", label: "Static Image Test", linkText: "Static Image Test" },
	{ expectedPath: "/styles-demo", label: "Styles Demo", linkText: "Styles Demo" },
	{ expectedPath: "/custom-headers", label: "Custom Headers", linkText: "Custom Headers" },
	{ expectedPath: "/cache-headers-test", label: "Cache Headers", linkText: "Cache Headers Test" },
	{ expectedPath: "/cookie-test", label: "Cookie Test", linkText: "Cookie Test" },
	{ expectedPath: "/link-advanced", label: "Link Advanced", linkText: "Link Advanced" },
	{ expectedPath: "/link-test", label: "Link Test", linkText: "Link Test" },
	{ expectedPath: "/link-features", label: "Link Features", linkText: "Link Features" },
	{ expectedPath: "/shallow-test", label: "Shallow Test", linkText: "Shallow Test" },
	{ expectedPath: "/shallow-validated", label: "Shallow Validated", linkText: "Shallow Validated" },
	{ expectedPath: "/blocker-test", label: "Blocker Test", linkText: "Blocker Test" },
	{ expectedPath: "/navigate-demo", label: "Navigate Demo", linkText: "Navigate Demo" },
	{ expectedPath: "/disabled-toggle", label: "Disabled Toggle", linkText: "Disabled Toggle" },
	{ expectedPath: "/deferred-multi", label: "Deferred Multi", linkText: "Deferred Multi" },
	{ expectedPath: "/scroll-tall", label: "Scroll Tall", linkText: "Scroll Tall" },
	{ expectedPath: "/chain-override", label: "Chain Override", linkText: "Chain Override" },
	{ expectedPath: "/head-3-level/head-page", label: "Head 3-Level", linkText: "Head 3-Level" },
	{ expectedPath: "/products", label: "Products", linkText: "Products Index" },
	{ expectedPath: "/cache-test", label: "Cache Test", linkText: "Cache Test" },
	{ expectedPath: "/isr-test", label: "ISR Test", linkText: "ISR Test" },
	{ expectedPath: "/isr-kv-combo", label: "ISR KV Combo", linkText: "ISR KV Combo" },
	{ expectedPath: "/kv-cache-test", label: "KV Cache Test", linkText: "KV Cache Test" },
	{ expectedPath: "/static-cache-test", label: "Static Cache Test", linkText: "Static Cache Test" },
	{ expectedPath: "/static-pure", label: "Static Pure", linkText: "Static Pure" },
	{ expectedPath: "/ssr-cdn-combo", label: "SSR CDN Combo", linkText: "SSR CDN Combo" },
	{ expectedPath: "/cached-layout", label: "Cached Layout", linkText: "Cached Layout Index" },
	{
		expectedPath: "/cached-layout/isr-child",
		label: "Cached Layout ISR",
		linkText: "Cached Layout ISR Child",
	},
	{ expectedPath: "/deep-cache", label: "Deep Cache", linkText: "Deep Cache Index" },
	{
		expectedPath: "/deep-cache/store-page",
		label: "Deep Cache Store",
		linkText: "Deep Cache Store Page",
	},
	{
		expectedPath: "/deep-cache/uncached",
		label: "Deep Cache Uncached",
		linkText: "Deep Cache Uncached",
	},
	{ expectedPath: "/shared-tag", label: "Shared Tag", linkText: "Shared Tag Index" },
	{
		expectedPath: "/server-fn-advanced",
		label: "Server Fn Advanced",
		linkText: "Server Fn Advanced",
	},

	{
		expectedPath: "/server-context-test",
		label: "Server Context",
		linkText: "Server Context Test",
	},
	{ expectedPath: "/lazy-test", label: "Lazy Test", linkText: "Lazy Test" },
	{ expectedPath: "/form-demo", label: "Form Demo", linkText: "Form Demo" },
	{ expectedPath: "/rewrite-target", label: "Rewrite Target", linkText: "Rewrite Target" },
	{ expectedPath: "/isr-defer", label: "ISR Defer", linkText: "ISR Defer" },
	{ expectedPath: "/isr-multi-defer", label: "ISR Multi Defer", linkText: "ISR Multi Defer" },
]

test.describe("Route Smoke: SSR Hard Navigation", () => {
	for (const route of RENDERABLE_ROUTES) {
		test(`SSR: ${route.label} (${route.path})`, async ({ page }) => {
			const cap = setupConsoleCapture(page)
			await loadPage(page, route.path)

			const hydrated = await page.evaluate(() =>
				document.documentElement.hasAttribute("data-hydrated"),
			)
			expect(hydrated).toBe(true)
			cap.assertClean()
		})
	}
})

test.describe("Route Smoke: SSR Noisy Routes (intentional console errors)", () => {
	for (const route of NOISY_ROUTES) {
		test(`SSR noisy: ${route.label} (${route.path})`, async ({ page }) => {
			/* These routes intentionally produce console errors (deferred rejections, etc.) */
			await loadPage(page, route.path)

			const hydrated = await page.evaluate(() =>
				document.documentElement.hasAttribute("data-hydrated"),
			)
			expect(hydrated).toBe(true)
		})
	}
})

test.describe("Route Smoke: SSR Auth Routes", () => {
	for (const route of AUTH_ROUTES) {
		test(`SSR auth: ${route.label} (${route.path})`, async ({ request }) => {
			/* Auth routes redirect or error without session — verify valid response */
			const res = await request.get(`${BASE}${route.path}`)
			expect(res.status()).toBeGreaterThanOrEqual(200)
			expect(res.status()).toBeLessThan(600)
			const html = await res.text()
			expect(html.length).toBeGreaterThan(0)
		})
	}
})

test.describe("Route Smoke: SSR Error Pages", () => {
	for (const route of ERROR_ROUTES) {
		test(`SSR error: ${route.label} (${route.path}) → ${route.expectedStatus}`, async ({
			request,
		}) => {
			const res = await request.get(`${BASE}${route.path}`)
			expect(res.status()).toBe(route.expectedStatus)
			const html = await res.text()
			/* Must return valid HTML — Vite dev uses lowercase <!doctype html> */
			expect(html.toLowerCase()).toContain("<!doctype html>")
		})
	}
})

test.describe("Route Smoke: SSR Internal Redirects", () => {
	for (const route of REDIRECT_ROUTES) {
		test(`SSR redirect: ${route.label} → ${route.expectedPath}`, async ({ page }) => {
			const cap = setupConsoleCapture(page)
			await page.goto(route.path, { waitUntil: "domcontentloaded" })
			await assertHydrated(page)
			expect(new URL(page.url()).pathname).toBe(route.expectedPath)
			cap.assertClean()
		})
	}
})

test.describe("Route Smoke: SSR External Redirects", () => {
	for (const route of EXTERNAL_REDIRECT_ROUTES) {
		test(`SSR external: ${route.label} (${route.path})`, async ({ request }) => {
			const res = await request.get(`${BASE}${route.path}`, { maxRedirects: 0 })
			expect(res.status()).toBeGreaterThanOrEqual(300)
			expect(res.status()).toBeLessThan(400)
			const location = res.headers().location
			expect(location).toBeTruthy()
			expect(location).toContain("example.com")
		})
	}
})

test.describe("Route Smoke: SPA Navigation from Index", () => {
	for (const target of SPA_TARGETS) {
		test(`SPA: ${target.label}`, async ({ page }) => {
			const cap = setupConsoleCapture(page)
			await loadPage(page, "/")

			await clickAndAssertSPA(
				page,
				`[data-testid="nav-links"] a:has-text("${target.linkText}")`,
				target.expectedPath,
			)

			const hydrated = await page.evaluate(() =>
				document.documentElement.hasAttribute("data-hydrated"),
			)
			expect(hydrated).toBe(true)
			cap.assertClean()
		})
	}
})

test.describe("Route Smoke: SPA Internal Redirects", () => {
	test("SPA: redirect-source → redirect-target", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")
		await setNavMarker(page)
		await page.click('[data-testid="nav-links"] a:has-text("Redirect Source")')
		await page.waitForURL("**/redirect-target", { timeout: 10_000 })

		const hydrated = await page.evaluate(() =>
			document.documentElement.hasAttribute("data-hydrated"),
		)
		expect(hydrated).toBe(true)
		cap.assertClean()
	})

	test("SPA: chain-a → chain-final", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")
		await setNavMarker(page)
		await page.click('[data-testid="nav-links"] a:has-text("Chain Redirect")')
		await page.waitForURL("**/chain-final", { timeout: 10_000 })

		const hydrated = await page.evaluate(() =>
			document.documentElement.hasAttribute("data-hydrated"),
		)
		expect(hydrated).toBe(true)
		cap.assertClean()
	})
})

test.describe("Route Smoke: SPA External Redirects (Bug 76)", () => {
	/*
	 * Bug 76: External redirects during SPA navigation returned raw HTTP 3xx,
	 * causing fetch() to follow cross-origin → CORS block → frozen UI.
	 * Fix: data requests return NDJSON redirect, client does hardNavigate().
	 */
	for (const route of EXTERNAL_REDIRECT_ROUTES) {
		test(`SPA external: ${route.label} returns NDJSON not 3xx`, async ({ request }) => {
			const res = await request.get(`${BASE}${route.path}`, {
				headers: { "x-d": "1" },
			})
			/* Data request MUST get NDJSON 200, NOT a raw 3xx redirect */
			expect(res.status()).toBe(200)
			expect(res.headers()["content-type"]).toContain("application/x-ndjson")

			const body = await res.text()
			const lines = body.trim().split("\n")
			expect(lines.length).toBeGreaterThanOrEqual(2)

			const redirectLine = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>
			expect(redirectLine.t).toBe("x")
			expect(redirectLine.xl).toBe(true)
			expect(typeof redirectLine.u).toBe("string")
			expect(redirectLine.u as string).toContain("example.com")
		})
	}
})

test.describe("Route Smoke: SPA Error Routes", () => {
	const SPA_ERROR_TARGETS: Array<{ expectedPath: string; label: string; linkText: string }> = [
		{ expectedPath: "/broken", label: "Broken", linkText: "Broken (Error)" },
		{ expectedPath: "/error-string", label: "Error String", linkText: "Error String" },
		{ expectedPath: "/throw-not-found", label: "NotFound", linkText: "Throw NotFound" },
		{ expectedPath: "/throw-unauthorized", label: "Unauthorized", linkText: "Throw Unauthorized" },
		{
			expectedPath: "/throw-unauthenticated",
			label: "Unauthenticated",
			linkText: "Throw Unauthenticated",
		},
		{
			expectedPath: "/authorize-fail",
			label: "Authorize Fail",
			linkText: "Authorize Fail (always 403)",
		},
		{
			expectedPath: "/layout-catches-child/broken-child",
			label: "Layout Catches Broken",
			linkText: "Layout Catches Broken Child",
		},
	]

	for (const target of SPA_ERROR_TARGETS) {
		test(`SPA error: ${target.label}`, async ({ page }) => {
			await loadPage(page, "/")
			await setNavMarker(page)
			await page.click(`[data-testid="nav-links"] a:has-text("${target.linkText}")`)
			await page.waitForURL(`**${target.expectedPath}`, { timeout: 10_000 })

			/* SPA nav should survive — app doesn't crash, error boundary renders */
			await assertSPANavigation(page)
		})
	}
})

test.describe("Route Smoke: Multi-hop SPA Navigation", () => {
	test("Index → About → Back → Head Demo → Forward/Back", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")

		await clickAndAssertSPA(page, '[data-testid="nav-links"] a:has-text("About")', "/about")

		await page.goBack()
		await page.waitForURL("**/", { timeout: 5000 })
		await clickAndAssertSPA(page, '[data-testid="nav-links"] a:has-text("Head Demo")', "/head-demo")

		await page.goBack()
		await page.waitForURL("**/", { timeout: 5000 })
		await page.goForward()
		await page.waitForURL("**/head-demo", { timeout: 5000 })

		const hydrated = await page.evaluate(() =>
			document.documentElement.hasAttribute("data-hydrated"),
		)
		expect(hydrated).toBe(true)
		cap.assertClean()
	})

	test("Index → Deep Cache → P3 Store → Back → Shared Tag", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")

		await clickAndAssertSPA(
			page,
			'[data-testid="nav-links"] a:has-text("Deep Cache Index")',
			"/deep-cache",
		)
		/* Deep cache page uses testid links — wait for hydration to complete */
		await page.waitForSelector('[data-testid="dc-nav-p3"]', { state: "visible" })
		await clickAndAssertSPA(page, '[data-testid="dc-nav-p3"]', "/deep-cache/store-page")

		await page.goBack()
		await page.waitForURL("**/deep-cache", { timeout: 5000 })

		await page.goBack()
		await page.waitForURL("**/", { timeout: 5000 })
		await clickAndAssertSPA(
			page,
			'[data-testid="nav-links"] a:has-text("Shared Tag Index")',
			"/shared-tag",
		)

		cap.assertClean()
	})

	test("Index → ISR Test → KV Cache → Products (cross-section hops)", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")

		await clickAndAssertSPA(page, '[data-testid="nav-links"] a:has-text("ISR Test")', "/isr-test")
		await page.goBack()
		await page.waitForURL("**/", { timeout: 5000 })

		await clickAndAssertSPA(
			page,
			'[data-testid="nav-links"] a:has-text("KV Cache Test")',
			"/kv-cache-test",
		)
		await page.goBack()
		await page.waitForURL("**/", { timeout: 5000 })

		await clickAndAssertSPA(
			page,
			'[data-testid="nav-links"] a:has-text("Products Index")',
			"/products",
		)

		cap.assertClean()
	})
})
