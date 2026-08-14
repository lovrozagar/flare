import { expect, test } from "@playwright/test"

test.describe("theme first land", () => {
	test("blocking theme script is in SSR HTML before modulepreload", async ({ request }) => {
		const response = await request.get("/")
		expect(response.status()).toBe(200)
		const html = await response.text()
		const themeIdx = html.indexOf("flare.theme")
		const preloadIdx = html.indexOf('rel="modulepreload"')
		expect(themeIdx).toBeGreaterThan(0)
		if (preloadIdx >= 0) expect(themeIdx).toBeLessThan(preloadIdx)
	})

	test("stored dark theme applies at first land, before hydration", async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem("flare.theme", "dark")
		})
		await page.goto("/", { waitUntil: "commit" })
		await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark")
		const snap = await page.evaluate(() => ({
			colorScheme: document.documentElement.style.colorScheme,
			theme: document.documentElement.getAttribute("data-theme"),
		}))
		expect(snap.theme).toBe("dark")
		expect(snap.colorScheme).toBe("dark")
	})

	test("first land and reload both keep data-theme", async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem("flare.theme", "dark")
		})
		await page.goto("/", { waitUntil: "commit" })
		await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark")
		await page.reload({ waitUntil: "commit" })
		await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark")
	})
})
