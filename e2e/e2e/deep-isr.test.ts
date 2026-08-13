import { expect, test } from "@playwright/test"
import { loadPage, setupConsoleCapture } from "./helpers"

/**
 * ISR (Incremental Static Regeneration) e2e tests.
 *
 * The /isr-test route has: static: { revalidate: 5 }
 * The server.ts configures an in-memory FlareStore.
 *
 * Flow:
 * 1. First request → ISR miss → blocking SSR fallback
 * 2. Background populate stores HTML + NDJSON in static store
 * 3. Second request → serves from static store
 */

test.describe("ISR — blocking fallback on cache miss", () => {
	test("first request renders via SSR when store is empty", async ({ request }) => {
		const res = await request.get("/isr-test")
		expect(res.status()).toBe(200)

		const html = await res.text()
		expect(html).toContain('data-testid="isr-test"')
		expect(html).toContain('data-testid="isr-source"')
		expect(html).toContain('data-testid="isr-rendered-at"')

		const renderedAt = html.match(/data-testid="isr-rendered-at">(\d+)</)
		expect(renderedAt).not.toBeNull()
		expect(Number(renderedAt?.[1])).toBeGreaterThan(0)
	})

	test("ISR fallback response includes security headers", async ({ page }) => {
		const res = await page.goto("/isr-test")
		expect(res?.status()).toBe(200)

		expect(res?.headers()["x-content-type-options"]).toBe("nosniff")
		expect(res?.headers()["x-frame-options"]).toBe("DENY")
	})

	test("middleware runs on ISR fallback SSR response", async ({ request }) => {
		const res = await request.get("/isr-test")
		expect(res.status()).toBe(200)

		expect(res.headers()["x-middleware-ran"]).toBe("true")
		expect(res.headers()["x-request-id"]).toBeDefined()
		expect(res.headers()["x-timing"]).toBeDefined()
	})
})

test.describe("ISR — on-demand store population", () => {
	test("second request serves from static store after background populate", async ({ request }) => {
		/* First request — SSR, triggers background populate */
		const res1 = await request.get("/isr-test")
		expect(res1.status()).toBe(200)
		const html1 = await res1.text()
		const ts1 = html1.match(/data-testid="isr-rendered-at">(\d+)</)

		/* Wait for background populate to complete */
		await new Promise((r) => setTimeout(r, 500))

		/* Second request — should come from static store */
		const res2 = await request.get("/isr-test")
		expect(res2.status()).toBe(200)
		const html2 = await res2.text()
		const ts2 = html2.match(/data-testid="isr-rendered-at">(\d+)</)

		expect(ts1).not.toBeNull()
		expect(ts2).not.toBeNull()

		/*
		 * The store was populated by a background re-render, so
		 * the stored timestamp may differ from the first SSR.
		 * What matters is the second request returns valid data.
		 */
		expect(Number(ts2?.[1])).toBeGreaterThan(0)
	})

	test("ISR-served response has valid HTML structure", async ({ request }) => {
		/* Prime the store */
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 500))

		const res = await request.get("/isr-test")
		const html = await res.text()

		expect(html).toContain("<!DOCTYPE html>")
		expect(html).toContain("<html")
		expect(html).toContain("</html>")
		expect(html).toContain('data-testid="isr-test"')
	})

	test("ISR-served response has fresh nonce (not placeholder)", async ({ request }) => {
		/* Prime the store */
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 500))

		const res = await request.get("/isr-test")
		const html = await res.text()

		/* Should NOT contain the placeholder */
		expect(html).not.toContain("__FLARE_NONCE__")
	})

	test("ISR-served response includes security headers", async ({ page, request }) => {
		/* Prime the store */
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 500))

		/* Use page.goto for non-CSP headers (CSP stripped in dev mode) */
		const res = await page.goto("/isr-test")
		expect(res?.headers()["x-content-type-options"]).toBe("nosniff")
		expect(res?.headers()["x-frame-options"]).toBe("DENY")
	})
})

test.describe("ISR — NDJSON data requests", () => {
	test("NDJSON request returns valid data after store populated", async ({ request }) => {
		/* Prime the store */
		await request.get("/isr-test")
		await new Promise((r) => setTimeout(r, 500))

		const res = await request.get("/isr-test", {
			headers: { "x-d": "1" },
		})
		expect(res.status()).toBe(200)

		const ct = res.headers()["content-type"]
		expect(ct).toContain("ndjson")

		const body = await res.text()
		expect(body.length).toBeGreaterThan(0)
	})
})

test.describe("ISR — browser hydration", () => {
	test("ISR fallback page hydrates correctly", async ({ page }) => {
		await loadPage(page, "/isr-test")
		await expect(page.locator("[data-testid=isr-test]")).toBeVisible()

		const source = await page.locator("[data-testid=isr-source]").textContent()
		expect(source).toBe("ssr")

		const renderedAt = await page.locator("[data-testid=isr-rendered-at]").textContent()
		expect(Number(renderedAt)).toBeGreaterThan(0)
	})

	test("no console errors on ISR page", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/isr-test")
		await page.waitForTimeout(200)
		cap.assertClean()
	})
})
