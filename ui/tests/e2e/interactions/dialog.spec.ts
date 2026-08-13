import { expect, test } from "@playwright/test"

test.describe("Dialog", () => {
  test.beforeEach(({ page }) => page.goto("/dialog"))

  test("opens on trigger click", async ({ page }) => {
    await page.getByRole("button", { name: "Open dialog" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("closes on Escape", async ({ page }) => {
    await page.getByRole("button", { name: "Open dialog" }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible()
  })

  test("closes on close button click", async ({ page }) => {
    await page.getByRole("button", { name: "Open dialog" }).click()
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("dialog")).not.toBeVisible()
  })

  test("title visible", async ({ page }) => {
    await page.getByRole("button", { name: "Open dialog" }).click()
    await expect(page.getByRole("heading", { name: "Dialog title" })).toBeVisible()
  })
})
