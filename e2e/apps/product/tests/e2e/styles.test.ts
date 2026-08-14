import { expect, test } from "@playwright/test"
import { loadPage } from "./helpers"

async function computedRgb(page: import("@playwright/test").Page, testId: string): Promise<string> {
	return page.getByTestId(testId).evaluate((el) => {
		const raw = getComputedStyle(el).backgroundColor
		const canvas = document.createElement("canvas")
		canvas.width = canvas.height = 1
		const ctx = canvas.getContext("2d")
		if (!ctx) return raw
		ctx.fillStyle = raw
		ctx.fillRect(0, 0, 1, 1)
		const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
		return `rgb(${r}, ${g}, ${b})`
	})
}

test.describe("class= Tailwind", () => {
	test("bg-blue-500 and p-4 compile", async ({ page }) => {
		await loadPage(page, "/styles")
		expect(await computedRgb(page, "tw-class-static")).toBe("rgb(43, 127, 255)")
		const padding = await page
			.getByTestId("tw-class-static")
			.evaluate((el) => getComputedStyle(el).padding)
		expect(padding).toBe("16px")
	})

	test("conditional class toggles bg-red-500", async ({ page }) => {
		await loadPage(page, "/styles")
		expect(await computedRgb(page, "tw-class-conditional")).not.toBe("rgb(251, 44, 54)")
		await page.getByTestId("tw-toggle").click()
		expect(await computedRgb(page, "tw-class-conditional")).toBe("rgb(251, 44, 54)")
	})
})
