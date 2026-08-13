import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("Cache hit on immediate revisit", () => {
	test("cached timestamp is identical after immediate A→B→A", async ({ page }) => {
		await loadPage(page, "/cache-test")

		const ts1 = await page.locator("[data-testid=cache-timestamp]").textContent()
		const rand1 = await page.locator("[data-testid=cache-random]").textContent()
		expect(Number(ts1)).toBeGreaterThan(0)

		await navigateSPA(page, "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()

		await navigateSPA(page, "/cache-test")
		await expect(page.locator("[data-testid=cache-test]")).toBeVisible()

		const ts2 = await page.locator("[data-testid=cache-timestamp]").textContent()
		const rand2 = await page.locator("[data-testid=cache-random]").textContent()

		expect(ts2).toBe(ts1)
		expect(rand2).toBe(rand1)
	})

	test("no NDJSON fetch fires on immediate revisit within staleTime", async ({ page }) => {
		await loadPage(page, "/cache-test")

		const ndjsonRequests: string[] = []
		await page.route("**/*", (route) => {
			const headers = route.request().headers()
			if (headers["x-d"] === "1") {
				ndjsonRequests.push(route.request().url())
			}
			return route.continue()
		})

		await navigateSPA(page, "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()

		const countBeforeReturn = ndjsonRequests.filter((u) => u.includes("/cache-test")).length

		await navigateSPA(page, "/cache-test")
		await expect(page.locator("[data-testid=cache-test]")).toBeVisible()

		const countAfterReturn = ndjsonRequests.filter((u) => u.includes("/cache-test")).length

		/* Return trip should not trigger a new NDJSON fetch for /cache-test */
		expect(countAfterReturn).toBe(countBeforeReturn)
	})
})

test.describe("Cache miss after staleTime", () => {
	test("timestamp changes after staleTime expires", async ({ page }) => {
		await loadPage(page, "/cache-test")

		const ts1 = await page.locator("[data-testid=cache-timestamp]").textContent()
		expect(Number(ts1)).toBeGreaterThan(0)

		await navigateSPA(page, "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()

		/* Wait beyond staleTime (2000ms) */
		await page.waitForTimeout(2500)

		await navigateSPA(page, "/cache-test")
		await expect(page.locator("[data-testid=cache-test]")).toBeVisible()

		const ts2 = await page.locator("[data-testid=cache-timestamp]").textContent()
		expect(Number(ts2)).toBeGreaterThan(0)
		expect(ts2).not.toBe(ts1)
	})

	test("NDJSON fetch fires after staleTime expires", async ({ page }) => {
		await loadPage(page, "/cache-test")

		const ndjsonRequests: string[] = []
		await page.route("**/*", (route) => {
			const headers = route.request().headers()
			if (headers["x-d"] === "1") {
				ndjsonRequests.push(route.request().url())
			}
			return route.continue()
		})

		await navigateSPA(page, "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()

		const countBeforeReturn = ndjsonRequests.filter((u) => u.includes("/cache-test")).length

		/* Wait beyond staleTime (2000ms) */
		await page.waitForTimeout(2500)

		await navigateSPA(page, "/cache-test")
		await expect(page.locator("[data-testid=cache-test]")).toBeVisible()

		const countAfterReturn = ndjsonRequests.filter((u) => u.includes("/cache-test")).length

		/* Stale cache should trigger a fresh NDJSON fetch */
		expect(countAfterReturn).toBeGreaterThan(countBeforeReturn)
	})

	test("random value differs on cache miss", async ({ page }) => {
		await loadPage(page, "/cache-test")

		const rand1 = await page.locator("[data-testid=cache-random]").textContent()

		await navigateSPA(page, "/about")
		await page.waitForTimeout(2500)
		await navigateSPA(page, "/cache-test")

		const rand2 = await page.locator("[data-testid=cache-random]").textContent()

		/* Math.random() should produce a different value on re-fetch */
		expect(rand2).not.toBe(rand1)
	})
})

test.describe("Independent cache entries", () => {
	test("/cache-test and /about have separate cache lifecycles", async ({ page }) => {
		await loadPage(page, "/cache-test")

		const cacheTs1 = await page.locator("[data-testid=cache-timestamp]").textContent()
		expect(Number(cacheTs1)).toBeGreaterThan(0)

		await navigateSPA(page, "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()
		const aboutContent = await page.locator("[data-testid=about-content]").textContent()
		expect(aboutContent).toContain("about page")

		/* Revisit /cache-test immediately — should be cached */
		await navigateSPA(page, "/cache-test")
		const cacheTs2 = await page.locator("[data-testid=cache-timestamp]").textContent()
		expect(cacheTs2).toBe(cacheTs1)

		/* Revisit /about — about has no staleTime so it fetches fresh */
		await navigateSPA(page, "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()
		const aboutContentAgain = await page.locator("[data-testid=about-content]").textContent()
		expect(aboutContentAgain).toContain("about page")
	})

	test("cache-test cache does not affect home cache", async ({ page }) => {
		await loadPage(page, "/")
		const homeTs1 = Number(await page.locator("[data-testid=timestamp]").textContent())
		expect(homeTs1).toBeGreaterThan(0)

		await navigateSPA(page, "/cache-test")
		const cacheTs1 = await page.locator("[data-testid=cache-timestamp]").textContent()

		/* Navigate back to home — home has no staleTime so it should re-fetch */
		await page.waitForTimeout(50)
		await navigateSPA(page, "/")
		const homeTs2 = Number(await page.locator("[data-testid=timestamp]").textContent())
		expect(homeTs2).not.toBe(homeTs1)

		/* cache-test should still be cached (within staleTime) */
		await navigateSPA(page, "/cache-test")
		const cacheTs2 = await page.locator("[data-testid=cache-timestamp]").textContent()
		expect(cacheTs2).toBe(cacheTs1)
	})
})

test.describe("NDJSON fetch tracking", () => {
	test("A→B→A counts correct number of NDJSON requests", async ({ page }) => {
		const ndjsonRequests: string[] = []
		await page.route("**/*", (route) => {
			const headers = route.request().headers()
			if (headers["x-d"] === "1") {
				ndjsonRequests.push(route.request().url())
			}
			return route.continue()
		})

		await loadPage(page, "/cache-test")

		/* SPA nav to /about triggers NDJSON for /about */
		await navigateSPA(page, "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()
		const aboutFetches = ndjsonRequests.filter((u) => u.includes("/about")).length
		expect(aboutFetches).toBe(1)

		/* SPA nav back to /cache-test within staleTime — no NDJSON for /cache-test */
		await navigateSPA(page, "/cache-test")
		await expect(page.locator("[data-testid=cache-test]")).toBeVisible()
		const cacheFetches = ndjsonRequests.filter((u) => u.includes("/cache-test")).length
		expect(cacheFetches).toBe(0)
	})

	test("stale revisit generates exactly one new NDJSON request", async ({ page }) => {
		const ndjsonRequests: string[] = []
		await page.route("**/*", (route) => {
			const headers = route.request().headers()
			if (headers["x-d"] === "1") {
				ndjsonRequests.push(route.request().url())
			}
			return route.continue()
		})

		await loadPage(page, "/cache-test")

		await navigateSPA(page, "/about")
		await page.waitForTimeout(2500)
		await navigateSPA(page, "/cache-test")
		await expect(page.locator("[data-testid=cache-test]")).toBeVisible()

		const cacheFetches = ndjsonRequests.filter((u) => u.includes("/cache-test")).length
		expect(cacheFetches).toBe(1)
	})
})

test.describe("Console cleanliness", () => {
	test("no errors during cache hit scenario", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/cache-test")
		await navigateSPA(page, "/about")
		await navigateSPA(page, "/cache-test")
		await page.waitForTimeout(200)
		cap.assertClean()
	})

	test("no errors during cache miss scenario", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/cache-test")
		await navigateSPA(page, "/about")
		await page.waitForTimeout(2500)
		await navigateSPA(page, "/cache-test")
		await page.waitForTimeout(200)
		cap.assertClean()
	})
})
