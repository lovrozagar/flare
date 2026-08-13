import { expect, test } from "@playwright/test"

test.describe("AlertDialog", () => {
  test.beforeEach(({ page }) => page.goto("/alert-dialog"))

  test("opens on trigger click", async ({ page }) => {
    await page.getByRole("button", { name: "Delete" }).click()
    await expect(page.getByRole("alertdialog")).toBeVisible()
  })

  test("closes on cancel", async ({ page }) => {
    await page.getByRole("button", { name: "Delete" }).click()
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("alertdialog")).not.toBeVisible()
  })

  test("title visible", async ({ page }) => {
    await page.getByRole("button", { name: "Delete" }).click()
    await expect(page.getByText("Are you sure?")).toBeVisible()
  })
})
