import type { Page } from "@playwright/test"
import { callFn, expect, freshEmail, open, signedIn, submitSignIn, test } from "./dashboard.fixture.ts"

// Sign-in, sign-out, and the session's life across navigations, tabs, and roles (bits/17). The app lives under /app
// (B146); every case signs in as its own user.

const HYDRATED = "html[data-flare-hydrated]"

async function hydrated(page: Page): Promise<void> {
	await page.waitForSelector(HYDRATED, { state: "attached" })
}

// A deep link with a search, opened signed out: the document is the layout's 401, the client replaces it with the
// sign-in page carrying the link, and signing in lands on that exact URL, search included.
test("login redirects back", async ({ page, dashboard }) => {
	const target = "/app/projects?page=2&status=active"
	const response = await page.goto(`${dashboard.origin}${target}`)
	expect(response?.status()).toBe(401)
	await page.waitForURL(`${dashboard.origin}/app/login?returnTo=${encodeURIComponent(target)}`)
	await hydrated(page)
	const email = freshEmail()
	await Promise.all([page.waitForURL(`${dashboard.origin}${target}`), submitSignIn(page, email)])
	await expect(page.locator("#title")).toHaveText("Projects")
	await expect(page.locator("#viewer")).toHaveText(email)
})

// A wrong password names itself under the password field, which takes focus, and sets no cookie.
test("wrong password", async ({ page, dashboard }) => {
	const problems = await open(page, dashboard.origin, "/app/login")
	await submitSignIn(page, freshEmail(), "wrong-password")
	await expect(page.locator("#password-error")).toHaveText("Wrong email or password")
	await expect(page.locator("#password")).toBeFocused()
	await expect(page).toHaveURL(`${dashboard.origin}/app/login`)
	const cookies = await page.context().cookies(dashboard.origin)
	expect(cookies.map((cookie) => cookie.name)).not.toContain("dash.session")
	// The call's 500 is the answer the browser logs, as for any failed fetch; nothing else may be logged.
	expect(problems.filter((problem) => !problem.includes("Failed to load resource"))).toEqual([])
})

// After signing out, Back to a page the session saw shows none of its data: the cookie went with the returned
// Response, so Flare dropped every held page (B133), and the page asks the server again, which answers 401.
test("logout clears held data", async ({ page, dashboard }) => {
	const email = await signedIn(page, dashboard.origin)
	await page.locator("#sidebar").getByRole("link", { name: "Billing" }).click()
	await expect(page.locator("#title")).toHaveText("Billing")
	await page.locator("#sign-out").click()
	await page.waitForURL(`${dashboard.origin}/app/login`)
	await expect(page.locator("#sign-in")).toBeVisible()
	await page.goBack()
	await page.waitForURL(`${dashboard.origin}/app/login?returnTo=${encodeURIComponent("/app/projects")}`)
	await expect(page.locator("#sign-in")).toBeVisible()
	await expect(page.locator("body")).not.toContainText(email)
	const cookies = await page.context().cookies(dashboard.origin)
	expect(cookies.map((cookie) => cookie.name)).not.toContain("dash.session")
})

// The session ends on the server while the browser keeps its cookie: the next client navigation is answered 401,
// and the page goes to sign in, carrying where it was going.
test("expired session mid navigation", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin)
	await callFn(page, dashboard.origin, { name: "expireSession" })
	await page.locator("#sidebar").getByRole("link", { name: "Billing" }).click()
	await page.waitForURL(`${dashboard.origin}/app/login?returnTo=${encodeURIComponent("/app/settings/billing")}`)
	await expect(page.locator("#sign-in")).toBeVisible()
	await expect(page.locator("#viewer")).toHaveCount(0)
})

// Two tabs share the cookie. Signing out in one ends the session for both: the other tab's next navigation goes to
// sign in.
test("session in another tab", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin)
	const other = await page.context().newPage()
	await open(other, dashboard.origin, "/app/projects")
	await expect(other.locator("#title")).toHaveText("Projects")
	await page.locator("#sign-out").click()
	await page.waitForURL(`${dashboard.origin}/app/login`)
	await other.locator("#sidebar").getByRole("link", { name: "Billing" }).click()
	await other.waitForURL(`${dashboard.origin}/app/login?returnTo=${encodeURIComponent("/app/settings/billing")}`)
	await expect(other.locator("#viewer")).toHaveCount(0)
	await other.close()
})

// Billing is the owner's. A member's document is 403 with Flare's built-in text in the page's slot, under the shell,
// since no route on the chain has an `unauthorizedRender`; the member's sidebar has no Billing link.
test("role gate", async ({ page, dashboard }) => {
	await signedIn(page, dashboard.origin, "/app/settings/billing")
	await expect(page.locator("#plan")).toHaveText("free")
	await callFn(page, dashboard.origin, { name: "assignRole", input: { role: "member" } })
	const response = await page.goto(`${dashboard.origin}/app/settings/billing`)
	expect(response?.status()).toBe(403)
	await hydrated(page)
	await expect(page.locator("#page")).toHaveText("Access denied")
	await expect(page.locator("#viewer")).toHaveAttribute("data-role", "member")
	await expect(page.locator("#sidebar").getByRole("link", { name: "Billing" })).toHaveCount(0)
})
