import { expect, test } from "@playwright/test"
import {
	assertSPANavigation,
	clickAndAssertSPA,
	loadPage,
	navigateSPA,
	setNavMarker,
	setupConsoleCapture,
} from "./helpers"

const BASE = ""

test.describe("Optional params [[locale]] — SSR", () => {
	test("renders with locale param present", async ({ page }) => {
		await loadPage(page, "/optional-locale/en")
		await expect(page.getByTestId("locale-value")).toHaveText("en")
		await expect(page.getByTestId("greeting")).toHaveText("Hello World")
	})

	test("renders with locale=de", async ({ page }) => {
		await loadPage(page, "/optional-locale/de")
		await expect(page.getByTestId("locale-value")).toHaveText("de")
		await expect(page.getByTestId("greeting")).toHaveText("Hallo Welt")
	})

	test("renders with locale=fr", async ({ page }) => {
		await loadPage(page, "/optional-locale/fr")
		await expect(page.getByTestId("locale-value")).toHaveText("fr")
		await expect(page.getByTestId("greeting")).toHaveText("Bonjour le monde")
	})

	test("renders without locale param (default)", async ({ page }) => {
		await loadPage(page, "/optional-locale")
		await expect(page.getByTestId("locale-value")).toHaveText("default")
		await expect(page.getByTestId("greeting")).toHaveText("Hello World")
	})

	test("layout wrapper is present", async ({ page }) => {
		await loadPage(page, "/optional-locale/en")
		await expect(page.getByTestId("optional-locale-layout")).toBeVisible()
	})

	test("head title reflects locale", async ({ page }) => {
		await loadPage(page, "/optional-locale/de")
		await expect(page).toHaveTitle("Locale: de")
	})

	test("head title for default locale", async ({ page }) => {
		await loadPage(page, "/optional-locale")
		await expect(page).toHaveTitle("Locale: default")
	})
})

test.describe("Optional params [[locale]] — SPA navigation", () => {
	test("navigate from home to locale route", async ({ page }) => {
		await loadPage(page, "/")
		await navigateSPA(page, "/optional-locale/en")
		await expect(page.getByTestId("locale-value")).toHaveText("en")
	})

	test("navigate from locale to no-locale", async ({ page }) => {
		await loadPage(page, "/optional-locale/de")
		await navigateSPA(page, "/optional-locale")
		await expect(page.getByTestId("locale-value")).toHaveText("default")
	})

	test("navigate between locales", async ({ page }) => {
		await loadPage(page, "/optional-locale/en")
		await navigateSPA(page, "/optional-locale/fr")
		await expect(page.getByTestId("greeting")).toHaveText("Bonjour le monde")
	})

	test("SPA nav updates title", async ({ page }) => {
		await loadPage(page, "/")
		await navigateSPA(page, "/optional-locale/de")
		await expect(page).toHaveTitle("Locale: de")
	})
})

test.describe("Optional params [[locale]] — history", () => {
	test("back/forward between locale and no-locale", async ({ page }) => {
		await loadPage(page, "/optional-locale")
		await setNavMarker(page)
		await navigateSPA(page, "/optional-locale/fr")
		await expect(page.getByTestId("greeting")).toHaveText("Bonjour le monde")

		await page.goBack()
		await page.waitForURL("**/optional-locale")
		await assertSPANavigation(page)
		await expect(page.getByTestId("locale-value")).toHaveText("default")

		await page.goForward()
		await page.waitForURL("**/optional-locale/fr")
		await assertSPANavigation(page)
		await expect(page.getByTestId("greeting")).toHaveText("Bonjour le monde")
	})

	test("back/forward between different locales", async ({ page }) => {
		await loadPage(page, "/optional-locale/en")
		await setNavMarker(page)
		await navigateSPA(page, "/optional-locale/de")
		await expect(page.getByTestId("greeting")).toHaveText("Hallo Welt")

		await page.goBack()
		await page.waitForURL("**/optional-locale/en")
		await assertSPANavigation(page)
		await expect(page.getByTestId("greeting")).toHaveText("Hello World")
	})
})

test.describe("Optional params [[locale]] — NDJSON", () => {
	test("NDJSON request includes correct params", async ({ page }) => {
		const response = await page.request.get(`${BASE}/optional-locale/de`, {
			headers: { "x-d": "1" },
		})
		expect(response.status()).toBe(200)
		const text = await response.text()
		const lines = text.split("\n").filter(Boolean)
		/* Find the page-specific loader line (has locale/greeting data, not root) */
		const loaderLine = lines.find((l) => {
			const parsed = JSON.parse(l) as { d?: { locale?: string }; t: string }
			return parsed.t === "l" && parsed.d && "locale" in parsed.d
		})
		expect(loaderLine).toBeDefined()
		const data = JSON.parse(loaderLine!) as { d: { greeting: string; locale: string } }
		expect(data.d.locale).toBe("de")
		expect(data.d.greeting).toBe("Hallo Welt")
	})

	test("NDJSON request without locale param", async ({ page }) => {
		const response = await page.request.get(`${BASE}/optional-locale`, {
			headers: { "x-d": "1" },
		})
		expect(response.status()).toBe(200)
		const text = await response.text()
		const lines = text.split("\n").filter(Boolean)
		const loaderLine = lines.find((l) => {
			const parsed = JSON.parse(l) as { d?: { locale?: string }; t: string }
			return parsed.t === "l" && parsed.d && "locale" in parsed.d
		})
		expect(loaderLine).toBeDefined()
		const data = JSON.parse(loaderLine!) as { d: { greeting: string; locale: string } }
		expect(data.d.locale).toBe("default")
		expect(data.d.greeting).toBe("Hello World")
	})
})

test.describe("Optional params [[locale]] — console", () => {
	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/optional-locale/en")
		await navigateSPA(page, "/optional-locale")
		await navigateSPA(page, "/optional-locale/fr")
		cap.assertClean()
	})
})
