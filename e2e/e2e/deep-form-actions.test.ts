import { expect, test } from "@playwright/test"
import { loadPage, setupConsoleCapture } from "./helpers"

/* ── JS-enabled: Contact form (Standard Schema / zod validator) ────── */

test.describe("Form actions — JS on — contact (zod Standard Schema)", () => {
	test("P1: valid submit — onSuccess called, result accessible", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("email-input").fill("user@test.com")
		await page.getByTestId("message-input").fill("Hello there")
		await page.getByTestId("submit-btn").click()

		await expect(page.getByTestId("success-message")).toHaveText("Message sent!", { timeout: 5000 })
		await expect(page.getByTestId("result-data")).toContainText('"sent":true')
	})

	test("P2: empty email — FieldError shows Required", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("message-input").fill("Hello")
		await page.getByTestId("submit-btn").click()

		await expect(page.locator(".field-error").first()).toBeVisible({ timeout: 5000 })
		const emailError = page.locator("div:has(#email) .field-error")
		await expect(emailError).toContainText("Required")
	})

	test("P3: invalid email — FieldError shows email error", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("email-input").fill("not-an-email")
		await page.getByTestId("message-input").fill("Hello")
		await page.getByTestId("submit-btn").click()

		const emailError = page.locator("div:has(#email) .field-error")
		await expect(emailError).toContainText("Invalid email", { timeout: 5000 })
	})

	test("P4: multiple field errors — both email + message errors shown", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		/* Leave both fields empty */
		await page.getByTestId("submit-btn").click()

		const errors = page.locator(".field-error")
		await expect(errors).toHaveCount(2, { timeout: 5000 })
	})

	test("P5: form-level error — form.error populated", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("email-input").fill("user@test.com")
		await page.getByTestId("message-input").fill("FORM_ERROR")
		await page.getByTestId("submit-btn").click()

		await expect(page.getByTestId("form-error")).toContainText("Form-level validation failed", {
			timeout: 5000,
		})
	})

	test("P6: handler throws SFVE (email taken) — FieldError shows business error", async ({
		page,
	}) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("email-input").fill("taken@test.com")
		await page.getByTestId("message-input").fill("Hi")
		await page.getByTestId("submit-btn").click()

		const emailError = page.locator("div:has(#email) .field-error")
		await expect(emailError).toContainText("Email already registered", { timeout: 5000 })
	})

	test("P7: pending state — button disabled during submit, re-enabled after", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("email-input").fill("user@test.com")
		await page.getByTestId("message-input").fill("Hello")

		await expect(page.getByTestId("pending-state")).toHaveText("false")
		await page.getByTestId("submit-btn").click()

		/* After success, pending should be false */
		await expect(page.getByTestId("success-message")).toHaveText("Message sent!", { timeout: 5000 })
		await expect(page.getByTestId("pending-state")).toHaveText("false")
		await expect(page.getByTestId("submit-btn")).toBeEnabled()
	})

	test("P8: form.reset() clears errors and result", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		/* Trigger an error first */
		await page.getByTestId("submit-btn").click()
		await expect(page.locator(".field-error").first()).toBeVisible({ timeout: 5000 })

		/* Reset */
		await page.getByTestId("reset-btn").click()
		await expect(page.getByTestId("reset-count")).toHaveText("1")
		await expect(page.locator(".field-error")).toHaveCount(0)
	})

	test("P9: DOM preserves input values after validation error", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("email-input").fill("not-an-email")
		await page.getByTestId("message-input").fill("My message")
		await page.getByTestId("submit-btn").click()

		/* Wait for error */
		const emailError = page.locator("div:has(#email) .field-error")
		await expect(emailError).toBeVisible({ timeout: 5000 })

		/* Values still in DOM (uncontrolled inputs) */
		await expect(page.getByTestId("email-input")).toHaveValue("not-an-email")
		await expect(page.getByTestId("message-input")).toHaveValue("My message")
	})

	test("no console errors during contact form interaction", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/forms/contact")
		await page.getByTestId("email-input").fill("user@test.com")
		await page.getByTestId("message-input").fill("Hello")
		await page.getByTestId("submit-btn").click()
		await expect(page.getByTestId("success-message")).toHaveText("Message sent!", { timeout: 5000 })
		cap.assertClean()
	})
})

