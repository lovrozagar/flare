import { expect, test } from "@playwright/test"
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("Interactive styles: active toggle", () => {
	test("initial state is gray, toggles to green on click", async ({ page }) => {
		await loadPage(page, "/styling-interactive")
		const box = page.getByTestId("active-box")

		const initialColor = await box.evaluate((el) => getComputedStyle(el).color)
		expect(initialColor).toBe("rgb(128, 128, 128)")

		const initialAttr = await box.getAttribute("data-active")
		expect(initialAttr).toBe("false")

		await page.getByTestId("toggle-active").click()

		const activeColor = await box.evaluate((el) => getComputedStyle(el).color)
		expect(activeColor).toBe("rgb(0, 128, 0)")

		const activeAttr = await box.getAttribute("data-active")
		expect(activeAttr).toBe("true")
	})

	test("double toggle returns to initial gray", async ({ page }) => {
		await loadPage(page, "/styling-interactive")
		const box = page.getByTestId("active-box")
		const btn = page.getByTestId("toggle-active")

		await btn.click()
		await btn.click()

		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(128, 128, 128)")

		const attr = await box.getAttribute("data-active")
		expect(attr).toBe("false")
	})
})

test.describe("Interactive styles: variant switch", () => {
	test("variant toggles between a (red) and b (blue)", async ({ page }) => {
		await loadPage(page, "/styling-interactive")
		const box = page.getByTestId("variant-box")

		const initialColor = await box.evaluate((el) => getComputedStyle(el).color)
		expect(initialColor).toBe("rgb(255, 0, 0)")
		expect(await box.getAttribute("data-variant")).toBe("a")

		await page.getByTestId("toggle-variant").click()

		const newColor = await box.evaluate((el) => getComputedStyle(el).color)
		expect(newColor).toBe("rgb(0, 0, 255)")
		expect(await box.getAttribute("data-variant")).toBe("b")
	})
})

test.describe("Interactive styles: SSR initial state", () => {
	test("SSR HTML has data-active=false", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-interactive`)
		const html = await response.text()
		expect(html).toContain('data-active="false"')
		expect(html).toContain('data-variant="a"')
	})
})

test.describe("Interactive styles: rapid toggle", () => {
	test("10 rapid toggles end at correct state", async ({ page }) => {
		await loadPage(page, "/styling-interactive")
		const btn = page.getByTestId("toggle-active")
		const box = page.getByTestId("active-box")

		for (let i = 0; i < 10; i++) {
			await btn.click()
		}

		/* 10 toggles = even = back to false */
		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(128, 128, 128)")
		expect(await box.getAttribute("data-active")).toBe("false")
	})
})

test.describe("Interactive styles: SPA round-trip", () => {
	test("toggled state resets after SPA nav away and back", async ({ page }) => {
		await loadPage(page, "/styling-interactive")
		await page.getByTestId("toggle-active").click()

		const activeColor = await page
			.getByTestId("active-box")
			.evaluate((el) => getComputedStyle(el).color)
		expect(activeColor).toBe("rgb(0, 128, 0)")

		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styling-interactive")

		/* fresh component = initial state */
		const resetColor = await page
			.getByTestId("active-box")
			.evaluate((el) => getComputedStyle(el).color)
		expect(resetColor).toBe("rgb(128, 128, 128)")
	})
})

test.describe("Interactive styles: console clean", () => {
	test("no console errors on interactive page", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-interactive")
		await page.getByTestId("toggle-active").click()
		await page.getByTestId("toggle-variant").click()
		cap.assertClean()
	})
})
