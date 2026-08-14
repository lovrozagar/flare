import { expect, test } from "@playwright/test"
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

test.describe("Deferred styles: shell renders immediately", () => {
	test("shell styled element visible before deferred resolves", async ({ page }) => {
		await loadPage(page, "/styling-deferred")
		const shell = page.getByTestId("deferred-shell")
		await expect(shell).toBeVisible()

		const computed = await shell.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { color: cs.color, fontWeight: cs.fontWeight }
		})
		expect(computed.color).toBe("rgb(0, 100, 0)")
		expect(Number(computed.fontWeight)).toBeGreaterThanOrEqual(700)
	})

	test("shell has data-c in SSR HTML", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-deferred`)
		const html = await response.text()
		expect(html).toContain('data-c="deferred-shell"')
		expect(html).toContain('data-testid="deferred-shell"')
	})
})

test.describe("Deferred styles: pending state styled", () => {
	test("pending element has data-c while waiting", async ({ page }) => {
		/* use raw goto to catch pending state before resolve */
		await page.goto("/styling-deferred", { waitUntil: "commit" })

		/* either pending or resolved — check whichever is present */
		const pendingEl = page.getByTestId("deferred-pending")
		const resolvedEl = page.getByTestId("deferred-resolved")

		const pendingVisible = await pendingEl.isVisible().catch(() => false)
		if (pendingVisible) {
			const dataC = await pendingEl.getAttribute("data-c")
			expect(dataC).toBeTruthy()
		} else {
			/* already resolved — just verify resolved is styled */
			await expect(resolvedEl).toBeVisible()
		}
	})
})

test.describe("Deferred styles: resolved element styled", () => {
	test("deferred-resolved appears with correct styles after stream", async ({ page }) => {
		await loadPage(page, "/styling-deferred")

		const resolved = page.getByTestId("deferred-resolved")
		await expect(resolved).toBeVisible({ timeout: 10_000 })

		const computed = await resolved.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { color: cs.color, fontWeight: cs.fontWeight }
		})
		expect(computed.color).toBe("rgb(0, 0, 200)")
		expect(Number(computed.fontWeight)).toBeGreaterThanOrEqual(700)
	})

	test("deferred-resolved has data-c attribute", async ({ page }) => {
		await loadPage(page, "/styling-deferred")
		const resolved = page.getByTestId("deferred-resolved")
		await expect(resolved).toBeVisible({ timeout: 10_000 })

		const dataC = await resolved.getAttribute("data-c")
		expect(dataC).toBeTruthy()
	})

	test("resolved content matches deferred value", async ({ page }) => {
		await loadPage(page, "/styling-deferred")
		const resolved = page.getByTestId("deferred-resolved")
		await expect(resolved).toBeVisible({ timeout: 10_000 })
		await expect(resolved).toContainText("streamed-result")
	})
})

test.describe("Deferred styles: multiple deferred", () => {
	test("slow deferred also resolves with styles", async ({ page }) => {
		await loadPage(page, "/styling-deferred")

		const slow = page.getByTestId("slow-resolved")
		await expect(slow).toBeVisible({ timeout: 10_000 })
		await expect(slow).toContainText("slow-result")

		const computed = await slow.evaluate((el) => {
			const cs = getComputedStyle(el)
			return { color: cs.color, textDecoration: cs.textDecorationLine || cs.textDecoration }
		})
		expect(computed.color).toBe("rgb(200, 0, 0)")
		expect(computed.textDecoration).toContain("underline")
	})

	test("shell + resolved + slow all have different data-c", async ({ page }) => {
		await loadPage(page, "/styling-deferred")
		await page.getByTestId("slow-resolved").waitFor({ timeout: 10_000 })

		const shellC = await page.getByTestId("deferred-shell").getAttribute("data-c")
		const resolvedC = await page.getByTestId("deferred-resolved").getAttribute("data-c")
		const slowC = await page.getByTestId("slow-resolved").getAttribute("data-c")

		expect(new Set([shellC, resolvedC, slowC]).size).toBe(3)
	})
})

test.describe("Deferred styles: SPA round-trip", () => {
	test("nav away + back re-streams deferred with styles", async ({ page }) => {
		await loadPage(page, "/styling-deferred")
		await page.getByTestId("deferred-resolved").waitFor({ timeout: 10_000 })

		await navigateSPA(page, "/about")
		await navigateSPA(page, "/styling-deferred")

		/* should stream again and get styles */
		const resolved = page.getByTestId("deferred-resolved")
		await expect(resolved).toBeVisible({ timeout: 10_000 })

		const color = await resolved.evaluate((el) => getComputedStyle(el).color)
		expect(color).toBe("rgb(0, 0, 200)")
	})
})

test.describe("Deferred styles: hydration no dup", () => {
	test("scoped style tag at most 1 after all deferred resolve", async ({ page }) => {
		await loadPage(page, "/styling-deferred")
		await page.getByTestId("slow-resolved").waitFor({ timeout: 10_000 })

		const count = await page.evaluate(
			() => document.querySelectorAll("style#__FLARE_SCOPED__").length,
		)
		expect(count).toBeLessThanOrEqual(1)
	})
})

test.describe("Deferred styles: console clean", () => {
	test("no errors during deferred streaming", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/styling-deferred")
		await page.getByTestId("slow-resolved").waitFor({ timeout: 10_000 })
		cap.assertClean()
	})
})
