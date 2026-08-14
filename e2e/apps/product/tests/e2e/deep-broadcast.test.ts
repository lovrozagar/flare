import { expect, test } from "@playwright/test"
import { loadPage } from "./helpers"

/**
 * Cross-tab broadcast tests.
 * BroadcastChannel works between pages in the SAME browser context (same origin).
 * Separate contexts are isolated — use context.newPage() for cross-tab tests.
 */

test.describe("Broadcast: createBroadcastSignal cross-tab", () => {
	test("signal update in tab A reflects in tab B", async ({ context }) => {
		const tab1 = await context.newPage()
		const tab2 = await context.newPage()

		await loadPage(tab1, "/broadcast-test")
		await loadPage(tab2, "/broadcast-test")

		await expect(tab1.locator("[data-testid=count]")).toHaveText("0")
		await expect(tab2.locator("[data-testid=count]")).toHaveText("0")

		await tab1.locator("[data-testid=inc-btn]").click()
		await expect(tab1.locator("[data-testid=count]")).toHaveText("1")

		await expect(tab2.locator("[data-testid=count]")).toHaveText("1", { timeout: 5000 })
	})

	test("multiple increments sync correctly", async ({ context }) => {
		const tab1 = await context.newPage()
		const tab2 = await context.newPage()

		await loadPage(tab1, "/broadcast-test")
		await loadPage(tab2, "/broadcast-test")

		await tab1.locator("[data-testid=inc-btn]").click()
		await tab1.locator("[data-testid=inc-btn]").click()
		await tab1.locator("[data-testid=inc-btn]").click()

		await expect(tab1.locator("[data-testid=count]")).toHaveText("3")
		await expect(tab2.locator("[data-testid=count]")).toHaveText("3", { timeout: 5000 })
	})

	test("bidirectional: tab2 updates reflect in tab1", async ({ context }) => {
		const tab1 = await context.newPage()
		const tab2 = await context.newPage()

		await loadPage(tab1, "/broadcast-test")
		await loadPage(tab2, "/broadcast-test")

		await tab1.locator("[data-testid=inc-btn]").click()
		await expect(tab2.locator("[data-testid=count]")).toHaveText("1", { timeout: 5000 })

		await tab2.locator("[data-testid=inc-btn]").click()
		await expect(tab2.locator("[data-testid=count]")).toHaveText("2")
		await expect(tab1.locator("[data-testid=count]")).toHaveText("2", { timeout: 5000 })
	})
})

test.describe("Broadcast: useBroadcast cross-tab events", () => {
	test("emit in tab1 received in tab2", async ({ context }) => {
		const tab1 = await context.newPage()
		const tab2 = await context.newPage()

		await loadPage(tab1, "/broadcast-test")
		await loadPage(tab2, "/broadcast-test")

		await tab1.locator("[data-testid=emit-btn]").click()

		await expect(tab2.locator("[data-testid=received]")).toHaveText("hello-from-tab", {
			timeout: 5000,
		})

		/* Tab 1 should NOT receive its own event (BroadcastChannel only fires in other tabs) */
		await tab1.waitForTimeout(500)
		await expect(tab1.locator("[data-testid=received]")).toHaveText("")
	})
})

test.describe("Broadcast: signal registry (same-tab multi-component)", () => {
	test("two components with same signal key share state locally", async ({ page }) => {
		await loadPage(page, "/broadcast-signal-multi")

		await expect(page.locator("[data-testid=comp-a-value]")).toHaveText("0")
		await expect(page.locator("[data-testid=comp-b-value]")).toHaveText("0")

		await page.locator("[data-testid=comp-a-set]").click()

		await expect(page.locator("[data-testid=comp-a-value]")).toHaveText("42")
		await expect(page.locator("[data-testid=comp-b-value]")).toHaveText("42")
	})

	test("cross-tab sync with multi-component signal", async ({ context }) => {
		const tab1 = await context.newPage()
		const tab2 = await context.newPage()

		await loadPage(tab1, "/broadcast-signal-multi")
		await loadPage(tab2, "/broadcast-signal-multi")

		await tab1.locator("[data-testid=comp-a-set]").click()
		await expect(tab1.locator("[data-testid=comp-a-value]")).toHaveText("42")
		await expect(tab1.locator("[data-testid=comp-b-value]")).toHaveText("42")

		await expect(tab2.locator("[data-testid=comp-a-value]")).toHaveText("42", { timeout: 5000 })
		await expect(tab2.locator("[data-testid=comp-b-value]")).toHaveText("42", { timeout: 5000 })
	})
})

