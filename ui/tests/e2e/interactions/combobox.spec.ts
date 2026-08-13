import { expect, test } from "@playwright/test"

test.describe("Combobox", () => {
  test.beforeEach(({ page }) => page.goto("/combobox"))

  test("opens list on input click", async ({ page }) => {
    await page.getByRole("combobox").click()
    await expect(page.getByRole("listbox")).toBeVisible()
  })

  test("filters items on type", async ({ page }) => {
    await page.getByRole("combobox").fill("Apple")
    await expect(page.getByRole("option", { name: "Apple" })).toBeVisible()
  })

  test("closes on Escape", async ({ page }) => {
    await page.getByRole("combobox").click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).not.toBeVisible()
  })
})
