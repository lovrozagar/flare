import { expect, test } from "@playwright/test"
import { loadPage } from "./helpers"

/**
 * Trigger a shallow navigation to a different route — this deterministically
 * fires `warn("nav", "shallow navigation to different route ...")` inside
 * the navigation module. In dev (level="warn") the message appears in console;
 * in prod (level="error") it is suppressed.
 */
async function triggerShallowCrossRouteWarning(page: import("@playwright/test").Page) {
	await page.evaluate(() => {
		const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
			| ((to: string, opts?: Record<string, unknown>) => Promise<void>)
			| undefined
		if (!nav) throw new Error("__flareNavigate not available")
		return nav("/about", { shallow: true })
	})
	/* Give microtask queue time to flush console output */
	await page.waitForTimeout(200)
}

test.describe("Logging behavior", () => {
	test("@dev-only warn() fires in dev — [flare:nav] shallow warning visible", async ({ page }) => {
		const flareWarnings: string[] = []
		page.on("console", (msg) => {
			if (msg.type() === "warning" && msg.text().includes("[flare:nav]")) {
				flareWarnings.push(msg.text())
			}
		})

		await loadPage(page, "/shallow-test")
		await triggerShallowCrossRouteWarning(page)

		expect(flareWarnings.length).toBeGreaterThanOrEqual(1)
		expect(flareWarnings[0]).toContain("shallow navigation to different route")
	})

	test("@dev-only no uncaught page errors during navigation", async ({ page }) => {
		const pageErrors: string[] = []
		page.on("pageerror", (err) => {
			if (/SSL certificate error/i.test(err.message)) return
			pageErrors.push(err.message)
		})

		await loadPage(page, "/")
		await page.click('a[href="/about"]')
		await page.waitForURL("**/about", { timeout: 10_000 })
		await page.waitForTimeout(300)

		expect(pageErrors).toHaveLength(0)
	})

	test("@prod-only warn() suppressed in prod — no [flare:nav] output", async ({ page }) => {
		const flareWarnings: string[] = []
		page.on("console", (msg) => {
			if (msg.type() === "warning" && msg.text().includes("[flare:nav]")) {
				flareWarnings.push(msg.text())
			}
		})

		await loadPage(page, "/shallow-test")
		await triggerShallowCrossRouteWarning(page)

		/* Same trigger, but prod level="error" suppresses warn() calls */
		expect(flareWarnings).toHaveLength(0)
	})

	test("@prod-only server logs absent from FlareState", async ({ page }) => {
		await loadPage(page, "/")

		const state = await page.evaluate(() => (self as unknown as { flare?: unknown }).flare)
		const obj = state as Record<string, unknown>
		expect(obj.g).toBeUndefined()
	})
})
