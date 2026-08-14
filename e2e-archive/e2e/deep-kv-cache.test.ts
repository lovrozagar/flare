import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

/**
 * KV Cache Store e2e tests.
 *
 * These test the server-side KV cache layer (CacheStore) configured on
 * the server handler. The in-memory Map-backed store in server.ts caches
 * loader results between requests, so SSR + NDJSON loads skip the loader
 * when the entry is fresh.
 *
 * The test route /kv-cache-test has:
 *   - kv.staleTime: 5000ms
 *   - kv.ttl: 60s
 *   - loader increments a server-side callCount + returns random + timestamp
 */

test.describe("KV cache — SSR hit on second full load", () => {
	test("second full page load returns cached data from KV store", async ({ page, request }) => {
		/* First load — populates KV cache */
		const res1 = await request.get("/kv-cache-test")
		const html1 = await res1.text()
		const ts1 = html1.match(/data-testid="kv-timestamp">(\d+)</)
		expect(ts1).not.toBeNull()

		/* Second load within staleTime — KV cache hit, same data */
		const res2 = await request.get("/kv-cache-test")
		const html2 = await res2.text()
		const ts2 = html2.match(/data-testid="kv-timestamp">(\d+)</)
		expect(ts2).not.toBeNull()

		expect(ts2?.[1]).toBe(ts1?.[1])
	})

	test("KV cached call count stays same on second SSR load", async ({ request }) => {
		/* First load */
		const res1 = await request.get("/kv-cache-test")
		const html1 = await res1.text()
		const count1 = html1.match(/data-testid="kv-call-count">(\d+)</)

		/* Second load within staleTime — loader should NOT re-run */
		const res2 = await request.get("/kv-cache-test")
		const html2 = await res2.text()
		const count2 = html2.match(/data-testid="kv-call-count">(\d+)</)

		expect(count2?.[1]).toBe(count1?.[1])
	})
})

test.describe("KV cache — SPA navigation uses server KV cache", () => {
	test("NDJSON data request returns KV cached loaderData", async ({ page }) => {
		/* Initial SSR load populates KV */
		await loadPage(page, "/kv-cache-test")
		const ts1 = await page.locator("[data-testid=kv-timestamp]").textContent()
		expect(Number(ts1)).toBeGreaterThan(0)

		/* Navigate away */
		await navigateSPA(page, "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()

		/* Navigate back — NDJSON request hits server, which reads from KV cache */
		await navigateSPA(page, "/kv-cache-test")
		await expect(page.locator("[data-testid=kv-cache-test]")).toBeVisible()

		const ts2 = await page.locator("[data-testid=kv-timestamp]").textContent()

		/*
		 * The server KV cache serves the same timestamp.
		 * The client cache (no client staleTime set) fetches fresh NDJSON,
		 * but the server returns KV-cached loader data.
		 */
		expect(ts2).toBe(ts1)
	})

	test("KV cache call count unchanged across multiple navigations", async ({ page }) => {
		await loadPage(page, "/kv-cache-test")
		const count1 = await page.locator("[data-testid=kv-call-count]").textContent()

		await navigateSPA(page, "/about")
		await navigateSPA(page, "/kv-cache-test")

		const count2 = await page.locator("[data-testid=kv-call-count]").textContent()
		expect(count2).toBe(count1)

		await navigateSPA(page, "/about")
		await navigateSPA(page, "/kv-cache-test")

		const count3 = await page.locator("[data-testid=kv-call-count]").textContent()
		expect(count3).toBe(count1)
	})
})

test.describe("KV cache — parameterized routes", () => {
	test("different slugs get independent KV cache entries", async ({ request }) => {
		const res1 = await request.get("/kv-param-test/alpha")
		const html1 = await res1.text()
		const slug1 = html1.match(/data-testid="kv-param-slug">([^<]+)</)
		const ts1 = html1.match(/data-testid="kv-param-timestamp">(\d+)</)

		const res2 = await request.get("/kv-param-test/beta")
		const html2 = await res2.text()
		const slug2 = html2.match(/data-testid="kv-param-slug">([^<]+)</)
		const ts2 = html2.match(/data-testid="kv-param-timestamp">(\d+)</)

		expect(slug1?.[1]).toBe("alpha")
		expect(slug2?.[1]).toBe("beta")

		/* Different slugs → different timestamps (different loader calls) */
		expect(ts1?.[1]).not.toBe(ts2?.[1])
	})

	test("same slug returns KV cached data on second load", async ({ request }) => {
		const res1 = await request.get("/kv-param-test/gamma")
		const html1 = await res1.text()
		const ts1 = html1.match(/data-testid="kv-param-timestamp">(\d+)</)
		const count1 = html1.match(/data-testid="kv-param-call-count">(\d+)</)

		const res2 = await request.get("/kv-param-test/gamma")
		const html2 = await res2.text()
		const ts2 = html2.match(/data-testid="kv-param-timestamp">(\d+)</)
		const count2 = html2.match(/data-testid="kv-param-call-count">(\d+)</)

		/* Same slug within staleTime → cached */
		expect(ts2?.[1]).toBe(ts1?.[1])
		expect(count2?.[1]).toBe(count1?.[1])
	})

	test("parameterized SPA navigation uses KV cache per slug", async ({ page }) => {
		await loadPage(page, "/kv-param-test/delta")
		const ts1 = await page.locator("[data-testid=kv-param-timestamp]").textContent()

		await navigateSPA(page, "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()

		await navigateSPA(page, "/kv-param-test/delta")
		await expect(page.locator("[data-testid=kv-param-test]")).toBeVisible()
		const ts2 = await page.locator("[data-testid=kv-param-timestamp]").textContent()

		/* Same slug → KV cache hit */
		expect(ts2).toBe(ts1)
	})
})

test.describe("KV cache — static config type", () => {
	test("route with static: true renders normally at runtime", async ({ page }) => {
		await loadPage(page, "/static-cache-test")
		await expect(page.locator("[data-testid=static-cache-test]")).toBeVisible()

		const message = await page.locator("[data-testid=static-message]").textContent()
		expect(message).toContain("ssg: true")

		const builtAt = await page.locator("[data-testid=static-built-at]").textContent()
		expect(Number(builtAt)).toBeGreaterThan(0)
	})

	test("static route works with SPA navigation", async ({ page }) => {
		await loadPage(page, "/about")
		await navigateSPA(page, "/static-cache-test")
		await expect(page.locator("[data-testid=static-cache-test]")).toBeVisible()

		const message = await page.locator("[data-testid=static-message]").textContent()
		expect(message).toContain("ssg: true")
	})
})

test.describe("KV cache — console cleanliness", () => {
	test("no errors during KV cache SSR + SPA round trip", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/kv-cache-test")
		await navigateSPA(page, "/about")
		await navigateSPA(page, "/kv-cache-test")
		await page.waitForTimeout(200)
		cap.assertClean()
	})

	test("no errors during parameterized KV cache navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/kv-param-test/echo")
		await navigateSPA(page, "/about")
		await navigateSPA(page, "/kv-param-test/echo")
		await page.waitForTimeout(200)
		cap.assertClean()
	})
})
