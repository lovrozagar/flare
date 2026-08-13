import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

const LIBS = [
	"zod",
	"valibot",
	"arktype",
	"manual",
	"yup",
	"superstruct",
	"typebox",
	"effect",
] as const

/* zod passes raw schema → Standard Schema detected → SFVE → 400.
 * Others wrap in {parse}/function → generic throw → 500. */
const VALIDATION_ERROR_STATUS: Record<string, number> = { zod: 400 }

/*
 * arktype uses string.numeric which:
 * - rejects leading zeros ("007" is not well-formed numeric)
 * - accepts floats ("3.14" is a valid numeric string)
 * All other libs use ^\d+$ regex.
 */
const REGEX_LIBS = LIBS.filter((l) => l !== "arktype")

for (const lib of REGEX_LIBS) {
	test.describe(`Edge params (${lib})`, () => {
		test("leading zeros: /007 → valid", async ({ page }) => {
			const cap = setupConsoleCapture(page)
			await loadPage(page, `/input-${lib}/007`)

			expect(await page.locator("[data-testid=input-id]").textContent()).toBe("7")
			cap.assertClean()
		})

		test(`float-like: /3.14 → ${VALIDATION_ERROR_STATUS[lib] ?? 500}`, async ({ page }) => {
			const response = await page.goto(`/input-${lib}/3.14`, { waitUntil: "domcontentloaded" })
			expect(response?.status()).toBe(VALIDATION_ERROR_STATUS[lib] ?? 500)
		})
	})
}

test.describe("Edge params (arktype): string.numeric specifics", () => {
	test("leading zeros: /007 → 500 (string.numeric rejects leading zeros)", async ({ page }) => {
		const response = await page.goto("/input-arktype/007", { waitUntil: "domcontentloaded" })
		expect(response?.status()).toBe(500)
	})

	test("float-like: /3.14 → valid (string.numeric accepts floats)", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/input-arktype/3.14")

		expect(await page.locator("[data-testid=input-id]").textContent()).toBe("3.14")
		cap.assertClean()
	})
})

for (const lib of LIBS) {
	test.describe(`Edge params common (${lib})`, () => {
		test("large number: /999999999999 → valid", async ({ page }) => {
			const cap = setupConsoleCapture(page)
			await loadPage(page, `/input-${lib}/999999999999`)

			expect(await page.locator("[data-testid=input-id]").textContent()).toBe("999999999999")
			cap.assertClean()
		})

		test("single zero: /0 → valid", async ({ page }) => {
			const cap = setupConsoleCapture(page)
			await loadPage(page, `/input-${lib}/0`)

			expect(await page.locator("[data-testid=input-id]").textContent()).toBe("0")
			cap.assertClean()
		})

		test(`special chars: /42abc → ${VALIDATION_ERROR_STATUS[lib] ?? 500}`, async ({ page }) => {
			const response = await page.goto(`/input-${lib}/42abc`, { waitUntil: "domcontentloaded" })
			expect(response?.status()).toBe(VALIDATION_ERROR_STATUS[lib] ?? 500)
		})
	})
}

for (const lib of LIBS) {
	test.describe(`Error recovery (${lib})`, () => {
		test("SPA: invalid → valid (error clears, correct data)", async ({ page }) => {
			await loadPage(page, "/")

			/* navigate to invalid */
			await page.evaluate((path) => {
				const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
					| ((to: string) => Promise<void>)
					| undefined
				if (!nav) throw new Error("__flareNavigate not available")
				return nav(path).catch(() => {})
			}, `/input-${lib}/abc`)
			await page.waitForURL(`**/input-${lib}/abc`, { timeout: 10_000 })

			/* navigate to valid — error boundary should clear */
			await navigateSPA(page, `/input-${lib}/42`)

			expect(await page.locator("[data-testid=input-id]").textContent()).toBe("42")
			expect(await page.locator("[data-testid=input-tab]").textContent()).toBe("overview")
		})

		test("SPA: valid → invalid → valid (round-trip recovery)", async ({ page }) => {
			await loadPage(page, `/input-${lib}/10`)
			expect(await page.locator("[data-testid=input-id]").textContent()).toBe("10")

			/* navigate to invalid */
			await page.evaluate((path) => {
				const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
					| ((to: string) => Promise<void>)
					| undefined
				if (!nav) throw new Error("__flareNavigate not available")
				return nav(path).catch(() => {})
			}, `/input-${lib}/abc`)
			await page.waitForURL(`**/input-${lib}/abc`, { timeout: 10_000 })

			/* navigate back to valid */
			await navigateSPA(page, `/input-${lib}/20`)

			expect(await page.locator("[data-testid=input-id]").textContent()).toBe("20")
			expect(await page.locator("[data-testid=input-tab]").textContent()).toBe("overview")
		})
	})
}

