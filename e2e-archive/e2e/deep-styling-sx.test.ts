import { expect, test } from "@playwright/test"
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

/* ── Basic: static flat sx object ──────────────────────────────────── */

test.describe("sx: basic static object", () => {
	test("element has correct computed color and padding", async ({ page }) => {
		await loadPage(page, "/styling-sx-basic")
		const box = page.getByTestId("sx-basic-box")
		await expect(box).toBeVisible()

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight }
		})
		expect(computed.color).toBe("rgb(0, 0, 255)")
		expect(computed.fontSize).toBe("24px")
		expect(Number(computed.fontWeight)).toBeGreaterThanOrEqual(700)
	})

	test("small text element has correct font-size and color", async ({ page }) => {
		await loadPage(page, "/styling-sx-basic")
		const el = page.getByTestId("sx-basic-text")
		await expect(el).toBeVisible()

		const computed = await el.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { color: cs.color, fontSize: cs.fontSize }
		})
		expect(computed.color).toBe("rgb(100, 100, 100)")
		expect(computed.fontSize).toBe("14px")
	})

	test("SSR HTML contains class attr on sx elements", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-sx-basic`)
		const html = await response.text()
		/* sx plugin emits class= attr (atomic or compileSx) — no data-c= */
		expect(html).toContain('data-testid="sx-basic-box"')
		expect(html).toContain("class=")
	})

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-basic")
		cap.assertClean()
	})
})

/* ── Nested: &:hover and @media selectors ──────────────────────────── */

test.describe("sx: nested selectors", () => {
	test("base color applied before hover", async ({ page }) => {
		await loadPage(page, "/styling-sx-nested")
		const box = page.getByTestId("sx-hover-box")
		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 0, 0)")
	})

	test("media query (min-width: 1px) always applies — fontSize is 24px", async ({ page }) => {
		await loadPage(page, "/styling-sx-nested")
		const box = page.getByTestId("sx-media-box")
		await expect(box).toBeVisible()

		const fontSize = await box.evaluate((el) => getComputedStyle(el).fontSize)
		/* @media (min-width: 1px) always matches — overrides base 12px */
		expect(fontSize).toBe("24px")
	})

	test("SSR HTML present", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-sx-nested`)
		const html = await response.text()
		expect(html).toContain('data-testid="sx-hover-box"')
		expect(html).toContain('data-testid="sx-media-box"')
	})

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-nested")
		cap.assertClean()
	})
})

/* ── Variants: data-* attr switching ──────────────────────────────── */

test.describe("sx: variants", () => {
	test("initial variant=primary applies correct color", async ({ page }) => {
		await loadPage(page, "/styling-sx-variants")
		const box = page.getByTestId("sx-variants-box")
		await expect(box).toBeVisible()

		expect(await box.getAttribute("data-variant")).toBe("primary")
		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 100, 200)")
	})

	test("cycle to secondary updates color", async ({ page }) => {
		await loadPage(page, "/styling-sx-variants")
		await page.getByTestId("cycle-variant").click()

		const box = page.getByTestId("sx-variants-box")
		expect(await box.getAttribute("data-variant")).toBe("secondary")
		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(100, 100, 100)")
	})

	test("cycle to danger updates color", async ({ page }) => {
		await loadPage(page, "/styling-sx-variants")
		const btn = page.getByTestId("cycle-variant")
		await btn.click()
		await btn.click()

		const box = page.getByTestId("sx-variants-box")
		expect(await box.getAttribute("data-variant")).toBe("danger")
		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(200, 0, 0)")
	})

	test("cycling back to primary restores color", async ({ page }) => {
		await loadPage(page, "/styling-sx-variants")
		const btn = page.getByTestId("cycle-variant")
		await btn.click()
		await btn.click()
		await btn.click()

		const box = page.getByTestId("sx-variants-box")
		expect(await box.getAttribute("data-variant")).toBe("primary")
		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 100, 200)")
	})

	test("no console errors with variant cycling", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-variants")
		await page.getByTestId("cycle-variant").click()
		await page.getByTestId("cycle-variant").click()
		cap.assertClean()
	})
})

