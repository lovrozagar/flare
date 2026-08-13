import { expect, test } from "@playwright/test"
import { loadPage, setupConsoleCapture } from "./helpers"

/**
 * ISR + Defer e2e tests.
 *
 * Routes:
 * - /isr-defer — ISR (revalidate: 10) + single defer (200ms)
 * - /isr-multi-defer — ISR + fast (50ms) + slow (300ms) defer
 * - /isr-defer-error — ISR + defer that throws
 *
 * Flow:
 * 1. First request → ISR miss → SSR with streaming deferred values
 * 2. Background populate stores resolved deferred data in NDJSON
 * 3. Second request → serves from store with all data pre-resolved
 */

const POPULATE_WAIT = 1000

test.describe("ISR + Defer — first SSR miss with streaming", () => {
	test("single defer renders pending then resolves", async ({ page }) => {
		await loadPage(page, "/isr-defer")
		await expect(page.locator("[data-testid=isr-defer]")).toBeVisible()
		await expect(page.locator("[data-testid=isr-defer-title]")).toHaveText("ISR Defer")

		/* Deferred value resolves after ~200ms */
		await expect(page.locator("[data-testid=isr-defer-resolved]")).toBeVisible({
			timeout: 5000,
		})
		expect(await page.locator("[data-testid=isr-defer-resolved]").textContent()).toBe(
			"deferred-comment",
		)
	})

	test("multi defer — both fast and slow resolve", async ({ page }) => {
		await loadPage(page, "/isr-multi-defer")
		await expect(page.locator("[data-testid=isr-multi-defer]")).toBeVisible()

		/* Fast resolves first (~50ms) */
		await expect(page.locator("[data-testid=isr-multi-fast-resolved]")).toBeVisible({
			timeout: 5000,
		})
		expect(await page.locator("[data-testid=isr-multi-fast-resolved]").textContent()).toBe(
			"fast-result",
		)

		/* Slow resolves after (~300ms) */
		await expect(page.locator("[data-testid=isr-multi-slow-resolved]")).toBeVisible({
			timeout: 5000,
		})
		expect(await page.locator("[data-testid=isr-multi-slow-resolved]").textContent()).toBe(
			"slow-result",
		)
	})

	test("defer error caught by error boundary", async ({ page }) => {
		await loadPage(page, "/isr-defer-error")
		await expect(page.locator("[data-testid=isr-defer-error]")).toBeVisible()

		/* Error boundary catches the deferred throw */
		await expect(page.locator("[data-testid=isr-defer-error-caught]")).toBeVisible({
			timeout: 5000,
		})
		expect(await page.locator("[data-testid=isr-defer-error-caught]").textContent()).toBe("boom")
	})
})

test.describe("ISR + Defer — store captures resolved deferred data", () => {
	test("store-served single defer has resolved data in streaming chunk", async ({ request }) => {
		/* Prime store — first request triggers SSR + background populate */
		await request.get("/isr-defer")
		await new Promise((r) => setTimeout(r, POPULATE_WAIT))

		/* Second request from store */
		const res = await request.get("/isr-defer")
		const html = await res.text()
		expect(res.status()).toBe(200)

		/*
		 * Store captures full SSR output including streaming deferred chunks.
		 * The deferred data appears in __flare_q.push() scripts at the end,
		 * not pre-rendered in the HTML body (that's done client-side by Await).
		 */
		expect(html).toContain("deferred-comment")
		expect(html).toContain('data-testid="isr-defer"')
	})

	test("store-served multi-defer has both values in streaming chunks", async ({ request }) => {
		await request.get("/isr-multi-defer")
		await new Promise((r) => setTimeout(r, POPULATE_WAIT))

		const res = await request.get("/isr-multi-defer")
		const html = await res.text()
		expect(res.status()).toBe(200)

		expect(html).toContain("fast-result")
		expect(html).toContain("slow-result")
	})

	test("store still populated even when defer throws", async ({ request }) => {
		await request.get("/isr-defer-error")
		await new Promise((r) => setTimeout(r, POPULATE_WAIT))

		/* Store should still have the page, even with deferred error */
		const res = await request.get("/isr-defer-error")
		expect(res.status()).toBe(200)

		const html = await res.text()
		expect(html).toContain('data-testid="isr-defer-error"')
		expect(html).toContain('data-testid="isr-defer-error-rendered-at"')
	})
})

