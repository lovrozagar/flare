import { expect, test } from "@playwright/test"

test.describe("Slider", () => {
  test.beforeEach(({ page }) => page.goto("/slider"))

  test("thumb rendered", async ({ page }) => {
    await expect(page.getByRole("slider").first()).toBeVisible()
  })

  test("disabled slider thumb not interactive", async ({ page }) => {
    const disabled = page.getByRole("slider").nth(1)
    await expect(disabled).toBeDisabled()
  })
})
