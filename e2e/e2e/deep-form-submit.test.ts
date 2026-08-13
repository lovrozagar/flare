import { expect, test } from "@playwright/test"
import { loadPage, setupConsoleCapture } from "./helpers"

test.describe("Form submission via UI — server function", () => {
	test("form submits and displays echo result", async ({ page }) => {
		await loadPage(page, "/form-demo")
		await expect(page.getByTestId("form-demo")).toBeVisible()

		/* Fill in and submit form */
		await page.getByTestId("message-input").fill("hello from form")
		await page.getByTestId("submit-btn").click()

		/* Wait for result */
		await expect(page.getByTestId("form-result")).toHaveText("hello from form", { timeout: 5000 })
		await expect(page.getByTestId("form-error")).toHaveText("")
	})

	test("form shows loading state during submit", async ({ page }) => {
		await loadPage(page, "/form-demo")
		await page.getByTestId("message-input").fill("test")

		/* Check loading state changes */
		await expect(page.getByTestId("form-loading")).toHaveText("false")
		await page.getByTestId("submit-btn").click()

		/* After completion, loading should be false again */
		await expect(page.getByTestId("form-result")).toHaveText("test", { timeout: 5000 })
		await expect(page.getByTestId("form-loading")).toHaveText("false")
	})

	test("multiple sequential form submissions", async ({ page }) => {
		await loadPage(page, "/form-demo")

		/* First submit */
		await page.getByTestId("message-input").fill("first")
		await page.getByTestId("submit-btn").click()
		await expect(page.getByTestId("form-result")).toHaveText("first", { timeout: 5000 })

		/* Second submit */
		await page.getByTestId("message-input").fill("second")
		await page.getByTestId("submit-btn").click()
		await expect(page.getByTestId("form-result")).toHaveText("second", { timeout: 5000 })
	})
})

test.describe("Form submission — SSR hydration", () => {
	test("form is interactive after hydration", async ({ page }) => {
		await loadPage(page, "/form-demo")

		/* Form should be present */
		await expect(page.getByTestId("echo-form")).toBeVisible()
		await expect(page.getByTestId("message-input")).toBeEnabled()
		await expect(page.getByTestId("submit-btn")).toBeEnabled()
	})
})

test.describe("Form submission — console", () => {
	test("no console errors during form interaction", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/form-demo")
		await page.getByTestId("message-input").fill("test")
		await page.getByTestId("submit-btn").click()
		await expect(page.getByTestId("form-result")).toHaveText("test", { timeout: 5000 })
		cap.assertClean()
	})
})
