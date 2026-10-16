import type { Browser, Page } from "@playwright/test"
import { expect, test } from "./crash.ts"
import { boot, type Boot } from "./boot.ts"

let session: Boot

test.beforeAll(async ({ browserName }, workerInfo) => {
	const name = workerInfo.project.name ?? `node-dev-${browserName}`
	const [runtime, mode] = name.split("-")
	session = await boot({ app: "minimal", runtime: runtime ?? "node", mode: mode ?? "dev" })
})

test.afterAll(async () => {
	await session?.close()
})

test("hydrate", async ({ page }: { page: Page; browser: Browser }) => {
	await page.goto(`${session.origin}/`)
	await expect(page.locator("#app")).toHaveText("Home")
	await expect(page.locator("html")).toHaveAttribute("data-flare-hydrated", "")
})

// A root whose own loader failed answers a standards-mode document whose body is the built-in div (B77, BUGS.md 134).
test("root failure document", async ({ page }: { page: Page; browser: Browser }) => {
	const response = await page.goto(`${session.origin}/root-missing`)
	expect(response?.status()).toBe(404)
	expect(await page.evaluate(() => document.compatMode)).toBe("CSS1Compat")
	await expect(page.locator("body > div")).toHaveText("Page not found")
	expect(await page.locator("#nav").count()).toBe(0)
})

test.describe("basepath", () => {
	let base: Boot

	test.beforeAll(async ({ browserName }, workerInfo) => {
		const name = workerInfo.project.name ?? `node-dev-${browserName}`
		const [runtime, mode] = name.split("-")
		base = await boot({ app: "basepath", runtime: runtime ?? "node", mode: mode ?? "dev" })
	})

	test.afterAll(async () => {
		await base?.close()
	})

	test("base path serves /app", async ({ page }: { page: Page; browser: Browser }) => {
		const home = await page.goto(`${base.origin}/app`)
		expect(home?.status()).toBe(200)
		await expect(page.locator("#app")).toHaveText("Home")
		const root = await page.goto(`${base.origin}/`)
		expect(root?.status()).toBe(404)
	})
})
