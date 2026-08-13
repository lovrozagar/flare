import { expect, test } from "@playwright/test"

test.describe("Progress", () => {
  test.beforeEach(({ page }) => page.goto("/progress"))

  test("progress bars rendered", async ({ page }) => {
    const bars = page.getByRole("progressbar")
    await expect(bars).toHaveCount(3)
  })

  test("33% bar has correct aria value", async ({ page }) => {
    const bar = page.getByRole("progressbar").first()
    await expect(bar).toHaveAttribute("aria-valuenow", "33")
  })
})
