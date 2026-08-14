import { expect, test } from "@playwright/test"
import { loadPage, setupConsoleCapture } from "./helpers"

/*
 * Visual regression baselines for sx prop system.
 * Tolerance: default Playwright threshold (pixel diff, no custom config needed).
 * Baselines committed to e2e/__screenshots__/ on first run with --update-snapshots.
 */

/* ── Basic static sx ────────────────────────────────────────────────── */

test.describe("sx visual: basic static object", () => {
	test("sx-basic-box matches snapshot", async ({ page }) => {
		await loadPage(page, "/styling-sx-basic")
		await expect(page.getByTestId("sx-basic-box")).toHaveScreenshot("sx-basic-box.png")
	})

	test("sx-basic-text matches snapshot", async ({ page }) => {
		await loadPage(page, "/styling-sx-basic")
		await expect(page.getByTestId("sx-basic-text")).toHaveScreenshot("sx-basic-text.png")
	})
})

/* ── Nested selectors ───────────────────────────────────────────────── */

test.describe("sx visual: nested selectors", () => {
	test("sx-hover-box matches snapshot before hover", async ({ page }) => {
		await loadPage(page, "/styling-sx-nested")
		await expect(page.getByTestId("sx-hover-box")).toHaveScreenshot("sx-hover-box-default.png")
	})

	test("sx-media-box matches snapshot", async ({ page }) => {
		await loadPage(page, "/styling-sx-nested")
		await expect(page.getByTestId("sx-media-box")).toHaveScreenshot("sx-media-box.png")
	})
})

/* ── Variants ───────────────────────────────────────────────────────── */

test.describe("sx visual: variants", () => {
	test("variant primary matches snapshot", async ({ page }) => {
		await loadPage(page, "/styling-sx-variants")
		await expect(page.getByTestId("sx-variants-box")).toHaveScreenshot("sx-variants-primary.png")
	})

	test("variant secondary matches snapshot after one click", async ({ page }) => {
		await loadPage(page, "/styling-sx-variants")
		await page.getByTestId("cycle-variant").click()
		await expect(page.getByTestId("sx-variants-box")).toHaveScreenshot("sx-variants-secondary.png")
	})

	test("variant danger matches snapshot after two clicks", async ({ page }) => {
		await loadPage(page, "/styling-sx-variants")
		await page.getByTestId("cycle-variant").click()
		await page.getByTestId("cycle-variant").click()
		await expect(page.getByTestId("sx-variants-box")).toHaveScreenshot("sx-variants-danger.png")
	})
})

/* ── Signal-driven dynamic color ────────────────────────────────────── */

test.describe("sx visual: dynamic signal color", () => {
	test("dynamic box initial color matches snapshot", async ({ page }) => {
		await loadPage(page, "/styling-sx-dynamic")
		await expect(page.getByTestId("sx-dynamic-box")).toHaveScreenshot("sx-dynamic-initial.png")
	})

	test("dynamic box after one cycle matches snapshot", async ({ page }) => {
		await loadPage(page, "/styling-sx-dynamic")
		await page.getByTestId("cycle-color").click()
		await expect(page.getByTestId("sx-dynamic-box")).toHaveScreenshot("sx-dynamic-cycle1.png")
	})
})

/* ── Lazy mount ─────────────────────────────────────────────────────── */

test.describe("sx visual: lazy component", () => {
	test("lazy sx box matches snapshot after mount", async ({ page }) => {
		await loadPage(page, "/styling-sx-lazy")
		await page.getByTestId("mount-lazy").click()
		await page.getByTestId("lazy-sx-box").waitFor({ state: "visible", timeout: 10_000 })
		await expect(page.getByTestId("lazy-sx-box")).toHaveScreenshot("sx-lazy-mounted.png")
	})
})

/* ── Dialog composition ─────────────────────────────────────────────── */

test.describe("sx visual: dialog composition", () => {
	test("dialog content matches snapshot when open", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-dialog")
		await page.getByTestId("open-dialog").click()
		await expect(page.getByTestId("sx-dialog-backdrop")).toBeVisible()
		await expect(page.getByTestId("sx-dialog-content")).toHaveScreenshot("sx-dialog-open.png")
	})
})

/* ── Custom Button ──────────────────────────────────────────────────── */

test.describe("sx visual: custom button", () => {
	test("default button matches snapshot", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-button")
		await expect(page.getByTestId("btn-default")).toHaveScreenshot("sx-custom-btn-default.png")
	})

	test("style-override button matches snapshot", async ({ page }) => {
		await loadPage(page, "/styling-sx-custom-button")
		await expect(page.getByTestId("btn-style-override")).toHaveScreenshot(
			"sx-custom-btn-override.png",
		)
	})
})

/* ── Cross-package Mode 2: prebuilt lib ─────────────────────────────── */

test.describe("sx visual: cross-package prebuilt lib", () => {
	test("prebuilt button matches snapshot", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt")
		await expect(page.getByTestId("prebuilt-btn")).toHaveScreenshot("sx-prebuilt-btn.png")
	})

	test("prebuilt card matches snapshot", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt")
		await expect(page.getByTestId("prebuilt-card")).toHaveScreenshot("sx-prebuilt-card.png")
	})
})

/* ── Cross-package Mode 3: source lib ───────────────────────────────── */

test.describe("sx visual: cross-package source lib", () => {
	test("source button matches snapshot", async ({ page }) => {
		await loadPage(page, "/styling-sx-source")
		await expect(page.getByTestId("source-btn")).toHaveScreenshot("sx-source-btn.png")
	})

	test("source card matches snapshot", async ({ page }) => {
		await loadPage(page, "/styling-sx-source")
		await expect(page.getByTestId("source-card")).toHaveScreenshot("sx-source-card.png")
	})

	test("no console errors during visual capture", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-source")
		cap.assertClean()
	})
})
