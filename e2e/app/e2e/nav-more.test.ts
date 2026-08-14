import { expect, test } from "@playwright/test"
import { loadPage, setNavMarker } from "./helpers"

test.describe("URL normalize", () => {
	test("trailing slash redirects to canonical", async ({ request }) => {
		const res = await request.get("/about/", { maxRedirects: 0 })
		expect([200, 301, 302, 308]).toContain(res.status())
		if (res.status() !== 200) {
			expect(new URL(res.headers().location, "http://localhost:4101").pathname).toBe("/about")
		}
	})

	test("case-insensitive /About lands on about", async ({ page }) => {
		await page.goto("/About")
		await expect(page.getByTestId("about")).toBeVisible()
	})
})

test.describe("Link target blank", () => {
	test("internal _blank gets rel noopener", async ({ page }) => {
		await loadPage(page, "/link-features")
		const rel = (await page.getByTestId("internal-blank").getAttribute("rel")) ?? ""
		expect(rel).toContain("noopener")
	})
})

test.describe("blocker", () => {
	test("dirty state blocks then proceed", async ({ page }) => {
		await loadPage(page, "/blocker-test")
		await page.getByTestId("toggle-dirty").click()
		await expect(page.getByTestId("dirty-state")).toHaveText("dirty")
		await page.getByTestId("nav-link").click()
		await expect(page.getByTestId("blocked-state")).toHaveText("blocked")
		expect(new URL(page.url()).pathname).toBe("/blocker-test")
		await expect(page.getByTestId("blocker-test")).toBeVisible()
	})
})

test.describe("disabled toggle", () => {
	test("starts as span then becomes anchor", async ({ page }) => {
		await loadPage(page, "/disabled-toggle")
		expect(await page.getByTestId("toggle-link").evaluate((n) => n.tagName.toLowerCase())).not.toBe(
			"a",
		)
		await page.getByTestId("toggle-btn").click()
		await expect(page.getByTestId("disabled-state")).toHaveText("enabled")
		expect(await page.getByTestId("toggle-link").evaluate((n) => n.tagName.toLowerCase())).toBe("a")
	})
})

test.describe("navigate API", () => {
	test("push to about", async ({ page }) => {
		await loadPage(page, "/navigate-demo")
		await page.getByTestId("nav-to-about").click()
		await page.waitForURL("**/about")
		await expect(page.getByTestId("about")).toBeVisible()
	})

	test("search navigate", async ({ page }) => {
		await loadPage(page, "/navigate-demo")
		await page.getByTestId("nav-with-search").click()
		await page.waitForURL("**/search**")
		await expect(page.getByTestId("search-q")).toHaveText("hello")
	})

	test("invalidate refetches loader", async ({ page }) => {
		await loadPage(page, "/navigate-demo")
		const first = await page.getByTestId("nav-loaded-at").textContent()
		await page.getByTestId("nav-invalidate").click()
		await expect.poll(async () => page.getByTestId("nav-loaded-at").textContent()).not.toBe(first)
	})
})

test.describe("shallow", () => {
	test("search changes without refetching loader", async ({ page }) => {
		await loadPage(page, "/shallow-test")
		const loaded = await page.getByTestId("shallow-loaded-at").textContent()
		await page.getByTestId("shallow-search").click()
		await page.waitForURL("**tab=b**")
		await expect(page.getByTestId("shallow-loaded-at")).toHaveText(loaded ?? "")
	})

	test("validated search transforms", async ({ page }) => {
		await loadPage(page, "/shallow-validated")
		await page.getByTestId("shallow-explicit").click()
		await page.waitForURL("**page=3**")
		await expect(page.getByTestId("search-page")).toHaveText("3")
	})
})

test.describe("prefetch", () => {
	test("hover intent sends x-p and does not commit", async ({ page }) => {
		await loadPage(page, "/")
		const pref = page.waitForRequest((r) => r.headers()["x-p"] === "1")
		await page.getByRole("link", { name: "Prefetch", exact: true }).hover()
		const req = await pref
		expect(req.headers()["x-d"]).toBe("1")
		expect(new URL(page.url()).pathname).toBe("/")
	})

	test("prefetch defer has no t:c", async ({ request }) => {
		const res = await request.get("/prefetch-defer", { headers: { "x-d": "1", "x-p": "1" } })
		const body = await res.text()
		expect(body.includes('"t":"c"') || body.includes('"t": "c"')).toBe(false)
	})
})

test.describe("download + concurrent + phase", () => {
	test("download href is the csv", async ({ page }) => {
		await loadPage(page, "/download-test")
		await expect(page.getByTestId("link-download")).toHaveAttribute("href", "/api/download/test.csv")
	})

	test("rapid nav lands on last target", async ({ page }) => {
		await loadPage(page, "/")
		await page.evaluate(() => {
			const nav = (window as unknown as { __flareNavigate: (to: string) => Promise<void> })
				.__flareNavigate
			void nav("/about")
			return nav("/context")
		})
		await page.waitForURL("**/context")
		await expect(page.getByTestId("context")).toBeVisible()
	})

	test("navigation phase is a string", async ({ page }) => {
		await loadPage(page, "/")
		const phase = await page.evaluate(() => {
			const fn = (window as unknown as { __flareNavigationPhase?: () => string })
				.__flareNavigationPhase
			return fn?.()
		})
		expect(typeof phase).toBe("string")
	})
})

test.describe("scroll + popstate cache", () => {
	test("hash link scrolls to section", async ({ page }) => {
		await loadPage(page, "/scroll-tall")
		await page.getByRole("link", { name: "Jump 20" }).click()
		await page.waitForURL("**#section-20")
		const top = await page.locator("#section-20").evaluate((el) => el.getBoundingClientRect().top)
		expect(top).toBeLessThan(windowInner(400))
	})

	test("cross-route hash nav scrolls to the target", async ({ page }) => {
		await loadPage(page, "/about")
		await page.evaluate(() => {
			const nav = (window as unknown as { __flareNavigate: (to: string) => Promise<void> })
				.__flareNavigate
			return nav("/scroll-tall#section-20")
		})
		await page.waitForURL("**#section-20")
		const top = await page.locator("#section-20").evaluate((el) => el.getBoundingClientRect().top)
		expect(top).toBeLessThan(windowInner(400))
	})

	test("back to cached page does not refetch NDJSON", async ({ page }) => {
		await loadPage(page, "/cache-test")
		await page.goto("/about")
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"))
		let ndjson = 0
		page.on("request", (r) => {
			if (r.headers()["x-d"] === "1") ndjson++
		})
		await setNavMarker(page)
		await page.goBack()
		await page.waitForURL("**/cache-test")
		await expect(page.getByTestId("cache-test")).toBeVisible()
		expect(ndjson).toBe(0)
	})
})

test.describe("view transitions", () => {
	test("ViewTransition CSS is present", async ({ page }) => {
		await page.goto("/")
		const html = await page.content()
		expect(html.includes("view-transition") || html.includes("ViewTransition")).toBe(true)
	})
})

function windowInner(fallback: number): number {
	return fallback
}
