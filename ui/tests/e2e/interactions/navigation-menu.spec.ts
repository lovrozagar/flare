import { expect, test } from "@playwright/test"

test.describe("NavigationMenu", () => {
  test.beforeEach(({ page }) => page.goto("/navigation-menu"))

  test("opens content on trigger click", async ({ page }) => {
    await page.getByRole("button", { name: "Getting started" }).click()
    await expect(page.getByText("Overview of the library.")).toBeVisible()
  })

  test("links visible", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Components" })).toBeVisible()
  })
})
