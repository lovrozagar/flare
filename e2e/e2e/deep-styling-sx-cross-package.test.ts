import { expect, test } from "@playwright/test"
import { BASE, loadPage, setupConsoleCapture } from "./helpers"

/* ── Mode 2: prebuilt lib — classes from dist CSS, not consumer's CSS ───── */

test.describe("sx cross-package: Mode 2 — prebuilt lib button renders", () => {
	test("prebuilt button is visible with correct background from lib CSS", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt")
		const btn = page.getByTestId("prebuilt-btn")
		await expect(btn).toBeVisible()

		const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor)
		/* a1-pb001 = background-color: rgb(0, 120, 80) from dist/button.css */
		expect(bg).toBe("rgb(0, 120, 80)")
	})

	test("prebuilt button has correct text color from lib CSS", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt")
		const color = await page
			.getByTestId("prebuilt-btn")
			.evaluate((el) => getComputedStyle(el).color)
		/* a1-pb002 = color: rgb(255, 255, 255) */
		expect(color).toBe("rgb(255, 255, 255)")
	})

	test("prebuilt button has lib border-radius from lib CSS", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt")
		const radius = await page
			.getByTestId("prebuilt-btn")
			.evaluate((el) => getComputedStyle(el).borderRadius)
		/* a1-pb003 = border-radius: 6px */
		expect(radius).toBe("6px")
	})

	test("prebuilt button carries prebuilt-btn and lib atomic classes", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt")
		const cls = await page.getByTestId("prebuilt-btn").getAttribute("class")
		expect(cls).toContain("prebuilt-btn")
		expect(cls).toContain("a1-pb001")
	})

	test("consumer extra class coexists with lib atomic classes", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt")
		const cls = await page.getByTestId("prebuilt-btn-extra").getAttribute("class")
		expect(cls).toContain("consumer-extra")
		expect(cls).toContain("a1-pb001")
	})
})

test.describe("sx cross-package: Mode 2 — prebuilt lib card renders", () => {
	test("prebuilt card is visible with correct background from lib CSS", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt")
		const card = page.getByTestId("prebuilt-card")
		await expect(card).toBeVisible()

		const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor)
		/* a1-pc001 = background-color: rgb(245, 250, 245) */
		expect(bg).toBe("rgb(245, 250, 245)")
	})

	test("prebuilt card has lib border-radius from lib CSS", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt")
		const radius = await page
			.getByTestId("prebuilt-card")
			.evaluate((el) => getComputedStyle(el).borderRadius)
		/* a1-pc003 = border-radius: 8px */
		expect(radius).toBe("8px")
	})

	test("prebuilt card carries prebuilt-card and lib atomic classes", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt")
		const cls = await page.getByTestId("prebuilt-card").getAttribute("class")
		expect(cls).toContain("prebuilt-card")
		expect(cls).toContain("a1-pc001")
	})
})

test.describe("sx cross-package: Mode 2 — consumer sx in same page", () => {
	test("consumer sx box has correct color", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt")
		const color = await page
			.getByTestId("consumer-sx-box")
			.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(10, 60, 120)")
	})

	test("consumer sx box has correct font-size", async ({ page }) => {
		await loadPage(page, "/styling-sx-prebuilt")
		const size = await page
			.getByTestId("consumer-sx-box")
			.evaluate((el) => getComputedStyle(el).fontSize)
		expect(size).toBe("16px")
	})

	test("SSR HTML contains prebuilt classes on button", async ({ page }) => {
		const res = await page.request.get(`${BASE}/styling-sx-prebuilt`)
		const html = await res.text()
		expect(html).toContain("a1-pb001")
		expect(html).toContain("prebuilt-btn")
	})

	test("SSR HTML contains prebuilt classes on card", async ({ page }) => {
		const res = await page.request.get(`${BASE}/styling-sx-prebuilt`)
		const html = await res.text()
		expect(html).toContain("a1-pc001")
		expect(html).toContain("prebuilt-card")
	})

	test("no console errors on prebuilt page", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-prebuilt")
		cap.assertClean()
	})
})

