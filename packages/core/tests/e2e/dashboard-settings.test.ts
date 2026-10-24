import type { Dialog, Page } from "@playwright/test"
import { documents, expect, fnId, open, signedIn, submitSignIn, test } from "./dashboard.fixture.ts"

// Settings (bits/17): the profile form's unsaved-changes blocker across a link, Back, and a tab close, a save that
// answers with a redirect, and the team page's invites and roles, seen from a second user's own browser.

const PROFILE = "/app/settings/profile"

// Every dialog the page raises from now on, each answered as `answer` says at that moment.
function dialogs(page: Page, answer: { accept: boolean }): string[] {
	const seen: string[] = []
	page.on("dialog", (dialog: Dialog) => {
		seen.push(dialog.type())
		void (answer.accept ? dialog.accept() : dialog.dismiss())
	})
	return seen
}

async function editName(page: Page, name: string): Promise<void> {
	await page.locator("#profile-name").fill(name)
	await expect(page.locator("#profile-state")).toHaveText("Unsaved changes")
}

// A link while the form holds a change asks first: cancel stays on the form with the change, confirm leaves.
test("unsaved changes block a link", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, PROFILE)
	const answer = { accept: false }
	const seen = dialogs(page, answer)
	await editName(page, "Grace")
	await page.locator("#sidebar").getByRole("link", { name: "Projects" }).click()
	await expect.poll(() => seen).toEqual(["confirm"])
	await expect(page).toHaveURL(`${dashboard.origin}${PROFILE}`)
	await expect(page.locator("#profile-name")).toHaveValue("Grace")
	answer.accept = true
	await page.locator("#sidebar").getByRole("link", { name: "Projects" }).click()
	await expect(page.locator("#title")).toHaveText("Projects")
	expect(seen).toEqual(["confirm", "confirm"])
})

// Back is the browser's own step: Flare does not ask the blocker for it (dx/navigate.md useBlocker), so it leaves.
test("back is not asked", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin)
	await page.locator("#sidebar").getByRole("link", { name: "Settings" }).click()
	await expect(page.locator("#title")).toHaveText("Profile")
	const seen = dialogs(page, { accept: false })
	await editName(page, "Grace")
	await page.goBack()
	await expect(page.locator("#title")).toHaveText("Projects")
	expect(seen).toEqual([])
})

// Closing the tab with a change asks through `beforeunload`; cancelled, the page stays with the change.
test("unsaved changes block a close", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, PROFILE)
	const seen = dialogs(page, { accept: false })
	await editName(page, "Grace")
	await page.close({ runBeforeUnload: true })
	await expect.poll(() => seen).toEqual(["beforeunload"])
	expect(page.isClosed()).toBe(false)
	await expect(page.locator("#profile-name")).toHaveValue("Grace")
})

// The save's redirect lands back on the profile with the saved name, clean, so leaving asks nothing; the top bar's
// next document shows the new name too.
test("save redirects", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, PROFILE)
	const seen = dialogs(page, { accept: false })
	const loads = documents(page)
	await editName(page, "Ada Lovelace")
	// The save's redirect, the profile's data answer, is the later navigation, so a click before it lands is overtaken:
	// the case waits for it, then for "Saved", which the form shows only once the save has landed (BUGS.md 369).
	const redirected = page.waitForResponse((response) => {
		const url = new URL(response.url())
		return url.pathname === PROFILE && url.searchParams.get("_flare") === "data"
	})
	await page.locator("#profile-save").click()
	await redirected
	await expect(page.locator("#profile-state")).toHaveText("Saved")
	await expect(page.locator("#profile-name")).toHaveValue("Ada Lovelace")
	await page.locator("#sidebar").getByRole("link", { name: "Projects" }).click()
	await expect(page.locator("#title")).toHaveText("Projects")
	expect(seen).toEqual([])
	expect(loads).toEqual([])
	await page.goto(`${dashboard.origin}${PROFILE}`)
	await expect(page.locator("#profile-name")).toHaveValue("Ada Lovelace")
})

// changeRole's server-function path (B41).
const CHANGE_ROLE = `/app/_flare/fn/${fnId("src/fns/settings.ts", "changeRole")}`

// The owner invites a member, then makes them an admin; the list takes each answer, and a reload shows the same. The
// select shows its new value the moment it is chosen, before the server answers, so the case waits for changeRole's
// answer before the reload: a reload sent first cancels the call in the browser (CI 40104136999, BUGS.md 519). The
// call is held 300 ms here so that order is what every run meets.
test("invite and change a role", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, "/app/settings/team")
	const invited = `m${Date.now().toString(36)}@dash.test`
	await page.locator("#invite-email").fill(invited)
	await page.locator("#invite").click()
	const row = page.locator(`#members tr[data-email="${invited}"]`)
	await expect(row.locator(".member-role")).toHaveValue("member")
	await page.route(`**${CHANGE_ROLE}`, async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 300))
		await route.continue()
	})
	const changed = page.waitForResponse((response) => new URL(response.url()).pathname === CHANGE_ROLE)
	await row.locator(".member-role").selectOption("admin")
	expect((await changed).status()).toBe(200)
	await expect(row.locator(".member-role")).toHaveValue("admin")
	await expect(page.locator("#team-error")).toHaveText("")
	await page.reload()
	await expect(page.locator(`#members tr[data-email="${invited}"] .member-role`)).toHaveValue("admin")
})

// An invited admin, in their own browser, has the team page. Once the owner makes them a member, their next client
// navigation reloads the settings layout's data, so the Team tab is gone with no document load; the page itself is
// then answered 403 with its own render, under the settings tabs.
test("demoted admin loses the team", async ({ page, dashboard, browser }) => {
	await signedIn(page, dashboard.origin, "/app/settings/team")
	const admin = `a${Date.now().toString(36)}@dash.test`
	await page.locator("#invite-email").fill(admin)
	await page.locator("#invite-role").selectOption("admin")
	await page.locator("#invite").click()
	const row = page.locator(`#members tr[data-email="${admin}"]`)
	await expect(row.locator(".member-role")).toHaveValue("admin")
	const other = await browser.newContext()
	const tab = await other.newPage()
	const problems = await open(tab, dashboard.origin, `/app/login?returnTo=${encodeURIComponent("/app/settings/team")}`)
	await Promise.all([tab.waitForURL(`${dashboard.origin}/app/settings/team`), submitSignIn(tab, admin)])
	// Before hydrate a link is a plain anchor, and a click on it loads a document.
	await tab.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
	await expect(tab.locator("#title")).toHaveText("Team")
	await row.locator(".member-role").selectOption("member")
	await expect(row.locator(".member-role")).toHaveValue("member")
	const loads = documents(tab)
	await tab.locator("#settings-tabs").getByRole("link", { name: "Profile" }).click()
	await expect(tab.locator("#title")).toHaveText("Profile")
	await expect(tab.locator("#settings-tabs").getByRole("link", { name: "Team" })).toHaveCount(0)
	expect(problems).toEqual([])
	expect(loads).toEqual([])
	const response = await tab.goto(`${dashboard.origin}/app/settings/team`)
	expect(response?.status()).toBe(403)
	await expect(tab.locator("#team-403")).toContainText("Admins only")
	await expect(tab.locator("#settings-tabs")).toBeVisible()
	await other.close()
})
