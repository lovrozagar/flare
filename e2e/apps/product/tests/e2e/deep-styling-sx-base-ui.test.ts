import { expect, test } from "@playwright/test"
import { loadPage, setupConsoleCapture } from "./helpers"

test.describe("sx + Base UI Solid: Dialog trigger", () => {
	test("trigger has sx-applied background color", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		const trigger = page.getByTestId("bui-trigger")
		await expect(trigger).toBeVisible()

		const bg = await trigger.evaluate((el) => getComputedStyle(el).backgroundColor)
		/* sx={{ backgroundColor: "rgb(59, 130, 246)" }} — blue */
		expect(bg).toBe("rgb(59, 130, 246)")
	})

	test("trigger has sx-applied padding", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		const style = await page
			.getByTestId("bui-trigger")
			.evaluate((el) => {
				const cs = getComputedStyle(el)
				return { pt: cs.paddingTop, pb: cs.paddingBottom, pl: cs.paddingLeft, pr: cs.paddingRight }
			})
		expect(style.pt).toBe("8px")
		expect(style.pb).toBe("8px")
		expect(style.pl).toBe("16px")
		expect(style.pr).toBe("16px")
	})

	test("trigger class prop is forwarded as attribute", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		/* Base UI forwards class to the underlying DOM element */
		const cls = await page.getByTestId("bui-trigger").getAttribute("class")
		expect(cls).toContain("bui-trigger-custom")
	})
})

test.describe("sx + Base UI Solid: Dialog open/close", () => {
	test("dialog opens on trigger click", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		await page.getByTestId("bui-trigger").click()
		await expect(page.getByTestId("bui-popup")).toBeVisible()
	})

	test("close button dismisses dialog", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		await page.getByTestId("bui-trigger").click()
		await expect(page.getByTestId("bui-popup")).toBeVisible()
		await page.getByTestId("bui-close").click()
		await expect(page.getByTestId("bui-popup")).not.toBeVisible()
	})
})

test.describe("sx + Base UI Solid: Dialog.Popup sx styles", () => {
	test("popup has sx-applied white background", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		await page.getByTestId("bui-trigger").click()
		const bg = await page
			.getByTestId("bui-popup")
			.evaluate((el) => getComputedStyle(el).backgroundColor)
		expect(bg).toBe("rgb(255, 255, 255)")
	})

	test("popup has sx-applied padding 24px", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		await page.getByTestId("bui-trigger").click()
		const padding = await page
			.getByTestId("bui-popup")
			.evaluate((el) => getComputedStyle(el).padding)
		expect(padding).toBe("24px")
	})

	test("popup has sx-applied border-radius 8px", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		await page.getByTestId("bui-trigger").click()
		const br = await page
			.getByTestId("bui-popup")
			.evaluate((el) => getComputedStyle(el).borderRadius)
		expect(br).toBe("8px")
	})
})

test.describe("sx + Base UI Solid: Dialog.Backdrop sx styles", () => {
	test("backdrop has sx semi-transparent background", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		await page.getByTestId("bui-trigger").click()
		const bg = await page
			.getByTestId("bui-backdrop")
			.evaluate((el) => getComputedStyle(el).backgroundColor)
		/* rgba(0,0,0,0.5) */
		expect(bg).toMatch(/rgba\(0,\s*0,\s*0,\s*0\.5\)|rgba\(0, 0, 0, 0\.5\)/)
	})

	test("backdrop has sx position fixed", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		await page.getByTestId("bui-trigger").click()
		const pos = await page
			.getByTestId("bui-backdrop")
			.evaluate((el) => getComputedStyle(el).position)
		expect(pos).toBe("fixed")
	})
})

test.describe("sx + Base UI Solid: render prop polymorphism", () => {
	test("render fn: trigger renders as anchor element", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		const tag = await page
			.getByTestId("bui-trigger-link")
			.evaluate((el) => el.tagName.toLowerCase())
		expect(tag).toBe("a")
	})

	test("render fn: anchor has sx-applied underline", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		const style = await page
			.getByTestId("bui-trigger-link")
			.evaluate((el) => getComputedStyle(el).textDecorationLine)
		expect(style).toBe("underline")
	})

	test("render fn: anchor trigger opens dialog", async ({ page }) => {
		await loadPage(page, "/styling-sx-base-ui")
		await page.getByTestId("bui-trigger-link").click()
		await expect(page.getByTestId("bui-poly-popup")).toBeVisible()
	})
})

test.describe("sx + Base UI Solid: no errors", () => {
	test("no console errors on page load", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-base-ui")
		cap.assertClean()
	})
})
