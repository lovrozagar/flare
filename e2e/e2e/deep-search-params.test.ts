import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers"

/* ------------------------------------------------------------------ */
/*  Special characters in search params                                */
/* ------------------------------------------------------------------ */

test.describe("Search params: special characters", () => {
	test("unicode characters preserved", async ({ page }) => {
		await page.goto("/search-demo?q=%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF")
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.q).toBe("こんにちは")
	})

	test("emoji characters preserved", async ({ page }) => {
		await page.goto("/search-demo?emoji=%F0%9F%94%A5%F0%9F%9A%80")
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.emoji).toBe("🔥🚀")
	})

	test("pipe characters preserved", async ({ page }) => {
		await page.goto("/search-demo?filter=a%7Cb%7Cc")
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.filter).toBe("a|b|c")
	})

	test("brackets preserved", async ({ page }) => {
		await page.goto("/search-demo?ids=%5B1%2C2%2C3%5D")
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.ids).toBe("[1,2,3]")
	})

	test("plus sign decoded as space", async ({ page }) => {
		await page.goto("/search-demo?q=hello+world")
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.q).toBe("hello world")
	})

	test("encoded ampersand in value preserved", async ({ page }) => {
		await page.goto("/search-demo?company=foo%26bar")
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.company).toBe("foo&bar")
	})

	test("encoded equals in value preserved", async ({ page }) => {
		await page.goto("/search-demo?expr=a%3Db")
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.expr).toBe("a=b")
	})
})

/* ------------------------------------------------------------------ */
/*  Empty vs absent params                                             */
/* ------------------------------------------------------------------ */

test.describe("Search params: empty vs absent", () => {
	test("empty param value is empty string", async ({ page }) => {
		await page.goto("/search-demo?q=")
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.q).toBe("")
	})

	test("absent param is not in allParams", async ({ page }) => {
		await page.goto("/search-demo?other=1")
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.q).toBeUndefined()
		expect(parsed.other).toBe("1")
	})

	test("param count matches actual params", async ({ page }) => {
		await page.goto("/search-demo?a=1&b=2&c=3")
		const count = await page.locator("[data-testid=search-param-count]").textContent()
		expect(count).toBe("3")
	})

	test("no params results in zero count", async ({ page }) => {
		await page.goto("/search-demo")
		const count = await page.locator("[data-testid=search-param-count]").textContent()
		expect(count).toBe("0")
	})
})

/* ------------------------------------------------------------------ */
/*  Search params in head (dynamic title based on query)               */
/* ------------------------------------------------------------------ */

test.describe("Search params: head integration", () => {
	test("head title reflects search params from SSR", async ({ page }) => {
		await page.goto("/search-demo?q=hello&page=2")
		const title = await page.title()
		expect(title).toContain("hello")
		expect(title).toContain("page")
	})

	test("head title updates after SPA navigation with new search", async ({ page }) => {
		await loadPage(page, "/search-demo?q=initial")
		const titleBefore = await page.title()
		expect(titleBefore).toContain("initial")

		await navigateSPA(page, "/search-demo?q=updated")
		await page.waitForFunction(() => document.title.includes("updated"), null, { timeout: 5000 })
		const titleAfter = await page.title()
		expect(titleAfter).toContain("updated")
		expect(titleAfter).not.toContain("initial")
	})
})

/* ------------------------------------------------------------------ */
/*  URL encoding roundtrip                                             */
/* ------------------------------------------------------------------ */

test.describe("Search params: URL encoding roundtrip", () => {
	test("encoded value survives SSR roundtrip", async ({ page }) => {
		const value = "hello world & goodbye"
		const encoded = encodeURIComponent(value)
		await page.goto(`/search-demo?msg=${encoded}`)
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.msg).toBe(value)
	})

	test("encoded value survives SPA navigation roundtrip", async ({ page }) => {
		await loadPage(page, "/search-demo?q=start")
		const value = "test=foo&bar baz"
		const encoded = encodeURIComponent(value)
		await navigateSPA(page, `/search-demo?val=${encoded}`)
		await page.waitForFunction(
			(v) => {
				const el = document.querySelector("[data-testid=search-all-params]")
				return el?.textContent?.includes(v)
			},
			value,
			{ timeout: 5000 },
		)
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.val).toBe(value)
	})

	test("search signal matches loader data after navigation", async ({ page }) => {
		await loadPage(page, "/search-demo?q=sync-test&page=5")
		const loaderText = await page.locator("[data-testid=search-all-params]").textContent()
		const signalText = await page.locator("[data-testid=search-signal]").textContent()
		const loaderParsed = JSON.parse(loaderText ?? "{}")
		const signalParsed = JSON.parse(signalText ?? "{}")
		expect(signalParsed.q).toBe(loaderParsed.q)
		expect(signalParsed.page).toBe(loaderParsed.page)
	})
})

/* ------------------------------------------------------------------ */
/*  Search params persistence across client navigation                 */
/* ------------------------------------------------------------------ */

test.describe("Search params: persistence across navigation", () => {
	test("search params carried through SPA nav to same route", async ({ page }) => {
		await loadPage(page, "/search-demo?q=original")
		await navigateSPA(page, "/search-demo?q=original&extra=added")
		await page.waitForFunction(
			() => {
				const el = document.querySelector("[data-testid=search-all-params]")
				return el?.textContent?.includes("extra")
			},
			null,
			{ timeout: 5000 },
		)
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.q).toBe("original")
		expect(parsed.extra).toBe("added")
	})

	test("search params cleared when navigating without them", async ({ page }) => {
		await loadPage(page, "/search-demo?q=willclear")
		await navigateSPA(page, "/search-demo")
		await page.waitForFunction(
			() => {
				const el = document.querySelector("[data-testid=search-param-count]")
				return el?.textContent === "0"
			},
			null,
			{ timeout: 5000 },
		)
		const count = await page.locator("[data-testid=search-param-count]").textContent()
		expect(count).toBe("0")
	})

	test("search params intact after navigating to different route and back", async ({ page }) => {
		await loadPage(page, "/search-demo?q=persist")
		await navigateSPA(page, "/about")
		await page.waitForURL("**/about", { timeout: 5000 })

		await page.goBack()
		await page.waitForURL("**/search-demo?q=persist", { timeout: 5000 })
		const text = await page.locator("[data-testid=search-all-params]").textContent()
		const parsed = JSON.parse(text ?? "{}")
		expect(parsed.q).toBe("persist")
	})

	test("no hydration mismatch with search params", async ({ page }) => {
		const cap = setupConsoleCapture(page)
		await loadPage(page, "/search-demo?q=hydrate&tag=a&tag=b")
		cap.assertClean()
	})
})

/* ------------------------------------------------------------------ */
/*  Search params in NDJSON data requests                              */
/* ------------------------------------------------------------------ */

test.describe("Search params: NDJSON data requests", () => {
	test("loader receives search params via NDJSON", async ({ request }) => {
		const response = await request.get("/search-demo?q=ndjson-test&page=3", {
			headers: { "x-d": "1" },
		})
		const text = await response.text()
		expect(text).toContain("ndjson-test")
		expect(text).toContain("page")
	})

	test("NDJSON with special characters in params", async ({ request }) => {
		const response = await request.get(`/search-demo?q=${encodeURIComponent("café & résumé")}`, {
			headers: { "x-d": "1" },
		})
		const text = await response.text()
		expect(text).toContain("café")
		expect(text).toContain("résumé")
	})
})
