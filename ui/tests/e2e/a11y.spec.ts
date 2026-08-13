import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const routes = [
  "button", "badge", "label", "separator", "skeleton", "spinner",
  "avatar", "alert", "card", "input", "textarea", "checkbox",
  "radio-group", "switch", "toggle", "toggle-group", "meter",
  "dialog", "alert-dialog", "sheet", "drawer", "popover", "tooltip",
  "hover-card", "dropdown-menu", "context-menu", "menubar",
  "navigation-menu", "accordion", "collapsible", "tabs", "scroll-area",
  "progress", "slider", "combobox", "select", "autocomplete",
  "number-field", "otp-field", "toast", "form", "field",
] as const

const dirs = ["ltr", "rtl"] as const
const themes = ["light", "dark"] as const

for (const route of routes) {
  for (const dir of dirs) {
    for (const theme of themes) {
      test(`a11y: ${route} ${dir} ${theme}`, async ({ page }) => {
        await page.goto(`/${route}?dir=${dir}&theme=${theme}`)
        const results = await new AxeBuilder({ page }).analyze()
        expect(results.violations).toEqual([])
      })
    }
  }
}
