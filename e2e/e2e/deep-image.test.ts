import { expect, test } from "@playwright/test"
import { BASE, loadPage } from "./helpers"

/* ── Responsive mode ── */

test.describe("Image: responsive mode", () => {
	test("renders img with maxWidth/maxHeight as width/height attrs", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-responsive-basic]")
		await expect(img).toHaveAttribute("width", "600")
		await expect(img).toHaveAttribute("height", "400")
	})

	test("no srcset without loader (passthrough src)", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-responsive-basic]")
		await expect(img).toHaveAttribute("src", "/photos/basic.jpg")
		const srcset = await img.getAttribute("srcset")
		expect(srcset).toBeNull()
	})

	test("auto sizes: (min-width: Xpx) Xpx, 100vw", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-responsive-basic]")
		await expect(img).toHaveAttribute("sizes", "(min-width: 600px) 600px, 100vw")
	})

	test("fluid layout styles: max-width, width: 100%, aspect-ratio", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-responsive-basic]")
		const style = await img.getAttribute("style")
		expect(style).toMatch(/max-width:\s*600px/)
		expect(style).toMatch(/width:\s*100%/)
		expect(style).toContain("aspect-ratio")
		expect(style).toContain("600 / 400")
	})

	test("width-descriptor srcset with loader", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-responsive-loader]")
		const srcset = await img.getAttribute("srcset")
		expect(srcset).not.toBeNull()

		/* DEFAULT_WIDTHS filtered to ≤1200 (maxWidth*2) + 600 included, sorted */
		expect(srcset).toContain("600w")
		expect(srcset).toContain("640w")
		expect(srcset).toContain("750w")
		expect(srcset).toContain("828w")
		expect(srcset).toContain("1080w")
		expect(srcset).toContain("1200w")
		/* no widths beyond 2x maxWidth */
		expect(srcset).not.toContain("1920w")
	})

	test("loader transforms src using maxWidth", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-responsive-loader]")
		await expect(img).toHaveAttribute("src", "/_img/w600/q75/photos/responsive.jpg")
	})

	test("aspectRatio computes height from maxWidth", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-responsive-aspect]")
		await expect(img).toHaveAttribute("width", "1600")
		await expect(img).toHaveAttribute("height", "900")
	})

	test("user sizes override auto-generated", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-responsive-sizes]")
		await expect(img).toHaveAttribute("sizes", "(max-width: 768px) 100vw, 50vw")
	})
})

/* ── Fixed mode ── */

test.describe("Image: fixed mode", () => {
	test("renders with exact width/height attrs", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-fixed-basic]")
		await expect(img).toHaveAttribute("width", "48")
		await expect(img).toHaveAttribute("height", "48")
	})

	test("exact CSS dimensions in style", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-fixed-basic]")
		const style = await img.getAttribute("style")
		expect(style).toMatch(/width:\s*48px/)
		expect(style).toMatch(/height:\s*48px/)
	})

	test("auto sizes = widthpx", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-fixed-basic]")
		await expect(img).toHaveAttribute("sizes", "48px")
	})

	test("density srcset (1x/2x) with loader", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-fixed-loader]")
		const srcset = await img.getAttribute("srcset")
		expect(srcset).toContain("1x")
		expect(srcset).toContain("2x")
		expect(srcset).toContain("w32")
		expect(srcset).toContain("w64")
	})

	test("loader src uses exact width", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-fixed-loader]")
		await expect(img).toHaveAttribute("src", "/_img/w32/q75/photos/fixed.png")
	})

	test("no srcset without loader", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-fixed-basic]")
		const srcset = await img.getAttribute("srcset")
		expect(srcset).toBeNull()
	})
})

/* ── Fill mode ── */

