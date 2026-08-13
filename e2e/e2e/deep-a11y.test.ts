import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

/**
 * Accessibility tests.
 *
 * Validates that Flare's rendering primitives produce accessible HTML:
 * - ARIA landmarks and roles
 * - Heading hierarchy
 * - Keyboard navigation
 * - Focus management across SPA transitions
 * - Skip links
 * - Live regions for dynamic content
 * - Image alt text
 * - Link and button semantics
 */

test.describe("A11y — ARIA landmarks", () => {
	test("page has header, main, footer landmarks", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const header = page.locator("header[data-testid=a11y-header]")
		const main = page.locator("main")
		const footer = page.locator("footer[data-testid=a11y-footer]")

		await expect(header).toHaveCount(1)
		await expect(main).toHaveCount(1)
		await expect(footer).toHaveCount(1)
	})

	test("navigation has aria-label", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const nav = page.locator("nav[aria-label='Primary navigation']")
		await expect(nav).toHaveCount(1)
	})

	test("sections have accessible names via aria-labelledby", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const interactive = page.locator("section[aria-labelledby=interactive-heading]")
		await expect(interactive).toHaveCount(1)

		const headingText = await page.locator("#interactive-heading").textContent()
		expect(headingText).toBe("Interactive Elements")
	})

	test("article list uses ul with li children", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const list = page.locator("ul[aria-label='Article list']")
		await expect(list).toHaveCount(1)

		const items = list.locator("li")
		await expect(items).toHaveCount(3)
	})

	test("articles have aria-labelledby pointing to heading", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const article = page.locator("article[aria-labelledby=article-title-1]")
		await expect(article).toHaveCount(1)

		const heading = page.locator("#article-title-1")
		expect(await heading.textContent()).toBe("Getting Started with A11y")
	})
})

test.describe("A11y — heading hierarchy", () => {
	test("headings follow h1 > h2 > h3 order without skips", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const headings = await page.evaluate(() => {
			const els = document.querySelectorAll("h1, h2, h3, h4, h5, h6")
			return Array.from(els).map((el) => ({
				level: Number.parseInt(el.tagName.replace("H", ""), 10),
				text: el.textContent?.trim() ?? "",
			}))
		})

		expect(headings.length).toBeGreaterThan(0)

		/* h1 exists exactly once */
		const h1s = headings.filter((h) => h.level === 1)
		expect(h1s).toHaveLength(1)

		/* no heading skips (h1→h3 without h2) */
		for (let i = 1; i < headings.length; i++) {
			const prev = headings[i - 1]
			const curr = headings[i]
			if (prev && curr) {
				const jump = curr.level - prev.level
				expect(jump).toBeLessThanOrEqual(1)
			}
		}
	})

	test("SSR HTML contains proper heading hierarchy", async ({ request }) => {
		const res = await request.get("/a11y-test")
		const html = await res.text()

		expect(html).toMatch(/<h1[^>]*>/)
		expect(html).toMatch(/<h2[^>]*>/)
		expect(html).toMatch(/<h3[^>]*>/)

		/* h1 appears before h2 in source order */
		const h1Pos = html.indexOf("<h1")
		const h2Pos = html.indexOf("<h2")
		expect(h1Pos).toBeLessThan(h2Pos)
	})
})

test.describe("A11y — images", () => {
	test("content images have meaningful alt text", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const heroImg = page.locator("[data-testid=hero-image]")
		const alt = await heroImg.getAttribute("alt")
		expect(alt).toBeTruthy()
		expect(alt).not.toBe("")
		expect(alt?.length).toBeGreaterThan(5)
	})

	test("decorative images have empty alt and aria-hidden", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const decorative = page.locator("[data-testid=decorative-image]")
		expect(await decorative.getAttribute("alt")).toBe("")
		expect(await decorative.getAttribute("aria-hidden")).toBe("true")
	})

	test("SSR HTML includes alt attributes on page images", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		/* check all img tags within the test page content */
		const missingAlt = await page.evaluate(() => {
			const imgs = document.querySelectorAll("[data-testid=a11y-page] img")
			return Array.from(imgs)
				.filter((img) => !img.hasAttribute("alt"))
				.map((img) => img.getAttribute("src") ?? "unknown")
		})

		expect(missingAlt).toEqual([])
	})
})

test.describe("A11y — interactive elements", () => {
	test("toggle button has aria-expanded and aria-controls", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const btn = page.locator("[data-testid=toggle-btn]")
		expect(await btn.getAttribute("aria-expanded")).toBe("false")
		expect(await btn.getAttribute("aria-controls")).toBe("expandable-content")
	})

	test("aria-expanded updates on click", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const btn = page.locator("[data-testid=toggle-btn]")
		expect(await btn.getAttribute("aria-expanded")).toBe("false")

		await btn.click()
		expect(await btn.getAttribute("aria-expanded")).toBe("true")

		const content = page.locator("#expandable-content")
		await expect(content).toBeVisible()
	})

	test("live region announces state changes", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const liveRegion = page.locator("[data-testid=live-region]")
		expect(await liveRegion.getAttribute("aria-live")).toBe("polite")

		/* initially empty */
		expect(await liveRegion.textContent()).toBe("")

		/* click triggers announcement */
		await page.locator("[data-testid=toggle-btn]").click()
		const text = await liveRegion.textContent()
		expect(text).toBeTruthy()
	})

	test("buttons are keyboard-activatable", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const btn = page.locator("[data-testid=toggle-btn]")
		await btn.focus()
		await page.keyboard.press("Enter")

		expect(await btn.getAttribute("aria-expanded")).toBe("true")
		await expect(page.locator("#expandable-content")).toBeVisible()

		/* Space also works */
		await page.keyboard.press("Space")
		expect(await btn.getAttribute("aria-expanded")).toBe("false")
	})

	test("aria-current marks active nav link", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const activeLink = page.locator("nav a[aria-current=page]")
		await expect(activeLink).toHaveCount(1)
		expect(await activeLink.textContent()).toBe("A11y Test")
	})
})

