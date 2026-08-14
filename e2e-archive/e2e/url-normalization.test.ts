import { expect, test } from "@playwright/test"
import { assertHydrated } from "./helpers"

test.describe("URL Normalization", () => {
	test("trailing slash redirects to without", async ({ page }) => {
		await page.goto("/about/", { waitUntil: "commit" })
		await page.waitForURL("**/about")
		expect(page.url()).toContain("/about")
		expect(page.url()).not.toMatch(/\/about\/$/)
	})

	test("query string preserved without trailing slash", async ({ page }) => {
		await page.goto("/about?q=1")
		expect(page.url()).toContain("/about?q=1")
		expect(page.url()).not.toMatch(/\/about\//)
	})

	test("file extension returns 404", async ({ page }) => {
		const response = await page.goto("/something.json")
		expect(response).not.toBeNull()
		expect(response?.status()).toBe(404)
	})
})
