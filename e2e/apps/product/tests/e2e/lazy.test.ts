import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("lazy() and clientLazy()", () => {
	test("SSR: lazy-heavy resolves after hydration", async ({ page }) => {
		await loadPage(page, "/lazy-test")
		await expect(page.locator("[data-testid=lazy-heavy]")).toBeVisible({ timeout: 10_000 })
		await expect(page.locator("[data-testid=lazy-heavy]")).toHaveText("Heavy Component Loaded")
	})

	test("SSR: pending shown or lazy-heavy visible (race-safe)", async ({ page }) => {
		await page.goto("/lazy-test", { waitUntil: "domcontentloaded" })
		const pending = page.locator("[data-testid=lazy-heavy-pending]")
		const resolved = page.locator("[data-testid=lazy-heavy]")
		await expect(pending.or(resolved)).toBeVisible({ timeout: 10_000 })
	})

	test("SSR: clientLazy not rendered in SSR HTML", async ({ page }) => {
		const response = await page.goto("/lazy-test", { waitUntil: "commit" })
		const html = (await response?.text()) ?? ""
		expect(html).not.toContain('data-testid="lazy-client-widget"')
	})

	test("Hydration: clientLazy renders after hydration", async ({ page }) => {
		await loadPage(page, "/lazy-test")
		const widget = page.locator(
			"[data-testid=client-widget-section] [data-testid=lazy-client-widget]",
		)
		await expect(widget).toBeVisible({ timeout: 10_000 })
		await expect(widget).toHaveText("Client Widget Loaded")
	})

	test("Hydration: clientLazy eager renders after hydration", async ({ page }) => {
		await loadPage(page, "/lazy-test")
		await expect(
			page.locator("[data-testid=client-widget-eager-section] [data-testid=lazy-client-widget]"),
		).toBeVisible({ timeout: 10_000 })
	})

	test("SPA: navigate to /lazy-test, all components load", async ({ page }) => {
		await loadPage(page, "/")
		await navigateSPA(page, "/lazy-test")
		await expect(page.locator("[data-testid=lazy-test-page]")).toBeVisible({ timeout: 10_000 })
		await expect(page.locator("[data-testid=lazy-heavy]")).toBeVisible({ timeout: 10_000 })
		await expect(
			page.locator("[data-testid=client-widget-section] [data-testid=lazy-client-widget]"),
		).toBeVisible({ timeout: 10_000 })
	})

	test("Error: lazy-error-test shows error boundary", async ({ page }) => {
		await page.goto("/lazy-error-test", { waitUntil: "domcontentloaded" })
		await expect(page.locator("[data-testid=lazy-error-caught]")).toBeVisible({ timeout: 10_000 })
		await expect(page.locator("[data-testid=lazy-error-caught]")).toHaveText("Lazy load failed")
	})

	test("SPA error: navigate to lazy-error-test shows error boundary", async ({ page }) => {
		await loadPage(page, "/")
		await navigateSPA(page, "/lazy-error-test")
		const lazyError = page.locator("[data-testid=lazy-error-caught]")
		const rootError = page.locator("[data-testid=root-error-boundary]")
		await expect(lazyError.or(rootError)).toBeVisible({ timeout: 10_000 })
	})

	test("no console errors on /lazy-test", async ({ page }) => {
		const console = setupConsoleCapture(page)
		await loadPage(page, "/lazy-test")
		await expect(page.locator("[data-testid=lazy-heavy]")).toBeVisible({ timeout: 10_000 })
		await expect(
			page.locator("[data-testid=client-widget-section] [data-testid=lazy-client-widget]"),
		).toBeVisible({ timeout: 10_000 })
		console.assertClean()
	})
})
