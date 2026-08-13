import { expect, test } from "@playwright/test"
import { loadPage, setNavMarker, setupConsoleCapture } from "./helpers"

test.describe("Download link behavior", () => {
	test("<Link download> click does NOT SPA-navigate", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/download-test")
		await setNavMarker(page)

		/* Intercept to prevent actual download */
		await page.evaluate(() => {
			window.addEventListener(
				"click",
				(e) => {
					const target = e.target as HTMLElement
					if (target.closest("[data-testid=link-download]")) {
						e.preventDefault()
					}
				},
				true,
			)
		})

		await page.click("[data-testid=link-download]")
		await page.waitForTimeout(300)

		/* URL should stay on /download-test — no SPA navigation happened */
		expect(page.url()).toContain("/download-test")

		/* Marker should survive — no full-page reload */
		const markerSurvived = await page.evaluate(
			() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ === "number",
		)
		expect(markerSurvived).toBe(true)

		cap.assertClean()
	})

	test("<a download> click does NOT SPA-navigate", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/download-test")
		await setNavMarker(page)

		/* Intercept to prevent actual download */
		await page.evaluate(() => {
			window.addEventListener(
				"click",
				(e) => {
					const target = e.target as HTMLElement
					if (target.closest("[data-testid=anchor-download]")) {
						e.preventDefault()
					}
				},
				true,
			)
		})

		await page.click("[data-testid=anchor-download]")
		await page.waitForTimeout(300)

		expect(page.url()).toContain("/download-test")
		cap.assertClean()
	})

	test("<Link> without download SPA-navigates normally", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/download-test")
		await setNavMarker(page)

		await page.click("[data-testid=link-normal]")
		await page.waitForURL("**/about", { timeout: 10_000 })

		/* Marker survives = SPA navigation (not full reload) */
		const markerSurvived = await page.evaluate(
			() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ === "number",
		)
		expect(markerSurvived).toBe(true)

		cap.assertClean()
	})

	test("external <a> click is NOT intercepted", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/download-test")

		/* Intercept to prevent actual external nav */
		await page.evaluate(() => {
			window.addEventListener(
				"click",
				(e) => {
					const target = e.target as HTMLElement
					if (target.closest("[data-testid=anchor-external]")) {
						e.preventDefault()
					}
				},
				true,
			)
		})

		const urlBefore = page.url()
		await page.click("[data-testid=anchor-external]")
		await page.waitForTimeout(300)

		expect(page.url()).toContain("/download-test")
		cap.assertClean()
	})

	test("no console errors on download-test page", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/download-test")
		cap.assertClean()
	})
})
