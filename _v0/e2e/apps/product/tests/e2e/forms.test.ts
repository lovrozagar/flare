import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

test.describe("Form", () => {
	test("valid submit shows success", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/forms/contact");
		await page.getByTestId("email-input").fill("ok@test.com");
		await page.getByTestId("message-input").fill("hello");
		await page.getByTestId("submit-btn").click({ force: true });
		await expect(page.getByTestId("success-message")).toHaveText("Message sent!", { timeout: 8_000 });
		await expect(page.getByTestId("result-data")).toContainText("sent");
		cap.assertClean();
	});

	test("invalid email shows field error", async ({ page }) => {
		await loadPage(page, "/forms/contact");
		await page.getByTestId("email-input").fill("not-an-email");
		await page.getByTestId("message-input").fill("hello");
		await page.getByTestId("submit-btn").click({ force: true });
		await expect(page.locator(".field-error")).toContainText(/invalid|email/i, { timeout: 8_000 });
	});

	test("taken email is a field error", async ({ page }) => {
		await loadPage(page, "/forms/contact");
		await page.getByTestId("email-input").fill("taken@test.com");
		await page.getByTestId("message-input").fill("hello");
		await page.getByTestId("submit-btn").click({ force: true });
		await expect(page.locator(".field-error")).toContainText("Email already registered", {
			timeout: 8_000,
		});
	});
});
