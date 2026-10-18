import type { Page, Route } from "@playwright/test"
import { documents, expect, fnId, rowNames, signedIn, test } from "./dashboard.fixture.ts"

// Writes through server functions (bits/17): a form's field errors and its redirect, an optimistic row that lands or
// rolls back, renames that race, a write that outlives a navigation, and `invalidate()` after a write.

const TABLE = "/app/projects"
const PROJECTS = "src/fns/projects.ts"

// The answers of one server function of src/fns/projects.ts, each held until the test lets it go. The request reaches
// the server at once; only its answer waits, so the server's order is the order the calls were made.
async function holdAnswers(page: Page, name: string): Promise<{ release: () => void; held: () => number }> {
	const gate = Promise.withResolvers<void>()
	let count = 0
	await page.route(
		(url) => url.pathname.endsWith(`/_flare/fn/${fnId(PROJECTS, name)}`),
		async (route: Route) => {
			count += 1
			const response = await route.fetch()
			await gate.promise
			await route.fulfill({ response })
		},
	)
	return { release: () => gate.resolve(), held: () => count }
}

// The form names each field the server refused and keeps what was typed.
test("create shows field errors", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	await page.locator("#new-project").click()
	await expect(page.locator("#title")).toHaveText("New project")
	await page.locator("#new-name").fill("x")
	await page.locator("#new-budget").fill("-5")
	await page.locator("#create").click()
	await expect(page.locator("#name-error")).toHaveText("Use at least 2 characters")
	await expect(page.locator("#budget-error")).toHaveText("Use a whole number of dollars, 0 or more")
	await expect(page.locator("#new-name")).toHaveValue("x")
	await expect(page.locator("#new-budget")).toHaveValue("-5")
	await expect(page).toHaveURL(`${dashboard.origin}${TABLE}/new`)
})

// The server function's redirect lands on the table, newest first, loaded fresh: the new project is the first row,
// with no document load.
test("create then list", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const before = await rowNames(page)
	const loads = documents(page)
	await page.locator("#new-project").click()
	await page.locator("#new-name").fill("Zephyr")
	await page.locator("#new-budget").fill("1200")
	await page.locator("#create").click()
	await expect(page).toHaveURL(`${dashboard.origin}${TABLE}?dir=desc&page=1&sort=updated`)
	await expect.poll(async () => (await rowNames(page))[0]).toBe("Zephyr")
	expect((await rowNames(page)).slice(1)).toEqual(before.slice(0, -1))
	expect(loads).toEqual([])
})

// A quick add shows its row before the server answers; a name the server refuses takes the row back and says why.
test("optimistic insert rolls back", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const before = await rowNames(page)
	const answers = await holdAnswers(page, "quickAdd")
	await page.locator("#quick-name").fill("Atlas 1")
	await page.locator("#quick-submit").click()
	await expect(page.locator('#projects tr[data-optimistic="true"]')).toHaveText(/Atlas 1/)
	await expect.poll(answers.held).toBe(1)
	answers.release()
	await expect(page.locator("#quick-error")).toHaveText('A project named "Atlas 1" exists')
	await expect(page.locator('#projects tr[data-optimistic="true"]')).toHaveCount(0)
	await expect.poll(() => rowNames(page)).toEqual(before)
})

// An accepted quick add replaces its optimistic row with the server's, at the top of the newest-first table.
test("optimistic insert lands", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	await page.locator("#quick-name").fill("Nova")
	await page.locator("#quick-submit").click()
	const first = page.locator("#projects tbody tr").first()
	await expect(first).toHaveText(/Nova/)
	await expect(page.locator('#projects tr[data-optimistic="true"]')).toHaveCount(0)
	await expect(first).not.toHaveAttribute("data-id", "-1")
	await expect(page.locator("#quick-name")).toHaveValue("")
})

// Two renames in flight, the first answering last: once both settle, the dialog and the row show the name the server
// kept, the second, not the late answer's.
test("concurrent renames", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const id = await page.locator("#projects tbody tr").first().getAttribute("data-id")
	await page.locator("#projects .project-link").first().click()
	const gate = Promise.withResolvers<void>()
	const seen = { calls: 0, firstAnswered: false }
	await page.route(
		(url) => url.pathname.endsWith(`/_flare/fn/${fnId(PROJECTS, "renameProject")}`),
		async (route: Route) => {
			seen.calls += 1
			if (seen.calls > 1) return route.continue()
			const response = await route.fetch()
			seen.firstAnswered = true
			await gate.promise
			return route.fulfill({ response })
		},
	)
	await page.locator("#rename-name").fill("First name")
	await page.locator("#rename-submit").click()
	// The server has done the first rename before the second is sent; only its answer to the page waits.
	await expect.poll(() => seen.firstAnswered).toBe(true)
	await page.locator("#rename-name").fill("Second name")
	await page.locator("#rename-submit").click()
	await expect.poll(() => seen.calls).toBe(2)
	gate.resolve()
	await expect(page.locator(`#projects tr[data-id="${id}"] .project-link`)).toHaveText("Second name")
	await expect(page.locator("#project-dialog #project-name")).toHaveText("Second name")
})

// A write started before a navigation away still lands, and the table shows it on the way back.
test("mutation during navigation", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const answers = await holdAnswers(page, "quickAdd")
	await page.locator("#quick-name").fill("Orbit")
	await page.locator("#quick-submit").click()
	await expect.poll(answers.held).toBe(1)
	await page.locator("#sidebar").getByRole("link", { name: "Billing" }).click()
	await expect(page.locator("#title")).toHaveText("Billing")
	answers.release()
	await page.locator("#sidebar").getByRole("link", { name: "Projects" }).click()
	await expect(page.locator("#title")).toHaveText("Projects")
	await expect.poll(async () => (await rowNames(page))[0]).toBe("Orbit")
})

// Archiving a row is a write, then `invalidate()`: Flare drops what it holds and loads the table on screen again, which
// shows the row archived with no document load.
test("archive invalidates", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const loads = documents(page)
	const row = page.locator("#projects tbody tr").first()
	const id = await row.getAttribute("data-id")
	await row.locator("[data-archive]").click()
	const archived = page.locator(`#projects tr[data-id="${id}"] td[data-status]`)
	await expect(archived).toHaveText("archived")
	await expect(page.locator(`#projects tr[data-id="${id}"] [data-archive]`)).toHaveCount(0)
	expect(loads).toEqual([])
})
