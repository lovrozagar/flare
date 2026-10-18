import type { Page } from "@playwright/test"
import { documents, expect, fnId, open, signedIn, test } from "./dashboard.fixture.ts"

// The overview (bits/17): four deferred widgets in a document held until they settle (`documentResponseDefer:
// "buffer"`, B146), streamed on a client navigation, a rejection in each, a live feed a navigation stops, the
// progress bar, and the server's rewrite of the old home.

const OVERVIEW = "/app/overview"
const WIDGETS = ["revenue", "active", "incidents", "plan"]

// The order in which the widgets' values appear in the page from now on, by id.
async function appearing(page: Page): Promise<() => Promise<string[]>> {
	await page.evaluate((ids) => {
		const seen: string[] = []
		Reflect.set(window, "__widgets", seen)
		new MutationObserver(() => {
			for (const id of ids) if (!seen.includes(id) && document.getElementById(id) !== null) seen.push(id)
		}).observe(document.body, { childList: true, subtree: true })
	}, WIDGETS)
	return () => page.evaluate(() => [...(Reflect.get(window, "__widgets") as string[])])
}

// The served document already holds every value, and no skeleton: the server waited for all four.
test("buffered document", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin)
	const response = await page.request.get(`${dashboard.origin}${OVERVIEW}`)
	expect(response.status()).toBe(200)
	const html = await response.text()
	for (const id of WIDGETS) expect(html, id).not.toContain(`id="${id}-loading"`)
	const problems = await open(page, dashboard.origin, OVERVIEW)
	await expect(page.locator("#revenue")).toHaveText("$606000")
	await expect(page.locator("#active")).toHaveText("12")
	await expect(page.locator("#incidents")).toHaveText("0 open")
	await expect(page.locator("#plan")).toHaveText("free")
	expect(problems).toEqual([])
})

// A held document renders a rejected value as a streamed one does (dx/defer.md, BUGS.md 373): the page is 200 and
// never stored, the failed widget's own <Errored> says why once the client hydrates, and the other widgets keep
// their values.
test("rejected value stays in its widget", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin)
	const response = await page.goto(`${dashboard.origin}${OVERVIEW}?incidents=fail`)
	expect(response?.status()).toBe(200)
	expect(response?.headers()["cache-control"]).toBe("private, no-store")
	await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
	await expect(page.locator("#incidents-error")).toContainText("The incidents service is down")
	await expect(page.locator("#revenue")).toHaveText("$606000")
	await expect(page.locator("#plan")).toHaveText("free")
})

// A widget behind a tab opened after load reads its value from the document: the server never rendered it, so
// Solid's hydration data holds nothing for it, and its slot settles from the value the document wrote (BUGS.md 375).
test("widget behind a tab", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin)
	const problems = await open(page, dashboard.origin, OVERVIEW)
	await expect(page.locator("#total")).toHaveCount(0)
	await page.locator("#tab-usage").click()
	await expect(page.locator("#total")).toHaveText("24 projects")
	expect(problems).toEqual([])
})

// A client navigation streams: each widget shows its skeleton, then its value as its defer settles, fastest first.
test("client navigation streams widgets", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin)
	const order = await appearing(page)
	const loads = documents(page)
	await page.locator("#sidebar").getByRole("link", { name: "Overview" }).click()
	await expect(page.locator("#plan")).toHaveText("free")
	expect(await order()).toEqual(["revenue", "active", "incidents", "plan"])
	expect(loads).toEqual([])
})

// On a client navigation a rejected value stays in its widget: its own <Errored> says why, and the rest render.
test("failed widget stays in its boundary", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, OVERVIEW)
	const loads = documents(page)
	await page.locator("#outage").click()
	await expect(page.locator("#incidents-error")).toContainText("The incidents service is down")
	await expect(page.locator("#revenue")).toHaveText("$606000")
	await expect(page.locator("#plan")).toHaveText("free")
	await expect(page).toHaveURL(`${dashboard.origin}${OVERVIEW}?incidents=fail`)
	expect(loads).toEqual([])
})

// The live feed is a streamed server function. Leaving the page stops the iteration, which ends its request.
test("feed stops on leave", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin)
	const feed = fnId("src/fns/activity.ts", "activityFeed")
	const ended = { count: 0 }
	const isFeed = (url: string): boolean => url.includes(`/_flare/fn/${feed}`)
	page.on("requestfinished", (request) => void (isFeed(request.url()) && (ended.count += 1)))
	page.on("requestfailed", (request) => void (isFeed(request.url()) && (ended.count += 1)))
	await page.locator("#sidebar").getByRole("link", { name: "Overview" }).click()
	await expect.poll(() => page.locator("#feed li").count()).toBeGreaterThanOrEqual(2)
	expect(ended.count).toBe(0)
	await page.locator("#sidebar").getByRole("link", { name: "Projects" }).click()
	await expect(page.locator("#title")).toHaveText("Projects")
	await expect.poll(() => ended.count).toBe(1)
})

// The bar shows while a navigation's data is out, pending, and goes once it lands.
test("progress bar", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin)
	const gate = Promise.withResolvers<void>()
	await page.route(
		(url) => url.pathname === OVERVIEW && url.searchParams.get("_flare") === "data",
		async (route) => {
			await gate.promise
			await route.continue()
		},
	)
	await page.locator("#sidebar").getByRole("link", { name: "Overview" }).click()
	await expect(page.locator("#progress")).toHaveAttribute("data-pending", "true")
	gate.resolve()
	await expect(page.locator("#title")).toHaveText("Overview")
	await expect(page.locator("#progress")).toHaveCount(0)
})

// The old home redirects to the overview, its query kept: the server's rewrite, before any route runs.
test("home rewrites to overview", async ({ page, dashboard }) => {
	const response = await page.request.get(`${dashboard.origin}/app/home?from=bookmark`, { maxRedirects: 0 })
	expect(response.status()).toBe(301)
	expect(response.headers()["location"]).toBe("/app/overview?from=bookmark")
})
