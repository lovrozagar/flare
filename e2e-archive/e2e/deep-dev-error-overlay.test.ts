import { expect, test } from "@playwright/test"
import { loadPage } from "./helpers"

test.describe("@dev-only DevErrorOverlay: no errors state", () => {
	test("overlay not visible when no errors", async ({ page }) => {
		await loadPage(page, "/")
		const overlay = await page.locator("[data-flare-dev-overlay]").count()
		expect(overlay).toBe(0)
	})

	test("page functions normally without overlay", async ({ page }) => {
		await loadPage(page, "/")
		const content = await page.locator("[data-testid=home]").count()
		expect(content).toBeGreaterThan(0)

		/* Navigate and verify no overlay appears */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined
			return nav?.("/about")
		})
		await page.waitForURL("**/about", { timeout: 5000 })
		const overlayAfterNav = await page.locator("[data-flare-dev-overlay]").count()
		expect(overlayAfterNav).toBe(0)
	})
})

test.describe("@dev-only DevErrorOverlay: error display", () => {
	test("overlay appears on unhandled error", async ({ page }) => {
		await loadPage(page, "/")

		/* Trigger a window error */
		await page.evaluate(() => {
			const event = new ErrorEvent("error", {
				error: new Error("Test overlay error"),
				message: "Test overlay error",
			})
			window.dispatchEvent(event)
		})

		await page.waitForTimeout(500)
		const overlay = page.locator("[data-flare-dev-overlay]")
		await expect(overlay).toBeVisible()
		await expect(overlay).toContainText("Test overlay error")
	})

	test("overlay shows error count", async ({ page }) => {
		await loadPage(page, "/")

		/* Trigger two errors */
		await page.evaluate(() => {
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: new Error("Error one"),
					message: "Error one",
				}),
			)
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: new Error("Error two"),
					message: "Error two",
				}),
			)
		})

		await page.waitForTimeout(500)
		const overlay = page.locator("[data-flare-dev-overlay]")
		await expect(overlay).toContainText("2 errors")
	})

	test("overlay shows error name and message", async ({ page }) => {
		await loadPage(page, "/")

		await page.evaluate(() => {
			const err = new TypeError("Cannot read property 'x'")
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: err,
					message: err.message,
				}),
			)
		})

		await page.waitForTimeout(500)
		const overlay = page.locator("[data-flare-dev-overlay]")
		await expect(overlay).toContainText("TypeError")
		await expect(overlay).toContainText("Cannot read property 'x'")
	})

	test("overlay shows error source", async ({ page }) => {
		await loadPage(page, "/")

		await page.evaluate(() => {
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: new Error("Source test"),
					message: "Source test",
				}),
			)
		})

		await page.waitForTimeout(500)
		const overlay = page.locator("[data-flare-dev-overlay]")
		await expect(overlay).toContainText("window.onerror")
	})

	test("overlay shows unhandledrejection source", async ({ page }) => {
		await loadPage(page, "/")

		await page.evaluate(() => {
			window.dispatchEvent(
				new PromiseRejectionEvent("unhandledrejection", {
					promise: Promise.resolve(),
					reason: new Error("Promise failed"),
				}),
			)
		})

		await page.waitForTimeout(500)
		const overlay = page.locator("[data-flare-dev-overlay]")
		await expect(overlay).toContainText("unhandledrejection")
		await expect(overlay).toContainText("Promise failed")
	})
})

test.describe("@dev-only DevErrorOverlay: dismiss and clear", () => {
	test("dismiss button hides individual error", async ({ page }) => {
		await loadPage(page, "/")

		/* Trigger two errors */
		await page.evaluate(() => {
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: new Error("Keep this"),
					message: "Keep this",
				}),
			)
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: new Error("Dismiss this"),
					message: "Dismiss this",
				}),
			)
		})

		await page.waitForTimeout(500)
		const overlay = page.locator("[data-flare-dev-overlay]")
		await expect(overlay).toContainText("2 errors")

		/* Click the dismiss button on second error (last "x" button) */
		const dismissButtons = overlay.locator("button").filter({ hasText: "x" })
		const count = await dismissButtons.count()
		expect(count).toBeGreaterThanOrEqual(2)
		await dismissButtons.last().click()
		await page.waitForTimeout(300)

		/* Should show 1 error now */
		await expect(overlay).toContainText("1 error")
		await expect(overlay).toContainText("Keep this")
	})

	test("clear all button removes overlay", async ({ page }) => {
		await loadPage(page, "/")

		await page.evaluate(() => {
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: new Error("Will be cleared"),
					message: "Will be cleared",
				}),
			)
		})

		await page.waitForTimeout(500)
		const overlay = page.locator("[data-flare-dev-overlay]")
		await expect(overlay).toBeVisible()

		/* Click "Clear all" button */
		const clearBtn = overlay.locator("button").filter({ hasText: "Clear all" })
		await clearBtn.click()
		await page.waitForTimeout(300)

		/* Overlay should disappear */
		const overlayCount = await page.locator("[data-flare-dev-overlay]").count()
		expect(overlayCount).toBe(0)
	})
})

test.describe("@dev-only DevErrorOverlay: deduplication", () => {
	test("same error dispatched twice only shows once", async ({ page }) => {
		await loadPage(page, "/")

		await page.evaluate(() => {
			const err = new Error("Duplicate error")
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: err,
					message: err.message,
				}),
			)
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: err,
					message: err.message,
				}),
			)
		})

		await page.waitForTimeout(500)
		const overlay = page.locator("[data-flare-dev-overlay]")
		await expect(overlay).toContainText("1 error")
	})

	test("different errors show separately", async ({ page }) => {
		await loadPage(page, "/")

		await page.evaluate(() => {
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: new Error("First unique error"),
					message: "First unique error",
				}),
			)
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: new TypeError("Second unique error"),
					message: "Second unique error",
				}),
			)
		})

		await page.waitForTimeout(500)
		const overlay = page.locator("[data-flare-dev-overlay]")
		await expect(overlay).toContainText("2 errors")
		await expect(overlay).toContainText("First unique error")
		await expect(overlay).toContainText("Second unique error")
	})
})

test.describe("@dev-only DevErrorOverlay: z-index and styling", () => {
	test("overlay has high z-index to cover content", async ({ page }) => {
		await loadPage(page, "/")

		await page.evaluate(() => {
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: new Error("Z-index test"),
					message: "Z-index test",
				}),
			)
		})

		await page.waitForTimeout(500)
		const overlay = page.locator("[data-flare-dev-overlay]")
		const zIndex = await overlay.evaluate((el) => getComputedStyle(el).zIndex)
		expect(Number(zIndex)).toBeGreaterThanOrEqual(99999)
	})

	test("overlay covers full viewport", async ({ page }) => {
		await loadPage(page, "/")

		await page.evaluate(() => {
			window.dispatchEvent(
				new ErrorEvent("error", {
					error: new Error("Coverage test"),
					message: "Coverage test",
				}),
			)
		})

		await page.waitForTimeout(500)
		const overlay = page.locator("[data-flare-dev-overlay]")
		const position = await overlay.evaluate((el) => getComputedStyle(el).position)
		expect(position).toBe("fixed")
	})
})
