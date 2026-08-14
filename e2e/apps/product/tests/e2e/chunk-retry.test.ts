import { expect, test } from "@playwright/test"
import { loadPage, setNavMarker } from "./helpers"

function isJsAsset(url: string): boolean {
	try {
		const path = new URL(url).pathname
		return path.endsWith(".js") || path.endsWith(".mjs")
	} catch {
		return false
	}
}

async function blockServiceWorker(page: import("@playwright/test").Page): Promise<void> {
	/* Prod SW precaches every hashed asset. If those fetches land in the
	   home baseline, the abort interceptor never sees a "new" URL. */
	await page.route("**/sw.js", (route) => route.abort())
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "serviceWorker", {
			configurable: true,
			value: undefined,
		})
	})
}

/**
 * Fail the first unseen JS file after the home baseline.
 * Hashed Vite chunks often omit the route name (`/assets/D4xK8a.js`),
 * so URL-contains-"about" is not a reliable selector.
 */
test.describe("@prod-only chunk load retry (hashed filenames)", () => {
	test("retry succeeds after transient chunk failure", async ({ page }) => {
		await blockServiceWorker(page)

		const baseline = new Set<string>()
		const recordBaseline = (req: { url: () => string }) => {
			if (isJsAsset(req.url())) baseline.add(req.url())
		}
		page.on("request", recordBaseline)

		await loadPage(page, "/")
		page.off("request", recordBaseline)

		let targetUrl: string | null = null
		let requestCount = 0

		await page.route("**/*.{js,mjs}", async (route) => {
			const url = route.request().url()
			if (!isJsAsset(url) || baseline.has(url)) {
				await route.continue()
				return
			}
			if (!targetUrl) targetUrl = url
			if (url === targetUrl) {
				requestCount++
				if (requestCount === 1) {
					await route.abort("connectionfailed")
					return
				}
			}
			await route.continue()
		})

		await setNavMarker(page)
		/* Programmatic nav — Playwright click focuses the link and fires
		   prefetch:"intent", which can eat the only new JS before navigate. */
		await page.evaluate(async () => {
			const nav = (window as unknown as { __flareNavigate?: (to: string) => Promise<void> })
				.__flareNavigate
			if (!nav) throw new Error("no-nav-fn")
			await nav("/about")
		})
		await page.waitForURL("**/about", { timeout: 15_000 })
		await expect(page.getByTestId("about")).toBeVisible({ timeout: 10_000 })
		expect(requestCount).toBeGreaterThan(1)
		expect(targetUrl).toBeTruthy()
	})

	test("exhausted retries trigger a single reload, then continue", async ({ page }) => {
		await blockServiceWorker(page)

		const baseline = new Set<string>()
		const recordBaseline = (req: { url: () => string }) => {
			if (isJsAsset(req.url())) baseline.add(req.url())
		}
		page.on("request", recordBaseline)

		await loadPage(page, "/")
		page.off("request", recordBaseline)
		await setNavMarker(page)

		let targetUrl: string | null = null
		let abortCount = 0
		/* Cap aborts so the post-reload fetch can proceed. Prefetch + navigate
		 * may share a failed-import cache, so the observed abort count can be
		 * less than 1 + IMPORT_MAX_RETRIES. */
		const abortCap = 6

		await page.route("**/*.{js,mjs}", async (route) => {
			const url = route.request().url()
			if (!isJsAsset(url) || baseline.has(url)) {
				await route.continue()
				return
			}
			if (!targetUrl) targetUrl = url
			if (url === targetUrl && abortCount < abortCap) {
				abortCount++
				await route.abort("connectionfailed")
				return
			}
			await route.continue()
		})

		await page.click("a[href='/about']")

		await page.waitForFunction(
			() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ !== "number",
			null,
			{ timeout: 15_000 },
		)

		const markerGone = await page.evaluate(
			() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ !== "number",
		)
		expect(markerGone).toBe(true)
		expect(abortCount).toBeGreaterThanOrEqual(1)
		expect(abortCount).toBeLessThanOrEqual(abortCap)
		await expect(page.getByTestId("about")).toBeVisible({ timeout: 15_000 })
	})
})