test.describe("A11y — skip link", () => {
	test("skip link exists and targets main content", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const skipLink = page.locator("[data-testid=skip-link]")
		expect(await skipLink.getAttribute("href")).toBe("#main-content")

		const target = page.locator("#main-content")
		await expect(target).toHaveCount(1)
	})

	test("skip link is first focusable element", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		/* tab into the page — first focusable should be skip link */
		await page.keyboard.press("Tab")
		const focused = await page.evaluate(() => {
			const el = document.activeElement
			return el?.getAttribute("data-testid") ?? el?.tagName ?? null
		})
		expect(focused).toBe("skip-link")
	})
})

test.describe("A11y — keyboard navigation", () => {
	test("tab order follows visual layout", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const tabOrder: string[] = []
		for (let i = 0; i < 10; i++) {
			await page.keyboard.press("Tab")
			const tag = await page.evaluate(() => {
				const el = document.activeElement
				return el?.tagName.toLowerCase() ?? "none"
			})
			tabOrder.push(tag)
		}

		/* should hit links and buttons, not random elements */
		const interactive = tabOrder.filter((t) => t === "a" || t === "button" || t === "input")
		expect(interactive.length).toBeGreaterThan(0)
	})

	test("all interactive elements are focusable", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const unfocusable = await page.evaluate(() => {
			const interactive = document.querySelectorAll("a[href], button, input, textarea, select")
			const problems: string[] = []
			for (const el of interactive) {
				const htmlEl = el as HTMLElement
				if (htmlEl.tabIndex < 0 && !htmlEl.getAttribute("aria-hidden")) {
					problems.push(
						`${el.tagName}[${el.getAttribute("data-testid") ?? ""}] has tabIndex=${htmlEl.tabIndex}`,
					)
				}
			}
			return problems
		})

		expect(unfocusable).toEqual([])
	})
})

test.describe("A11y — SPA navigation focus management", () => {
	test("focus resets to body or main after SPA navigation", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		/* navigate away and back */
		await navigateSPA(page, "/about")

		const focusedTag = await page.evaluate(() => {
			const el = document.activeElement
			return el?.tagName.toLowerCase() ?? "none"
		})

		/* after SPA nav, focus should not be stuck on a link from the previous page */
		expect(["body", "html", "main"]).toContain(focusedTag)
	})

	test("no focus trap after navigation", async ({ page }) => {
		await loadPage(page, "/a11y-test")
		await navigateSPA(page, "/about")

		/* should be able to tab to interactive elements */
		await page.keyboard.press("Tab")
		const tag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? "none")
		expect(tag).not.toBe("none")
	})
})

test.describe("A11y — SSR output structure", () => {
	test("HTML has lang attribute for screen readers", async ({ request }) => {
		const res = await request.get("/a11y-test")
		const html = await res.text()

		expect(html).toMatch(/<html[^>]*lang="en"/)
	})

	test("page has title element", async ({ page }) => {
		await loadPage(page, "/a11y-test")
		const title = await page.title()
		expect(title).toBe("A11y Test")
	})

	test("meta description present for SEO/a11y", async ({ request }) => {
		const res = await request.get("/a11y-test")
		const html = await res.text()
		expect(html).toContain('<meta name="description"')
	})

	test("no positive tabindex values in SSR output", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const positiveTabindex = await page.evaluate(() => {
			const all = document.querySelectorAll("[tabindex]")
			return Array.from(all)
				.filter((el) => Number.parseInt(el.getAttribute("tabindex") ?? "0", 10) > 0)
				.map((el) => `${el.tagName}[tabindex=${el.getAttribute("tabindex")}]`)
		})

		expect(positiveTabindex).toEqual([])
	})

	test("no empty links or buttons in SSR output", async ({ page }) => {
		await loadPage(page, "/a11y-test")

		const emptyInteractive = await page.evaluate(() => {
			const problems: string[] = []
			const links = document.querySelectorAll("a[href]")
			for (const link of links) {
				const text = link.textContent?.trim() ?? ""
				const ariaLabel = link.getAttribute("aria-label") ?? ""
				const ariaLabelledby = link.getAttribute("aria-labelledby") ?? ""
				if (!text && !ariaLabel && !ariaLabelledby) {
					problems.push(`empty link: ${link.outerHTML.slice(0, 100)}`)
				}
			}
			const buttons = document.querySelectorAll("button")
			for (const btn of buttons) {
				const text = btn.textContent?.trim() ?? ""
				const ariaLabel = btn.getAttribute("aria-label") ?? ""
				if (!text && !ariaLabel) {
					problems.push(`empty button: ${btn.outerHTML.slice(0, 100)}`)
				}
			}
			return problems
		})

		expect(emptyInteractive).toEqual([])
	})
})

test.describe("A11y — console cleanliness", () => {
	test("no console errors on a11y test page", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/a11y-test")
		cap.assertClean()
	})

	test("no console errors after interactive state changes", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/a11y-test")
		await page.locator("[data-testid=toggle-btn]").click()
		await page.locator("[data-testid=toggle-btn]").click()
		cap.assertClean()
	})
})
