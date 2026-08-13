import { expect, test } from "@playwright/test"

test.describe("Tabs", () => {
  test.beforeEach(({ page }) => page.goto("/tabs"))

  test("switches content on tab click", async ({ page }) => {
    await expect(page.getByText("Account settings.")).toBeVisible()
    await page.getByRole("tab", { name: "Password" }).click()
    await expect(page.getByText("Password settings.")).toBeVisible()
    await expect(page.getByText("Account settings.")).not.toBeVisible()
  })

  test("arrow keys navigate tabs", async ({ page }) => {
    await page.getByRole("tab", { name: "Account" }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(page.getByRole("tab", { name: "Password" })).toBeFocused()
  })
})