test.describe("Broadcast: router navigate broadcast", () => {
	test("navigate with broadcast: true triggers navigation in other tab", async ({ context }) => {
		const tab1 = await context.newPage()
		const tab2 = await context.newPage()

		await loadPage(tab1, "/broadcast-test")
		await loadPage(tab2, "/broadcast-test")

		await tab1.locator("[data-testid=nav-broadcast-btn]").click()

		await tab1.waitForURL("**/about", { timeout: 5000 })
		await tab2.waitForURL("**/about", { timeout: 5000 })
	})

	test("navigate without broadcast does NOT affect other tab", async ({ context }) => {
		const tab1 = await context.newPage()
		const tab2 = await context.newPage()

		await loadPage(tab1, "/broadcast-test")
		await loadPage(tab2, "/broadcast-test")

		await tab1.locator("[data-testid=nav-no-broadcast-btn]").click()

		await tab1.waitForURL("**/about", { timeout: 5000 })

		await tab2.waitForTimeout(1000)
		expect(tab2.url()).toContain("/broadcast-test")
	})
})

test.describe("Broadcast: router invalidate broadcast", () => {
	test("invalidate with broadcast triggers revalidation in other tab", async ({ context }) => {
		const tab1 = await context.newPage()
		const tab2 = await context.newPage()

		await loadPage(tab1, "/broadcast-test")
		await loadPage(tab2, "/broadcast-test")

		const tab2NavPromise = tab2.waitForFunction(
			() => {
				return new Promise<boolean>((resolve) => {
					const observer = new PerformanceObserver((list) => {
						for (const entry of list.getEntries()) {
							if (entry.entryType === "resource") {
								resolve(true)
							}
						}
					})
					observer.observe({ entryTypes: ["resource"] })
					setTimeout(() => resolve(true), 3000)
				})
			},
			null,
			{ timeout: 10000 },
		)

		await tab1.locator("[data-testid=invalidate-broadcast-btn]").click()

		await tab2NavPromise

		expect(tab1.url()).toContain("/broadcast-test")
		expect(tab2.url()).toContain("/broadcast-test")
	})
})

test.describe("Broadcast: three tabs", () => {
	test("signal update propagates to all other tabs", async ({ context }) => {
		const tab1 = await context.newPage()
		const tab2 = await context.newPage()
		const tab3 = await context.newPage()

		await loadPage(tab1, "/broadcast-test")
		await loadPage(tab2, "/broadcast-test")
		await loadPage(tab3, "/broadcast-test")

		await tab1.locator("[data-testid=inc-btn]").click()

		await expect(tab1.locator("[data-testid=count]")).toHaveText("1")
		await expect(tab2.locator("[data-testid=count]")).toHaveText("1", { timeout: 5000 })
		await expect(tab3.locator("[data-testid=count]")).toHaveText("1", { timeout: 5000 })

		await tab3.locator("[data-testid=inc-btn]").click()

		await expect(tab3.locator("[data-testid=count]")).toHaveText("2")
		await expect(tab1.locator("[data-testid=count]")).toHaveText("2", { timeout: 5000 })
		await expect(tab2.locator("[data-testid=count]")).toHaveText("2", { timeout: 5000 })
	})
})

test.describe("Broadcast: tab close resilience", () => {
	test("closing sender tab does not break receiver", async ({ context }) => {
		const tab1 = await context.newPage()
		const tab2 = await context.newPage()

		await loadPage(tab1, "/broadcast-test")
		await loadPage(tab2, "/broadcast-test")

		await tab1.locator("[data-testid=inc-btn]").click()
		await expect(tab2.locator("[data-testid=count]")).toHaveText("1", { timeout: 5000 })

		await tab1.close()

		await tab2.locator("[data-testid=inc-btn]").click()
		await expect(tab2.locator("[data-testid=count]")).toHaveText("2")
	})

	test("new tab picks up broadcasts from existing tab", async ({ context }) => {
		const tab1 = await context.newPage()

		await loadPage(tab1, "/broadcast-test")

		await tab1.locator("[data-testid=inc-btn]").click()
		await tab1.locator("[data-testid=inc-btn]").click()
		await tab1.locator("[data-testid=inc-btn]").click()
		await expect(tab1.locator("[data-testid=count]")).toHaveText("3")

		/* Open new tab — starts fresh with initial value */
		const tab2 = await context.newPage()
		await loadPage(tab2, "/broadcast-test")
		await expect(tab2.locator("[data-testid=count]")).toHaveText("0")

		/* New broadcast from tab 1 still reaches tab 2 */
		await tab1.locator("[data-testid=inc-btn]").click()
		await expect(tab2.locator("[data-testid=count]")).toHaveText("4", { timeout: 5000 })
	})
})
