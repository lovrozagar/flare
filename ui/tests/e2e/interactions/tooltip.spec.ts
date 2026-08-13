import { expect, test } from "@playwright/test"

test.describe("Tooltip", () => {
  test.beforeEach(({ page }) => page.goto("/tooltip"))

  test("shows on hover", async ({ page }) => {
    await page.getByRole("button", { name: "Hover me" }).hover()
    await expect(page.getByRole("tooltip")).toBeVisible()
  })
})
