import { expect, test } from "@playwright/test"

test.describe("Form actions — JS off — contact (PE)", () => {
	test.use({ javaScriptEnabled: false })

	test("valid submit 303s back to the form page", async ({ page }) => {
		await page.goto("/forms/contact")
		await page.getByTestId("email-input").fill("user@test.com")
		await page.getByTestId("message-input").fill("Hello")
		await page.getByTestId("submit-btn").click()
		await expect(page).toHaveURL(/\/forms\/contact/)
		await expect(page.getByTestId("form-contact")).toBeVisible()
	})

	test("empty fields re-render FieldError", async ({ page }) => {
		await page.goto("/forms/contact")
		await page.getByTestId("submit-btn").click()
		const errors = page.locator(".field-error")
		await expect(errors.first()).toBeVisible({ timeout: 5_000 })
		await expect(errors.first()).toContainText("Required")
	})

	test("invalid email preserves value via form.value", async ({ page }) => {
		await page.goto("/forms/contact")
		await page.getByTestId("email-input").fill("bad-email")
		await page.getByTestId("message-input").fill("Hello")
		await page.getByTestId("submit-btn").click()
		const emailError = page.locator("div:has(#email) .field-error")
		await expect(emailError).toContainText("Invalid email", { timeout: 5_000 })
		await expect(page.getByTestId("email-input")).toHaveValue("bad-email")
	})

	test("taken email shows business FieldError", async ({ page }) => {
		await page.goto("/forms/contact")
		await page.getByTestId("email-input").fill("taken@test.com")
		await page.getByTestId("message-input").fill("Hi")
		await page.getByTestId("submit-btn").click()
		const emailError = page.locator("div:has(#email) .field-error")
		await expect(emailError).toContainText("Email already registered", { timeout: 5_000 })
	})
})

test.describe("Form actions — JS off — upload (PE)", () => {
	test.use({ javaScriptEnabled: false })

	test("file upload success stays on the page", async ({ page }) => {
		await page.goto("/forms/upload")
		await page.getByTestId("avatar-input").setInputFiles({
			buffer: Buffer.from("fake image content"),
			mimeType: "image/png",
			name: "avatar.png",
		})
		await page.getByTestId("upload-btn").click()
		await expect(page).toHaveURL(/\/forms\/upload/)
	})

	test("missing file shows required error", async ({ page }) => {
		await page.goto("/forms/upload")
		await page.getByTestId("upload-btn").click()
		await expect(page.locator(".field-error")).toContainText("File is required", { timeout: 5_000 })
	})
})
