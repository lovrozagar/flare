import { expect, test } from "@playwright/test"

test.describe("OTPField", () => {
  test.beforeEach(({ page }) => page.goto("/otp-field"))

  test("hidden input rendered", async ({ page }) => {
    await expect(page.locator("input[aria-label='One-time password']")).toBeAttached()
  })

  test("slot cells rendered", async ({ page }) => {
    const slots = page.locator(".relative.flex.size-10")
    await expect(slots).toHaveCount(6)
  })
})