/* ── Mode 3: source-only lib — all classes in consumer's flare-global.css ── */

test.describe("sx cross-package: Mode 3 — source lib button renders", () => {
	test("source button is visible with correct background", async ({ page }) => {
		await loadPage(page, "/styling-sx-source")
		const btn = page.getByTestId("source-btn")
		await expect(btn).toBeVisible()

		const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor)
		/* sx: backgroundColor: rgb(30, 90, 180) */
		expect(bg).toBe("rgb(30, 90, 180)")
	})

	test("source button has correct text color", async ({ page }) => {
		await loadPage(page, "/styling-sx-source")
		const color = await page
			.getByTestId("source-btn")
			.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(255, 255, 255)")
	})

	test("source button has correct border-radius", async ({ page }) => {
		await loadPage(page, "/styling-sx-source")
		const radius = await page
			.getByTestId("source-btn")
			.evaluate((el) => getComputedStyle(el).borderRadius)
		expect(radius).toBe("5px")
	})

	test("source button carries source-btn anchor class", async ({ page }) => {
		await loadPage(page, "/styling-sx-source")
		const cls = await page.getByTestId("source-btn").getAttribute("class")
		expect(cls).toContain("source-btn")
	})

	test("consumer extra class coexists with lib sx classes on source button", async ({ page }) => {
		await loadPage(page, "/styling-sx-source")
		const cls = await page.getByTestId("source-btn-extra").getAttribute("class")
		expect(cls).toContain("consumer-extra-src")
		expect(cls).toContain("source-btn")
	})
})

test.describe("sx cross-package: Mode 3 — source lib card renders", () => {
	test("source card is visible with correct background", async ({ page }) => {
		await loadPage(page, "/styling-sx-source")
		const card = page.getByTestId("source-card")
		await expect(card).toBeVisible()

		const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor)
		/* sx: backgroundColor: rgb(240, 248, 255) */
		expect(bg).toBe("rgb(240, 248, 255)")
	})

	test("source card has correct border-radius", async ({ page }) => {
		await loadPage(page, "/styling-sx-source")
		const radius = await page
			.getByTestId("source-card")
			.evaluate((el) => getComputedStyle(el).borderRadius)
		expect(radius).toBe("8px")
	})

	test("source card carries source-card anchor class", async ({ page }) => {
		await loadPage(page, "/styling-sx-source")
		const cls = await page.getByTestId("source-card").getAttribute("class")
		expect(cls).toContain("source-card")
	})
})

test.describe("sx cross-package: Mode 3 — consumer sx coexists with source lib", () => {
	test("consumer sx box has correct color", async ({ page }) => {
		await loadPage(page, "/styling-sx-source")
		const color = await page
			.getByTestId("source-consumer-box")
			.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(20, 80, 160)")
	})

	test("consumer sx box has correct font-size", async ({ page }) => {
		await loadPage(page, "/styling-sx-source")
		const size = await page
			.getByTestId("source-consumer-box")
			.evaluate((el) => getComputedStyle(el).fontSize)
		expect(size).toBe("15px")
	})

	test("no class duplication — source-btn class appears exactly once per element", async ({
		page,
	}) => {
		await loadPage(page, "/styling-sx-source")
		const cls = (await page.getByTestId("source-btn").getAttribute("class")) ?? ""
		/* split on whitespace, count occurrences of source-btn */
		const parts = cls.trim().split(/\s+/)
		const count = parts.filter((c) => c === "source-btn").length
		expect(count).toBe(1)
	})

	test("SSR HTML contains lib sx classes on source button", async ({ page }) => {
		const res = await page.request.get(`${BASE}/styling-sx-source`)
		const html = await res.text()
		expect(html).toContain("source-btn")
		expect(html).toContain('data-testid="source-btn"')
	})

	test("SSR HTML contains lib sx classes on source card", async ({ page }) => {
		const res = await page.request.get(`${BASE}/styling-sx-source`)
		const html = await res.text()
		expect(html).toContain("source-card")
		expect(html).toContain('data-testid="source-card"')
	})

	test("no console errors on source page", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-source")
		cap.assertClean()
	})
})
