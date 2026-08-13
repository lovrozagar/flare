import { expect, test } from "@playwright/test"
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("TW static in styles(): flex + css merge", () => {
	test("tw: flex compiles to display:flex, css: border merges", async ({ page }) => {
		await loadPage(page, "/styling-tw-static")
		const box = page.getByTestId("tw-static-flex")
		await expect(box).toBeVisible()

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { border: cs.border, display: cs.display }
		})
		expect(computed.display).toBe("flex")
		/* border from css: */
		expect(computed.border).toContain("2px")
	})

	test("SSR HTML contains compiled TW + css declarations for flex box", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-tw-static`)
		const html = await response.text()
		expect(html).toContain('data-c="tw-static-flex"')
		expect(html).toContain("display:flex")
		expect(html).toContain("border:")
	})
})

test.describe("TW static in styles(): color + bold + underline", () => {
	test("tw: text-red-500 font-bold underline all applied", async ({ page }) => {
		await loadPage(page, "/styling-tw-static")
		const box = page.getByTestId("tw-static-color")

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el)
			return {
				fontWeight: cs.fontWeight,
				textDecoration: cs.textDecorationLine || cs.textDecoration,
			}
		})
		expect(Number(computed.fontWeight)).toBeGreaterThanOrEqual(700)
		expect(computed.textDecoration).toContain("underline")
	})

	test("tw-static-color has data-c attribute", async ({ page }) => {
		await loadPage(page, "/styling-tw-static")
		const dataC = await page.getByTestId("tw-static-color").getAttribute("data-c")
		expect(dataC).toBe("tw-static-color")
	})
})

test.describe("TW static + state selectors", () => {
	test("tw: bg-blue-500 + state active=false (no opacity)", async ({ page }) => {
		await loadPage(page, "/styling-tw-static")
		const box = page.getByTestId("tw-static-state")

		const attr = await box.getAttribute("data-active")
		expect(attr).toBe("false")

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { opacity: cs.opacity, padding: cs.padding }
		})
		/* opacity should be 1 (active=false, no match) */
		expect(computed.opacity).toBe("1")
		expect(computed.padding).toBe("12px")
	})

	test("SSR has state data-active=false and tw declarations", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-tw-static`)
		const html = await response.text()
		expect(html).toContain('data-active="false"')
		expect(html).toContain('data-c="tw-static-state"')
	})
})

test.describe("TW static + vars", () => {
	test("vars accent color applied via inline style var", async ({ page }) => {
		await loadPage(page, "/styling-tw-static")
		const box = page.getByTestId("tw-static-vars")

		/* vars inject --_0 via inline style, css: uses var(--_0) */
		const hasVar = await box.evaluate((el) => el.style.getPropertyValue("--_0"))
		expect(hasVar).toBe("rgb(128, 0, 255)")

		const dataC = await box.getAttribute("data-c")
		expect(dataC).toBeTruthy()
	})

	test("vars produce inline style with --_0 in SSR HTML", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-tw-static`)
		const html = await response.text()
		expect(html).toContain("--_0")
		expect(html).toContain("rgb(128, 0, 255)")
	})
})

test.describe("TW static: isolation", () => {
	test("all 4 tw-static elements have unique data-c", async ({ page }) => {
		await loadPage(page, "/styling-tw-static")
		const ids = ["tw-static-flex", "tw-static-color", "tw-static-state", "tw-static-vars"]
		const dataCValues = new Set<string>()
		for (const id of ids) {
			const val = await page.getByTestId(id).getAttribute("data-c")
			expect(val).toBeTruthy()
			dataCValues.add(val as string)
		}
		expect(dataCValues.size).toBe(4)
	})
})

test.describe("TW static: SPA round-trip", () => {
	test("styles survive SPA nav away and back", async ({ page }) => {
		await loadPage(page, "/styling-tw-static")
		const originalDisplay = await page
			.getByTestId("tw-static-flex")
			.evaluate((el) => getComputedStyle(el).display)

		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styling-tw-static")

		const newDisplay = await page
			.getByTestId("tw-static-flex")
			.evaluate((el) => getComputedStyle(el).display)
		expect(newDisplay).toBe(originalDisplay)
	})
})

test.describe("TW static: hydration no dup", () => {
	test("scoped style tag at most 1", async ({ page }) => {
		await loadPage(page, "/styling-tw-static")
		const count = await page.evaluate(
			() => document.querySelectorAll("style#__FLARE_SCOPED__").length,
		)
		expect(count).toBeLessThanOrEqual(1)
	})
})

test.describe("TW static: console clean", () => {
	test("no errors on tw-static page", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-tw-static")
		cap.assertClean()
	})
})
