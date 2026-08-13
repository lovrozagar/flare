import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("PreloaderContext override: SSR", () => {
	test("child key overwrites parent key (shared = 'page')", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/chain-override")

		expect(await page.locator("[data-testid=page-shared]").textContent()).toBe("page")
		cap.assertClean()
	})

	test("parent-only key present in page (layoutOnly = true)", async ({ page }) => {
		await loadPage(page, "/chain-override")
		expect(await page.locator("[data-testid=page-layoutOnly]").textContent()).toBe("true")
	})

	test("child-only key present in page (pageOnly = true)", async ({ page }) => {
		await loadPage(page, "/chain-override")
		expect(await page.locator("[data-testid=page-pageOnly]").textContent()).toBe("true")
	})

	test("layout snapshot does NOT include page preloader results", async ({ page }) => {
		await loadPage(page, "/chain-override")
		expect(await page.locator("[data-testid=layout-has-pageOnly]").textContent()).toBe("false")
	})

	test("layout snapshot has shared = 'layout' (before page override)", async ({ page }) => {
		await loadPage(page, "/chain-override")
		expect(await page.locator("[data-testid=layout-shared]").textContent()).toBe("layout")
	})

	test("page snapshot includes layout preloader results", async ({ page }) => {
		await loadPage(page, "/chain-override")
		const snapshot = JSON.parse(
			(await page.locator("[data-testid=page-snapshot]").textContent()) ?? "{}",
		) as Record<string, unknown>
		expect(snapshot.layoutOnly).toBe(true)
		expect(snapshot.pageOnly).toBe(true)
		expect(snapshot.shared).toBe("page")
	})
})

test.describe("PreloaderContext override: SPA", () => {
	test("SPA nav to /chain-override shows correct override", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")
		await navigateSPA(page, "/chain-override")

		expect(await page.locator("[data-testid=page-shared]").textContent()).toBe("page")
		expect(await page.locator("[data-testid=page-layoutOnly]").textContent()).toBe("true")
		expect(await page.locator("[data-testid=page-pageOnly]").textContent()).toBe("true")
		cap.assertClean()
	})
})

test.describe("Auth inheritance: SSR", () => {
	test("auth available in child page loader (inherited from layout)", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "editor-1" })
		await loadPage(page, "/chain-auth-inherit")

		expect(await page.locator("[data-testid=auth-page-has-auth]").textContent()).toBe("true")
		expect(await page.locator("[data-testid=auth-page-userId]").textContent()).toBe("editor-1")
	})

	test("auth not available without x-test-auth header → 401", async ({ page }) => {
		const response = await page.goto("/chain-auth-inherit", { waitUntil: "domcontentloaded" })
		expect(response?.status()).toBe(401)
	})

	test("layout preloaderContext includes auth-derived data", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "editor-1" })
		await loadPage(page, "/chain-auth-inherit")

		expect(await page.locator("[data-testid=auth-layout-role]").textContent()).toBe("editor")
		expect(await page.locator("[data-testid=auth-layout-userId]").textContent()).toBe("editor-1")
	})

	test("callerData from layout's .authenticate() used", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "editor-1" })
		await loadPage(page, "/chain-auth-inherit")

		const callerData = JSON.parse(
			(await page.locator("[data-testid=auth-page-callerData]").textContent()) ?? "[]",
		) as unknown[]
		expect(callerData).toEqual(["role:editor"])
	})

	test("page inherits preloaderContext from auth layout", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "editor-1" })
		await loadPage(page, "/chain-auth-inherit")

		expect(await page.locator("[data-testid=auth-page-role]").textContent()).toBe("editor")
		expect(await page.locator("[data-testid=auth-page-authUserId]").textContent()).toBe("editor-1")
	})
})

test.describe("Auth inheritance: SPA", () => {
	test("SPA nav with auth header shows auth page content", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "editor-1" })
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/")
		await navigateSPA(page, "/chain-auth-inherit")

		expect(await page.locator("[data-testid=auth-page-has-auth]").textContent()).toBe("true")
		expect(await page.locator("[data-testid=auth-page-userId]").textContent()).toBe("editor-1")
		cap.assertClean()
	})
})

test.describe("Console clean during chain tests", () => {
	test("chain-override SSR has clean console", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/chain-override")
		cap.assertClean()
	})

	test("chain-auth-inherit SSR has clean console", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "editor-1" })
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/chain-auth-inherit")
		cap.assertClean()
	})
})
