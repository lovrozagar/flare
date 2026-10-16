import type { Page } from "@playwright/test"
import { dataRequests, documents, expect, open, test } from "./docs.fixture.ts"

// Hash navigation on the docs app in every project (BUGS.md 148): a hash Link moves the page to its section and asks
// the server for nothing; clicked again after a scroll away it goes back there with no new history entry; Back and
// Forward between two hashes of one page move between the sections with no request; a Link to another page's section
// lands on it. A short viewport puts the sections below the fold.

const SHORT = { width: 900, height: 360 }

async function routing(page: Page, origin: string): Promise<void> {
	await page.setViewportSize(SHORT)
	await open(page, origin, "/docs/routing")
	await expect(page.locator("#params")).not.toBeInViewport()
}

// A section scrolled to sits at its `scroll-mt-24` offset from the top: within this many pixels, and not above it.
const TOP = 120

async function topOf(page: Page, id: string): Promise<number> {
	const top = await page.locator(`#${id}`).evaluate((element) => Math.round(element.getBoundingClientRect().top))
	return top < 0 ? Number.POSITIVE_INFINITY : top
}

// Clicks a TOC link from the page, as a person's click on a link in view: Playwright's own would scroll first.
async function toc(page: Page, name: string): Promise<void> {
	await page
		.locator("#toc")
		.getByRole("link", { name })
		.evaluate((anchor: HTMLElement) => anchor.click())
}

test("hash link again", async ({ page, docs }) => {
	await routing(page, docs.origin)
	const requests = dataRequests(page)
	const loads = documents(page)
	await toc(page, "Params")
	await expect(page).toHaveURL(`${docs.origin}/docs/routing#params`)
	await expect(page.locator("#params")).toBeInViewport()
	const length = await page.evaluate(() => history.length)
	await page.evaluate(() => window.scrollTo(0, 0))
	await expect(page.locator("#params")).not.toBeInViewport()
	await toc(page, "Params")
	await expect(page.locator("#params")).toBeInViewport()
	expect(await page.evaluate(() => history.length)).toBe(length)
	expect(requests).toEqual([])
	expect(loads).toEqual([])
})

// Each history entry keeps the position it was left at, which a hash click put at its section.
test("hash back and forward", async ({ page, docs }) => {
	await routing(page, docs.origin)
	const requests = dataRequests(page)
	const loads = documents(page)
	await toc(page, "Files")
	await expect.poll(() => topOf(page, "files")).toBeLessThan(TOP)
	await toc(page, "Params")
	await expect.poll(() => topOf(page, "params")).toBeLessThan(TOP)
	await page.goBack()
	await expect(page).toHaveURL(`${docs.origin}/docs/routing#files`)
	await expect.poll(() => topOf(page, "files")).toBeLessThan(TOP)
	await page.goForward()
	await expect(page).toHaveURL(`${docs.origin}/docs/routing#params`)
	await expect.poll(() => topOf(page, "params")).toBeLessThan(TOP)
	expect(requests).toEqual([])
	expect(loads).toEqual([])
})

test("hash on another page", async ({ page, docs }) => {
	await page.setViewportSize(SHORT)
	await open(page, docs.origin, "/docs/data-loading")
	const requests = dataRequests(page)
	const loads = documents(page)
	await page.locator("#see-also").evaluate((anchor: HTMLElement) => anchor.click())
	await expect(page).toHaveURL(`${docs.origin}/docs/routing#params`)
	await expect(page.locator("#doc-title")).toHaveText("Routing")
	await expect(page.locator("#params")).toBeInViewport()
	expect(requests.filter((seen) => seen.kind === "data").map((seen) => seen.path)).toEqual(["/docs/routing"])
	expect(loads).toEqual([])
})
