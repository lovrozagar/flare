import { expect, test } from "@playwright/test"

test.describe("Drawer", () => {
  test.beforeEach(({ page }) => page.goto("/drawer"))

  test("opens on trigger click", async ({ page }) => {
    await page.getByRole("button", { name: "Open drawer" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("closes on Escape", async ({ page }) => {
    await page.getByRole("button", { name: "Open drawer" }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible()
  })

  test("title visible", async ({ page }) => {
    await page.getByRole("button", { name: "Open drawer" }).click()
    await expect(page.getByText("Drawer title")).toBeVisible()
  })
})
