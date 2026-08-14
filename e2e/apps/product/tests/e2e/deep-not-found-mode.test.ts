import { expect, test } from "@playwright/test"
import { loadPage, setNavMarker, assertSPANavigation } from "./helpers"

test.describe("NotFound Mode — fuzzy vs root", () => {
	test("SSR: unknown URL returns 404 status", async ({ page }) => {
		const response = await page.goto("/nonexistent-page-xyz")
		expect(response).not.toBeNull()
		expect(response?.status()).toBe(404)
	})

	test("SSR: unknown deep URL still returns 404 status", async ({ page }) => {
		const response = await page.goto("/blog/nonexistent-slug/extra/segments")
		expect(response).not.toBeNull()
		expect(response?.status()).toBe(404)
	})

	test("CSR: SPA navigate to unknown path does not blank the page", async ({ page }) => {
		const consoleMessages: string[] = []
		page.on("console", (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`))
		page.on("pageerror", (err) => consoleMessages.push(`[pageerror] ${err.message}`))

		await loadPage(page, "/about")
		await setNavMarker(page)

		/* Navigate to a non-existent path — await the navigation promise */
		const navResult = await page.evaluate(async () => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) return { error: "no-nav-fn", url: window.location.pathname }
			try {
				await nav("/does-not-exist-at-all")
				return { error: null, url: window.location.pathname }
			} catch (e: unknown) {
				return { error: e instanceof Error ? e.message : String(e), url: window.location.pathname }
			}
		})

		/* Examine result */
		if (navResult.error) {
			console.log("Nav error:", navResult.error)
			console.log("Console:", consoleMessages.join("\n"))
		}

		expect(navResult.error).toBeNull()

		/* With fuzzy mode, URL should change to the target and page shows not-found content */
		expect(navResult.url).toBe("/does-not-exist-at-all")

		const bodyText = await page.evaluate(() => document.body.textContent?.trim())
		expect(bodyText).toBeTruthy()
		expect(bodyText?.length).toBeGreaterThan(0)

		await assertSPANavigation(page)
	})
})
