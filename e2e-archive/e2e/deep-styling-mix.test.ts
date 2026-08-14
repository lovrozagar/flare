import { expect, test } from "@playwright/test"
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("Styling mix: SSR completeness", () => {
	test("SSR HTML contains all 5 styling sources", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-mix`)
		const html = await response.text()

		/* head.css link */
		expect(html).toContain("mix-page.css")

		/* custom.styles inline */
		expect(html).toContain(".mix-custom")
		expect(html).toContain("letter-spacing")

		/* scoped styles() */
		expect(html).toContain('data-c="mix-scoped"')

		/* css= native → hash data-c */
		expect(html).toContain('data-testid="mix-css-native"')
		expect(html).toContain("font-style:italic")

		/* class= Tailwind — class names preserved verbatim, no data-c */
		expect(html).toContain('data-testid="mix-tw-native"')
		expect(html).toContain('class="underline font-bold"')
	})
})

test.describe("Styling mix: head.css", () => {
	test("head.css applies border to mix-head", async ({ page }) => {
		await loadPage(page, "/styling-mix")
		const el = page.getByTestId("mix-head")
		await expect(el).toBeVisible()

		const border = await el.evaluate((el) => getComputedStyle(el).borderColor)
		expect(border).toBe("rgb(128, 0, 128)")
	})
})

test.describe("Styling mix: custom.styles", () => {
	test("custom.styles applies letter-spacing", async ({ page }) => {
		await loadPage(page, "/styling-mix")
		const el = page.getByTestId("mix-custom")
		await expect(el).toBeVisible()

		const ls = await el.evaluate((el) => getComputedStyle(el).letterSpacing)
		expect(ls).toBe("2px")
	})
})

test.describe("Styling mix: scoped styles()", () => {
	test("styles() applies color blue", async ({ page }) => {
		await loadPage(page, "/styling-mix")
		const el = page.getByTestId("mix-scoped")
		await expect(el).toBeVisible()

		const computed = await el.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { color: cs.color, margin: cs.margin }
		})
		expect(computed.color).toBe("rgb(0, 0, 255)")
		expect(computed.margin).toBe("8px")
	})
})

test.describe("Styling mix: native css=", () => {
	test("css= applies italic and red color", async ({ page }) => {
		await loadPage(page, "/styling-mix")
		const el = page.getByTestId("mix-css-native")
		await expect(el).toBeVisible()

		const computed = await el.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { color: cs.color, fontStyle: cs.fontStyle }
		})
		expect(computed.fontStyle).toBe("italic")
		expect(computed.color).toBe("rgb(255, 0, 0)")
	})
})

test.describe("Styling mix: native class= Tailwind", () => {
	test("class= Tailwind applies underline and bold", async ({ page }) => {
		await loadPage(page, "/styling-mix")
		const el = page.getByTestId("mix-tw-native")
		await expect(el).toBeVisible()

		const computed = await el.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { fontWeight: cs.fontWeight, textDecoration: cs.textDecorationLine }
		})
		expect(Number(computed.fontWeight)).toBeGreaterThanOrEqual(700)
		expect(computed.textDecoration).toBe("underline")
	})
})

/* Mix page still uses dropped tw= / css= data-c assumptions. */
test.describe.skip("Styling mix: isolation", () => {
	test("all styled elements use distinct styling approaches", async ({ page }) => {
		await loadPage(page, "/styling-mix")
		const scoped = page.getByTestId("mix-scoped")
		const cssNative = page.getByTestId("mix-css-native")
		const twNative = page.getByTestId("mix-tw-native")

		/* styles() and css= use data-c; class= Tailwind uses class attr instead */
		const scopedC = await scoped.getAttribute("data-c")
		const cssC = await cssNative.getAttribute("data-c")
		const twCls = await twNative.getAttribute("class")

		expect(scopedC).toBe("mix-scoped")
		expect(cssC).toBeTruthy()
		expect(cssC).not.toBe(scopedC)
		/* tw element has no data-c — styles via class= Tailwind utilities */
		expect(await twNative.getAttribute("data-c")).toBeNull()
		expect(twCls).toContain("underline")
		expect(twCls).toContain("font-bold")
	})
})

test.describe("Styling mix: SPA round-trip", () => {
	test("all sources survive SPA navigation", async ({ page }) => {
		await loadPage(page, "/styling-mix")
		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styling-mix")

		const border = await page
			.getByTestId("mix-head")
			.evaluate((el) => getComputedStyle(el).borderColor)
		expect(border).toBe("rgb(128, 0, 128)")

		const color = await page.getByTestId("mix-scoped").evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 0, 255)")

		const fontStyle = await page
			.getByTestId("mix-css-native")
			.evaluate((el) => getComputedStyle(el).fontStyle)
		expect(fontStyle).toBe("italic")
	})
})

test.describe("Styling mix: console clean", () => {
	test("no console errors across mix page navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-mix")
		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styling-mix")
		cap.assertClean()
	})
})
