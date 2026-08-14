import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

/**
 * Production-only accessibility tests.
 *
 * Validates that prod build output maintains a11y properties:
 * - CSP nonces don't break assistive technology
 * - Minified HTML preserves semantic structure
 * - Prerendered pages have proper a11y
 * - No dev overlays interfere with screen readers
 * - Error pages are accessible in prod
 */

test.describe("@prod-only A11y — semantic structure survives build", () => {
	test("prod HTML has lang attribute", async ({ request }) => {
		const res = await request.get("/a11y-test")
		const html = await res.text()

		expect(html).toMatch(/<html[^>]*lang="en"/)
	})

	test("prod HTML has proper heading hierarchy", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const headings = await page.evaluate(() => {
			const els = document.querySelectorAll("h1, h2, h3, h4, h5, h6")
			return Array.from(els).map((el) => ({
				level: Number.parseInt(el.tagName.replace("H", ""), 10),
				text: el.textContent?.trim() ?? "",
			}))
		})

		expect(headings.length).toBeGreaterThan(0)
		const h1s = headings.filter((h) => h.level === 1)
		expect(h1s).toHaveLength(1)
	})

	test("prod HTML has ARIA landmarks", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		await expect(page.locator("header")).toHaveCount(1)
		await expect(page.locator("main")).toHaveCount(1)
		await expect(page.locator("footer[data-testid=a11y-footer]")).toHaveCount(1)
		await expect(page.locator("nav[aria-label]")).toHaveCount(1)
	})

	test("prod form has fieldset/legend structure", async ({ page }) => {
		await loadPage(page, "/a11y-form-test")

		await expect(page.locator("fieldset[data-testid=contact-fieldset]")).toHaveCount(1)
		const legend = page.locator("fieldset[data-testid=contact-fieldset] > legend")
		expect(await legend.textContent()).toBe("Contact Information")
	})

	test("prod form has aria-required on required fields", async ({ page }) => {
		await loadPage(page, "/a11y-form-test")

		const email = page.locator("[data-testid=a11y-email-input]")
		expect(await email.getAttribute("aria-required")).toBe("true")
	})
})

test.describe("@prod-only A11y — no dev artifacts interfering", () => {
	test("no dev overlay elements in DOM", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const devOverlay = await page.locator("[data-flare-dev-overlay]").count()
		expect(devOverlay).toBe(0)

		const devDashboard = await page.locator("#__flare-devtools-host").count()
		expect(devDashboard).toBe(0)
	})

	test("no dev-only ARIA landmarks that confuse screen readers", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		/* in prod, there should be no extra roles from dev tooling */
		const allMains = await page.locator("main").count()
		expect(allMains).toBe(1)
	})

	test("skip link still works in prod", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const skipLink = page.locator("[data-testid=skip-link]")
		expect(await skipLink.getAttribute("href")).toBe("#main-content")
		await expect(page.locator("#main-content")).toHaveCount(1)
	})

	test("keyboard navigation works in prod", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		await page.keyboard.press("Tab")
		const focused = await page.evaluate(
			() =>
				document.activeElement?.getAttribute("data-testid") ??
				document.activeElement?.tagName ??
				"none",
		)
		expect(focused).toBe("skip-link")
	})
})

test.describe("@prod-only A11y — error pages", () => {
	test("404 page has accessible content", async ({ page }) => {
		await page.goto("/nonexistent-a11y-check", { waitUntil: "domcontentloaded" })

		/* should have some text content for screen readers */
		const text = await page.evaluate(() => document.body.textContent?.trim() ?? "")
		expect(text.length).toBeGreaterThan(0)
	})

	test("500 page has accessible content", async ({ page }) => {
		await page.goto("/broken", { waitUntil: "domcontentloaded" })

		const text = await page.evaluate(() => document.body.textContent?.trim() ?? "")
		expect(text.length).toBeGreaterThan(0)
	})

	test("error pages have lang attribute", async ({ request }) => {
		const res404 = await request.get("/nonexistent-a11y-check-2")
		const html404 = await res404.text()
		expect(html404).toMatch(/<html[^>]*lang="/)

		const res500 = await request.get("/broken")
		const html500 = await res500.text()
		expect(html500).toMatch(/<html[^>]*lang="/)
	})
})

test.describe("@prod-only A11y — SPA navigation in prod", () => {
	test("focus management works after prod SPA nav", async ({ page }) => {
		await loadPage(page, "/a11y-test")
		await navigateSPA(page, "/about")

		const focusedTag = await page.evaluate(
			() => document.activeElement?.tagName.toLowerCase() ?? "none",
		)
		expect(["body", "html", "main"]).toContain(focusedTag)
	})

	test("interactive elements work after prod SPA nav", async ({ page }) => {
		await loadPage(page, "/")
		await navigateSPA(page, "/a11y-test")

		const btn = page.locator("[data-testid=toggle-btn]")
		await btn.click()
		expect(await btn.getAttribute("aria-expanded")).toBe("true")
	})

	test("form a11y preserved after prod SPA nav", async ({ page }) => {
		await loadPage(page, "/")
		await navigateSPA(page, "/a11y-form-test")

		const email = page.locator("[data-testid=a11y-email-input]")
		expect(await email.getAttribute("aria-required")).toBe("true")
		expect(await email.getAttribute("aria-describedby")).toContain("email-hint")
	})

	test("no console errors during prod navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")
		await navigateSPA(page, "/a11y-test")
		await navigateSPA(page, "/a11y-form-test")
		await navigateSPA(page, "/about")
		cap.assertClean()
	})
})