test.describe("Cross-validator SPA chain", () => {
	test("navigate through all 8 libs sequentially", async ({ page }) => {
		await loadPage(page, "/input-zod/1")
		expect(await page.locator("[data-testid=input-lib]").textContent()).toBe("zod")
		expect(await page.locator("[data-testid=input-id]").textContent()).toBe("1")

		await navigateSPA(page, "/input-valibot/2")
		expect(await page.locator("[data-testid=input-lib]").textContent()).toBe("valibot")
		expect(await page.locator("[data-testid=input-id]").textContent()).toBe("2")

		await navigateSPA(page, "/input-arktype/3")
		expect(await page.locator("[data-testid=input-lib]").textContent()).toBe("arktype")
		expect(await page.locator("[data-testid=input-id]").textContent()).toBe("3")

		await navigateSPA(page, "/input-manual/4")
		expect(await page.locator("[data-testid=input-lib]").textContent()).toBe("manual")
		expect(await page.locator("[data-testid=input-id]").textContent()).toBe("4")

		await navigateSPA(page, "/input-yup/5")
		expect(await page.locator("[data-testid=input-lib]").textContent()).toBe("yup")
		expect(await page.locator("[data-testid=input-id]").textContent()).toBe("5")

		await navigateSPA(page, "/input-superstruct/6")
		expect(await page.locator("[data-testid=input-lib]").textContent()).toBe("superstruct")
		expect(await page.locator("[data-testid=input-id]").textContent()).toBe("6")

		await navigateSPA(page, "/input-typebox/7")
		expect(await page.locator("[data-testid=input-lib]").textContent()).toBe("typebox")
		expect(await page.locator("[data-testid=input-id]").textContent()).toBe("7")

		await navigateSPA(page, "/input-effect/8")
		expect(await page.locator("[data-testid=input-lib]").textContent()).toBe("effect")
		expect(await page.locator("[data-testid=input-id]").textContent()).toBe("8")
	})
})

for (const lib of LIBS) {
	test.describe(`Search edge cases (${lib})`, () => {
		test("URL-encoded search: ?tab=hello%20world → decoded value", async ({ page }) => {
			const cap = setupConsoleCapture(page)
			await loadPage(page, `/input-${lib}/1?tab=hello%20world`)

			expect(await page.locator("[data-testid=input-tab]").textContent()).toBe("hello world")
			cap.assertClean()
		})

		test("only one search param: ?tab=billing → limit gets default", async ({ page }) => {
			const cap = setupConsoleCapture(page)
			await loadPage(page, `/input-${lib}/1?tab=billing`)

			expect(await page.locator("[data-testid=input-tab]").textContent()).toBe("billing")
			expect(await page.locator("[data-testid=input-limit]").textContent()).toBe("10")
			cap.assertClean()
		})

		test("empty search value: ?tab=&limit=5 → tab is empty, limit is 5", async ({ page }) => {
			const cap = setupConsoleCapture(page)
			await loadPage(page, `/input-${lib}/1?tab=&limit=5`)

			expect(await page.locator("[data-testid=input-tab]").textContent()).toBe("")
			expect(await page.locator("[data-testid=input-limit]").textContent()).toBe("5")
			cap.assertClean()
		})
	})
}
