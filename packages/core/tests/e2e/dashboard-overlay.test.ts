import type { Page } from "@playwright/test"
import { documents, expect, open, signedIn, test } from "./dashboard.fixture.ts"

// A project opened from the table is a dialog over the table, an intercepted route with a typed param (bits/17,
// dx/navigate.md InterceptOutlet); the same URL loaded as a document is the project's page.

const TABLE = "/app/projects"

// The first row's project: its id and its name, as the table links it.
async function firstRow(page: Page): Promise<{ id: string; name: string }> {
	const row = page.locator("#projects tbody tr").first()
	return {
		id: (await row.getAttribute("data-id")) ?? "",
		name: (await row.locator(".project-link").textContent()) ?? "",
	}
}

async function focusedIn(page: Page, selector: string): Promise<boolean> {
	return page.evaluate((within) => document.activeElement?.closest(within) !== null, selector)
}

// A row's link opens the dialog at the project's URL; the table stays mounted behind it and focus moves into it.
test("row opens overlay", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const loads = documents(page)
	const { id, name } = await firstRow(page)
	await page.locator("#projects .project-link").first().click()
	await expect(page).toHaveURL(`${dashboard.origin}${TABLE}/${id}`)
	const dialog = page.locator("#project-dialog")
	await expect(dialog.locator("#project-name")).toHaveText(name)
	await expect(dialog).toHaveAttribute("data-background", TABLE)
	await expect(dialog).toHaveAttribute("data-label", "project-dialog")
	await expect(page.locator("#projects")).toBeVisible()
	await expect.poll(() => focusedIn(page, "#project-dialog")).toBe(true)
	expect(loads).toEqual([])
})

// The project's URL loaded as a document is its page, with no dialog and the project's title.
test("deep link is a page", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const { id, name } = await firstRow(page)
	await open(page, dashboard.origin, `${TABLE}/${id}`)
	await expect(page.locator("#project-page #project-name")).toHaveText(name)
	await expect(page.locator("#project-dialog")).toHaveCount(0)
	await expect(page).toHaveTitle(`${name} — Projects — Dashboard`)
})

// Back closes the dialog without a fetch, and focus returns to the link that opened it. The link opens it from the
// keyboard: a click focuses a link in Chromium, Firefox, and Linux WebKit but not in macOS WebKit, where focus stays on
// the body and there is no opener to return to (CI 39092510724).
test("back closes overlay", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const { name } = await firstRow(page)
	const link = page.locator("#projects .project-link").first()
	await link.focus()
	await link.press("Enter")
	await expect(page.locator("#project-dialog")).toBeVisible()
	const loads = documents(page)
	await page.goBack()
	await expect(page).toHaveURL(`${dashboard.origin}${TABLE}`)
	await expect(page.locator("#project-dialog")).toHaveCount(0)
	await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe(name)
	expect(loads).toEqual([])
})

// A reload of an open dialog's URL renders the project's page.
test("reload keeps detail", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const { name } = await firstRow(page)
	await page.locator("#projects .project-link").first().click()
	await expect(page.locator("#project-dialog")).toBeVisible()
	await page.reload()
	await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
	await expect(page.locator("#project-page #project-name")).toHaveText(name)
	await expect(page.locator("#project-dialog")).toHaveCount(0)
})

// A rename in the dialog shows in the dialog and in the row behind it, with no document load, and stays once the
// dialog closes.
test("rename revalidates list", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const loads = documents(page)
	const { id } = await firstRow(page)
	await page.locator("#projects .project-link").first().click()
	await page.locator("#rename-name").fill("Renamed project")
	await page.locator("#rename-submit").click()
	await expect(page.locator("#project-dialog #project-name")).toHaveText("Renamed project")
	await expect(page.locator(`#projects tr[data-id="${id}"] .project-link`)).toHaveText("Renamed project")
	await page.locator("#dialog-close").click()
	await expect(page.locator("#project-dialog")).toHaveCount(0)
	await expect(page.locator(`#projects tr[data-id="${id}"] .project-link`)).toHaveText("Renamed project")
	expect(loads).toEqual([])
})

// A popover the open dialog mounts through a Portal sits outside the dialog under document.body; a click on its field
// keeps focus there and typing reaches it, while the dialog stays open (BUGS.md 501.3).
test("portal popover keeps focus", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	await page.locator("#projects .project-link").first().click()
	await expect(page.locator("#project-dialog")).toBeVisible()
	await page.locator("#dialog-note").click()
	const field = page.locator("#note-field")
	await field.click()
	await expect(field).toBeFocused()
	await page.keyboard.type("todo")
	await expect(field).toHaveValue("todo")
	await expect(page.locator("#project-dialog")).toBeVisible()
})

// A project id the workspace does not have is a 404 under the shell; a URL no route matches is the root's not-found
// (notFoundMode "root", B146), with no shell.
test("missing project", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, TABLE)
	const missing = await page.goto(`${dashboard.origin}${TABLE}/9999`)
	expect(missing?.status()).toBe(404)
	await expect(page.locator("#page")).toHaveText("Page not found")
	await expect(page.locator("#sidebar")).toBeVisible()
	const unknown = await page.goto(`${dashboard.origin}/app/no-such-page`)
	expect(unknown?.status()).toBe(404)
	await expect(page.locator("body")).toContainText("Page not found")
	await expect(page.locator("#sidebar")).toHaveCount(0)
})
