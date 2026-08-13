import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

/**
 * Coverage for routes that had zero test references.
 *
 * - /fonts-category-test — serif/mono/sans font categories
 * - /fonts-cls-serif-test — CLS measurement with serif fallback metrics
 * - /fonts-cls-mono-test — CLS measurement with mono fallback metrics
 * - /error-test — loader error with error boundary
 * - /styling-nav-stress — 5 scoped styles on one page
 * - /styling-responsive — media query breakpoints
 * - /sitemap.xml — XML response route
 */

test.describe("Route coverage — font categories", () => {
	test("font category page renders all three families", async ({ page }) => {
		await loadPage(page, "/fonts-category-test")

		await expect(page.locator("[data-testid=category-test]")).toBeVisible()
		await expect(page.locator("[data-testid=serif-text]")).toBeVisible()
		await expect(page.locator("[data-testid=mono-text]")).toBeVisible()
		await expect(page.locator("[data-testid=sans-text]")).toBeVisible()
	})

	test("font families include category fallbacks", async ({ page }) => {
		await loadPage(page, "/fonts-category-test")

		const serifFamily = await page.locator("[data-testid=serif-family]").textContent()
		const monoFamily = await page.locator("[data-testid=mono-family]").textContent()
		const sansFamily = await page.locator("[data-testid=sans-family]").textContent()

		expect(serifFamily).toContain("serif")
		expect(monoFamily).toContain("monospace")
		expect(sansFamily).toContain("sans-serif")
	})

	test("font category page has FontCSS style tags in SSR", async ({ request }) => {
		const res = await request.get("/fonts-category-test")
		const html = await res.text()

		expect(html).toContain("@font-face")
		expect(html).toContain("Category Test Serif")
		expect(html).toContain("Category Test Mono")
		expect(html).toContain("Category Test Sans")
	})

	test("page hydrates without page errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/fonts-category-test")

		/* font files are test placeholders that 404 — only check for page crashes */
		expect(cap.pageErrors).toEqual([])
	})
})

test.describe("Route coverage — font CLS serif", () => {
	test("serif CLS page renders both variants", async ({ page }) => {
		await loadPage(page, "/fonts-cls-serif-test")

		await expect(page.locator("[data-testid=cls-serif-test]")).toBeVisible()
		await expect(page.locator("[data-testid=serif-with-fallback]")).toBeVisible()
		await expect(page.locator("[data-testid=serif-without-fallback]")).toBeVisible()
	})

	test("serif fallback metrics produce @font-face with size-adjust", async ({ request }) => {
		const res = await request.get("/fonts-cls-serif-test")
		const html = await res.text()

		expect(html).toContain("@font-face")
		expect(html).toContain("Lora CLS Test")
		expect(html).toContain("size-adjust")
	})

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/fonts-cls-serif-test")
		cap.assertClean()
	})
})

test.describe("Route coverage — font CLS mono", () => {
	test("mono CLS page renders both variants", async ({ page }) => {
		await loadPage(page, "/fonts-cls-mono-test")

		await expect(page.locator("[data-testid=cls-mono-test]")).toBeVisible()
		await expect(page.locator("[data-testid=mono-with-fallback]")).toBeVisible()
		await expect(page.locator("[data-testid=mono-without-fallback]")).toBeVisible()
	})

	test("mono fallback metrics produce @font-face with size-adjust", async ({ request }) => {
		const res = await request.get("/fonts-cls-mono-test")
		const html = await res.text()

		expect(html).toContain("@font-face")
		expect(html).toContain("Fira Code CLS Test")
		expect(html).toContain("size-adjust")
	})

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/fonts-cls-mono-test")
		cap.assertClean()
	})
})

test.describe("Route coverage — error-test", () => {
	test("renders normally without error param", async ({ page }) => {
		await loadPage(page, "/error-test")

		await expect(page.locator("[data-testid=error-test]")).toBeVisible()
		expect(await page.locator("[data-testid=error-test]").textContent()).toBe("No error")
	})

	test("error boundary catches loader error", async ({ page }) => {
		await page.goto("/error-test?fail=true", { waitUntil: "domcontentloaded" })

		await expect(page.locator("[data-testid=error-test-boundary]")).toBeVisible()
		const msg = await page.locator("[data-testid=error-test-message]").textContent()
		expect(msg).toBe("Intentional loader error")
	})

	test("error boundary shows in SSR HTML", async ({ request }) => {
		const res = await request.get("/error-test?fail=true")
		const html = await res.text()

		expect(html).toContain("error-test-boundary")
		expect(html).toContain("Intentional loader error")
	})
})

