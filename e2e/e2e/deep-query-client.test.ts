import { expect, test } from "@playwright/test"
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

/* ── 1. useSuspenseQuery renders on SSR ──────────────────────────────── */

test.describe("QueryClient: SSR rendering", () => {
	test("useSuspenseQuery renders data in SSR HTML", async ({ page }) => {
		const response = await page.request.get(`${BASE}/query-basic`)
		const html = await response.text()
		/* query data should be present in the SSR HTML */
		expect(html).toContain("42")
		expect(html).toContain("from-loader")
	})

	test("page loads and hydrates without errors", async ({ page }) => {
		const capture = setupConsoleCapture(page)
		await loadPage(page, "/query-basic")
		capture.assertClean()
	})

	test("query data visible after hydration", async ({ page }) => {
		await loadPage(page, "/query-basic")
		await expect(page.locator("[data-testid=query-count]")).toHaveText("42")
		await expect(page.locator("[data-testid=loader-msg]")).toHaveText("from-loader")
	})
})

/* ── 2. SSR → client query hydration ─────────────────────────────────── */

test.describe("QueryClient: hydration", () => {
	test("query data survives hydration (source=server)", async ({ page }) => {
		await loadPage(page, "/query-hydration")
		const source = await page.locator("[data-testid=query-source]").textContent()
		/* if hydration works, data came from server (SSR) not client refetch */
		expect(source).toBe("server")
	})

	test("staleTime prevents refetch after hydration", async ({ page }) => {
		await loadPage(page, "/query-hydration")
		const ts1 = await page.locator("[data-testid=query-ts]").textContent()
		/* wait and check timestamp hasn't changed (staleTime=60s) */
		await page.waitForTimeout(1_000)
		const ts2 = await page.locator("[data-testid=query-ts]").textContent()
		expect(ts1).toBe(ts2)
	})
})

/* ── 3. FlareState.q serialization ───────────────────────────────────── */

test.describe("QueryClient: FlareState.q", () => {
	test("FlareState.q populated with query entries", async ({ page }) => {
		await loadPage(page, "/query-flare-state")
		const q = await page.evaluate(() => (self as unknown as { flare?: { q?: unknown[] } }).flare?.q)
		expect(Array.isArray(q)).toBe(true)
		expect((q as unknown[]).length).toBeGreaterThan(0)
	})

	test("FlareState.q contains query key and data", async ({ page }) => {
		await loadPage(page, "/query-flare-state")
		const entries = await page.evaluate(
			() =>
				(self as unknown as { flare?: { q?: Array<{ data: unknown; key: unknown[] }> } }).flare
					?.q ?? [],
		)
		const stateEntry = entries.find((e) => Array.isArray(e.key) && e.key[0] === "state-check")
		expect(stateEntry).toBeDefined()
		expect(stateEntry?.data).toEqual({ payload: "state-check" })
	})

	test("query data rendered from SSR matches FlareState", async ({ page }) => {
		await loadPage(page, "/query-flare-state")
		await expect(page.locator("[data-testid=state-query-data]")).toHaveText("state-check")
	})
})

/* ── 4. Multiple queries on same page ────────────────────────────────── */

test.describe("QueryClient: multiple queries", () => {
	test("user query renders", async ({ page }) => {
		await loadPage(page, "/query-multi")
		await expect(page.locator("[data-testid=user-name]")).toHaveText("Alice")
		await expect(page.locator("[data-testid=user-role]")).toHaveText("admin")
	})

	test("items query renders", async ({ page }) => {
		await loadPage(page, "/query-multi")
		await expect(page.locator("[data-testid=items-count]")).toHaveText("2")
		await expect(page.locator("[data-testid=items-first]")).toHaveText("Item A")
	})

	test("both queries coexist without errors", async ({ page }) => {
		const capture = setupConsoleCapture(page)
		await loadPage(page, "/query-multi")
		await expect(page.locator("[data-testid=user-name]")).toHaveText("Alice")
		await expect(page.locator("[data-testid=items-count]")).toHaveText("2")
		capture.assertClean()
	})

	test("SSR HTML contains both query results", async ({ page }) => {
		const response = await page.request.get(`${BASE}/query-multi`)
		const html = await response.text()
		expect(html).toContain("Alice")
		expect(html).toContain("Item A")
	})
})

/* ── 5. Piggybacked queries → QueryClient cache ─────────────────────── */

test.describe("QueryClient: piggyback integration", () => {
	test("mutation applies piggybacked data to query cache", async ({ page }) => {
		await loadPage(page, "/query-piggyback")
		await page.click("[data-testid=call-mutation]")
		await expect(page.locator("[data-testid=mutation-result]")).not.toHaveText("", {
			timeout: 5_000,
		})
		const result = await page.locator("[data-testid=mutation-result]").textContent()
		expect(result).toContain("piggyback-test")

		/* piggybacked demo-items should be in cache */
		const cacheHit = await page.locator("[data-testid=cache-hit]").textContent()
		expect(cacheHit).not.toBe("miss")
		expect(cacheHit).not.toBe("")
		const items = JSON.parse(cacheHit ?? "null") as unknown[]
		expect(Array.isArray(items)).toBe(true)
		expect(items.length).toBeGreaterThan(0)
	})

	test("serverFnQueryOptions applies piggybacked queries", async ({ page }) => {
		await loadPage(page, "/query-piggyback")
		await page.click("[data-testid=call-query-opts]")
		await expect(page.locator("[data-testid=mutation-result]")).not.toHaveText("", {
			timeout: 5_000,
		})
		const cacheHit = await page.locator("[data-testid=cache-hit]").textContent()
		expect(cacheHit).not.toBe("miss")
		expect(cacheHit).not.toBe("")
	})
})

/* ── 6. SPA navigation preserves query cache ─────────────────────────── */

test.describe("QueryClient: SPA navigation", () => {
	test("navigate away and back preserves query data", async ({ page }) => {
		await loadPage(page, "/query-basic")
		await expect(page.locator("[data-testid=query-count]")).toHaveText("42")

		/* navigate away */
		await navigateSPA(page, "/about")

		/* navigate back */
		await navigateSPA(page, "/query-basic")
		await expect(page.locator("[data-testid=query-count]")).toHaveText("42")
	})

	test("navigating between query pages shows correct data", async ({ page }) => {
		await loadPage(page, "/query-basic")
		await expect(page.locator("[data-testid=query-count]")).toHaveText("42")

		await navigateSPA(page, "/query-multi")
		await expect(page.locator("[data-testid=user-name]")).toHaveText("Alice")
		await expect(page.locator("[data-testid=items-count]")).toHaveText("2")
	})
})

/* ── 7. No console errors on query pages ─────────────────────────────── */

test.describe("QueryClient: error-free operation", () => {
	test("query-basic clean console", async ({ page }) => {
		const capture = setupConsoleCapture(page)
		await loadPage(page, "/query-basic")
		capture.assertClean()
	})

	test("query-hydration clean console", async ({ page }) => {
		const capture = setupConsoleCapture(page)
		await loadPage(page, "/query-hydration")
		capture.assertClean()
	})

	test("query-multi clean console", async ({ page }) => {
		const capture = setupConsoleCapture(page)
		await loadPage(page, "/query-multi")
		capture.assertClean()
	})

	test("query-flare-state clean console", async ({ page }) => {
		const capture = setupConsoleCapture(page)
		await loadPage(page, "/query-flare-state")
		capture.assertClean()
	})
})
