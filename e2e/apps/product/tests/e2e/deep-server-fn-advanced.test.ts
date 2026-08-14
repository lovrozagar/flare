import { expect, test } from "@playwright/test"
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

/* ── 3.1 Streaming in browser ──────────────────────────────────────── */

test.describe("Deep: streaming in browser", () => {
	test("stream chunks appear progressively", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=start-stream]")

		/* wait for all 5 chunks */
		await expect(page.locator("[data-testid=stream-count]")).toHaveText("5", {
			timeout: 10_000,
		})
	})

	test("stream chunks in order", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=start-stream]")
		await expect(page.locator("[data-testid=stream-count]")).toHaveText("5", {
			timeout: 10_000,
		})

		for (let i = 0; i < 5; i++) {
			const text = await page.locator(`[data-testid=chunk-${i}]`).textContent()
			const parsed = JSON.parse(text ?? "{}") as { chunk: number }
			expect(parsed.chunk).toBe(i + 1)
		}
	})

	test("stream done signal in UI", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=start-stream]")
		await expect(page.locator("[data-testid=stream-status]")).toHaveText("done", {
			timeout: 10_000,
		})
	})

	test("slow stream shows intermediate count", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=start-stream]")

		/* poll until we see an intermediate count (> 0 but < 5) */
		let sawIntermediate = false
		for (let attempt = 0; attempt < 20; attempt++) {
			const text = await page.locator("[data-testid=stream-count]").textContent()
			const count = Number.parseInt(text ?? "0", 10)
			if (count > 0 && count < 5) {
				sawIntermediate = true
				break
			}
			if (count >= 5) break
			await page.waitForTimeout(100)
		}
		expect(sawIntermediate).toBe(true)
	})

	test("no console errors during streaming", async ({ page }) => {
		const capture = setupConsoleCapture(page)
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=start-stream]")
		await expect(page.locator("[data-testid=stream-status]")).toHaveText("done", {
			timeout: 10_000,
		})
		capture.assertClean()
	})
})

/* ── 3.2 Mutation + piggyback ──────────────────────────────────────── */

