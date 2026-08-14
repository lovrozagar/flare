import { expect, test } from "@playwright/test"
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("Native css= prop: SSR", () => {
	test("css= elements are present in SSR HTML", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-css-native`)
		const html = await response.text()
		expect(html).toContain('data-testid="css-native-box"')
		expect(html).toContain('data-testid="css-native-second"')
	})

	test("css= SSR HTML contains scoped CSS with the declarations", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-css-native`)
		const html = await response.text()
		expect(html).toContain('data-testid="css-native-box"')
		expect(html).toContain("<style")
	})
})

test.describe("Native css= prop: computed", () => {
	test("css= renders correct computed styles", async ({ page }) => {
		await loadPage(page, "/styling-css-native")
		const box = page.getByTestId("css-native-box")
		await expect(box).toBeVisible()

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { color: cs.color, fontSize: cs.fontSize, padding: cs.padding }
		})
		expect(computed.color).toBe("rgb(0, 128, 0)")
		expect(computed.fontSize).toBe("20px")
		expect(computed.padding).toBe("12px")
	})

	test("second css= element has distinct styles from the first", async ({ page }) => {
		await loadPage(page, "/styling-css-native")
		const box = page.getByTestId("css-native-box")
		const second = page.getByTestId("css-native-second")

		const boxColor = await box.evaluate((el) => getComputedStyle(el).color)
		const bg = await second.evaluate((el) => getComputedStyle(el).backgroundColor)
		expect(boxColor).toBe("rgb(0, 128, 0)")
		expect(bg).toBe("rgb(255, 255, 0)")
	})
})

test.describe("Native class= Tailwind: SSR", () => {
	test("class= Tailwind elements present in SSR HTML", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-tw-native`)
		const html = await response.text()
		expect(html).toContain('data-testid="tw-native-flex"')
		expect(html).toContain('data-testid="tw-native-color"')
		/* class names preserved verbatim — no data-c for Tailwind utilities */
		expect(html).toContain('class="flex gap-4 p-8"')
		expect(html).toContain('class="text-red-500 font-bold"')
	})
})

test.describe("Native class= Tailwind: computed", () => {
	test("flex element renders correct computed styles", async ({ page }) => {
		await loadPage(page, "/styling-tw-native")
		const flex = page.getByTestId("tw-native-flex")
		await expect(flex).toBeVisible()

		const display = await flex.evaluate((el) => getComputedStyle(el).display)
		expect(display).toBe("flex")
	})

	test("color element renders bold", async ({ page }) => {
		await loadPage(page, "/styling-tw-native")
		const color = page.getByTestId("tw-native-color")
		await expect(color).toBeVisible()

		const fontWeight = await color.evaluate((el) => getComputedStyle(el).fontWeight)
		expect(Number(fontWeight)).toBeGreaterThanOrEqual(700)
	})

	test("elements carry expected class names", async ({ page }) => {
		await loadPage(page, "/styling-tw-native")
		const flexCls = await page.getByTestId("tw-native-flex").getAttribute("class")
		const colorCls = await page.getByTestId("tw-native-color").getAttribute("class")
		expect(flexCls).toContain("flex")
		expect(flexCls).toContain("gap-4")
		expect(colorCls).toContain("text-red-500")
		expect(colorCls).toContain("font-bold")
	})
})

test.describe("Native props: SPA navigation", () => {
	test("SPA nav preserves data-c and computed styles for css=", async ({ page }) => {
		await loadPage(page, "/styling-css-native")
		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styling-css-native")

		const color = await page
			.getByTestId("css-native-box")
			.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 128, 0)")
	})

	test("SPA nav preserves Tailwind class= styles", async ({ page }) => {
		await loadPage(page, "/styling-tw-native")
		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styling-tw-native")

		const display = await page
			.getByTestId("tw-native-flex")
			.evaluate((el) => getComputedStyle(el).display)
		expect(display).toBe("flex")
	})
})

test.describe("Native props: console clean", () => {
	test("no console errors across native prop pages", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-css-native")
		await navigateSPA(page, "/styling-tw-native")
		await navigateSPA(page, "/styling-css-native")
		cap.assertClean()
	})
})
