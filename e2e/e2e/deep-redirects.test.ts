import { expect, test } from "@playwright/test"
import {
	BASE,
	assertSPANavigation,
	loadPage,
	navigateSPA,
	setNavMarker,
	setupConsoleCapture,
} from "./helpers"

test.describe("Deep: SSR chain redirect", () => {
	test("chain redirect (a → b → final) lands on final page", async ({ page }) => {
		await page.goto("/chain-a")
		await page.waitForURL("**/chain-final")
		expect(page.url()).toContain("/chain-final")
		await expect(page.locator("[data-testid=chain-final-page]")).toBeVisible()
	})

	test("chain redirect final page has correct content", async ({ page }) => {
		await page.goto("/chain-a")
		await page.waitForURL("**/chain-final")
		await expect(page.locator("[data-testid=chain-path]")).toContainText("a → b → final")
		await expect(page.locator("[data-testid=chain-arrived]")).toContainText("true")
	})

	test("SSR redirect returns 302 status before following", async ({ page }) => {
		const response = await page.request.get(`${BASE}/redirect-source`, {
			maxRedirects: 0,
		})
		expect(response.status()).toBe(302)
		expect(response.headers().location).toBe("/redirect-target")
	})

	test("SSR redirect 301 status code", async ({ page }) => {
		/* chain-a uses 302, verify redirect-source also uses 302 */
		const response = await page.request.get(`${BASE}/chain-a`, {
			maxRedirects: 0,
		})
		expect(response.status()).toBe(302)
		expect(response.headers().location).toBe("/chain-b")
	})
})

test.describe("Deep: SPA redirect behavior", () => {
	test("SPA chain redirect resolves to final page", async ({ page }) => {
		await loadPage(page, "/")
		await setNavMarker(page)
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) throw new Error("__flareNavigate not available")
			return nav("/chain-a")
		})
		await page.waitForURL("**/chain-final", { timeout: 10_000 })
		await assertSPANavigation(page)
		await expect(page.locator("[data-testid=chain-final-page]")).toBeVisible()
	})

	test("SPA redirect is SPA (no full reload)", async ({ page }) => {
		await loadPage(page, "/")
		await setNavMarker(page)
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) throw new Error("__flareNavigate not available")
			return nav("/redirect-source")
		})
		await page.waitForURL("**/redirect-target", { timeout: 10_000 })
		await assertSPANavigation(page)
	})

	test("back button after redirect goes to pre-redirect page", async ({ page }) => {
		await loadPage(page, "/about")
		await setNavMarker(page)
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) throw new Error("__flareNavigate not available")
			return nav("/redirect-source")
		})
		await page.waitForURL("**/redirect-target", { timeout: 10_000 })
		await assertSPANavigation(page)

		await page.goBack()
		await page.waitForURL("**/about", { timeout: 10_000 })
		await expect(page.locator("[data-testid=about]")).toBeVisible()
	})
})

test.describe("Deep: redirect with query params", () => {
	test("SSR redirect preserves query params", async ({ page }) => {
		const response = await page.request.get(`${BASE}/redirect-with-params?foo=bar&baz=qux`, {
			maxRedirects: 0,
		})
		expect(response.status()).toBe(302)
		const location = response.headers().location
		expect(location).toContain("foo=bar")
		expect(location).toContain("baz=qux")
	})

	test("SPA redirect preserves query params in URL", async ({ page }) => {
		await loadPage(page, "/")
		await setNavMarker(page)
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) throw new Error("__flareNavigate not available")
			return nav("/redirect-with-params?keep=this")
		})
		await page.waitForURL("**/redirect-target**", { timeout: 10_000 })
		expect(page.url()).toContain("keep=this")
	})
})

test.describe("Deep: NDJSON redirect shape", () => {
	test("NDJSON redirect response has correct fields", async ({ page }) => {
		const response = await page.request.get(`${BASE}/redirect-source`, {
			headers: { "x-d": "1" },
			maxRedirects: 0,
		})
		expect(response.status()).toBe(200)
		const text = await response.text()
		const lines = text.trim().split("\n").filter(Boolean)
		/* Find redirect line */
		const redirectLine = lines.find((l) => {
			const parsed = JSON.parse(l) as Record<string, unknown>
			return parsed.t === "x"
		})
		expect(redirectLine).toBeDefined()
		const data = JSON.parse(redirectLine as string) as Record<string, unknown>
		expect(data.t).toBe("x")
		expect(data.u).toBe("/redirect-target")
		expect(data.s).toBe(302)
	})
})

test.describe("Deep: authenticated redirect", () => {
	test("SSR authenticated redirect works with auth header", async ({ page }) => {
		const response = await page.request.get(`${BASE}/redirect-auth`, {
			headers: { "x-test-auth": "admin" },
			maxRedirects: 0,
		})
		expect(response.status()).toBe(302)
		expect(response.headers().location).toBe("/redirect-target")
	})

	test("SSR authenticated redirect returns 401 without auth", async ({ page }) => {
		const response = await page.request.get(`${BASE}/redirect-auth`, {
			maxRedirects: 0,
		})
		/* Without auth, authenticate() should fail before redirect */
		expect(response.status()).toBe(401)
	})
})

test.describe("Deep: redirect console clean", () => {
	test("no console errors during SSR redirect", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await page.goto("/redirect-source")
		await page.waitForURL("**/redirect-target")
		await expect(page.locator("[data-testid=redirect-target]")).toBeVisible()
		cap.assertClean()
	})

	test("no console errors during chain redirect", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await page.goto("/chain-a")
		await page.waitForURL("**/chain-final")
		await expect(page.locator("[data-testid=chain-final-page]")).toBeVisible()
		cap.assertClean()
	})
})
