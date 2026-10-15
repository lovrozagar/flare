import type { Page } from "@playwright/test"
import { expect, test } from "./crash.ts"
import { flushEvents } from "./flush.ts"
import { boot, type Boot } from "./boot.ts"

// Client navigation on the minimal app's real dev path (B70): flare() serves src/server.ts and the client hydrates.

let session: Boot

test.beforeAll(async ({ browserName }, workerInfo) => {
	const name = workerInfo.project.name ?? `node-dev-${browserName}`
	const [runtime, mode] = name.split("-")
	session = await boot({ app: "minimal", runtime: runtime ?? "node", mode: mode ?? "dev" })
})

test.afterAll(async () => {
	await session?.close()
})

// A page error, a console error, or a console warning fails the test: a Solid hydration mismatch or warning
// arrives on the console without throwing, and halts the page without changing its text. Vite's own lines are
// debug messages and are not collected. No test here expects a 4xx resource.
async function open(page: Page, path: string): Promise<string[]> {
	const problems: string[] = []
	page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`))
	page.on("console", (message) => {
		if (message.type() === "error" || message.type() === "warning")
			problems.push(`${message.type()}: ${message.text()}`)
	})
	await page.goto(`${session.origin}${path}`)
	await expect(page.locator("html")).toHaveAttribute("data-flare-hydrated", "")
	return problems
}

test("click", async ({ page }) => {
	const documents: string[] = []
	page.on("request", (request) => {
		if (request.resourceType() === "document") documents.push(request.url())
	})
	const errors = await open(page, "/")
	await page.evaluate(() => Reflect.set(document.getElementById("nav") ?? {}, "flareMark", 1))
	await page.getByRole("link", { name: "About" }).click()
	await expect(page).toHaveURL(`${session.origin}/about`)
	await expect(page.locator("#app")).toHaveText("About")
	expect(await page.evaluate(() => Reflect.get(document.getElementById("nav") ?? {}, "flareMark"))).toBe(1)
	await expect(page.getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page")
	expect(documents).toEqual([`${session.origin}/`])
	expect(errors).toEqual([])
})

test("back", async ({ page }) => {
	const errors = await open(page, "/")
	await page.getByRole("link", { name: "About" }).click()
	await expect(page.locator("#app")).toHaveText("About")
	await page.goBack()
	await expect(page).toHaveURL(`${session.origin}/`)
	await expect(page.locator("#app")).toHaveText("Home")
	expect(errors).toEqual([])
})

test("scroll", async ({ page }) => {
	const errors = await open(page, "/")
	await page.evaluate(() => window.scrollTo(0, 1500))
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1500)
	await page.getByRole("link", { name: "About" }).click()
	await expect(page.locator("#app")).toHaveText("About")
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
	await page.goBack()
	await expect(page.locator("#app")).toHaveText("Home")
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1500)
	expect(errors).toEqual([])
})

test("two skeletons", async ({ page }) => {
	// Identity: this measures Flare's stream, not a runtime's compressor. Miniflare's gzip buffers the whole body.
	const response = await fetch(`${session.origin}/skeletons`, { headers: { "accept-encoding": "identity" } })
	expect(response.status).toBe(200)
	const reader = response.body?.getReader()
	if (reader === undefined) throw new Error("body")
	const decoder = new TextDecoder()
	const chunks: string[] = []
	for (let step = await reader.read(); !step.done; step = await reader.read()) {
		chunks.push(decoder.decode(step.value, { stream: true }))
	}
	const first = chunks[0] ?? ""
	expect(first).toContain("wait-fast")
	expect(first).toContain("wait-slow")
	expect(first).not.toContain("FAST")
	expect(first).not.toContain("SLOW")
	const fastAt = chunks.findIndex((chunk) => chunk.includes("FAST"))
	const slowAt = chunks.findIndex((chunk) => chunk.includes("SLOW"))
	expect(fastAt).toBeGreaterThan(0)
	expect(slowAt).toBeGreaterThan(fastAt)
	const errors = await open(page, "/skeletons")
	await expect(page.locator("#fast")).toHaveText("FAST")
	await expect(page.locator("#slow")).toHaveText("SLOW")
	expect(errors).toEqual([])
})

// The second load of a stored page is a hit whose HTML holds the value under both boundaries. It hydrates with no
// console error or warning, and a client navigation away and back still fills it.
test("stored hit hydrates", async ({ page }) => {
	let hit: Response | undefined
	for (let attempt = 0; attempt < 20 && hit === undefined; attempt += 1) {
		const response = await fetch(`${session.origin}/stored`)
		if (response.headers.get("flare-cache") === "hit") hit = response
		else await response.text()
	}
	if (hit === undefined) throw new Error("no stored hit")
	const html = await hit.text()
	expect(html).toContain("STORED-VALUE!")
	expect(html).not.toContain("wait-outer")
	expect(html).not.toContain("wait-inner")
	const errors = await open(page, "/stored")
	await expect(page.locator("#stored")).toHaveText("STORED-VALUE!")
	await page.getByRole("link", { name: "About" }).click()
	await expect(page.locator("#app")).toHaveText("About")
	await page.goBack()
	await expect(page).toHaveURL(`${session.origin}/stored`)
	await expect(page.locator("#stored")).toHaveText("STORED-VALUE!")
	expect(errors).toEqual([])
})

// A stored page's "stream" value is a hole: the HTML holds the fallback, and after hydrate one no-store
// `_flare=fill` request fills it.
test("stored stream fills", async ({ page }) => {
	const html = await (await fetch(`${session.origin}/holed`)).text()
	expect(html).toContain("wait-hole")
	expect(html).not.toContain("FILLED")
	const fills: string[] = []
	page.on("response", (response) => {
		if (response.url().includes("_flare=fill")) fills.push(response.headers()["cache-control"] ?? "")
	})
	const errors = await open(page, "/holed")
	await expect(page.locator("#holed")).toHaveText("FILLED")
	expect(fills).toEqual(["private, no-store"])
	expect(errors).toEqual([])
})

// The same page with no cache mode streams the value into the live document and sends no fill.
test("live stream ssr", async ({ page }) => {
	const html = await (await fetch(`${session.origin}/unstored`)).text()
	expect(html).toContain("STREAMED")
	const fills: string[] = []
	page.on("request", (request) => {
		if (request.url().includes("_flare=fill")) fills.push(request.url())
	})
	const errors = await open(page, "/unstored")
	await expect(page.locator("#unstored")).toHaveText("STREAMED")
	// A fill leaves in the boot's own task, right after hydrate, so a flush after it has seen any.
	await flushEvents(page)
	expect(fills).toEqual([])
	expect(errors).toEqual([])
})

test("style object", async ({ page }) => {
	const response = await fetch(`${session.origin}/styled`)
	expect(response.status).toBe(200)
	const errors = await open(page, "/styled")
	const styled = page.locator("#styled")
	await expect(styled).toHaveCSS("color", "rgb(255, 0, 0)")
	await expect(styled).toHaveCSS("font-weight", "700")
	expect(errors).toEqual([])
})