test.describe("Route coverage — styling-nav-stress", () => {
	test("all 5 styled elements render", async ({ page }) => {
		await loadPage(page, "/styling-nav-stress")

		await expect(page.locator("[data-testid=styling-nav-stress]")).toBeVisible()
		await expect(page.locator("[data-testid=stress-header]")).toBeVisible()
		await expect(page.locator("[data-testid=stress-body]")).toBeVisible()
		await expect(page.locator("[data-testid=stress-footer]")).toBeVisible()
		await expect(page.locator("[data-testid=stress-sidebar]")).toBeVisible()
		await expect(page.locator("[data-testid=stress-badge]")).toBeVisible()
	})

	test("scoped styles apply correct colors", async ({ page }) => {
		await loadPage(page, "/styling-nav-stress")

		const headerColor = await page
			.locator("[data-testid=stress-header]")
			.evaluate((el) => getComputedStyle(el).color)
		expect(headerColor).toBe("rgb(255, 0, 0)")

		const bodyColor = await page
			.locator("[data-testid=stress-body]")
			.evaluate((el) => getComputedStyle(el).color)
		expect(bodyColor).toBe("rgb(0, 128, 0)")

		const footerColor = await page
			.locator("[data-testid=stress-footer]")
			.evaluate((el) => getComputedStyle(el).color)
		expect(footerColor).toBe("rgb(0, 0, 255)")
	})

	test("styles survive SPA navigation", async ({ page }) => {
		await loadPage(page, "/")
		await navigateSPA(page, "/styling-nav-stress")

		const headerColor = await page
			.locator("[data-testid=stress-header]")
			.evaluate((el) => getComputedStyle(el).color)
		expect(headerColor).toBe("rgb(255, 0, 0)")
	})

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-nav-stress")
		cap.assertClean()
	})
})

test.describe("Route coverage — styling-responsive", () => {
	test("responsive page renders", async ({ page }) => {
		await loadPage(page, "/styling-responsive")

		await expect(page.locator("[data-testid=styling-responsive]")).toBeVisible()
		await expect(page.locator("[data-testid=responsive-box]")).toBeVisible()
		await expect(page.locator("[data-testid=multi-breakpoint]")).toBeVisible()
	})

	test("responsive styles apply at desktop width", async ({ page }) => {
		/* ensure desktop-class viewport for this test */
		await page.setViewportSize({ height: 720, width: 1280 })
		await loadPage(page, "/styling-responsive")

		const bgColor = await page
			.locator("[data-testid=responsive-box]")
			.evaluate((el) => getComputedStyle(el).backgroundColor)
		/* above 800px → blue */
		expect(bgColor).toBe("rgb(0, 0, 255)")
	})

	test("responsive styles apply at narrow width", async ({ page }) => {
		await page.setViewportSize({ height: 720, width: 400 })
		await loadPage(page, "/styling-responsive")

		const bgColor = await page
			.locator("[data-testid=responsive-box]")
			.evaluate((el) => getComputedStyle(el).backgroundColor)
		/* below 800px → red */
		expect(bgColor).toBe("rgb(255, 0, 0)")
	})

	test("multi-breakpoint font sizes change with viewport", async ({ page }) => {
		/* narrow: 14px */
		await page.setViewportSize({ height: 720, width: 400 })
		await loadPage(page, "/styling-responsive")

		const narrowSize = await page
			.locator("[data-testid=multi-breakpoint]")
			.evaluate((el) => getComputedStyle(el).fontSize)
		expect(narrowSize).toBe("14px")

		/* medium: 18px */
		await page.setViewportSize({ height: 720, width: 700 })
		await page.waitForTimeout(100)
		const medSize = await page
			.locator("[data-testid=multi-breakpoint]")
			.evaluate((el) => getComputedStyle(el).fontSize)
		expect(medSize).toBe("18px")

		/* wide: 24px */
		await page.setViewportSize({ height: 720, width: 1100 })
		await page.waitForTimeout(100)
		const wideSize = await page
			.locator("[data-testid=multi-breakpoint]")
			.evaluate((el) => getComputedStyle(el).fontSize)
		expect(wideSize).toBe("24px")
	})

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-responsive")
		cap.assertClean()
	})
})

test.describe("Route coverage — sitemap.xml", () => {
	test("returns valid XML with correct content-type", async ({ request }) => {
		const res = await request.get("/sitemap.xml")

		expect(res.status()).toBe(200)
		const contentType = res.headers()["content-type"]
		expect(contentType).toContain("application/xml")
	})

	test("XML contains required sitemap structure", async ({ request }) => {
		const res = await request.get("/sitemap.xml")
		const xml = await res.text()

		expect(xml).toContain('<?xml version="1.0"')
		expect(xml).toContain("<urlset")
		expect(xml).toContain("sitemaps.org/schemas/sitemap")
		expect(xml).toContain("<url>")
		expect(xml).toContain("<loc>")
	})

	test("XML contains expected URLs", async ({ request }) => {
		const res = await request.get("/sitemap.xml")
		const xml = await res.text()

		expect(xml).toContain("https://example.com/")
		expect(xml).toContain("https://example.com/about")
	})
})