/* ── JS-enabled: hasErrors accessor ───────────────────────────────── */

test.describe("Form actions — JS on — hasErrors accessor", () => {
	test("HE1: hasErrors is false initially", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await expect(page.getByTestId("has-errors")).toHaveText("false")
	})

	test("HE2: hasErrors is true after field validation error", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("submit-btn").click()

		await expect(page.locator(".field-error").first()).toBeVisible({ timeout: 5000 })
		await expect(page.getByTestId("has-errors")).toHaveText("true")
	})

	test("HE3: hasErrors is true after form-level error", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("email-input").fill("user@test.com")
		await page.getByTestId("message-input").fill("FORM_ERROR")
		await page.getByTestId("submit-btn").click()

		await expect(page.getByTestId("form-error")).toBeVisible({ timeout: 5000 })
		await expect(page.getByTestId("has-errors")).toHaveText("true")
	})

	test("HE4: hasErrors is true after business-logic SFVE (field-only)", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("email-input").fill("taken@test.com")
		await page.getByTestId("message-input").fill("Hi")
		await page.getByTestId("submit-btn").click()

		const emailError = page.locator("div:has(#email) .field-error")
		await expect(emailError).toBeVisible({ timeout: 5000 })
		await expect(page.getByTestId("has-errors")).toHaveText("true")
	})

	test("HE5: hasErrors returns to false after reset", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("submit-btn").click()
		await expect(page.getByTestId("has-errors")).toHaveText("true", { timeout: 5000 })

		await page.getByTestId("reset-btn").click()
		await expect(page.getByTestId("has-errors")).toHaveText("false")
	})

	test("HE6: hasErrors is false after successful submit", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("email-input").fill("user@test.com")
		await page.getByTestId("message-input").fill("Hello")
		await page.getByTestId("submit-btn").click()

		await expect(page.getByTestId("success-message")).toHaveText("Message sent!", { timeout: 5000 })
		await expect(page.getByTestId("has-errors")).toHaveText("false")
	})
})

/* ── JS-enabled: FieldError all prop ─────────────────────────────── */

test.describe("Form actions — JS on — FieldError all prop", () => {
	test("FA1: without all prop — only first error shown", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("submit-btn").click()

		/* email has Required error, default FieldError shows 1 */
		const emailErrors = page.locator("div:has(#email) .field-error")
		await expect(emailErrors).toHaveCount(1, { timeout: 5000 })
	})

	test("FA2: with all prop — shows all errors for field", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("submit-btn").click()

		/* .field-error-all shows all email errors via FieldError all prop */
		const allErrors = page.locator("div:has(#email) .field-error-all")
		await expect(allErrors.first()).toBeVisible({ timeout: 5000 })
	})

	test("FA3: with all prop — no errors renders nothing", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		/* Before submit, no errors exist */
		const allErrors = page.locator("div:has(#email) .field-error-all")
		await expect(allErrors).toHaveCount(0)
	})
})

/* ── JS-enabled: File upload (manual function validator) ───────────── */

test.describe("Form actions — JS on — file upload (manual fn validator)", () => {
	test("P10: file upload success", async ({ page }) => {
		await loadPage(page, "/forms/upload")

		/* Create a fake file via input */
		const fileInput = page.getByTestId("file-input")
		await fileInput.setInputFiles({
			buffer: Buffer.from("fake image content"),
			mimeType: "image/png",
			name: "avatar.png",
		})
		await page.getByTestId("submit-btn").click()

		await expect(page.getByTestId("result-data")).toContainText('"filename":"avatar.png"', {
			timeout: 5000,
		})
	})

	test("P11: file validation error — no file selected", async ({ page }) => {
		await loadPage(page, "/forms/upload")
		await page.getByTestId("submit-btn").click()

		const fileError = page.locator(".field-error")
		await expect(fileError).toContainText("File is required", { timeout: 5000 })
	})
})

/* ── JS-enabled: Multi-value checkboxes (manual function validator) ── */

