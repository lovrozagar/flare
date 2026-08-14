import { expect, test } from "@playwright/test"
import { loadPage } from "./helpers"

test.describe("query + broadcast + theme", () => {
	test("suspense query hydrates 42", async ({ page }) => {
		await loadPage(page, "/query-basic")
		await expect(page.getByTestId("query-count")).toHaveText("42")
	})

	test("invalidate changes loader ts", async ({ page }) => {
		await loadPage(page, "/query-invalidation")
		const first = await page.getByTestId("qi-ts").textContent()
		await page.getByTestId("qi-invalidate").click()
		await expect.poll(async () => page.getByTestId("qi-ts").textContent()).not.toBe(first)
	})

	test("broadcast signal increments locally", async ({ page }) => {
		await loadPage(page, "/broadcast-test")
		await page.getByTestId("inc-btn").click()
		await expect(page.getByTestId("count")).toHaveText("1")
	})

	test("broadcast across tabs", async ({ context }) => {
		const a = await context.newPage()
		const b = await context.newPage()
		await loadPage(a, "/broadcast-test")
		await loadPage(b, "/broadcast-test")
		await a.getByTestId("inc-btn").click()
		await expect(b.getByTestId("count")).toHaveText("1", { timeout: 8_000 })
		await a.close()
		await b.close()
	})

	test("theme and direction scripts in HTML", async ({ page }) => {
		await page.goto("/theme-dir")
		const html = await page.content()
		expect(html.includes("localStorage") || html.includes("data-theme") || html.includes("dir")).toBe(
			true,
		)
		await expect(page.getByTestId("theme-dir")).toBeVisible()
	})
})

test.describe("fonts image lazy sx", () => {
	test("FontCSS emits family and fallback metrics", async ({ page }) => {
		await loadPage(page, "/fonts-test")
		await expect(page.getByTestId("font-category")).toHaveText("sans-serif")
		const html = await page.content()
		expect(html).toContain("@font-face")
		expect(html).toContain("size-adjust")
	})

	test("Image has alt and src", async ({ page }) => {
		await loadPage(page, "/image-test")
		const img = page.getByTestId("img-responsive-basic")
		await expect(img).toHaveAttribute("alt", "Responsive basic")
		expect(await img.getAttribute("src")).toBeTruthy()
	})

	test("lazy island loads", async ({ page }) => {
		await loadPage(page, "/lazy-test")
		await expect(page.getByTestId("lazy-heavy")).toHaveText("Heavy Component Loaded")
	})

	test("sx variant color changes", async ({ page }) => {
		await loadPage(page, "/sx-variants")
		const color = async () =>
			page.getByTestId("sx-variants-box").evaluate((el) => getComputedStyle(el).color)
		const first = await color()
		await page.getByTestId("cycle-variant").click()
		expect(await color()).not.toBe(first)
	})
})

test.describe("hooks intercept input a11y sw malformed logs", () => {
	test("hooks expose loader and location", async ({ page }) => {
		await loadPage(page, "/hooks-test")
		await expect(page.getByTestId("loader-greeting")).toHaveText("hello from hooks")
		await expect(page.getByTestId("location-pathname")).toHaveText("/hooks-test")
		await page.getByTestId("navigate-btn").click()
		await expect(page.getByTestId("search-json")).toContainText("active")
	})

	test("intercept overlay from list", async ({ page }) => {
		await loadPage(page, "/products")
		await page.getByTestId("product-link-1").click()
		await expect(page.getByTestId("intercept-overlay")).toBeVisible()
		await expect(page.getByTestId("product-name")).toHaveText("Product 1")
		await page.getByTestId("intercept-dismiss").click()
		await expect(page.getByTestId("intercept-overlay")).toHaveCount(0)
		await expect(page.getByTestId("product-list")).toBeVisible()
	})

	test("nav from about to product is full page, not overlay", async ({ page }) => {
		await loadPage(page, "/about")
		await page.evaluate(() => {
			const nav = (window as unknown as { __flareNavigate: (to: string) => Promise<void> })
				.__flareNavigate
			return nav("/products/1")
		})
		await page.waitForURL("**/products/1")
		await expect(page.getByTestId("product-detail")).toBeVisible()
		await expect(page.getByTestId("intercept-overlay")).toHaveCount(0)
	})

	test("browser back dismisses intercept overlay", async ({ page }) => {
		await loadPage(page, "/products")
		await page.getByTestId("product-link-1").click()
		await expect(page.getByTestId("intercept-overlay")).toBeVisible()
		await page.goBack()
		await page.waitForURL("**/products", { timeout: 10_000 })
		await expect(page.getByTestId("intercept-overlay")).toHaveCount(0)
		await expect(page.getByTestId("product-list")).toBeVisible()
	})

	test("zod input accepts digits and rejects letters", async ({ page }) => {
		await loadPage(page, "/input-zod/42?tab=info")
		await expect(page.getByTestId("input-id")).toHaveText("42")
		await expect(page.getByTestId("input-tab")).toHaveText("info")
		const res = await page.goto("/input-zod/abc")
		expect(res?.status()).toBeGreaterThanOrEqual(400)
	})

	test("a11y landmarks and skip link", async ({ page }) => {
		await loadPage(page, "/a11y-test")
		await expect(page.getByTestId("skip-link")).toHaveAttribute("href", "#main-content")
		await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible()
		await expect(page.getByLabel("Email")).toBeVisible()
		await expect(page.getByTestId("not-found-heading")).toHaveCount(0)
	})

	test("404 is accessible", async ({ page }) => {
		await page.goto("/does-not-exist")
		await expect(page.getByTestId("not-found-boundary")).toBeVisible()
		await expect(page.getByRole("heading", { name: "404" })).toBeVisible()
	})

	test("offline fallback page", async ({ page }) => {
		await loadPage(page, "/offline")
		await expect(page.getByTestId("offline-page")).toBeVisible()
	})

	test("malformed / users /.. does not 500", async ({ request }) => {
		const res = await request.get("/users/%2e%2e")
		expect(res.status()).toBeLessThan(500)
	})

	test("server logs do not crash page", async ({ page }) => {
		await loadPage(page, "/server-log-test")
		await expect(page.getByTestId("status")).toHaveText("ok")
	})
})
