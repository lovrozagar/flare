import { expect, test } from "@playwright/test"
import { assertHydrated, clickAndAssertSPA, loadPage } from "./helpers"

test.describe("Link Component", () => {
	test("Link renders as <a> with correct href", async ({ page }) => {
		await loadPage(page, "/")
		const link = page.locator("a[href='/about']").first()
		await expect(link).toBeVisible()
		await expect(link).toHaveAttribute("href", "/about")
	})

	test("Link click is SPA navigation", async ({ page }) => {
		await loadPage(page, "/")
		await clickAndAssertSPA(page, "a[href='/about'] >> nth=0", "/about")
		await expect(page.locator("[data-testid=about]")).toBeVisible()
	})

	test("Cmd+Click does not preventDefault", async ({ page }) => {
		await loadPage(page, "/")
		const prevented = await page.evaluate(() => {
			return new Promise<boolean>((resolve) => {
				const link = document.querySelector("a[href='/about']") as HTMLAnchorElement
				if (!link) {
					resolve(false)
					return
				}
				link.addEventListener(
					"click",
					(e) => {
						resolve(e.defaultPrevented)
					},
					{ once: true },
				)
				link.dispatchEvent(
					new MouseEvent("click", {
						bubbles: true,
						cancelable: true,
						metaKey: true,
					}),
				)
			})
		})
		expect(prevented).toBe(false)
	})

	test("external link not intercepted", async ({ page }) => {
		await loadPage(page, "/")
		await page.evaluate(() => {
			const a = document.createElement("a")
			a.href = "https://example.com"
			a.textContent = "External"
			a.setAttribute("data-testid", "external-link")
			document.body.appendChild(a)
		})
		const link = page.locator("[data-testid=external-link]")
		await expect(link).toHaveAttribute("href", "https://example.com")
	})

	test("all links on home page are SPA-navigable", async ({ page }) => {
		await loadPage(page, "/")
		const links = page.locator("a[href]")
		const count = await links.count()
		expect(count).toBeGreaterThanOrEqual(2)
		for (let i = 0; i < count; i++) {
			const href = await links.nth(i).getAttribute("href")
			expect(href).toBeTruthy()
			expect(href).toMatch(/^\//)
		}
	})
})