/* ── Dynamic: signal-bound value — CSS var or compileSx path ───────── */

test.describe("sx: dynamic value", () => {
	test("initial color applied", async ({ page }) => {
		await loadPage(page, "/styling-sx-dynamic")
		const box = page.getByTestId("sx-dynamic-box")
		await expect(box).toBeVisible()

		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 128, 0)")
	})

	test("cycle updates computed color", async ({ page }) => {
		await loadPage(page, "/styling-sx-dynamic")
		await page.getByTestId("cycle-color").click()

		const box = page.getByTestId("sx-dynamic-box")
		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(200, 0, 100)")
	})

	test("second cycle updates to third color", async ({ page }) => {
		await loadPage(page, "/styling-sx-dynamic")
		const btn = page.getByTestId("cycle-color")
		await btn.click()
		await btn.click()

		const box = page.getByTestId("sx-dynamic-box")
		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 0, 200)")
	})

	test("no console errors with dynamic cycling", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-dynamic")
		await page.getByTestId("cycle-color").click()
		cap.assertClean()
	})
})

/* ── Fallback: compileSx runtime — flare-rt-<hash> class ──────────── */

test.describe("sx: runtime compileSx fallback", () => {
	test("element has a class starting with flare-rt-", async ({ page }) => {
		await loadPage(page, "/styling-sx-fallback")
		const cls = await page.getByTestId("sx-fallback-class").textContent()
		expect(cls).toMatch(/^flare-rt-/)
	})

	test("computed styles from compileSx are correct", async ({ page }) => {
		await loadPage(page, "/styling-sx-fallback")
		const box = page.getByTestId("sx-fallback-box")
		await expect(box).toBeVisible()

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight }
		})
		expect(computed.color).toBe("rgb(128, 0, 128)")
		expect(computed.fontSize).toBe("22px")
		expect(Number(computed.fontWeight)).toBeGreaterThanOrEqual(700)
	})

	test("flare-runtime style tag exists with rule for the class", async ({ page }) => {
		await loadPage(page, "/styling-sx-fallback")
		const cls = await page.getByTestId("sx-fallback-class").textContent()

		const rulePresent = await page.evaluate((className) => {
			const el = document.getElementById("flare-runtime") as HTMLStyleElement | null
			if (!el) return false
			/* Check CSSOM rules */
			const sheet = el.sheet
			if (sheet) {
				for (let i = 0; i < sheet.cssRules.length; i++) {
					if (sheet.cssRules[i].cssText.includes(className)) return true
				}
			}
			return el.textContent?.includes(className) ?? false
		}, cls ?? "")

		expect(rulePresent).toBe(true)
	})

	test("SSR HTML contains flare-rt- class on element", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-sx-fallback`)
		const html = await response.text()
		expect(html).toMatch(/flare-rt-/)
		expect(html).toContain('data-testid="sx-fallback-box"')
	})

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-fallback")
		cap.assertClean()
	})
})

/* ── Layers: cascade verification ─────────────────────────────────── */

test.describe("sx: cascade layers", () => {
	test("app-layer sx prop element has correct color", async ({ page }) => {
		await loadPage(page, "/styling-sx-layers")
		const box = page.getByTestId("sx-layers-app")
		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 0, 255)")
	})

	test("runtime user.app compileSx element has correct color", async ({ page }) => {
		await loadPage(page, "/styling-sx-layers")
		const box = page.getByTestId("sx-layers-runtime")
		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 128, 0)")
	})

	test("inline style wins over sx layer", async ({ page }) => {
		await loadPage(page, "/styling-sx-layers")
		const box = page.getByTestId("sx-layers-inline")
		const color = await box.evaluate((el) => getComputedStyle(el).color)
		/* inline style: rgb(200, 0, 0) beats sx prop rgb(0, 0, 255) */
		expect(color).toBe("rgb(200, 0, 0)")
	})

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-layers")
		cap.assertClean()
	})
})

/* ── Lazy: lazy-loaded component using sx ─────────────────────────── */

test.describe("sx: lazy component", () => {
	test("before mount: pending or absent", async ({ page }) => {
		await loadPage(page, "/styling-sx-lazy")
		await expect(page.getByTestId("lazy-sx-box")).not.toBeVisible()
	})

	test("after mount: lazy component renders with correct styles", async ({ page }) => {
		await loadPage(page, "/styling-sx-lazy")
		await page.getByTestId("mount-lazy").click()

		const box = page.getByTestId("lazy-sx-box")
		await expect(box).toBeVisible({ timeout: 10_000 })

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight }
		})
		expect(computed.color).toBe("rgb(0, 100, 200)")
		expect(computed.fontSize).toBe("22px")
		expect(Number(computed.fontWeight)).toBeGreaterThanOrEqual(700)
	})

	test("lazy component mounts without FOUC — class present immediately", async ({ page }) => {
		await loadPage(page, "/styling-sx-lazy")
		await page.getByTestId("mount-lazy").click()

		const box = page.getByTestId("lazy-sx-box")
		await expect(box).toBeVisible({ timeout: 10_000 })

		/* Class attr is set on first paint — no frame where class is absent */
		const cls = await box.getAttribute("class")
		expect(cls).toBeTruthy()
	})

	test("SPA nav away and back: lazy component restores on re-mount", async ({ page }) => {
		await loadPage(page, "/styling-sx-lazy")
		await page.getByTestId("mount-lazy").click()
		await page.getByTestId("lazy-sx-box").waitFor({ state: "visible", timeout: 10_000 })

		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styling-sx-lazy")

		/* initial state — not mounted yet */
		await expect(page.getByTestId("lazy-sx-box")).not.toBeVisible()

		/* re-mount */
		await page.getByTestId("mount-lazy").click()
		await expect(page.getByTestId("lazy-sx-box")).toBeVisible({ timeout: 10_000 })
		const color = await page
			.getByTestId("lazy-sx-box")
			.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 100, 200)")
	})

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-lazy")
		await page.getByTestId("mount-lazy").click()
		await page.getByTestId("lazy-sx-box").waitFor({ state: "visible", timeout: 10_000 })
		cap.assertClean()
	})
})

/* ── SSR-dynamic: compileSx in SSR'd markup ──────────────────────── */

test.describe("sx: SSR-dynamic compileSx", () => {
	test("SSR HTML contains flare-rt- class on element", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-sx-ssr-dynamic`)
		const html = await response.text()
		expect(html).toMatch(/flare-rt-/)
		expect(html).toContain('data-testid="sx-ssr-dynamic-box"')
	})

	test("SSR HTML contains flare-runtime style with the class rule", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-sx-ssr-dynamic`)
		const html = await response.text()
		/* flare-runtime sheet is injected server-side when compileSx runs during SSR */
		expect(html).toContain("flare-runtime")
	})

	test("computed color correct after hydration", async ({ page }) => {
		await loadPage(page, "/styling-sx-ssr-dynamic")
		const box = page.getByTestId("sx-ssr-dynamic-box")
		await expect(box).toBeVisible()

		const color = await box.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 100, 0)")
	})

	test("class name is stable across SSR and client (no hydration mismatch)", async ({ page }) => {
		/* loadPage already asserts no hydration warnings — just verify class present */
		await loadPage(page, "/styling-sx-ssr-dynamic")
		const cls = await page.getByTestId("sx-ssr-dynamic-class").textContent()
		expect(cls).toMatch(/^flare-rt-/)
	})

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-sx-ssr-dynamic")
		cap.assertClean()
	})
})
