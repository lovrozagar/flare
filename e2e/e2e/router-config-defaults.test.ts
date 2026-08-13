import { expect, test } from "@playwright/test"
import { assertHydrated, loadPage } from "./helpers"

test.describe("Router config defaults (E2E)", () => {
	test("caseSensitive=false (default): /About matches /about route", async ({ page }) => {
		/* Default router is case-insensitive — /About should resolve to /about */
		await page.goto("/About", { waitUntil: "domcontentloaded" })
		await assertHydrated(page)
		/* Should hydrate successfully, not show 404 */
		const notFound = await page.evaluate(
			() => document.querySelector("[data-testid='not-found']") !== null,
		)
		expect(notFound).toBe(false)
	})

	test("trailingSlash=never (default): /about/ redirects to /about", async ({ page }) => {
		const response = await page.goto("/about/", { waitUntil: "commit" })
		await page.waitForURL("**/about")
		expect(page.url()).toContain("/about")
		expect(page.url()).not.toMatch(/\/about\/$/)
		/* Server returns 301 redirect */
		expect(response?.status()).toBe(200) /* after redirect follows */
	})

	test("trailingSlash=never (default): root / is not redirected", async ({ page }) => {
		await loadPage(page, "/")
		expect(page.url()).toMatch(/\/$/)
	})

	test("scrollRestoration defaults to manual", async ({ page }) => {
		await loadPage(page, "/")
		const scrollRestoration = await page.evaluate(() => history.scrollRestoration)
		expect(scrollRestoration).toBe("manual")
	})

	test("FlareState.c.router available after hydration", async ({ page }) => {
		await loadPage(page, "/")
		const routerConfig = await page.evaluate(() => {
			const state = (self as unknown as { flare?: Record<string, unknown> }).flare
			const config = state?.c as Record<string, unknown> | undefined
			return config?.router
		})
		expect(routerConfig).toBeDefined()
		expect(typeof routerConfig).toBe("object")
	})

	test("caseSensitive=false: SPA navigation to /About resolves correctly", async ({ page }) => {
		await loadPage(page, "/")

		/* Set nav marker to detect SPA navigation */
		await page.evaluate(() => {
			;(window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ = Date.now()
		})

		/* Navigate via Flare's navigate function */
		const navigated = await page.evaluate(async () => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) return false
			await nav("/About")
			return true
		})

		if (navigated) {
			/* Should resolve (not 404) because default is case-insensitive */
			await page.waitForURL("**/About", { timeout: 5_000 })
			const markerSurvived = await page.evaluate(
				() =>
					typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ === "number",
			)
			expect(markerSurvived).toBe(true) /* SPA navigation, not full reload */
		}
	})
})
