import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA } from "./helpers"

/**
 * Router-level locale sync tests.
 *
 * The i18n-test routes in flare-e2e use [[locale]] AFTER a layout prefix:
 *   /i18n-test/[[locale]]/...
 *
 * This means the i18n middleware (first-segment detection) doesn't detect
 * locale from these URLs. Cookie sync for these routes comes from the
 * router's syncLocale() on SPA navigation.
 *
 * SSR <html lang> is set by the root layout (always "en" in flare-e2e).
 * Router sync only fires on SPA navigation (c.setParams call sites).
 */

test.describe("router locale sync — SPA html lang", () => {
	test("SPA nav to /i18n-test/hr updates html lang to hr", async ({ page }) => {
		await loadPage(page, "/i18n-test")
		/* SSR sets lang based on root layout — may not be locale-aware */
		await navigateSPA(page, "/i18n-test/hr")
		await expect(page.getByTestId("locale-value")).toHaveText("hr")
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("hr")
	})

	test("SPA nav hr → en updates html lang to en", async ({ page }) => {
		await loadPage(page, "/i18n-test")
		await navigateSPA(page, "/i18n-test/hr")
		await expect(page.getByTestId("locale-value")).toHaveText("hr")
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("hr")

		await navigateSPA(page, "/i18n-test")
		await expect(page.getByTestId("locale-value")).toHaveText("en")
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("en")
	})

	test("SPA nav cycle: en → hr → en keeps lang in sync", async ({ page }) => {
		await loadPage(page, "/i18n-test")

		await navigateSPA(page, "/i18n-test/hr")
		await expect(page.getByTestId("locale-value")).toHaveText("hr")
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("hr")

		await navigateSPA(page, "/i18n-test")
		await expect(page.getByTestId("locale-value")).toHaveText("en")
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("en")
	})
})

test.describe("router locale sync — SPA cookie", () => {
	test("SPA nav to /i18n-test/hr sets cookie to hr", async ({ page }) => {
		await loadPage(page, "/i18n-test")

		await navigateSPA(page, "/i18n-test/hr")
		await expect(page.getByTestId("locale-value")).toHaveText("hr")

		const cookies = await page.context().cookies()
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("hr")
	})

	test("SPA nav back to default sets cookie to en", async ({ page }) => {
		await loadPage(page, "/i18n-test")
		await navigateSPA(page, "/i18n-test/hr")
		await expect(page.getByTestId("locale-value")).toHaveText("hr")

		await navigateSPA(page, "/i18n-test")
		await expect(page.getByTestId("locale-value")).toHaveText("en")

		const cookies = await page.context().cookies()
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("en")
	})

	test("SPA full cycle: en → hr → en, cookie correct at each step", async ({ page }) => {
		await loadPage(page, "/i18n-test")
		let cookies: { name: string; value: string }[]

		await navigateSPA(page, "/i18n-test/hr")
		await expect(page.getByTestId("locale-value")).toHaveText("hr")
		cookies = await page.context().cookies()
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("hr")

		await navigateSPA(page, "/i18n-test")
		await expect(page.getByTestId("locale-value")).toHaveText("en")
		cookies = await page.context().cookies()
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("en")
	})
})

test.describe("router.locale() accessor", () => {
	test("reflects correct locale after SPA nav", async ({ page }) => {
		await loadPage(page, "/i18n-test")
		await expect(page.getByTestId("locale-value")).toHaveText("en")

		await navigateSPA(page, "/i18n-test/hr")
		await expect(page.getByTestId("locale-value")).toHaveText("hr")
	})

	test("reflects correct locale on SSR", async ({ page }) => {
		await loadPage(page, "/i18n-test")
		await expect(page.getByTestId("locale-value")).toHaveText("en")
	})

	test("reflects hr locale on SSR with prefix", async ({ page }) => {
		await loadPage(page, "/i18n-test/hr")
		await expect(page.getByTestId("locale-value")).toHaveText("hr")
	})
})

test.describe("router locale sync — no console errors", () => {
	test("SPA locale switch produces no console errors", async ({ page }) => {
		const errors: string[] = []
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text())
		})
		await loadPage(page, "/i18n-test")
		await navigateSPA(page, "/i18n-test/hr")
		await expect(page.getByTestId("locale-value")).toHaveText("hr")
		await navigateSPA(page, "/i18n-test")
		await expect(page.getByTestId("locale-value")).toHaveText("en")
		expect(
			errors.filter((e) => !e.includes("favicon") && !/SSL certificate error/i.test(e)),
		).toHaveLength(0)
	})
})
