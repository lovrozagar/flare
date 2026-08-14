import { expect, test } from "@playwright/test"
import { loadPage, setupConsoleCapture } from "./helpers"

test.describe("Keepalive", () => {
	test("ping fires within configured interval and returns 204", async ({ page }) => {
		const cap = setupConsoleCapture(page)

		const pingRequests: string[] = []
		const pingResponses: number[] = []

		page.on("request", (req) => {
			if (req.url().includes("/_flare/keepalive")) {
				pingRequests.push(req.url())
			}
		})

		page.on("response", (res) => {
			if (res.url().includes("/_flare/keepalive")) {
				pingResponses.push(res.status())
			}
		})

		await loadPage(page, "/")

		/* Server configured with keepalive({ interval: 5_000 }), wait for at least 1 ping */
		await page.waitForTimeout(6000)

		expect(pingRequests.length).toBeGreaterThanOrEqual(1)
		expect(pingResponses[0]).toBe(204)

		cap.assertClean()
	})

	test("direct fetch to /_flare/keepalive returns 204", async ({ page }) => {
		const response = await page.request.fetch("/_flare/keepalive")
		expect(response.status()).toBe(204)
	})
})
