import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("Deep: forward SPA nav scroll to top", () => {
	test("SPA nav from scrolled position to new page starts at top", async ({ page }) => {
		await loadPage(page, "/scroll-tall")
		await page.evaluate(() => window.scrollTo(0, 800))
		await page.waitForTimeout(200)
		const scrollBefore = await page.evaluate(() => window.scrollY)
		if (scrollBefore < 100) return /* viewport too small */

		await navigateSPA(page, "/about")
		await page.waitForTimeout(300)
		expect(await page.evaluate(() => window.scrollY)).toBe(0)
	})

	test("forward SPA nav scrolls to top from tall page", async ({ page }) => {
		await loadPage(page, "/scroll-tall")
		await page.evaluate(() => window.scrollTo(0, 1500))
		await page.waitForTimeout(200)

		await navigateSPA(page, "/")
		await page.waitForTimeout(300)
		expect(await page.evaluate(() => window.scrollY)).toBe(0)
	})
})

test.describe("Deep: hash navigation", () => {
	test("hash nav calls scrollIntoView on existing element", async ({ page }) => {
		await loadPage(page, "/scroll-tall")

		/* Override prototype-level scrollIntoView to capture calls */
		const scrolled = await page.evaluate(() => {
			return new Promise<boolean>((resolve) => {
				const origScrollIntoView = Element.prototype.scrollIntoView
				Element.prototype.scrollIntoView = function (this: Element) {
					if (this.id === "section-50") {
						Element.prototype.scrollIntoView = origScrollIntoView
						resolve(true)
					} else {
						origScrollIntoView.call(this)
					}
				}

				const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
					| ((to: string) => Promise<void>)
					| undefined
				if (nav) {
					nav("/scroll-tall#section-50")
				} else {
					resolve(false)
				}
			})
		})
		expect(scrolled).toBe(true)
	})

	test("hash nav to nonexistent ID does not crash", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/scroll-tall")

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (nav) return nav("/scroll-tall#nonexistent-id-xyz")
		})
		await page.waitForTimeout(500)
		await expect(page.locator("[data-testid=scroll-tall-page]")).toBeVisible()
		cap.assertClean()
	})

	test("multiple hash navs to different targets work", async ({ page }) => {
		await loadPage(page, "/scroll-tall")

		const count = await page.evaluate(() => {
			return new Promise<number>((resolve) => {
				let callCount = 0
				const origScrollIntoView = Element.prototype.scrollIntoView
				Element.prototype.scrollIntoView = function (this: Element) {
					if (this.id === "section-50" || this.id === "section-90") {
						callCount++
						if (callCount >= 2) {
							Element.prototype.scrollIntoView = origScrollIntoView
							resolve(callCount)
						}
					} else {
						origScrollIntoView.call(this)
					}
				}

				const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
					| ((to: string) => Promise<void>)
					| undefined
				if (nav) {
					nav("/scroll-tall#section-50").then(() => nav("/scroll-tall#section-90"))
				} else {
					resolve(0)
				}
			})
		})
		expect(count).toBe(2)
	})

	test("hash nav after SPA nav works", async ({ page }) => {
		await loadPage(page, "/")
		await navigateSPA(page, "/scroll-tall")

		const scrolled = await page.evaluate(() => {
			return new Promise<boolean>((resolve) => {
				const origScrollIntoView = Element.prototype.scrollIntoView
				Element.prototype.scrollIntoView = function (this: Element) {
					if (this.id === "section-50") {
						Element.prototype.scrollIntoView = origScrollIntoView
						resolve(true)
					} else {
						origScrollIntoView.call(this)
					}
				}

				const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
					| ((to: string) => Promise<void>)
					| undefined
				if (nav) {
					nav("/scroll-tall#section-50")
				} else {
					resolve(false)
				}
			})
		})
		expect(scrolled).toBe(true)
	})
})

test.describe("Deep: scroll console clean", () => {
	test("no console errors during scroll operations", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/scroll-tall")
		await page.evaluate(() => window.scrollTo(0, 500))
		await page.waitForTimeout(200)
		await navigateSPA(page, "/about")
		await page.waitForTimeout(200)
		cap.assertClean()
	})
})
