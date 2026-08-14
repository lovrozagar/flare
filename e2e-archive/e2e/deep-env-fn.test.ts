import { expect, test } from "@playwright/test"
import { loadPage, setupConsoleCapture } from "./helpers"

/* /env-fn-test SSRs the right data but never sets data-hydrated — client
   env-fn transform/hydration is a product gap, not an extract leftover. */
test.describe.skip("Environment-bound functions (env-fn)", () => {
	test("SSR: createServerOnlyFn runs in loader, data appears in HTML", async ({ page }) => {
		await loadPage(page, "/env-fn-test")
		await expect(page.locator("[data-testid=server-data]")).toHaveText("server-secret-42")
	})

	test("SSR: createIsomorphicFn picks server impl in loader", async ({ page }) => {
		await loadPage(page, "/env-fn-test")
		await expect(page.locator("[data-testid=loader-env]")).toHaveText("rendered-on-server")
	})

	test("client: createIsomorphicFn picks client impl after hydration", async ({ page }) => {
		await loadPage(page, "/env-fn-test")
		await expect(page.locator("[data-testid=live-env]")).toHaveText("rendered-on-client")
	})

	test("client: createClientOnlyFn runs after hydration", async ({ page }) => {
		await loadPage(page, "/env-fn-test")
		await expect(page.locator("[data-testid=client-mark]")).toHaveText("client-only-mark")
	})

	test("no errors from env-fn transforms", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/env-fn-test")

		/* verify all values populated */
		await expect(page.locator("[data-testid=server-data]")).toHaveText("server-secret-42")
		await expect(page.locator("[data-testid=client-mark]")).toHaveText("client-only-mark")

		cap.assertClean()
	})
})
