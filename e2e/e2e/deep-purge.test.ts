import { expect, test } from "@playwright/test"
import { loadPage } from "./helpers"

test.describe("@dev-only purge: dev mode preserves console output", () => {
	test("console.log and console.debug present in dev mode", async ({ page }) => {
		const logs: string[] = []
		page.on("console", (msg) => {
			if (msg.text().includes("purge-test:")) {
				logs.push(msg.text())
			}
		})

		await loadPage(page, "/purge-test")

		expect(logs).toContain("purge-test:console-log-marker")
		expect(logs).toContain("purge-test:console-debug-marker")
	})

	test("data-testid attributes present in dev mode", async ({ page }) => {
		await loadPage(page, "/purge-test")

		await expect(page.locator("[data-testid=purge-test-main]")).toBeVisible()
		await expect(page.locator("[data-testid=purge-heading]")).toHaveText("Purge Test Page")
		await expect(page.locator("[data-testid=purge-content]")).toBeVisible()
	})
})

test.describe("@prod-only purge: prod mode strips console output", () => {
	test("console.log and console.debug stripped in prod mode", async ({ page }) => {
		const logs: string[] = []
		page.on("console", (msg) => {
			if (msg.text().includes("purge-test:")) {
				logs.push(msg.text())
			}
		})

		await loadPage(page, "/purge-test")

		expect(logs).not.toContain("purge-test:console-log-marker")
		expect(logs).not.toContain("purge-test:console-debug-marker")
	})

	test("data-testid attributes still present (testIds not enabled)", async ({ page }) => {
		await loadPage(page, "/purge-test")

		/* testIds purging is NOT enabled in this E2E config, so data-testid should remain */
		await expect(page.locator("[data-testid=purge-test-main]")).toBeVisible()
		await expect(page.locator("[data-testid=purge-heading]")).toHaveText("Purge Test Page")
	})
})
