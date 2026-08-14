import { expect, test } from "@playwright/test"
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

/* Full styles() @media emit is not present in the current sx pipeline. */
test.describe.skip("Full CSS: media query", () => {
	test("SSR HTML contains @media rule for media-box", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-full-css`)
		const html = await response.text()
		expect(html).toContain("media-box")
		expect(html).toContain("@media")
		expect(html).toContain("min-width:1px")
	})

	test("media query background applied (min-width: 1px always matches)", async ({ page }) => {
		await loadPage(page, "/styling-full-css")
		const box = page.getByTestId("media-box")
		await expect(box).toBeVisible()

		const bg = await box.evaluate((el) => getComputedStyle(el).backgroundColor)
		expect(bg).toBe("rgb(200, 200, 255)")
	})
})

test.describe("Full CSS: pseudo-selectors", () => {
	test("::before pseudo-element has content", async ({ page }) => {
		await loadPage(page, "/styling-full-css")
		const box = page.getByTestId("pseudo-box")
		await expect(box).toBeVisible()

		const beforeContent = await box.evaluate((el) => getComputedStyle(el, "::before").content)
		expect(beforeContent).toContain(">>")
	})
})

test.describe("Full CSS: keyframes", () => {
	test("keyframe animation-name applied", async ({ page }) => {
		await loadPage(page, "/styling-full-css")
		const box = page.getByTestId("keyframe-box")
		await expect(box).toBeVisible()

		const animName = await box.evaluate((el) => getComputedStyle(el).animationName)
		expect(animName).toContain("spin-test")
	})

	test("SSR HTML contains @keyframes rule", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-full-css`)
		const html = await response.text()
		expect(html).toContain("@keyframes")
		expect(html).toContain("spin-test")
	})
})

test.describe("Full CSS: nested rules", () => {
	test("nested .inner span has correct color", async ({ page }) => {
		await loadPage(page, "/styling-full-css")
		const inner = page.getByTestId("nested-inner")
		await expect(inner).toBeVisible()

		const computed = await inner.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { color: cs.color, fontWeight: cs.fontWeight }
		})
		expect(computed.color).toBe("rgb(128, 0, 128)")
		expect(Number(computed.fontWeight)).toBeGreaterThanOrEqual(700)
	})
})

test.describe("Full CSS: state selectors", () => {
	test("state variant=primary applies correct color", async ({ page }) => {
		await loadPage(page, "/styling-full-css")
		const box = page.getByTestId("state-box")
		await expect(box).toBeVisible()

		const variant = await box.getAttribute("data-variant")
		expect(variant).toBe("primary")

		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 100, 200)")
	})

	test("state size=lg applies correct font-size", async ({ page }) => {
		await loadPage(page, "/styling-full-css")
		const box = page.getByTestId("state-box")

		const size = await box.getAttribute("data-size")
		expect(size).toBe("lg")

		const fontSize = await box.evaluate((el) => getComputedStyle(el).fontSize)
		expect(fontSize).toBe("24px")
	})
})

test.describe("Full CSS: vars + style merge", () => {
	test("vars produce correct computed color and background", async ({ page }) => {
		await loadPage(page, "/styling-full-css")
		const box = page.getByTestId("vars-combo-box")
		await expect(box).toBeVisible()

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { background: cs.backgroundColor, color: cs.color }
		})
		expect(computed.color).toBe("rgb(0, 100, 0)")
		expect(computed.background).toBe("rgb(240, 240, 240)")
	})

	test("style merge applies font-weight alongside vars", async ({ page }) => {
		await loadPage(page, "/styling-full-css")
		const box = page.getByTestId("vars-combo-box")

		const fontWeight = await box.evaluate((el) => getComputedStyle(el).fontWeight)
		expect(fontWeight).toBe("900")
	})
})

test.describe("Full CSS: SPA round-trip", () => {
	test("full CSS styles survive SPA navigation", async ({ page }) => {
		await loadPage(page, "/styling-full-css")
		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styling-full-css")

		const bg = await page
			.getByTestId("media-box")
			.evaluate((el) => getComputedStyle(el).backgroundColor)
		expect(bg).toBe("rgb(200, 200, 255)")

		const color = await page.getByTestId("state-box").evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 100, 200)")
	})
})

test.describe("Full CSS: console clean", () => {
	test("no console errors on full-css page", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-full-css")
		cap.assertClean()
	})
})