test.describe("Form actions — JS on — multi-value (manual fn validator)", () => {
	test("P12: checkboxes submit as string[]", async ({ page }) => {
		await loadPage(page, "/forms/multi")
		await page.getByTestId("tag-alpha").check()
		await page.getByTestId("tag-gamma").check()
		await page.getByTestId("submit-btn").click()

		const result = page.getByTestId("result-data")
		await expect(result).toBeVisible({ timeout: 5000 })
		const text = await result.textContent()
		const parsed = JSON.parse(text ?? "{}") as { received: string[] }
		expect(parsed.received).toContain("alpha")
		expect(parsed.received).toContain("gamma")
		expect(parsed.received).not.toContain("beta")
	})

	test("no checkboxes selected — validation error", async ({ page }) => {
		await loadPage(page, "/forms/multi")
		await page.getByTestId("submit-btn").click()

		const tagError = page.locator(".field-error")
		await expect(tagError).toContainText("Select at least one tag", { timeout: 5000 })
	})
})

/* ── JS-enabled: Two forms on one page ({parse} + function validators) */

test.describe("Form actions — JS on — dual forms (mixed validators)", () => {
	test("P13: submit form A — only form A state changes, form B untouched", async ({ page }) => {
		await loadPage(page, "/forms/dual")

		await page.getByTestId("nameA-input").fill("Alice")
		await page.getByTestId("submitA-btn").click()

		await expect(page.getByTestId("resultA-data")).toContainText('"formA":"Alice"', {
			timeout: 5000,
		})
		/* Form B should have no result */
		await expect(page.getByTestId("resultB-data")).not.toBeVisible()
	})

	test("submit form B — only form B state changes, form A untouched", async ({ page }) => {
		await loadPage(page, "/forms/dual")

		await page.getByTestId("nameB-input").fill("Bob")
		await page.getByTestId("submitB-btn").click()

		await expect(page.getByTestId("resultB-data")).toContainText('"formB":"Bob"', {
			timeout: 5000,
		})
		await expect(page.getByTestId("resultA-data")).not.toBeVisible()
	})

	test("form A empty — {parse} validator shows error, form B clean", async ({ page }) => {
		await loadPage(page, "/forms/dual")
		await page.getByTestId("submitA-btn").click()

		const errorA = page.locator("[data-testid='form-a-section'] .field-error")
		await expect(errorA).toContainText("Required", { timeout: 5000 })
		await expect(page.locator("[data-testid='form-b-section'] .field-error")).not.toBeVisible()
	})

	test("form B empty — function validator shows error, form A clean", async ({ page }) => {
		await loadPage(page, "/forms/dual")
		await page.getByTestId("submitB-btn").click()

		const errorB = page.locator("[data-testid='form-b-section'] .field-error")
		await expect(errorB).toContainText("Required", { timeout: 5000 })
		await expect(page.locator("[data-testid='form-a-section'] .field-error")).not.toBeVisible()
	})

	test("both forms submit independently", async ({ page }) => {
		await loadPage(page, "/forms/dual")

		await page.getByTestId("nameA-input").fill("Alice")
		await page.getByTestId("submitA-btn").click()
		await expect(page.getByTestId("resultA-data")).toBeVisible({ timeout: 5000 })

		await page.getByTestId("nameB-input").fill("Bob")
		await page.getByTestId("submitB-btn").click()
		await expect(page.getByTestId("resultB-data")).toBeVisible({ timeout: 5000 })

		await expect(page.getByTestId("resultA-data")).toContainText("Alice")
		await expect(page.getByTestId("resultB-data")).toContainText("Bob")
	})
})

/* ── JS-enabled: Auth form (manual fn validator + authenticate) ────── */