test.describe("Image: fill mode", () => {
	test("no width/height HTML attrs", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-fill-basic]")
		const width = await img.getAttribute("width")
		const height = await img.getAttribute("height")
		expect(width).toBeNull()
		expect(height).toBeNull()
	})

	test("absolute positioning styles", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-fill-basic]")
		const style = await img.getAttribute("style")
		expect(style).toMatch(/position:\s*absolute/)
		expect(style).toMatch(/inset:\s*0/)
		expect(style).toMatch(/width:\s*100%/)
		expect(style).toMatch(/height:\s*100%/)
		expect(style).toMatch(/object-fit:\s*cover/)
	})

	test("auto sizes = 100vw", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-fill-basic]")
		await expect(img).toHaveAttribute("sizes", "100vw")
	})

	test("uncapped width-descriptor srcset with loader", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-fill-basic]")
		const srcset = await img.getAttribute("srcset")
		expect(srcset).toContain("3840w")
		expect(srcset).toContain("640w")
		expect(srcset).toContain("1920w")
	})

	test("loader src uses largest default width (3840)", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-fill-basic]")
		await expect(img).toHaveAttribute("src", "/_img/w3840/q75/photos/fill.jpg")
	})

	test("aspectRatio applied in fill mode", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-fill-aspect]")
		const style = await img.getAttribute("style")
		expect(style).toContain("aspect-ratio")
	})
})

/* ── Priority ── */

test.describe("Image: priority", () => {
	test("loading='eager', fetchpriority='high', decoding='sync'", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-priority]")
		await expect(img).toHaveAttribute("loading", "eager")
		await expect(img).toHaveAttribute("fetchpriority", "high")
		await expect(img).toHaveAttribute("decoding", "sync")
	})

	test("non-priority: loading='lazy', decoding='async', no fetchpriority", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-responsive-basic]")
		await expect(img).toHaveAttribute("loading", "lazy")
		await expect(img).toHaveAttribute("decoding", "async")
		const fp = await img.getAttribute("fetchpriority")
		expect(fp).toBeNull()
	})
})

/* ── Loader features ── */

test.describe("Image: loader features", () => {
	test("per-instance loader overrides", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-instance-loader]")
		await expect(img).toHaveAttribute("src", "/_custom/w500/photos/custom.jpg")
	})

	test("custom quality passed to loader", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-quality]")
		await expect(img).toHaveAttribute("src", "/_img/w600/q95/photos/quality.jpg")
		const srcset = await img.getAttribute("srcset")
		expect(srcset).toContain("q95")
	})

	test("custom widths respected in srcset", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-custom-widths]")
		const srcset = await img.getAttribute("srcset")
		expect(srcset).toBe(
			[
				"/_img/w300/q75/photos/widths.jpg 300w",
				"/_img/w600/q75/photos/widths.jpg 600w",
				"/_img/w900/q75/photos/widths.jpg 900w",
			].join(", "),
		)
	})
})

/* ── Blur placeholder ── */

test.describe("Image: blur placeholder", () => {
	test("background-image set with blur data URL", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-blur]")
		const style = await img.getAttribute("style")
		expect(style).toContain("background-image")
		expect(style).toContain("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg")
	})

	test("background-size: cover included", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-blur]")
		const style = await img.getAttribute("style")
		expect(style).toContain("background-size")
		expect(style).toContain("cover")
	})

	test("blur + layout styles merged (responsive max-width present)", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-blur]")
		const style = await img.getAttribute("style")
		expect(style).toContain("background-image")
		expect(style).toMatch(/max-width:\s*600px/)
	})

	test("blur + object style merged", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-blur-style-obj]")
		const style = await img.getAttribute("style")
		expect(style).toContain("background-image")
		expect(style).toContain("border-radius")
		expect(style).toContain("8px")
	})

	test("blur + string style merged", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-blur-style-str]")
		const style = await img.getAttribute("style")
		expect(style).toContain("background-image")
		expect(style).toContain("border-radius")
		expect(style).toContain("12px")
	})

	test("onLoad clears blur background", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-blur]")

		await img.evaluate((el) => {
			el.dispatchEvent(new Event("load"))
		})

		await page.waitForFunction(
			() => {
				const el = document.querySelector("[data-testid=img-blur]")
				const style = el?.getAttribute("style") ?? ""
				return !style.includes("background-image")
			},
			null,
			{ timeout: 5000 },
		)

		const style = await img.getAttribute("style")
		expect(style ?? "").not.toContain("background-image")
		/* layout styles preserved after blur clear */
		expect(style ?? "").toMatch(/max-width:\s*600px/)
	})
})