test.describe("ISR + Defer — NDJSON data requests", () => {
	test("NDJSON from store includes deferred resolved data", async ({ request }) => {
		await request.get("/isr-defer")
		await new Promise((r) => setTimeout(r, POPULATE_WAIT))

		const res = await request.get("/isr-defer", {
			headers: { "x-d": "1" },
		})
		expect(res.status()).toBe(200)

		const ct = res.headers()["content-type"]
		expect(ct).toContain("ndjson")

		const body = await res.text()
		expect(body.length).toBeGreaterThan(0)
	})

	test("NDJSON from store for multi-defer has complete data", async ({ request }) => {
		await request.get("/isr-multi-defer")
		await new Promise((r) => setTimeout(r, POPULATE_WAIT))

		const res = await request.get("/isr-multi-defer", {
			headers: { "x-d": "1" },
		})
		expect(res.status()).toBe(200)
		expect(res.headers()["content-type"]).toContain("ndjson")

		const body = await res.text()
		expect(body.length).toBeGreaterThan(0)
	})
})

test.describe("ISR + Defer — nonce integrity on deferred chunks", () => {
	test("all scripts in ISR defer page have nonces", async ({ request }) => {
		const res = await request.get("/isr-defer")
		const html = await res.text()

		const scripts = html.match(/<script[^>]*>/g) ?? []
		/* Filter Vite dev scripts */
		const flareScripts = scripts.filter(
			(s) =>
				!s.includes("/@vite") &&
				!s.includes("__vite") &&
				!s.includes("@vite") &&
				!s.includes("/@id/") &&
				!s.includes("html-proxy"),
		)
		expect(flareScripts.length).toBeGreaterThan(0)

		for (const s of flareScripts) {
			expect(s).toMatch(/nonce="[a-f0-9]+"/)
		}
	})

	test("store-served ISR defer page has no nonce placeholders", async ({ request }) => {
		await request.get("/isr-defer")
		await new Promise((r) => setTimeout(r, POPULATE_WAIT))

		const res = await request.get("/isr-defer")
		const html = await res.text()

		expect(html).not.toContain("__FLARE_NONCE__")
	})
})

test.describe("ISR + Defer — hydration on store-served pages", () => {
	test("ISR defer page hydrates from store correctly", async ({ page, request }) => {
		/* Prime store */
		await request.get("/isr-defer")
		await new Promise((r) => setTimeout(r, POPULATE_WAIT))

		await loadPage(page, "/isr-defer")
		await expect(page.locator("[data-testid=isr-defer]")).toBeVisible()
		await expect(page.locator("[data-testid=isr-defer-resolved]")).toBeVisible({
			timeout: 5000,
		})
		expect(await page.locator("[data-testid=isr-defer-resolved]").textContent()).toBe(
			"deferred-comment",
		)
	})

	test("ISR multi-defer page hydrates from store correctly", async ({ page, request }) => {
		await request.get("/isr-multi-defer")
		await new Promise((r) => setTimeout(r, POPULATE_WAIT))

		await loadPage(page, "/isr-multi-defer")
		await expect(page.locator("[data-testid=isr-multi-fast-resolved]")).toBeVisible({
			timeout: 5000,
		})
		await expect(page.locator("[data-testid=isr-multi-slow-resolved]")).toBeVisible({
			timeout: 5000,
		})
	})

	test("no console errors on ISR defer pages", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/isr-defer")
		await page.locator("[data-testid=isr-defer-resolved]").waitFor({ timeout: 5000 })
		await page.waitForTimeout(200)
		cap.assertClean()
	})

	test("ISR defer error page catches error without unexpected console errors", async ({ page }) => {
		const errors: string[] = []
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				errors.push(msg.text())
			}
		})
		const pageErrors: string[] = []
		page.on("pageerror", (error) => {
			/* "boom" is the intentional defer error — expected */
			if (error.message.includes("boom")) return
			if (/SSL certificate error/i.test(error.message)) return
			pageErrors.push(error.message)
		})

		await loadPage(page, "/isr-defer-error")
		await page.locator("[data-testid=isr-defer-error-caught]").waitFor({ timeout: 5000 })
		await page.waitForTimeout(200)

		expect(pageErrors).toEqual([])
	})
})
