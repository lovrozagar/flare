import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA } from "./helpers"

test.describe("font system — dynamic selection", () => {
	test("only selected fonts CSS ships in SSR HTML", async ({ page }) => {
		await loadPage(page, "/fonts-dynamic?heading=beta&body=alpha")

		const html = await page.content()

		/* selected fonts present */
		expect(html).toContain("Alpha Sans")
		expect(html).toContain("Beta Serif")

		/* unselected font absent */
		expect(html).not.toContain("Gamma Mono")
	})

	test("different query params produce different font CSS", async ({ page }) => {
		await loadPage(page, "/fonts-dynamic?heading=gamma&body=gamma")

		const html = await page.content()

		/* only gamma present */
		expect(html).toContain("Gamma Mono")
		expect(html).not.toContain("Alpha Sans")
		expect(html).not.toContain("Beta Serif")
	})

	test("heading and body font families rendered correctly", async ({ page }) => {
		await loadPage(page, "/fonts-dynamic?heading=beta&body=alpha")

		const heading = await page.getByTestId("heading-family").textContent()
		const body = await page.getByTestId("body-family").textContent()

		expect(heading).toContain("Beta Serif")
		expect(heading).toContain("serif")
		expect(body).toContain("Alpha Sans")
		expect(body).toContain("sans-serif")
	})

	test("same font for heading+body renders single FontCSS", async ({ page }) => {
		await loadPage(page, "/fonts-dynamic?heading=alpha&body=alpha")

		const html = await page.content()

		/* count @font-face blocks for Alpha Sans — should be exactly 1 set */
		const matches = html.match(/font-family: "Alpha Sans"/g)
		expect(matches?.length).toBe(1)

		/* no other fonts */
		expect(html).not.toContain("Beta Serif")
		expect(html).not.toContain("Gamma Mono")
	})

	test("SPA navigation updates fonts dynamically", async ({ page }) => {
		await loadPage(page, "/fonts-dynamic?heading=alpha&body=alpha")
		const initial = await page.content()
		expect(initial).toContain("Alpha Sans")
		expect(initial).not.toContain("Beta Serif")

		await navigateSPA(page, "/fonts-dynamic?heading=beta&body=beta")
		const updated = await page.getByTestId("heading-family").textContent()
		expect(updated).toContain("Beta Serif")
	})
})

test.describe("font system — SSR", () => {
	test("SSR HTML contains @font-face style tag", async ({ page }) => {
		await loadPage(page, "/fonts-test")
		const style = page.locator("style")
		const count = await style.count()
		let found = false
		for (let i = 0; i < count; i++) {
			const content = await style.nth(i).innerHTML()
			if (content.includes("Test Font") && content.includes("@font-face")) {
				found = true
				break
			}
		}
		expect(found).toBe(true)
	})

	test("SSR HTML contains preload link for font", async ({ page }) => {
		await loadPage(page, "/fonts-test")
		const preload = page.locator('link[rel="preload"][as="font"]')
		await expect(preload).toHaveCount(1)
		await expect(preload).toHaveAttribute("href", "/fonts/test-font.woff2")
		await expect(preload).toHaveAttribute("type", "font/woff2")
	})

	test("font-family CSS value rendered correctly", async ({ page }) => {
		await loadPage(page, "/fonts-test")
		const el = page.getByTestId("font-family")
		const text = await el.textContent()
		expect(text).toContain("Test Font")
		expect(text).toContain("Test Font Fallback")
		expect(text).toContain("sans-serif")
	})

	test("fallback @font-face included in CSS", async ({ page }) => {
		await loadPage(page, "/fonts-test")
		const styles = page.locator("style")
		const count = await styles.count()
		let hasFallback = false
		for (let i = 0; i < count; i++) {
			const content = await styles.nth(i).innerHTML()
			if (content.includes("Test Font Fallback") && content.includes("size-adjust")) {
				hasFallback = true
				break
			}
		}
		expect(hasFallback).toBe(true)
	})

	test("no hydration warnings", async ({ page }) => {
		const errors: string[] = []
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				errors.push(msg.text())
			}
		})
		await loadPage(page, "/fonts-test")
		const hydrationErrors = errors.filter((e) => e.includes("hydrat") || e.includes("mismatch"))
		expect(hydrationErrors).toHaveLength(0)
	})
})

test.describe("font system — zero CLS", () => {
	test("font with fallback metrics produces zero CLS", async ({ page }) => {
		/* inject CLS observer before page loads */
		await page.addInitScript(() => {
			;(window as unknown as Record<string, number[]>).__cls_entries = []
			const observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					const le = entry as PerformanceEntry & { hadRecentInput: boolean; value: number }
					if (!le.hadRecentInput) {
						;(window as unknown as Record<string, number[]>).__cls_entries.push(le.value)
					}
				}
			})
			try {
				observer.observe({ buffered: true, type: "layout-shift" })
			} catch {
				/* layout-shift not supported (Firefox/WebKit) — CLS entries stay empty */
			}
		})

		await page.goto("/fonts-cls-test", { waitUntil: "networkidle" })

		/* wait for all fonts to finish loading (loaded or failed) */
		await page.evaluate(() => document.fonts.ready)

		/* extra settle time for any remaining layout shifts */
		await page.waitForTimeout(1000)

		const clsEntries = await page.evaluate(
			() => (window as unknown as Record<string, number[]>).__cls_entries,
		)

		const totalCls = clsEntries.reduce((sum, v) => sum + v, 0)

		/**
		 * With correct fallback metrics, CLS should be 0 or negligible.
		 * Allow a tiny epsilon for subpixel rounding (0.005).
		 * Without metrics, CLS would typically be 0.05-0.15+.
		 */
		expect(totalCls).toBeLessThan(0.005)
	})

	test("SSR renders fallback @font-face with correct metrics in CLS test page", async ({
		page,
	}) => {
		await page.goto("/fonts-cls-test", { waitUntil: "domcontentloaded" })

		const html = await page.content()

		/* fallback font-face present with metrics */
		expect(html).toContain('font-family: "Inter CLS Test Fallback"')
		expect(html).toContain("size-adjust: 95.04%")
		expect(html).toContain("ascent-override: 101.93%")
		expect(html).toContain("descent-override: 25.38%")
		expect(html).toContain('src: local("Arial")')
	})
})

test.describe("font system — SPA navigation", () => {
	test("fonts persist after SPA navigation", async ({ page }) => {
		await loadPage(page, "/")
		await navigateSPA(page, "/fonts-test")
		const el = page.getByTestId("font-family")
		await expect(el).toBeVisible()
		const text = await el.textContent()
		expect(text).toContain("Test Font")
	})
})
