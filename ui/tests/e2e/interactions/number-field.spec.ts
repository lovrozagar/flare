import { expect, test } from "@playwright/test"

test.describe("NumberField", () => {
  test.beforeEach(({ page }) => page.goto("/number-field"))

  test("increments on button click", async ({ page }) => {
    const input = page.getByRole("spinbutton").first()
    await expect(input).toHaveValue("0")
    await page.getByRole("button", { name: /increment/i }).first().click()
    await expect(input).toHaveValue("1")
  })

  test("decrements on button click", async ({ page }) => {
    const input = page.getByRole("spinbutton").first()
    await page.getByRole("button", { name: /decrement/i }).first().click()
    await expect(input).toHaveValue("-1")
  })
})
