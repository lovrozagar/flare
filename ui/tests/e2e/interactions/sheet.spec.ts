import { expect, test } from "@playwright/test"

test.describe("Sheet", () => {
  test.beforeEach(({ page }) => page.goto("/sheet"))

  test("opens right sheet on trigger click", async ({ page }) => {
    await page.getByRole("button", { name: "Open right" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("closes on Escape", async ({ page }) => {
    await page.getByRole("button", { name: "Open right" }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible()
  })
})
