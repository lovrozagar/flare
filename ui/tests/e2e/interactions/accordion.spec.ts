import { expect, test } from "@playwright/test"

test.describe("Accordion", () => {
  test.beforeEach(({ page }) => page.goto("/accordion"))

  test("expands on trigger click", async ({ page }) => {
    await page.getByRole("button", { name: "Is it accessible?" }).click()
    await expect(page.getByText("Follows WAI-ARIA pattern.")).toBeVisible()
  })

  test("collapses on second click", async ({ page }) => {
    await page.getByRole("button", { name: "Is it accessible?" }).click()
    await page.getByRole("button", { name: "Is it accessible?" }).click()
    await expect(page.getByText("Follows WAI-ARIA pattern.")).not.toBeVisible()
  })
})
