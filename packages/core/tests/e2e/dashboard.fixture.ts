import { createHash } from "node:crypto"
import { writeFileSync } from "node:fs"
import type { Page, TestInfo } from "@playwright/test"
import { expect, test as base } from "./crash.ts"
import { loadHydrated } from "../../src/testing/playwright.ts"
import { boot, type Boot } from "./boot.ts"
import { toWire } from "../../src/shared/protocol/value.ts"

// The dashboard app's shared boot (B146). The fixture is worker-scoped, so the dashboard spec files of one project
// share one build per worker. Cases never share rows: each signs in as its own user, with its own workspace.
export const test = base.extend<{ dashboard: Boot }, { dashboardBoot: Boot }>({
	dashboardBoot: [
		async ({ browserName }, use, workerInfo) => {
			const [runtime, mode] = (workerInfo.project.name || `node-dev-${browserName}`).split("-")
			const session = await boot({ app: "dashboard", runtime: runtime ?? "node", mode: mode ?? "dev" })
			await use(session)
			await session.close()
		},
		{ scope: "worker", timeout: 240_000 },
	],
	// A failing case keeps the server lines logged while it ran, and the whole boot's, beside its trace. The first case
	// of a boot also checks the capture: the server logs one line at its first request, and it must reach the log.
	dashboard: async ({ dashboardBoot }, use, testInfo) => {
		const start = dashboardBoot.logs().length
		if (!probed.has(dashboardBoot)) {
			probed.add(dashboardBoot)
			try {
				await fetch(`${dashboardBoot.origin}/app/login`)
				const logged = () => dashboardBoot.logs().some((line) => line.includes(PROBE))
				await expect.poll(logged, { message: `the boot's log has no "${PROBE}"`, timeout: 2000 }).toBe(true)
			} catch (error) {
				await attachLogs(testInfo, dashboardBoot, start)
				throw error
			}
		}
		await use(dashboardBoot)
		if (testInfo.status !== testInfo.expectedStatus) await attachLogs(testInfo, dashboardBoot, start)
	},
})

export { expect }

// The line the server logs at its first request (src/server.ts), and the boots already checked for it.
const PROBE = "[dashboard:probe] server up"
const probed = new WeakSet<Boot>()

// Every account's password (apps/dashboard/src/demo.ts).
export const PASSWORD = "flare-demo"

async function attachLogs(testInfo: TestInfo, session: Boot, start: number): Promise<void> {
	for (const [name, lines] of [
		["server log", session.logs().slice(start)],
		["server session log", session.logs()],
	] as const) {
		const path = testInfo.outputPath(`${name.replaceAll(" ", "-")}.txt`)
		writeFileSync(path, `${lines.join("\n")}\n`)
		await testInfo.attach(name, { path, contentType: "text/plain" })
	}
}

export function serverOf(info: TestInfo): string {
	const [runtime, mode] = info.project.name.split("-")
	return `${runtime}-${mode}`
}

export function isProd(info: TestInfo): boolean {
	return serverOf(info).endsWith("-prod")
}

// A page error, a console error, or a console warning is a problem. A resource the browser failed to load names its
// URL. The returned list grows for the life of the page.
export function watch(page: Page): string[] {
	const problems: string[] = []
	page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`))
	page.on("console", (message) => {
		if (message.type() !== "error" && message.type() !== "warning") return
		const resource = message.text().startsWith("Failed to load resource") ? ` at ${message.location().url}` : ""
		problems.push(`${message.type()}: ${message.text()}${resource}`)
	})
	return problems
}

// Load a path under the app's base path and wait for hydrate. The problems list starts before the navigation.
export async function open(page: Page, origin: string, path: string): Promise<string[]> {
	const problems = watch(page)
	await loadHydrated(page, `${origin}${path}`)
	return problems
}

// A fresh account for one case: its own email, so its first sign-in creates its own workspace.
export function freshEmail(): string {
	return `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@dash.test`
}

// Sign in through the form on the page on screen, which must be the sign-in page, and wait for the document load
// that follows it.
export async function submitSignIn(page: Page, email: string, password = PASSWORD): Promise<void> {
	await page.locator("#email").fill(email)
	await page.locator("#password").fill(password)
	await page.locator("#sign-in").click()
}

// A signed-in page at `path` for a fresh user: the sign-in page, the form, then the document it lands on.
export async function signedIn(page: Page, origin: string, path = "/app/projects"): Promise<string> {
	const email = freshEmail()
	await open(page, origin, `/app/login?returnTo=${encodeURIComponent(path)}`)
	await Promise.all([page.waitForURL(`${origin}${path}`), submitSignIn(page, email)])
	await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
	return email
}

// A server function's id: sha256 of the root-relative path, NUL, and the export name, as 16 hex characters (B41).
export function fnId(file: string, name: string): string {
	return createHash("sha256").update(`${file}\0${name}`).digest("hex").slice(0, 16)
}

// An e2e-only server function (apps/dashboard/src/fns/auth.ts), posted with the page's own cookies, as the page's
// client would post it: under the base path, from the app's origin, its input a wire value (B145).
export async function callFn(
	page: Page,
	origin: string,
	call: { name: "expireSession" | "assignRole"; input?: unknown },
): Promise<void> {
	const response = await page.context().request.post(`${origin}/app/_flare/fn/${fnId("src/fns/auth.ts", call.name)}`, {
		headers: { origin },
		data: toWire(call.input),
	})
	expect(response.status(), `${call.name} answers`).toBe(200)
}
