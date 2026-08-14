import { expect, test } from "@playwright/test"
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("Head CSS: SSR", () => {
	test("head.css produces link tag in SSR HTML", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-head-css`)
		const html = await response.text()
		expect(html).toContain('rel="stylesheet"')
		expect(html).toContain('href="/test-styles.css"')
	})
})

test.describe("Head CSS: loaded", () => {
	test("head.css stylesheet applies computed border", async ({ page }) => {
		await loadPage(page, "/styling-head-css")
		const box = page.getByTestId("head-css-box")
		await expect(box).toBeVisible()

		const border = await box.evaluate((el) => getComputedStyle(el).border)
		expect(border).toContain("2px")
		expect(border).toContain("solid")
	})
})

test.describe("Head CSS: SPA nav add", () => {
	test("navigating to head.css page adds stylesheet link", async ({ page }) => {
		await loadPage(page, "/")
		/* Home has no test-styles.css */
		const beforeCount = await page.evaluate(
			() => document.querySelectorAll('link[href="/test-styles.css"]').length,
		)
		expect(beforeCount).toBe(0)

		await navigateSPA(page, "/styling-head-css")
		const afterCount = await page.evaluate(
			() => document.querySelectorAll('link[href="/test-styles.css"]').length,
		)
		expect(afterCount).toBe(1)
	})
})

test.describe("Head CSS: SPA nav remove", () => {
	test("navigating away from head.css page removes stylesheet link", async ({ page }) => {
		await loadPage(page, "/styling-head-css")
		const linkCount = await page.evaluate(
			() => document.querySelectorAll('link[href="/test-styles.css"]').length,
		)
		expect(linkCount).toBe(1)

		await navigateSPA(page, "/about")
		const afterCount = await page.evaluate(
			() => document.querySelectorAll('link[href="/test-styles.css"]').length,
		)
		expect(afterCount).toBe(0)
	})
})

test.describe("Head CSS: layout persistence", () => {
	test("layout CSS persists across child navigations", async ({ page }) => {
		await loadPage(page, "/styling-child-a")
		await expect(page.getByTestId("shared-layout")).toBeVisible()
		await expect(page.getByTestId("child-a")).toBeVisible()

		/* Layout CSS present */
		const layoutCssBefore = await page.evaluate(
			() => document.querySelectorAll('link[href="/shared-layout.css"]').length,
		)
		expect(layoutCssBefore).toBe(1)

		/* child-b CSS not present yet */
		const childBCssBefore = await page.evaluate(
			() => document.querySelectorAll('link[href="/child-b-only.css"]').length,
		)
		expect(childBCssBefore).toBe(0)

		/* Nav to child-b */
		await navigateSPA(page, "/styling-child-b")
		await expect(page.getByTestId("child-b")).toBeVisible()

		/* Layout CSS still present */
		const layoutCssAfter = await page.evaluate(
			() => document.querySelectorAll('link[href="/shared-layout.css"]').length,
		)
		expect(layoutCssAfter).toBe(1)

		/* child-b CSS added */
		const childBCssAfter = await page.evaluate(
			() => document.querySelectorAll('link[href="/child-b-only.css"]').length,
		)
		expect(childBCssAfter).toBe(1)

		/* Nav back to child-a */
		await navigateSPA(page, "/styling-child-a")
		await expect(page.getByTestId("child-a")).toBeVisible()

		/* Layout CSS still present */
		const layoutCssFinal = await page.evaluate(
			() => document.querySelectorAll('link[href="/shared-layout.css"]').length,
		)
		expect(layoutCssFinal).toBe(1)

		/* child-b CSS removed */
		const childBCssFinal = await page.evaluate(
			() => document.querySelectorAll('link[href="/child-b-only.css"]').length,
		)
		expect(childBCssFinal).toBe(0)
	})
})

test.describe("Head CSS: custom.styles SSR", () => {
	test("custom.styles rendered in SSR HTML", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-combo`)
		const html = await response.text()
		expect(html).toContain(".custom-inline")
		expect(html).toContain("opacity")
	})
})

test.describe("Head CSS: custom.styles applied", () => {
	test("custom.styles computed opacity", async ({ page }) => {
		await loadPage(page, "/styling-combo")
		const el = page.getByTestId("combo-inline")
		await expect(el).toBeVisible()

		const opacity = await el.evaluate((e) => getComputedStyle(e).opacity)
		expect(opacity).toBe("0.9")
	})
})

test.describe("Head CSS: custom.styles cleanup", () => {
	test("custom.styles removed after navigating away", async ({ page }) => {
		await loadPage(page, "/styling-combo")
		const stylesBefore = await page.evaluate(
			() => document.querySelectorAll("style[data-flare-route]").length,
		)
		expect(stylesBefore).toBeGreaterThan(0)

		await navigateSPA(page, "/about")
		const stylesAfter = await page.evaluate(
			() => document.querySelectorAll("style[data-flare-route]").length,
		)
		expect(stylesAfter).toBe(0)
	})
})

test.describe("Head CSS: no FOUC", () => {
	test("stylesheet link present in SSR HTML before hydration", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-head-css`)
		const html = await response.text()
		/* Link tag appears before the body content — ensures no FOUC */
		const linkIdx = html.indexOf('href="/test-styles.css"')
		const bodyIdx = html.indexOf('data-testid="head-css-box"')
		expect(linkIdx).toBeGreaterThan(-1)
		expect(bodyIdx).toBeGreaterThan(-1)
		expect(linkIdx).toBeLessThan(bodyIdx)
	})
})

test.describe("Head CSS: console clean", () => {
	test("no console errors across head CSS pages", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-head-css")
		await navigateSPA(page, "/styling-child-a")
		await navigateSPA(page, "/styling-child-b")
		await navigateSPA(page, "/styling-combo")
		await navigateSPA(page, "/about")
		cap.assertClean()
	})
})
