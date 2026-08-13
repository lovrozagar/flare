import { expect, test } from "@playwright/test"

test.describe("Autocomplete", () => {
  test.beforeEach(({ page }) => page.goto("/autocomplete"))

  test("shows suggestions on type", async ({ page }) => {
    await page.getByRole("combobox").fill("Sol")
    await expect(page.getByRole("option", { name: "Solid" })).toBeVisible()
  })

  test("closes on Escape", async ({ page }) => {
    await page.getByRole("combobox").fill("React")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).not.toBeVisible()
  })
})
