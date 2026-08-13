import { expect, test } from "@playwright/test"

test.describe("ContextMenu", () => {
  test.beforeEach(({ page }) => page.goto("/context-menu"))

  test("opens on right-click", async ({ page }) => {
    await page.locator("text=Right-click here").click({ button: "right" })
    await expect(page.getByRole("menu")).toBeVisible()
  })

  test("closes on Escape", async ({ page }) => {
    await page.locator("text=Right-click here").click({ button: "right" })
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).not.toBeVisible()
  })
})
