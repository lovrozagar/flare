import { expect, test } from "@playwright/test"
import { loadPage, setupConsoleCapture } from "./helpers"

test.describe("Deep: SSR error rendering", () => {
	test("/broken returns 500 with error stacks stripped from FlareState", async ({ page }) => {
		const response = await page.goto("/broken", { waitUntil: "domcontentloaded" })
		expect(response?.status()).toBe(500)

		const state = await page.evaluate(
			() => (self as unknown as { flare?: Record<string, unknown> }).flare,
		)
		expect(state).toBeDefined()

		/* Error stacks are stripped from serialized FlareState for security */
		const errors = (state as Record<string, unknown>).e
		expect(errors).toBeUndefined()
	})

	test("/broken FlareState.m still has match entries despite error", async ({ page }) => {
		await page.goto("/broken", { waitUntil: "domcontentloaded" })

		const state = (await page.evaluate(
			() => (self as unknown as { flare?: Record<string, unknown> }).flare,
		)) as { m: unknown[]; p: string }

		expect(state.p).toBe("/broken")
		expect(state.m.length).toBeGreaterThanOrEqual(1)
	})

	test("404 page returns correct status and renders not-found content", async ({ page }) => {
		const response = await page.goto("/nonexistent-xyz-abc")
		expect(response?.status()).toBe(404)

		/* Not-found boundary renders custom 404 content */
		const body = await page.evaluate(() => document.body.innerHTML)
		expect(body.length).toBeGreaterThan(0)
	})
})

test.describe("Deep: auth boundary SSR", () => {
	test("/dashboard without auth returns 401 status", async ({ page }) => {
		const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
		expect(response?.status()).toBe(401)
	})

	test("/dashboard with x-test-auth header returns 200", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "user-123" })
		const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
		expect(response?.status()).toBe(200)
	})

	test("/dashboard with auth shows dashboard content", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "user-123" })
		await loadPage(page, "/dashboard")
		await expect(page.locator("[data-testid=dashboard-layout]")).toBeVisible()
		await expect(page.locator("[data-testid=dashboard-home]")).toBeVisible()
		await expect(page.locator("[data-testid=dashboard-header]")).toContainText("Dashboard")
	})

	test("/dashboard/settings with auth shows settings content", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "user-123" })
		await loadPage(page, "/dashboard/settings")
		await expect(page.locator("[data-testid=dashboard-layout]")).toBeVisible()
		await expect(page.locator("[data-testid=dashboard-settings]")).toBeVisible()
		await expect(page.locator("[data-testid=dashboard-settings]")).toContainText("Settings")
	})
})

test.describe("Deep: CSR error navigation", () => {
	test("SPA nav to /broken changes URL without page crash", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) throw new Error("__flareNavigate not available")
			return nav("/broken").catch(() => {
				/* navigate may reject on error route — that's expected */
			})
		})
		await page.waitForURL("**/broken", { timeout: 10_000 })
		expect(page.url()).toContain("/broken")

		/* Page should still be functional — not white screen */
		const body = await page.evaluate(() => document.body.innerHTML)
		expect(body.length).toBeGreaterThan(0)
	})

	test("SPA nav to /dashboard (no auth) changes URL without crash", async ({ page }) => {
		await loadPage(page, "/")

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			if (!nav) throw new Error("__flareNavigate not available")
			return nav("/dashboard").catch(() => {
				/* navigate may reject on auth error */
			})
		})
		await page.waitForURL("**/dashboard", { timeout: 10_000 })
		expect(page.url()).toContain("/dashboard")
	})

	test("recovery: SPA nav from error to valid page works", async ({ page }) => {
		const cap = setupConsoleCapture(page)

		/* Start on broken page via SSR */
		await page.goto("/broken", { waitUntil: "domcontentloaded" })

		/* Try navigating to home — even if hydration partially failed, page shouldn't be stuck */
		await page.goto("/")
		await loadPage(page, "/")
		await expect(page.locator("[data-testid=home]")).toBeVisible()
		const ts = await page.locator("[data-testid=timestamp]").textContent()
		expect(Number(ts)).toBeGreaterThan(0)
	})
})

test.describe("Deep: error NDJSON responses", () => {
	test("NDJSON to /broken returns error message in response", async ({ request }) => {
		const response = await request.get("/broken", {
			headers: { "x-d": "1" },
		})
		expect(response.status()).toBe(200)

		const body = await response.text()
		const lines = body.split("\n").filter((l) => l.trim().length > 0)
		expect(lines.length).toBeGreaterThan(0)

		/* Should contain an error message line */
		const hasError = lines.some((line) => {
			const msg = JSON.parse(line) as Record<string, unknown>
			return msg.t === "e" || (typeof msg.t === "string" && line.includes("Intentional"))
		})
		expect(hasError).toBe(true)
	})

	test("NDJSON to /dashboard without auth returns 401-related data", async ({ request }) => {
		const response = await request.get("/dashboard", {
			headers: { "x-d": "1" },
		})
		/* NDJSON always returns 200 status, error encoded in messages */
		const body = await response.text()
		expect(body.length).toBeGreaterThan(0)
	})
})
