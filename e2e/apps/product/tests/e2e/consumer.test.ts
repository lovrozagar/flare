import { expect, test } from "@playwright/test"
import { clickAndAssertSPA, loadPage } from "./helpers"

test.describe("cookies", () => {
	test("home sets flare-visit and about reads it", async ({ page }) => {
		await loadPage(page, "/")
		const token = await page.getByTestId("visit-token").textContent()
		expect(token).toMatch(/^visit-/)
		await page.goto("/about")
		await expect(page.getByTestId("visit-cookie")).toHaveText(token ?? "")
	})

	test("multi-cookie sets three cookies", async ({ context, page }) => {
		await page.goto("/multi-cookie")
		const cookies = await context.cookies()
		expect(cookies.find((c) => c.name === "session")?.value).toBe("abc123")
		expect(cookies.find((c) => c.name === "theme")?.value).toBe("dark")
		expect(cookies.find((c) => c.name === "lang")?.value).toBe("en")
	})
})

test.describe("defer + Await", () => {
	test("shell then streamed value", async ({ page }) => {
		await page.goto("/deferred")
		await expect(page.getByTestId("shell-status")).toHaveText("ready")
		await expect(page.getByTestId("deferred-message")).toHaveText("streamed", { timeout: 10_000 })
		const ts = Number(await page.getByTestId("deferred-ts").textContent())
		expect(ts).toBeGreaterThan(0)
	})
})

test.describe("search params", () => {
	test("reads q and page from URL", async ({ page }) => {
		await loadPage(page, "/search?q=hello&page=2")
		await expect(page.getByTestId("search-q")).toHaveText("hello")
		await expect(page.getByTestId("search-page")).toHaveText("2")
		await expect(page.getByTestId("search-count")).toHaveText("2")
	})

	test("head title includes query", async ({ page }) => {
		await page.goto("/search?q=flare")
		await expect(page).toHaveTitle("Search: flare")
	})
})

test.describe("dynamic params", () => {
	test("users/[id] loader", async ({ page }) => {
		await loadPage(page, "/users/42")
		await expect(page.getByTestId("user-id")).toHaveText("42")
		await expect(page.getByTestId("user-name")).toHaveText("User 42")
	})

	test("SPA param change updates loader", async ({ page }) => {
		await loadPage(page, "/users/1")
		await clickAndAssertSPA(page, "a[href='/users/2']", "/users/2")
		await expect(page.getByTestId("user-id")).toHaveText("2")
		await expect(page.getByTestId("user-name")).toHaveText("User 2")
	})
})

test.describe("catch-all", () => {
	test("files/[...path] splits segments", async ({ page }) => {
		await loadPage(page, "/files/docs/readme.md")
		await expect(page.getByTestId("files-joined")).toHaveText("docs/readme.md")
		await expect(page.getByTestId("files-count")).toHaveText("2")
		await expect(page.getByTestId("files-is-array")).toHaveText("true")
		await expect(page.getByTestId("files-ext")).toHaveText("md")
	})
})

test.describe("encoded params", () => {
	test("decode/[slug] decodes hello%20world", async ({ page }) => {
		await loadPage(page, "/decode/hello%20world")
		await expect(page.getByTestId("decode-slug")).toHaveText("hello world")
		await expect(page.getByTestId("decode-length")).toHaveText("11")
	})
})

test.describe("preloader", () => {
	test("loader sees preloader context", async ({ page }) => {
		await loadPage(page, "/preloaded")
		await expect(page.getByTestId("preload-order")).toHaveText("true")
		const ts = Number(await page.getByTestId("preload-ts").textContent())
		expect(ts).toBeGreaterThan(0)
	})
})

test.describe("SEO head", () => {
	test("canonical OG twitter and title", async ({ page }) => {
		await page.goto("/seo?title=Hello")
		await expect(page).toHaveTitle("Hello")
		const html = await page.content()
		expect(html).toContain('rel="canonical"')
		expect(html).toContain("https://example.com/seo")
		expect(html).toContain("OG: Hello")
		expect(html).toContain("Twitter: Hello")
		expect(html).toContain('name="author"')
	})
})

test.describe("echo + web APIs", () => {
	test("echo reads custom header", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-custom-test": "flare" })
		await loadPage(page, "/echo")
		await expect(page.getByTestId("echo-method")).toHaveText("GET")
		await expect(page.getByTestId("echo-custom")).toHaveText("flare")
	})

	test("hash SHA-256 of hello", async ({ page }) => {
		await loadPage(page, "/hash?input=hello")
		await expect(page.getByTestId("hash-input")).toHaveText("hello")
		await expect(page.getByTestId("hash-value")).toHaveText(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		)
	})

	test("encoding round-trip", async ({ page }) => {
		await loadPage(page, "/encoding")
		await expect(page.getByTestId("encoding-match")).toHaveText("true")
	})

	test("json edge values survive SSR", async ({ page }) => {
		await loadPage(page, "/json-edge")
		await expect(page.getByTestId("json-emoji")).toHaveText("Hello 🌍🔥")
		await expect(page.getByTestId("json-max-safe")).toHaveText(String(Number.MAX_SAFE_INTEGER))
		await expect(page.getByTestId("json-null")).toHaveText("null")
		await expect(page.getByTestId("json-nested")).toHaveText("42")
		await expect(page.getByTestId("json-match")).toHaveText("true")
	})

	test("time and Intl", async ({ page }) => {
		await loadPage(page, "/time")
		await expect(page.getByTestId("time-epoch-iso")).toHaveText("1970-01-01T00:00:00.000Z")
		await expect(page.getByTestId("time-epoch-ms")).toHaveText("0")
		await expect(page.getByTestId("time-parsed")).toHaveText("0")
		await expect(page.getByTestId("time-formatted")).toContainText("2024")
	})

	test("streams loader", async ({ page }) => {
		await loadPage(page, "/streams")
		await expect(page.getByTestId("streams-result")).toHaveText("Hello from streams")
		await expect(page.getByTestId("streams-response-body")).toHaveText("test-body")
		await expect(page.getByTestId("streams-response-header")).toHaveText("true")
	})
})
