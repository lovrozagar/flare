import { expect, test } from "@playwright/test"

test.describe("Toast", () => {
  test.beforeEach(({ page }) => page.goto("/toast"))

  test("provider renders without error", async ({ page }) => {
    await expect(page.getByText("Toast provider active.")).toBeVisible()
  })
})