/* ── SSR ── */

test.describe("Image: SSR HTML", () => {
	test("responsive image SSR: correct attrs in HTML", async ({ page }) => {
		const resp = await page.request.get(`${BASE}/image-test`)
		const html = await resp.text()

		const match = html.match(/<img[^>]*data-testid="img-responsive-basic"[^>]*>/)
		expect(match).not.toBeNull()
		const tag = match?.[0] ?? ""
		expect(tag).toContain('src="/photos/basic.jpg"')
		expect(tag).toContain('width="600"')
		expect(tag).toContain('height="400"')
		expect(tag).toContain('loading="lazy"')
	})

	test("fixed image SSR: correct attrs in HTML", async ({ page }) => {
		const resp = await page.request.get(`${BASE}/image-test`)
		const html = await resp.text()

		const match = html.match(/<img[^>]*data-testid="img-fixed-basic"[^>]*>/)
		expect(match).not.toBeNull()
		const tag = match?.[0] ?? ""
		expect(tag).toContain('width="48"')
		expect(tag).toContain('height="48"')
	})

	test("fill image SSR: no width/height in HTML", async ({ page }) => {
		const resp = await page.request.get(`${BASE}/image-test`)
		const html = await resp.text()

		const match = html.match(/<img[^>]*data-testid="img-fill-basic"[^>]*>/)
		expect(match).not.toBeNull()
		const tag = match?.[0] ?? ""
		/* fill mode should not have width/height attrs */
		expect(tag).not.toMatch(/\bwidth="\d+"/)
		expect(tag).not.toMatch(/\bheight="\d+"/)
	})

	test("priority image SSR: loading='eager'", async ({ page }) => {
		const resp = await page.request.get(`${BASE}/image-test`)
		const html = await resp.text()

		const match = html.match(/<img[^>]*data-testid="img-priority"[^>]*>/)
		expect(match).not.toBeNull()
		expect(match?.[0]).toContain('loading="eager"')
	})

	test("blur SSR: background-image in style", async ({ page }) => {
		const resp = await page.request.get(`${BASE}/image-test`)
		const html = await resp.text()

		const match = html.match(/<img[^>]*data-testid="img-blur"[^>]*>/)
		expect(match).not.toBeNull()
		expect(match?.[0]).toContain("background-image")
		expect(match?.[0]).toContain("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg")
	})
})

/* ── Rest props ── */

test.describe("Image: rest props", () => {
	test("class, id, data-* forwarded", async ({ page }) => {
		await loadPage(page, "/image-test")

		const img = page.locator("[data-testid=img-attrs]")
		const cls = await img.getAttribute("class")
		expect(cls?.trim()).toBe("hero-class")
		await expect(img).toHaveAttribute("id", "hero-id")
		await expect(img).toHaveAttribute("alt", "Accessible photo")
	})
})

/* ── Hydration ── */

test.describe("Image: hydration", () => {
	test("no hydration mismatch warnings", async ({ page }) => {
		const errors: string[] = []
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				const text = msg.text()
				if (text.includes("404") || text.includes("Failed to load resource")) return
				if (/computations created outside/i.test(text)) return
				if (/owner.*cleanup/i.test(text)) return
				if (/SSL certificate error/i.test(text)) return
				errors.push(text)
			}
		})

		await loadPage(page, "/image-test")
		await expect(page.locator("[data-testid=image-test]")).toBeVisible()
		expect(errors).toEqual([])
	})
})
