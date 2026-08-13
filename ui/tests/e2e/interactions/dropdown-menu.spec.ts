import { expect, test } from "@playwright/test"

test.describe("DropdownMenu", () => {
  test.beforeEach(({ page }) => page.goto("/dropdown-menu"))

  test("opens on trigger click", async ({ page }) => {
    await page.getByRole("button", { name: "Open menu" }).click()
    await expect(page.getByRole("menu")).toBeVisible()
  })

  test("closes on Escape", async ({ page }) => {
    await page.getByRole("button", { name: "Open menu" }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).not.toBeVisible()
  })

  test("items navigable with arrow keys", async ({ page }) => {
    await page.getByRole("button", { name: "Open menu" }).click()
    await page.keyboard.press("ArrowDown")
    await expect(page.getByRole("menuitem", { name: /Profile/ })).toBeFocused()
  })
})
