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

// A layout's notFound() reached by a client navigation paints that layout's notFoundRender in its slot, without its
// chrome, and the page stays loaded: the answer names the failed layout in `flare-failed` (B77, BUGS.md 134).
test("layout not found navigation", async ({ page }: { page: Page; browser: Browser }) => {
	await page.goto(`${session.origin}/area-home`)
	await expect(page.locator("html")).toHaveAttribute("data-flare-hydrated", "")
	await page.evaluate(() => Reflect.set(window, "__stayed", true))
	await page.locator("#to-area-missing").click()
	await expect(page.locator("#area-missing")).toHaveText("area missing")
	expect(await page.locator("#area").count()).toBe(0)
	expect(new URL(page.url()).pathname).toBe("/area-missing")
	expect(await page.evaluate(() => Reflect.get(window, "__stayed"))).toBe(true)
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

	// A page with the public CDN header renders again on a second document navigation: the browser revalidates, as
	// `max-age=0` asks, and shows the new render. stale-while-revalidate on Cache-Control made Firefox show the first
	// one from its own cache (BUGS.md 135).
	test("cdn page fresh", async ({ page }: { page: Page; browser: Browser }) => {
		const first = await page.goto(`${base.origin}/app/cdn`)
		expect(first?.headers()["cache-control"]).toBe("public, max-age=0, s-maxage=3600")
		const seen = Number(await page.locator("#render").textContent())
		await page.goto(`${base.origin}/app`)
		await page.goto(`${base.origin}/app/cdn`)
		await expect(page.locator("#render")).toHaveText(String(seen + 1))
	})
})

// A browser that still runs an old build's service worker at a retired path loads this build after one visit: the
// worker's update check gets the retiring worker, which clears its caches, unregisters, and reloads the page
// (plan 21 16.1, dx/server.md Migrating from v0).
test("retired service worker", async ({ page, context }) => {
	await page.goto(`${session.origin}/about`)
	await context.addCookies([{ name: "stand-in", value: "1", url: session.origin }])
	// `ready` can resolve while the worker is still activating, and its `clients.claim()` then lands during the next
	// navigation, which WebKit cancels; the page navigates once the worker is activated and controls it (BUGS.md 367).
	await page.evaluate(async () => {
		const registration = await navigator.serviceWorker.register("/legacy-sw.js", { scope: "/" })
		await navigator.serviceWorker.ready
		const worker = registration.active
		if (worker !== null && worker.state !== "activated") {
			await new Promise((resolve) => worker.addEventListener("statechange", resolve, { once: true }))
		}
		if (navigator.serviceWorker.controller === null) {
			await new Promise((resolve) =>
				navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }),
			)
		}
	})
	await page.goto(`${session.origin}/`)
	await expect(page.locator("#old-build")).toHaveText("old build")
	await context.clearCookies()
	await page.reload()
	await expect(page.locator("#app")).toHaveText("Home", { timeout: 15_000 })
	await expect(page.locator("html")).toHaveAttribute("data-flare-hydrated", "")
	expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0)
	expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true)
})
