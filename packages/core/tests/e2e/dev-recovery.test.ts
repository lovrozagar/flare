import { readFileSync, writeFileSync } from "node:fs"
import { bootCopy } from "./copy-boot.ts"
import { expect, isProd, serverOf, test } from "./docs.fixture.ts"

// How long chokidar, as Vite 8.1.4 bundles it, drops a second change to one path: `_throttle(EV_CHANGE, path, 50)` in
// its emit, with no trailing event (BUGS.md 366.2). Recheck on a Vite upgrade.
const WATCH_THROTTLE_MS = 50

// A server module that fails to load answers the dev error page, which carries Vite's client: the overlay opens in that
// tab, and fixing the file brings the page back to the app with no reload by hand (plan 21 11.6). The edit is on a
// private copy of the app (B70, BUGS.md 111).
test("load error recovers", async ({ page }, info) => {
	// The Node and Bun dev handler's own failure page; Workers dev answers through the Cloudflare plugin (B89).
	test.skip(isProd(info) || serverOf(info).startsWith("workers"), "the Node and Bun dev handler")
	const session = await bootCopy({ app: "minimal", runtime: serverOf(info).split("-")[0] ?? "node" })
	try {
		// A first load settles the dependency optimizer, whose own full reload would hide a missing recovery.
		await page.goto(`${session.origin}/about`)
		await page.waitForLoadState("networkidle")
		const file = `${session.appDir}/src/server.ts`
		const source = readFileSync(file, "utf8")
		// The break reloads the open page, as Solid's plugin does for a module only the server graph holds.
		const failure = page.waitForResponse((response) => response.request().resourceType() === "document")
		writeFileSync(file, `${source}\nexport const broken = ;\n`)
		expect((await failure).status()).toBe(500)
		const failedAt = Date.now()
		await expect(page.locator("vite-error-overlay")).toHaveCount(1)
		await page.evaluate(() => Object.assign(window, { failedPage: true }))
		// Vite's watcher, chokidar, drops a change to a path within 50 ms of the last change it reported for it, and the
		// overlay can show inside that window. The break's change came before its reload's answer, so the fix is saved
		// once, 50 ms after that answer, and its reload is the next document answered 200 (BUGS.md 366.2). Saving it again
		// and again, as a poll did, set off a reload per save that cut the recovered page's load short (BUGS.md 366).
		await new Promise((resolve) => setTimeout(resolve, Math.max(0, failedAt + WATCH_THROTTLE_MS - Date.now())))
		const recovered = page.waitForResponse(
			(response) => response.request().resourceType() === "document" && response.status() === 200,
		)
		writeFileSync(file, source)
		await recovered
		await expect(page.locator("pre")).toHaveCount(0)
		await expect(page.locator("body")).toContainText("About")
		await expect(page.locator("vite-error-overlay")).toHaveCount(0)
		expect(await page.evaluate(() => Reflect.get(window, "failedPage"))).toBeUndefined()
	} finally {
		await session.close()
	}
})

// A route file that does not parse leaves every other page its dev styles: the document the server writes carries the
// app's stylesheet, and the dev server never makes it wait out the styles' bound (plan 21 11.6).
test("broken sibling route", async ({ page }, info) => {
	test.skip(isProd(info) || serverOf(info).startsWith("workers"), "the Node and Bun dev handler")
	const session = await bootCopy({ app: "docs", runtime: serverOf(info).split("-")[0] ?? "node" })
	try {
		writeFileSync(
			`${session.appDir}/src/routes/[[locale]]/_root_/changelog/changelog.page.tsx`,
			"export const route = (\n",
		)
		const response = await page.goto(`${session.origin}/docs/routing`)
		expect(response?.status()).toBe(200)
		expect(await response?.text()).toMatch(/<style[^>]*data-vite-dev-id="[^"]*\/src\/styles\.css"/)
		expect(session.logs().filter((line) => line.includes("no dev styles"))).toEqual([])
	} finally {
		await session.close()
	}
})
