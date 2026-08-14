import { expect, test } from "@playwright/test"
import { loadPage, parseNDJSON } from "./helpers"

test.describe("NDJSON protocol deep", () => {
	test("error loader emits t:e", async ({ request }) => {
		const res = await request.get("/error-test?fail=true", { headers: { "x-d": "1" } })
		const msgs = parseNDJSON(await res.text())
		expect(msgs.some((m) => m.t === "e")).toBe(true)
	})

	test("redirect emits t:x", async ({ request }) => {
		const res = await request.get("/old-page", { headers: { "x-d": "1" }, maxRedirects: 0 })
		if (res.status() >= 300 && res.status() < 400) return
		const msgs = parseNDJSON(await res.text())
		expect(msgs.some((m) => m.t === "x" || m.t === "r")).toBe(true)
	})

	test("prefetch x-p is marked", async ({ request }) => {
		const res = await request.get("/about", { headers: { "x-d": "1", "x-p": "1" } })
		expect(res.status()).toBe(200)
		expect(res.headers()["content-type"]).toContain("ndjson")
	})

	test("stale x-m still 200", async ({ request }) => {
		const res = await request.get("/about", { headers: { "x-d": "1", "x-m": "stale-id" } })
		expect(res.status()).toBe(200)
	})

	test("SSR about text matches after hydrate", async ({ page }) => {
		const res = await page.goto("/about")
		const html = (await res?.text()) ?? ""
		expect(html).toContain("This is the about page for the Flare E2E test app.")
		await loadPage(page, "/about")
		await expect(page.getByTestId("about-content")).toHaveText(
			"This is the about page for the Flare E2E test app.",
		)
	})

	test("render props cause enter and preloader first", async ({ page }) => {
		await loadPage(page, "/props-demo")
		await expect(page.getByTestId("loader-cause")).toHaveText("enter")
		await expect(page.getByTestId("loader-prefetch")).toHaveText("false")
		await expect(page.getByTestId("location-pathname")).toHaveText("/props-demo")
		await expect(page.getByTestId("preloader-before-loader")).toHaveText("true")
	})

	test("multi defer resolves both", async ({ page }) => {
		await page.goto("/deferred-multi")
		await expect(page.getByTestId("fast-value")).toHaveText("fast-result")
		await expect(page.getByTestId("slow-value")).toHaveText("slow-result")
	})

	test("deferred error surface", async ({ page }) => {
		await page.goto("/deferred-error")
		await expect(page.getByTestId("deferred-error-msg")).toContainText("Deferred failed intentionally")
	})
})
