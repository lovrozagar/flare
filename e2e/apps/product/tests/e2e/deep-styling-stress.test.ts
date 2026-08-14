import { expect, test } from "@playwright/test"
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("Stress: mass boxes", () => {
	test("20 boxes all have unique data-c values", async ({ page }) => {
		await loadPage(page, "/styling-stress")

		const dataCValues = new Set<string>()
		for (let i = 0; i < 20; i++) {
			const val = await page.getByTestId(`stress-box-${i}`).getAttribute("data-c")
			expect(val).toBeTruthy()
			dataCValues.add(val as string)
		}
		expect(dataCValues.size).toBe(20)
	})

	test("first and last box have different computed colors", async ({ page }) => {
		await loadPage(page, "/styling-stress")

		const color0 = await page
			.getByTestId("stress-box-0")
			.evaluate((el) => getComputedStyle(el).color)
		const color19 = await page
			.getByTestId("stress-box-19")
			.evaluate((el) => getComputedStyle(el).color)

		/* hue 0 vs hue 342 — different colors */
		expect(color0).not.toBe(color19)
	})

	test("SSR HTML contains all 20 box data-c attrs", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-stress`)
		const html = await response.text()

		for (let i = 0; i < 20; i++) {
			expect(html).toContain(`data-testid="stress-box-${i}"`)
		}

		const dataCs = [...html.matchAll(/data-c="([^"]+)"/g)].map((m) => m[1])
		expect(new Set(dataCs).size).toBeGreaterThanOrEqual(20)
	})
})

test.describe("Stress: cross-property collision", () => {
	test("collision-a/b/c all set color but each is unique", async ({ page }) => {
		await loadPage(page, "/styling-stress")

		const colors = {
			"collision-a": "rgb(255, 0, 0)",
			"collision-b": "rgb(0, 255, 0)",
			"collision-c": "rgb(0, 0, 255)",
		}

		for (const [testid, expected] of Object.entries(colors)) {
			const color = await page.getByTestId(testid).evaluate((el) => getComputedStyle(el).color)
			expect(color).toBe(expected)
		}
	})

	test("collision elements have different data-c", async ({ page }) => {
		await loadPage(page, "/styling-stress")

		const ids = ["collision-a", "collision-b", "collision-c"]
		const values = new Set<string>()
		for (const id of ids) {
			const val = await page.getByTestId(id).getAttribute("data-c")
			expect(val).toBeTruthy()
			values.add(val as string)
		}
		expect(values.size).toBe(3)
	})
})

test.describe("Stress: dynamic item creation", () => {
	test("clicking add-5 creates 5 more styled items", async ({ page }) => {
		await loadPage(page, "/styling-stress")

		/* initial: dyn-0, dyn-1, dyn-2 */
		await expect(page.getByTestId("dyn-0")).toBeVisible()
		await expect(page.getByTestId("dyn-2")).toBeVisible()

		await page.getByTestId("add-dynamic").click()

		/* now 8 items: dyn-0..dyn-7 */
		await expect(page.getByTestId("dyn-7")).toBeVisible()

		const dataC = await page.getByTestId("dyn-7").getAttribute("data-c")
		expect(dataC).toBeTruthy()
	})

	test("each dynamic item has unique data-c", async ({ page }) => {
		await loadPage(page, "/styling-stress")

		const values = new Set<string>()
		for (let i = 0; i < 3; i++) {
			const val = await page.getByTestId(`dyn-${i}`).getAttribute("data-c")
			expect(val).toBeTruthy()
			values.add(val as string)
		}
		expect(values.size).toBe(3)
	})
})

test.describe("Stress: mixed styles() + css= + class= Tailwind", () => {
	test("scoped styles() works alongside native css= and class= Tailwind", async ({ page }) => {
		await loadPage(page, "/styling-stress")

		/* styles() scoped */
		const scopedColor = await page
			.getByTestId("stress-mixed-scoped")
			.evaluate((el) => getComputedStyle(el).color)
		expect(scopedColor).toBe("rgb(100, 0, 100)")

		/* native css= */
		const nativeColor = await page
			.getByTestId("stress-css-native")
			.evaluate((el) => getComputedStyle(el).color)
		expect(nativeColor).toBe("rgb(0, 200, 100)")

		/* class= Tailwind */
		const twWeight = await page
			.getByTestId("stress-tw-native")
			.evaluate((el) => getComputedStyle(el).fontWeight)
		expect(Number(twWeight)).toBeGreaterThanOrEqual(700)
	})

	test("styles() has data-c; class= Tailwind element uses class attr", async ({ page }) => {
		await loadPage(page, "/styling-stress")

		expect(await page.getByTestId("stress-mixed-scoped").getAttribute("data-c")).toBeTruthy()

		const twDataC = await page.getByTestId("stress-tw-native").getAttribute("data-c")
		expect(twDataC).toBeNull()
		const twCls = await page.getByTestId("stress-tw-native").getAttribute("class")
		expect(twCls).toContain("font-bold")
	})
})

test.describe("Stress: SPA round-trip", () => {
	test("mass styles survive navigation", async ({ page }) => {
		await loadPage(page, "/styling-stress")

		const before = await page
			.getByTestId("stress-box-0")
			.evaluate((el) => getComputedStyle(el).color)

		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styling-stress")

		const after = await page
			.getByTestId("stress-box-0")
			.evaluate((el) => getComputedStyle(el).color)
		expect(after).toBe(before)
	})
})

test.describe("Stress: console clean", () => {
	test("no errors with 20+ styles and dynamic creation", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-stress")
		await page.getByTestId("add-dynamic").click()
		await page.getByTestId("add-dynamic").click()
		cap.assertClean()
	})
})
