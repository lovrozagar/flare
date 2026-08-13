import { expect, test } from "@playwright/test"

test.describe("Menubar", () => {
  test.beforeEach(({ page }) => page.goto("/menubar"))

  test("opens File menu on click", async ({ page }) => {
    await page.getByRole("menuitem", { name: "File" }).click()
    await expect(page.getByRole("menu")).toBeVisible()
  })

  test("closes on Escape", async ({ page }) => {
    await page.getByRole("menuitem", { name: "File" }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).not.toBeVisible()
  })
})
