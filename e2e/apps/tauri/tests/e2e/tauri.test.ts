import { expect, test } from "@playwright/test"

test.describe("tauri app", () => {
	test("home SSR + hydrate", async ({ page, request }) => {
		const res = await request.get("/")
		expect(res.status()).toBe(200)
		expect(await res.text()).toContain("Flare on Tauri")
		await page.goto("/", { waitUntil: "domcontentloaded" })
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: 20_000,
		})
		await expect(page.getByTestId("request-id")).toBeVisible()
	})

	test("unknown path is 404", async ({ page, request }) => {
		const res = await request.get("/nope")
		expect(res.status()).toBe(404)
		await page.goto("/nope")
		await expect(page.getByTestId("not-found-heading")).toContainText("404")
	})
})