test.describe("Form actions — JS on — auth form (fn validator + authenticate)", () => {
	test("P15: 401 from auth-required fn — form.error shows auth error", async ({ page }) => {
		await loadPage(page, "/forms/auth")
		await page.getByTestId("note-input").fill("secret note")
		await page.getByTestId("submit-btn").click()

		await expect(page.getByTestId("form-error")).toBeVisible({ timeout: 5000 })
	})

	test("auth form with valid auth header — success", async ({ page, context }) => {
		/* Set auth header via route interception */
		await context.route("**/_fn/**", async (route) => {
			const request = route.request()
			const headers = {
				...request.headers(),
				"x-test-auth": "admin",
			}
			await route.continue({ headers })
		})

		await loadPage(page, "/forms/auth")
		await page.getByTestId("note-input").fill("my secret note")
		await page.getByTestId("submit-btn").click()

		await expect(page.getByTestId("result-data")).toContainText('"note":"my secret note"', {
			timeout: 5000,
		})
		await expect(page.getByTestId("result-data")).toContainText('"userId":"admin"')
	})

	test("auth form with empty note — validation error", async ({ page, context }) => {
		await context.route("**/_fn/**", async (route) => {
			const request = route.request()
			const headers = { ...request.headers(), "x-test-auth": "admin" }
			await route.continue({ headers })
		})

		await loadPage(page, "/forms/auth")
		await page.getByTestId("submit-btn").click()

		const noteError = page.locator(".field-error")
		await expect(noteError).toContainText("Required", { timeout: 5000 })
	})
})

/* ── JS-disabled: Contact form (no-JS progressive enhancement) ─────── */

test.describe("Form actions — JS off — contact (PE)", () => {
	test.use({ javaScriptEnabled: false })

	test("P16: valid submit — 303 redirect, page shows success", async ({ page }) => {
		await page.goto("/forms/contact")
		await page.getByTestId("email-input").fill("user@test.com")
		await page.getByTestId("message-input").fill("Hello")
		await page.getByTestId("submit-btn").click()

		/* After 303 PRG, should be back on same page */
		await expect(page).toHaveURL(/\/forms\/contact/)
	})

	test("P17: empty email — page re-renders with FieldError visible", async ({ page }) => {
		await page.goto("/forms/contact")
		await page.getByTestId("message-input").fill("Hello")
		await page.getByTestId("submit-btn").click()

		/* Server re-renders page with validation errors */
		const errors = page.locator(".field-error")
		await expect(errors.first()).toBeVisible({ timeout: 5000 })
		await expect(errors.first()).toContainText("Required")
	})

	test("P18: invalid email — error shown, input value preserved via form.value", async ({
		page,
	}) => {
		await page.goto("/forms/contact")
		await page.getByTestId("email-input").fill("bad-email")
		await page.getByTestId("message-input").fill("Hello")
		await page.getByTestId("submit-btn").click()

		const emailError = page.locator("div:has(#email) .field-error")
		await expect(emailError).toContainText("Invalid email", { timeout: 5000 })

		/* SSR should preserve the submitted value via form.value() */
		await expect(page.getByTestId("email-input")).toHaveValue("bad-email")
	})

	test("P19: multiple field errors — both visible in re-rendered page", async ({ page }) => {
		await page.goto("/forms/contact")
		await page.getByTestId("submit-btn").click()

		const errors = page.locator(".field-error")
		await expect(errors).toHaveCount(2, { timeout: 5000 })
	})

	test("P20: handler throws SFVE — business error shown in re-rendered page", async ({ page }) => {
		await page.goto("/forms/contact")
		await page.getByTestId("email-input").fill("taken@test.com")
		await page.getByTestId("message-input").fill("Hi")
		await page.getByTestId("submit-btn").click()

		const emailError = page.locator("div:has(#email) .field-error")
		await expect(emailError).toContainText("Email already registered", { timeout: 5000 })
	})
})

/* ── JS-disabled: File upload (PE) ─────────────────────────────────── */

test.describe("Form actions — JS off — file upload (PE)", () => {
	test.use({ javaScriptEnabled: false })

	test("P22: file upload success — 303 redirect", async ({ page }) => {
		await page.goto("/forms/upload")
		const fileInput = page.getByTestId("file-input")
		await fileInput.setInputFiles({
			buffer: Buffer.from("fake image content"),
			mimeType: "image/png",
			name: "avatar.png",
		})
		await page.getByTestId("submit-btn").click()

		/* After 303 PRG, should be back on same page */
		await expect(page).toHaveURL(/\/forms\/upload/)
	})

	test("P23: file validation error — error shown, page re-rendered", async ({ page }) => {
		await page.goto("/forms/upload")
		await page.getByTestId("submit-btn").click()

		const fileError = page.locator(".field-error")
		await expect(fileError).toContainText("File is required", { timeout: 5000 })
	})
})

