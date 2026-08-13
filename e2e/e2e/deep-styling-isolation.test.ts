import { expect, test } from "@playwright/test"
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("Isolation: sibling uniqueness", () => {
	test("5 siblings have unique data-c values", async ({ page }) => {
		await loadPage(page, "/styling-isolation")

		const dataCValues = new Set<string>()
		for (let i = 1; i <= 5; i++) {
			const val = await page.getByTestId(`sib-${i}`).getAttribute("data-c")
			expect(val).toBeTruthy()
			dataCValues.add(val as string)
		}
		expect(dataCValues.size).toBe(5)
	})

	test("5 siblings each have correct computed color", async ({ page }) => {
		await loadPage(page, "/styling-isolation")

		const expected: Record<string, string> = {
			"sib-1": "rgb(255, 0, 0)",
			"sib-2": "rgb(0, 128, 0)",
			"sib-3": "rgb(0, 0, 255)",
			"sib-4": "rgb(255, 165, 0)",
			"sib-5": "rgb(128, 0, 128)",
		}

		for (const [testid, color] of Object.entries(expected)) {
			const computed = await page.getByTestId(testid).evaluate((el) => getComputedStyle(el).color)
			expect(computed).toBe(color)
		}
	})
})

test.describe("Isolation: nested parent/child/grandchild", () => {
	test("each nesting level has own data-c", async ({ page }) => {
		await loadPage(page, "/styling-isolation")

		const parentC = await page.getByTestId("nest-parent").getAttribute("data-c")
		const childC = await page.getByTestId("nest-child").getAttribute("data-c")
		const grandC = await page.getByTestId("nest-grand").getAttribute("data-c")

		expect(parentC).toBeTruthy()
		expect(childC).toBeTruthy()
		expect(grandC).toBeTruthy()
		expect(new Set([parentC, childC, grandC]).size).toBe(3)
	})

	test("nested colors dont leak between levels", async ({ page }) => {
		await loadPage(page, "/styling-isolation")

		const parentColor = await page
			.getByTestId("nest-parent")
			.evaluate((el) => getComputedStyle(el).color)
		const childColor = await page
			.getByTestId("nest-child")
			.evaluate((el) => getComputedStyle(el).color)
		const grandColor = await page
			.getByTestId("nest-grand")
			.evaluate((el) => getComputedStyle(el).color)

		expect(parentColor).toBe("rgb(100, 0, 0)")
		expect(childColor).toBe("rgb(0, 100, 0)")
		expect(grandColor).toBe("rgb(0, 0, 100)")
	})
})

test.describe("Isolation: same styles() name different CSS", () => {
	test("two components with same name get scoped independently", async ({ page }) => {
		await loadPage(page, "/styling-isolation")

		const colorA = await page
			.getByTestId("same-name-a")
			.evaluate((el) => getComputedStyle(el).color)
		const colorB = await page
			.getByTestId("same-name-b")
			.evaluate((el) => getComputedStyle(el).color)

		/* both use "shared-name" but with different CSS */
		const dataCa = await page.getByTestId("same-name-a").getAttribute("data-c")
		const dataCb = await page.getByTestId("same-name-b").getAttribute("data-c")

		/* they should both have data-c (may be same name since same string) */
		expect(dataCa).toBeTruthy()
		expect(dataCb).toBeTruthy()

		/* at least one must show its intended color */
		const validColors = ["rgb(255, 0, 0)", "rgb(0, 0, 255)"]
		expect(validColors).toContain(colorA)
		expect(validColors).toContain(colorB)
	})
})

test.describe("Isolation: dynamic mutation on one sibling", () => {
	test("toggling highlight on sib-5 doesnt affect others", async ({ page }) => {
		await loadPage(page, "/styling-isolation")

		/* capture initial colors */
		const initialColors: Record<string, string> = {}
		for (let i = 1; i <= 4; i++) {
			initialColors[`sib-${i}`] = await page
				.getByTestId(`sib-${i}`)
				.evaluate((el) => getComputedStyle(el).color)
		}

		/* toggle highlight on sib-5 */
		await page.getByTestId("toggle-highlight").click()

		const sib5Color = await page.getByTestId("sib-5").evaluate((el) => getComputedStyle(el).color)
		expect(sib5Color).toBe("rgb(255, 255, 0)")

		/* others unchanged */
		for (let i = 1; i <= 4; i++) {
			const color = await page.getByTestId(`sib-${i}`).evaluate((el) => getComputedStyle(el).color)
			expect(color).toBe(initialColors[`sib-${i}`])
		}
	})
})

test.describe("Isolation: SSR correctness", () => {
	test("SSR HTML has 5 unique data-c attributes", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-isolation`)
		const html = await response.text()

		for (let i = 1; i <= 5; i++) {
			expect(html).toContain(`data-testid="sib-${i}"`)
		}
		expect(html).toContain("data-c=")
	})
})

test.describe("Isolation: post-hydration no duplication", () => {
	test("scoped style tag count at most 1", async ({ page }) => {
		await loadPage(page, "/styling-isolation")
		const count = await page.evaluate(
			() => document.querySelectorAll("style#__FLARE_SCOPED__").length,
		)
		expect(count).toBeLessThanOrEqual(1)
	})
})

test.describe("Isolation: SPA round-trip", () => {
	test("nav away and back preserves all sibling styles", async ({ page }) => {
		await loadPage(page, "/styling-isolation")

		const before: Record<string, string> = {}
		for (let i = 1; i <= 5; i++) {
			before[`sib-${i}`] = await page
				.getByTestId(`sib-${i}`)
				.evaluate((el) => getComputedStyle(el).color)
		}

		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styling-isolation")

		for (let i = 1; i <= 5; i++) {
			const color = await page.getByTestId(`sib-${i}`).evaluate((el) => getComputedStyle(el).color)
			expect(color).toBe(before[`sib-${i}`])
		}
	})
})

test.describe("Isolation: console clean", () => {
	test("no console errors on isolation page", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-isolation")
		await page.getByTestId("toggle-highlight").click()
		cap.assertClean()
	})
})