test.describe("Deep: mutation + piggyback", () => {
	test("mutation result in UI", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=call-piggyback]")
		await expect(page.locator("[data-testid=mut-result]")).not.toHaveText("", {
			timeout: 5_000,
		})
		const text = await page.locator("[data-testid=mut-result]").textContent()
		expect(text).toContain("test")
	})

	test("piggyback items in UI", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=call-piggyback]")
		await expect(page.locator("[data-testid=piggy-items]")).not.toHaveText("", {
			timeout: 5_000,
		})
		const text = await page.locator("[data-testid=piggy-items]").textContent()
		const items = JSON.parse(text ?? "[]") as unknown[]
		expect(Array.isArray(items)).toBe(true)
		expect(items.length).toBeGreaterThan(0)
	})

	test("piggyback count shown", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=call-piggyback]")
		await expect(page.locator("[data-testid=piggy-count]")).not.toHaveText("", {
			timeout: 5_000,
		})
		const text = await page.locator("[data-testid=piggy-count]").textContent()
		expect(text).toBe("1")
	})

	test("response structure via HTTP", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/piggyback/piggyback`, {
			data: { value: "http-test" },
		})
		expect(response.status()).toBe(200)
		const json = (await response.json()) as {
			data: unknown
			queries: Array<{ data: unknown; key: unknown[] }>
		}
		expect(json.queries).toBeDefined()
		expect(Array.isArray(json.queries)).toBe(true)
	})
})

/* ── 3.3 Concurrent calls ─────────────────────────────────────────── */

test.describe("Deep: concurrent calls", () => {
	test("three concurrent calls all resolve", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=call-concurrent]")
		await expect(page.locator("[data-testid=conc-count]")).toHaveText("3", {
			timeout: 10_000,
		})
	})

	test("all IDs present", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=call-concurrent]")
		await expect(page.locator("[data-testid=conc-count]")).toHaveText("3", {
			timeout: 10_000,
		})
		const text = await page.locator("[data-testid=conc-results]").textContent()
		expect(text).toContain("A")
		expect(text).toContain("B")
		expect(text).toContain("C")
	})

	test("5 concurrent via HTTP all succeed", async ({ page }) => {
		const ids = ["X1", "X2", "X3", "X4", "X5"]
		const results = await Promise.all(
			ids.map((id) =>
				page.request.post(`${BASE}/_fn/concurrent/concurrent`, {
					data: { delay: 10, id },
				}),
			),
		)
		for (const res of results) {
			expect(res.status()).toBe(200)
		}
		const bodies = await Promise.all(
			results.map((r) => r.json() as Promise<{ data: { id: string } }>),
		)
		const returnedIds = bodies.map((b) => b.data.id).sort()
		expect(returnedIds).toEqual(["X1", "X2", "X3", "X4", "X5"])
	})
})

/* ── 3.4 Stream abort on navigation ───────────────────────────────── */

test.describe("Deep: stream abort on navigation", () => {
	test("navigate away during stream - no errors", async ({ page }) => {
		const capture = setupConsoleCapture(page)
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=start-stream]")
		/* wait briefly for stream to start */
		await page.waitForTimeout(300)
		await navigateSPA(page, "/about")
		/* brief pause to let any errors propagate */
		await page.waitForTimeout(500)
		capture.assertClean()
	})

	test("return after abort shows clean state", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=start-stream]")
		await page.waitForTimeout(300)
		await navigateSPA(page, "/about")
		await navigateSPA(page, "/server-fn-advanced")
		const status = await page.locator("[data-testid=stream-status]").textContent()
		expect(status).toBe("idle")
		const count = await page.locator("[data-testid=stream-count]").textContent()
		expect(count).toBe("0")
	})
})

/* ── 3.5 Error recovery ───────────────────────────────────────────── */

test.describe("Deep: error recovery", () => {
	test("first call fails, retry succeeds", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")

		/* first call — should fail */
		await page.click("[data-testid=call-retry]")
		await expect(page.locator("[data-testid=retry-error]")).toBeVisible({ timeout: 5_000 })

		/* second call — should succeed */
		await page.click("[data-testid=call-retry]")
		await expect(page.locator("[data-testid=retry-result]")).not.toHaveText("", {
			timeout: 5_000,
		})
		const text = await page.locator("[data-testid=retry-result]").textContent()
		expect(text).toContain("success")
	})

	test("error does not corrupt state", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")

		/* trigger error */
		await page.click("[data-testid=call-retry]")
		await expect(page.locator("[data-testid=retry-error]")).toBeVisible({ timeout: 5_000 })

		/* succeed */
		await page.click("[data-testid=call-retry]")
		await expect(page.locator("[data-testid=retry-result]")).not.toHaveText("", {
			timeout: 5_000,
		})

		/* error should be cleared */
		const errorVisible = await page.locator("[data-testid=retry-error]").isVisible()
		expect(errorVisible).toBe(false)
	})

	test("500 format via HTTP", async ({ page }) => {
		/* unique key ensures first call is always the odd (failing) one */
		const key = `http-500-${Date.now()}`
		const response = await page.request.post(`${BASE}/_fn/retryable/retryable`, {
			data: { key },
		})
		expect(response.status()).toBe(500)
		const json = (await response.json()) as { message: string }
		expect(json.message).toBe("Internal server error")
	})
})

/* ── 3.6 Auth from browser ─────────────────────────────────────────── */

test.describe("Deep: auth from browser", () => {
	test("401 without auth from UI", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=call-auth-no]")
		await expect(page.locator("[data-testid=auth-error]")).toBeVisible({ timeout: 5_000 })
		const text = await page.locator("[data-testid=auth-error]").textContent()
		expect(text).toContain("Unauthorized")
	})

	test("200 with auth from UI", async ({ page }) => {
		await loadPage(page, "/server-fn-advanced")
		await page.click("[data-testid=call-auth-yes]")
		await expect(page.locator("[data-testid=auth-result]")).not.toHaveText("", {
			timeout: 5_000,
		})
		const text = await page.locator("[data-testid=auth-result]").textContent()
		expect(text).toContain("user-42")
	})

	test("401 via raw HTTP", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/auth-gated/auth-gated`, {
			data: {},
		})
		expect(response.status()).toBe(401)
	})

	test("403 via raw HTTP", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/authorized/authorized`, {
			data: {},
			headers: { "x-test-auth": "regular-user" },
		})
		expect(response.status()).toBe(403)
	})
})

/* ── 3.7 Piggyback structure via HTTP ──────────────────────────────── */

test.describe("Deep: piggyback structure via HTTP", () => {
	test("response includes queries array", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/piggyback/piggyback`, {
			data: { value: "struct-test" },
		})
		const json = (await response.json()) as Record<string, unknown>
		expect(json).toHaveProperty("queries")
		expect(Array.isArray(json.queries)).toBe(true)
	})

	test("piggyback keys are arrays", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/piggyback/piggyback`, {
			data: { value: "keys-test" },
		})
		const json = (await response.json()) as {
			queries: Array<{ data: unknown; key: unknown[] }>
		}
		for (const q of json.queries) {
			expect(Array.isArray(q.key)).toBe(true)
		}
	})

	test("piggyback data matches handler output", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/piggyback/piggyback`, {
			data: { value: "match-test" },
		})
		const json = (await response.json()) as {
			queries: Array<{ data: unknown; key: unknown[] }>
		}
		const itemsQuery = json.queries.find((q) => Array.isArray(q.key) && q.key[0] === "demo-items")
		const countQuery = json.queries.find((q) => Array.isArray(q.key) && q.key[0] === "demo-count")
		expect(itemsQuery?.data).toEqual([{ id: 1, name: "match-test" }])
		expect(countQuery?.data).toBe(1)
	})
})
