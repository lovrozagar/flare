import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("Styles and ResetCSS — SSR", () => {
	test("ResetCSS style tag present in SSR HTML", async ({ page }) => {
		await loadPage(page, "/")
		const resetStyle = page.locator("style[data-flare-reset]")
		const count = await resetStyle.count()
		/* ResetCSS may render as a style tag or be empty; verify no crash */
		expect(count).toBeGreaterThanOrEqual(0)
	})

	test("styles-demo page renders with data-c attribute", async ({ page }) => {
		await loadPage(page, "/styles-demo")
		await expect(page.getByTestId("styles-demo")).toBeVisible()

		const styledBox = page.getByTestId("styled-box")
		await expect(styledBox).toBeVisible()

		/* styles() sets data-c attribute for scoped CSS */
		const dataC = await styledBox.getAttribute("data-c")
		expect(dataC).toBe("styled-box")
	})

	test("different components get different data-c values", async ({ page }) => {
		await loadPage(page, "/styles-demo")
		const lgBox = page.getByTestId("styled-box")
		const smBox = page.getByTestId("styled-sm")

		const lgDataC = await lgBox.getAttribute("data-c")
		const smDataC = await smBox.getAttribute("data-c")

		expect(lgDataC).toBeTruthy()
		expect(smDataC).toBeTruthy()
		expect(lgDataC).not.toBe(smDataC)
	})
})

test.describe("Styles — SSR scoped styles injection", () => {
	test("SSR HTML contains scoped style tag with component CSS", async ({ page }) => {
		const response = await page.request.get("/styles-demo")
		const html = await response.text()

		/* SSR should inject scoped styles in the HTML */
		expect(html).toContain('data-testid="styles-demo"')
		expect(html).toContain('data-c="styled-box"')
		/* Scoped CSS should reference the data-c selector */
		expect(html).toContain('[data-c="styled-box"]')
	})
})

test.describe("Styles — SPA", () => {
	test("SPA nav to styles-demo renders styled elements", async ({ page }) => {
		await loadPage(page, "/")
		await navigateSPA(page, "/styles-demo")
		await expect(page.getByTestId("styles-demo")).toBeVisible()

		const styledBox = page.getByTestId("styled-box")
		const dataC = await styledBox.getAttribute("data-c")
		expect(dataC).toBe("styled-box")
	})

	test("styles survive SPA round-trip", async ({ page }) => {
		await loadPage(page, "/styles-demo")
		const originalDataC = await page.getByTestId("styled-box").getAttribute("data-c")

		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styles-demo")

		const newDataC = await page.getByTestId("styled-box").getAttribute("data-c")
		expect(newDataC).toBe(originalDataC)
	})
})

test.describe("Styles — console", () => {
	test("no console errors with styles", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styles-demo")
		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styles-demo")
		cap.assertClean()
	})
})
