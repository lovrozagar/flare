import { expect, test } from "@playwright/test"
import { loadPage, setupConsoleCapture, BASE } from "./helpers"

/* ── class= shape variants ──────────────────────────────────────────── */

test.describe("sx: class shape — static string", () => {
	test("element carries the static class", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-shapes")
		const el = page.getByTestId("shape-static")
		await expect(el).toBeVisible()
		const cls = await el.getAttribute("class")
		expect(cls).toContain("shape-static")
	})

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-class-shapes")
		cap.assertClean()
	})
})

test.describe("sx: class shape — array", () => {
	test("all array classes present on element", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-shapes")
		const el = page.getByTestId("shape-array")
		const cls = await el.getAttribute("class")
		expect(cls).toContain("shape-a")
		expect(cls).toContain("shape-b")
	})
})

test.describe("sx: class shape — nested array", () => {
	test("all nested array classes flattened onto element", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-shapes")
		const el = page.getByTestId("shape-nested-array")
		const cls = await el.getAttribute("class")
		expect(cls).toContain("shape-outer")
		expect(cls).toContain("shape-inner-a")
		expect(cls).toContain("shape-inner-b")
	})
})

test.describe("sx: class shape — cn() object composition", () => {
	test("truthy key present, falsy key absent", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-shapes")
		const el = page.getByTestId("shape-cn-object")
		const cls = await el.getAttribute("class")
		expect(cls).toContain("shape-cn-active")
		expect(cls ?? "").not.toContain("shape-cn-inactive")
	})
})

test.describe("sx: class shape — dynamic conditional", () => {
	test("base class always present", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-shapes")
		const el = page.getByTestId("shape-dynamic")
		const cls = await el.getAttribute("class")
		expect(cls).toContain("shape-base")
	})

	test("conditional class absent before toggle", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-shapes")
		const el = page.getByTestId("shape-dynamic")
		const cls = await el.getAttribute("class")
		expect(cls ?? "").not.toContain("shape-active")
	})

	test("conditional class present after toggle", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-shapes")
		await page.getByTestId("toggle-active").click()
		const el = page.getByTestId("shape-dynamic")
		const cls = await el.getAttribute("class")
		expect(cls).toContain("shape-active")
	})

	test("base class survives toggle", async ({ page }) => {
		await loadPage(page, "/styling-sx-class-shapes")
		await page.getByTestId("toggle-active").click()
		const el = page.getByTestId("shape-dynamic")
		const cls = await el.getAttribute("class")
		expect(cls).toContain("shape-base")
	})
})

/* ── sx all-props: every prop category ─────────────────────────────── */

test.describe("sx: all-props — flat CSS properties", () => {
	test("color and fontSize computed correctly", async ({ page }) => {
		await loadPage(page, "/styling-sx-all-props")
		const el = page.getByTestId("sx-flat")
		const cs = await el.evaluate((n) => {
			const s = getComputedStyle(n)
			return { color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight }
		})
		expect(cs.color).toBe("rgb(10, 10, 10)")
		expect(cs.fontSize).toBe("16px")
		expect(Number(cs.fontWeight)).toBeGreaterThanOrEqual(600)
	})

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-all-props")
		cap.assertClean()
	})
})

test.describe("sx: all-props — @media query", () => {
	test("media-overridden color wins (min-width:1px always matches)", async ({ page }) => {
		await loadPage(page, "/styling-sx-all-props")
		const color = await page
			.getByTestId("sx-media")
			.evaluate((n) => getComputedStyle(n).color)
		expect(color).toBe("rgb(0, 150, 0)")
	})
})

test.describe("sx: all-props — @supports query", () => {
	test("supports-overridden color wins (display:block always supported)", async ({ page }) => {
		await loadPage(page, "/styling-sx-all-props")
		const color = await page
			.getByTestId("sx-supports")
			.evaluate((n) => getComputedStyle(n).color)
		expect(color).toBe("rgb(0, 0, 180)")
	})
})

test.describe("sx: all-props — variants via data-attr", () => {
	test("data-size=lg activates correct color variant", async ({ page }) => {
		await loadPage(page, "/styling-sx-all-props")
		const color = await page
			.getByTestId("sx-variants-all")
			.evaluate((n) => getComputedStyle(n).color)
		/* variants.size.lg sets rgb(0, 100, 200) */
		expect(color).toBe("rgb(0, 100, 200)")
	})
})

test.describe("sx: all-props — SSR HTML", () => {
	test("SSR renders all testids", async ({ page }) => {
		const res = await page.request.get(`${BASE}/styling-sx-all-props`)
		const html = await res.text()
		expect(html).toContain('data-testid="sx-flat"')
		expect(html).toContain('data-testid="sx-media"')
		expect(html).toContain('data-testid="sx-supports"')
		expect(html).toContain('data-testid="sx-variants-all"')
	})
})
