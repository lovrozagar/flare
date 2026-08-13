import { expect, test } from "@playwright/test"

test.describe("Collapsible", () => {
  test.beforeEach(({ page }) => page.goto("/collapsible"))

  test("expands on trigger click", async ({ page }) => {
    await page.getByRole("button", { name: "Toggle" }).click()
    await expect(page.getByText("Hidden item 1")).toBeVisible()
  })

  test("collapses on second click", async ({ page }) => {
    await page.getByRole("button", { name: "Toggle" }).click()
    await page.getByRole("button", { name: "Toggle" }).click()
    await expect(page.getByText("Hidden item 1")).not.toBeVisible()
  })
})
