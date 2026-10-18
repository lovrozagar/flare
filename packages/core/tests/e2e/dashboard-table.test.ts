import { dataRequests, documents, expect, open, rowNames, signedIn, test } from "./dashboard.fixture.ts"

// The projects table, which its URL drives (bits/17): order, page, filters, and dates are validated search values, a
// number, a list, and two dates, that round-trip through a Link, the URL, and a reload (dx/link.md URL values).

const TABLE = "/app/projects"

// The page's search as a record, one entry per key, its values joined by commas.
function searchOf(url: string): Record<string, string> {
	const params = new URL(url).searchParams
	return Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key).join(",")]))
}

function sorted(names: readonly string[]): string[] {
	return names.toSorted((left, right) => left.localeCompare(right))
}

// Each header and pager click moves the URL and the rows, and Back and Forward walk the same states, all as client
// navigations: no document load after the first.
test("sort and page in the url", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const loads = documents(page)
	const first = await rowNames(page)
	await page.locator("#sort-name").click()
	await expect.poll(() => searchOf(page.url())).toEqual({ sort: "name", dir: "asc", page: "1" })
	const byName = await rowNames(page)
	expect(byName).toEqual(sorted(byName))
	expect(byName).not.toEqual(first)
	await page.locator("#next").click()
	await expect.poll(() => searchOf(page.url())).toEqual({ sort: "name", dir: "asc", page: "2" })
	await expect(page.locator("#page-of")).toHaveText("2 / 3")
	const second = await rowNames(page)
	expect(second[0]?.localeCompare(byName.at(-1) ?? "")).toBe(1)
	await page.goBack()
	await expect(page.locator("#page-of")).toHaveText("1 / 3")
	expect(await rowNames(page)).toEqual(byName)
	await page.goBack()
	await expect(page).toHaveURL(`${dashboard.origin}${TABLE}`)
	await expect.poll(() => rowNames(page)).toEqual(first)
	await page.goForward()
	await expect.poll(() => rowNames(page)).toEqual(byName)
	expect(loads).toEqual([])
})

// A list, a number, and a date in the URL reach the page as those types, on the document, after a reload, and after
// the filter form writes them back through a client navigation.
test("typed search round trip", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	await open(page, dashboard.origin, `${TABLE}?status=active&status=paused&page=2&from=2026-09-20`)
	const applied = page.locator("#applied")
	await expect(applied).toHaveAttribute("data-page-type", "number")
	await expect(applied).toHaveAttribute("data-from-type", "Date")
	await expect(applied).toHaveAttribute("data-status", "active,paused")
	await expect(applied).toContainText("from 2026-09-20T00:00:00.000Z")
	const statuses = await page.locator("#projects tbody td[data-status]").allTextContents()
	expect(statuses.every((status) => status === "active" || status === "paused")).toBe(true)
	await page.reload()
	await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
	await expect(applied).toHaveAttribute("data-from-type", "Date")
	await expect(applied).toHaveAttribute("data-status", "active,paused")
	const loads = documents(page)
	await page.locator('input[name="status"][value="paused"]').uncheck()
	await page.locator("#to").fill("2026-09-30")
	await page.locator("#apply").click()
	await expect
		.poll(() => searchOf(page.url()))
		.toEqual({
			sort: "updated",
			dir: "desc",
			page: "1",
			status: "active",
			from: "2026-09-20T00:00:00.000Z",
			to: "2026-09-30T23:59:59.999Z",
		})
	await expect(applied).toHaveAttribute("data-status", "active")
	await expect(applied).toContainText("to 2026-09-30T23:59:59.999Z")
	await expect(applied).toHaveAttribute("data-page-type", "number")
	expect(loads).toEqual([])
})

// Applying a filter replaces the entry: refining a search is not a step Back has to undo.
test("filter replaces history", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const length = await page.evaluate(() => history.length)
	await page.locator("#q").fill("atlas")
	await page.locator("#apply").click()
	await expect.poll(() => searchOf(page.url()).q).toBe("atlas")
	await expect.poll(() => rowNames(page)).toEqual(["Atlas 1", "Atlas 2", "Atlas 3"])
	expect(await page.evaluate(() => history.length)).toBe(length)
})

// A search the validator cannot read takes its defaults: the page answers 200 and shows the first page in the default
// order.
test("invalid search", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const response = await page.goto(`${dashboard.origin}${TABLE}?page=abc&sort=bogus&dir=up&from=yesterday`)
	expect(response?.status()).toBe(200)
	await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
	await expect(page.locator("#applied")).toHaveText("page 1 · updated desc")
	await expect(page.locator("#page-of")).toHaveText("1 / 3")
})

// Next prefetches its page's data on hover, once, and the click lands on it with no data request of its own. Page 2
// puts its own Next under the pointer, which Firefox and WebKit count as a hover of it: that prefetch is page 3's.
test("next page prefetched", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const requests = dataRequests(page)
	const pageTwo = () => requests.filter((request) => request.search.get("page") === "2")
	await page.locator("#next").hover()
	await expect.poll(() => pageTwo().map((request) => request.kind)).toEqual(["prefetch"])
	await page.locator("#next").click()
	await expect(page.locator("#page-of")).toHaveText("2 / 3")
	expect(requests.filter((request) => request.kind === "data")).toEqual([])
	expect(pageTwo().map((request) => request.kind)).toEqual(["prefetch"])
})

// A header Link with `scroll={false}` reorders the table where the reader is.
test("scroll kept on sort", async ({ page, dashboard }) => {
	await page.setViewportSize({ width: 1280, height: 420 })
	await signedIn(page, dashboard.origin, TABLE)
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
	const before = await page.evaluate(() => Math.round(scrollY))
	expect(before).toBeGreaterThan(0)
	await page.locator("#sort-budget").click()
	await expect.poll(() => searchOf(page.url())).toEqual({ sort: "budget", dir: "asc", page: "1" })
	await expect(page.locator("#projects th[aria-sort='ascending'] a")).toHaveText("Budget")
	expect(await page.evaluate(() => Math.round(scrollY))).toBe(before)
})
