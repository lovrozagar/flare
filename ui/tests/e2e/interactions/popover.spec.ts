import { expect, test } from "@playwright/test"

test.describe("Popover", () => {
  test.beforeEach(({ page }) => page.goto("/popover"))

  test("opens on trigger click", async ({ page }) => {
    await page.getByRole("button", { name: "Open popover" }).click()
    await expect(page.getByText("Popover content here.")).toBeVisible()
  })

  test("closes on Escape", async ({ page }) => {
    await page.getByRole("button", { name: "Open popover" }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByText("Popover content here.")).not.toBeVisible()
  })
})
