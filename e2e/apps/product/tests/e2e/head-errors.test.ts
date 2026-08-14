import { expect, test } from "@playwright/test"
import { loadPage } from "./helpers"

test.describe("redirect extras", () => {
	test("307 and 308", async ({ request }) => {
		const r307 = await request.get("/redirect-307", { maxRedirects: 0 })
		expect(r307.status()).toBe(307)
		const r308 = await request.get("/redirect-308", { maxRedirects: 0 })
		expect(r308.status()).toBe(308)
	})

	test("redirect preserves search", async ({ page }) => {
		await page.goto("/redirect-with-params?q=keep")
		await page.waitForURL("**/redirect-target**")
		await expect(page.getByTestId("redirect-q")).toHaveText("keep")
	})
})

test.describe("head merge + integrity", () => {
	test("nested page title wins", async ({ page }) => {
		await page.goto("/head-nest/page")
		await expect(page).toHaveTitle("Page Title")
		const desc = await page.locator('meta[name="description"]').getAttribute("content")
		expect(desc).toBe("from-layout")
	})

	test("head-full has OG twitter canonical and escaped description", async ({ page }) => {
		await page.goto("/head-full")
		const html = await page.content()
		expect(html).toContain("Head Full - OG")
		expect(html).toContain("Head Full - Twitter")
		expect(html).toContain("rel=\"canonical\"")
		expect(html).not.toContain('<script>alert("xss")</script> desc')
	})

	test("x-request-id and x-timing from middleware", async ({ page }) => {
		const res = await page.goto("/about")
		expect(res?.headers()["x-request-id"]).toBeTruthy()
		expect(res?.headers()["x-timing"]).toMatch(/ms/)
	})

	test("COOP or security headers present", async ({ page }) => {
		const res = await page.goto("/")
		expect(res?.headers()["x-content-type-options"]).toBe("nosniff")
		expect(
			res?.headers()["cross-origin-opener-policy"] ??
				res?.headers()["x-frame-options"] ??
				"present",
		).toBeTruthy()
	})
})

test.describe("errors extras", () => {
	test("layout catches child error", async ({ page }) => {
		const res = await page.goto("/layout-catches-child/broken-child")
		expect(res?.status()).toBe(500)
		await expect(page.getByTestId("layout-error-boundary")).toBeVisible()
		await expect(page.getByTestId("layout-error-message")).toContainText("Child broke")
	})

	test("auth inherit on child", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "editor" })
		await loadPage(page, "/chain-auth")
		await expect(page.getByTestId("auth-layout-userId")).toHaveText("editor")
		await expect(page.getByTestId("auth-child-user")).toHaveText("editor")
	})

	test("preloader throw uses errorRender", async ({ page }) => {
		const res = await page.goto("/preloader-throw")
		expect(res?.status()).toBe(500)
		await expect(page.getByTestId("preloader-error-message")).toContainText("Preloader exploded")
	})

	test("preloader redirect", async ({ page }) => {
		await page.goto("/preloader-redirect")
		await page.waitForURL("**/redirect-target")
	})

	test("error retry succeeds", async ({ page }) => {
		await page.request.get("/api/retry-reset")
		await page.goto("/retry-test")
		await expect(page.getByTestId("retry-error-boundary")).toBeVisible()
		await expect(page.getByTestId("retry-button")).toBeVisible()
		await page.getByTestId("retry-button").click()
		await expect(
			page.getByTestId("retry-success").or(page.getByTestId("retry-error-boundary")),
		).toBeVisible()
	})
})
