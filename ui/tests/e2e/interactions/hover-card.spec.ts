import { expect, test } from "@playwright/test"

test.describe("HoverCard", () => {
  test.beforeEach(({ page }) => page.goto("/hover-card"))

  test("shows on hover", async ({ page }) => {
    await page.getByRole("link", { name: "@shadcn" }).hover()
    await expect(page.getByText("Creator of shadcn/ui")).toBeVisible()
  })
})
