import { expect, test } from "@playwright/test"

test.describe("Select", () => {
  test.beforeEach(({ page }) => page.goto("/select"))

  test("opens on trigger click", async ({ page }) => {
    await page.getByRole("combobox").click()
    await expect(page.getByRole("listbox")).toBeVisible()
  })

  test("selects item on click", async ({ page }) => {
    await page.getByRole("combobox").click()
    await page.getByRole("option", { name: "Apple" }).click()
    await expect(page.getByText("Apple")).toBeVisible()
  })

  test("closes on Escape", async ({ page }) => {
    await page.getByRole("combobox").click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).not.toBeVisible()
  })
})