/* ── JS-disabled: Multi-value (PE) ─────────────────────────────────── */

test.describe("Form actions — JS off — multi-value (PE)", () => {
	test.use({ javaScriptEnabled: false })

	test("P24: checkboxes submit — handler receives array values", async ({ page }) => {
		await page.goto("/forms/multi")
		await page.getByTestId("tag-alpha").check()
		await page.getByTestId("tag-beta").check()
		await page.getByTestId("submit-btn").click()

		/* After 303 PRG, should be back on same page */
		await expect(page).toHaveURL(/\/forms\/multi/)
	})

	test("no checkboxes — validation error in re-rendered page", async ({ page }) => {
		await page.goto("/forms/multi")
		await page.getByTestId("submit-btn").click()

		const tagError = page.locator(".field-error")
		await expect(tagError).toContainText("Select at least one tag", { timeout: 5000 })
	})
})

/* ── JS-disabled: Dual forms (PE) ──────────────────────────────────── */

test.describe("Form actions — JS off — dual forms (PE)", () => {
	test.use({ javaScriptEnabled: false })

	test("P25: submit form A — only form A errors shown, form B clean", async ({ page }) => {
		await page.goto("/forms/dual")
		await page.getByTestId("submitA-btn").click()

		const errorA = page.locator("[data-testid='form-a-section'] .field-error")
		await expect(errorA).toContainText("Required", { timeout: 5000 })
		await expect(page.locator("[data-testid='form-b-section'] .field-error")).not.toBeVisible()
	})

	test("submit form A with valid data — 303 redirect", async ({ page }) => {
		await page.goto("/forms/dual")
		await page.getByTestId("nameA-input").fill("Alice")
		await page.getByTestId("submitA-btn").click()

		await expect(page).toHaveURL(/\/forms\/dual/)
	})
})

/* ── Cross-cutting: validator type diversity verification ──────────── */

test.describe("Form actions — validator diversity", () => {
	test("Standard Schema (zod) validator produces field errors automatically", async ({ page }) => {
		await loadPage(page, "/forms/contact")
		await page.getByTestId("email-input").fill("bad")
		await page.getByTestId("submit-btn").click()

		const emailError = page.locator("div:has(#email) .field-error")
		await expect(emailError).toContainText("Invalid email", { timeout: 5000 })
	})

	test("{parse} protocol validator produces field errors", async ({ page }) => {
		await loadPage(page, "/forms/dual")
		await page.getByTestId("submitA-btn").click()

		const errorA = page.locator("[data-testid='form-a-section'] .field-error")
		await expect(errorA).toContainText("Required", { timeout: 5000 })
	})

	test("manual function validator produces field errors", async ({ page }) => {
		await loadPage(page, "/forms/dual")
		await page.getByTestId("submitB-btn").click()

		const errorB = page.locator("[data-testid='form-b-section'] .field-error")
		await expect(errorB).toContainText("Required", { timeout: 5000 })
	})

	test("manual function validator with file upload produces field errors", async ({ page }) => {
		await loadPage(page, "/forms/upload")
		await page.getByTestId("submit-btn").click()

		const fileError = page.locator(".field-error")
		await expect(fileError).toContainText("File is required", { timeout: 5000 })
	})

	test("manual function validator + authenticate works together", async ({ page, context }) => {
		await context.route("**/_fn/**", async (route) => {
			const request = route.request()
			const headers = { ...request.headers(), "x-test-auth": "admin" }
			await route.continue({ headers })
		})

		await loadPage(page, "/forms/auth")
		await page.getByTestId("note-input").fill("test note")
		await page.getByTestId("submit-btn").click()

		await expect(page.getByTestId("result-data")).toContainText('"note":"test note"', {
			timeout: 5000,
		})
	})
})
