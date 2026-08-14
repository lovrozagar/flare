import { expect, test } from "@playwright/test"
import {
	assertSPANavigation,
	loadPage,
	navigateSPA,
	setNavMarker,
	setupConsoleCapture,
} from "./helpers"

test.describe("SSR segment parsing", () => {
	test("single segment parses correctly", async ({ page }) => {
		await loadPage(page, "/catch-all/a")
		await expect(page.locator("[data-testid=catch-all]")).toBeVisible()
		expect(await page.locator("[data-testid=catchall-count]").textContent()).toBe("1")
		expect(await page.locator("[data-testid=catchall-segments]").textContent()).toBe("a")
	})

	test("three segments parse correctly", async ({ page }) => {
		await loadPage(page, "/catch-all/a/b/c")
		expect(await page.locator("[data-testid=catchall-count]").textContent()).toBe("3")
		expect(await page.locator("[data-testid=catchall-segments]").textContent()).toBe("a/b/c")
	})

	test("four-level deep nested path", async ({ page }) => {
		await loadPage(page, "/catch-all/deep/nested/path/here")
		expect(await page.locator("[data-testid=catchall-count]").textContent()).toBe("4")
		expect(await page.locator("[data-testid=catchall-segments]").textContent()).toBe(
			"deep/nested/path/here",
		)
	})

	test("/catch-all/single has count 1", async ({ page }) => {
		await loadPage(page, "/catch-all/single")
		expect(await page.locator("[data-testid=catchall-count]").textContent()).toBe("1")
		expect(await page.locator("[data-testid=catchall-segments]").textContent()).toBe("single")
	})
})

test.describe("SPA navigation", () => {
	test("SPA nav from / to /catch-all/x/y renders correct segments", async ({ page }) => {
		await loadPage(page, "/")
		await navigateSPA(page, "/catch-all/x/y")

		await expect(page.locator("[data-testid=catch-all]")).toBeVisible()
		expect(await page.locator("[data-testid=catchall-count]").textContent()).toBe("2")
		expect(await page.locator("[data-testid=catchall-segments]").textContent()).toBe("x/y")
	})

	test("SPA nav between different catch-all paths updates data", async ({ page }) => {
		await loadPage(page, "/catch-all/first/path")
		await expect(page.locator("[data-testid=catchall-count]")).toHaveText("2")
		await expect(page.locator("[data-testid=catchall-segments]")).toHaveText("first/path")

		await navigateSPA(page, "/catch-all/second/longer/path")

		await expect(page.locator("[data-testid=catchall-count]")).toHaveText("3", { timeout: 5_000 })
		await expect(page.locator("[data-testid=catchall-segments]")).toHaveText("second/longer/path")
	})
})

test.describe("History navigation", () => {
	test("back button from /catch-all/a/b to / restores home", async ({ page }) => {
		await loadPage(page, "/")
		await setNavMarker(page)

		await navigateSPA(page, "/catch-all/a/b")
		await expect(page.locator("[data-testid=catch-all]")).toBeVisible()
		expect(await page.locator("[data-testid=catchall-count]").textContent()).toBe("2")

		await page.goBack()
		await page.waitForURL("**/")
		await assertSPANavigation(page)
		await expect(page.locator("[data-testid=home]")).toBeVisible()
	})

	test("forward after back restores catch-all segments", async ({ page }) => {
		await loadPage(page, "/")
		await setNavMarker(page)

		await navigateSPA(page, "/catch-all/a/b")
		expect(await page.locator("[data-testid=catchall-segments]").textContent()).toBe("a/b")

		await page.goBack()
		await page.waitForURL("**/")
		await assertSPANavigation(page)

		await page.goForward()
		await page.waitForURL("**/catch-all/a/b")
		await assertSPANavigation(page)

		expect(await page.locator("[data-testid=catchall-count]").textContent()).toBe("2")
		expect(await page.locator("[data-testid=catchall-segments]").textContent()).toBe("a/b")
	})
})

test.describe("Console cleanliness", () => {
	test("no console errors during SSR load of catch-all route", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/catch-all/deep/nested/path")
		await expect(page.locator("[data-testid=catch-all]")).toBeVisible()
		cap.assertClean()
	})

	test("no console errors during SPA nav to catch-all route", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")
		await navigateSPA(page, "/catch-all/foo/bar/baz")
		await expect(page.locator("[data-testid=catch-all]")).toBeVisible()
		expect(await page.locator("[data-testid=catchall-count]").textContent()).toBe("3")
		cap.assertClean()
	})
})
