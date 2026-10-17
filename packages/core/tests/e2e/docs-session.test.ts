import type { Page } from "@playwright/test"
import { expect, isProd, open, serverOf, test } from "./docs.fixture.ts"

// Long and broken sessions. A long session holds no page it left (plan 21 12.6, BUGS.md 246): sixty client navigations
// between home, whose hero is a fill `<Image>` with a blur placeholder, and a guide page with a fixed one leave as many
// elements and images alive, after a forced collection, as the tenth did. Chromium alone lets a test force a collection
// and count live objects, through CDP, so the probe runs once, on the production build. It fails today, the open
// BUGS.md 246: each page left keeps its `<img>` and about 46 elements, which Chromium's document MediaQueryMatcher holds
// through the image's ViewportChangeListener; `test.fail` keeps the reproduction here, and the day it passes the
// marker goes.

// The live instances of a DOM class after a forced collection, on screen or detached.
async function live(page: Page, kind: string): Promise<number> {
	const cdp = await page.context().newCDPSession(page)
	await cdp.send("HeapProfiler.enable")
	await cdp.send("HeapProfiler.collectGarbage")
	const prototype = await cdp.send("Runtime.evaluate", { expression: `${kind}.prototype` })
	const found = await cdp.send("Runtime.queryObjects", { prototypeObjectId: prototype.result.objectId ?? "" })
	const length = await cdp.send("Runtime.callFunctionOn", {
		objectId: found.objects.objectId ?? "",
		functionDeclaration: "function () { return this.length }",
		returnByValue: true,
	})
	await cdp.detach()
	return Number(length.result.value)
}

test("long session", async ({ page, docs, browserName }, info) => {
	test.skip(browserName !== "chromium" || serverOf(info) !== "node-prod", "a CDP heap count, once")
	test.fail(true, "BUGS.md 246: Chromium keeps each left page's images and their pages")
	test.setTimeout(120_000)
	await open(page, docs.origin, "/")
	const counts: { elements: number; images: number }[] = []
	for (let step = 1; step <= 60; step += 1) {
		const home = step % 2 === 0
		await page.evaluate(
			(to) => {
				const link = document.querySelector<HTMLAnchorElement>(`a[href="${to}"]`)
				link?.click()
			},
			home ? "/" : "/docs/routing",
		)
		await expect(page).toHaveURL(`${docs.origin}${home ? "/" : "/docs/routing"}`)
		await expect(page.locator(home ? "section.grid a" : "#doc-title").first()).toBeVisible()
		if (step === 10 || step === 60) {
			counts.push({ elements: await live(page, "HTMLElement"), images: await live(page, "HTMLImageElement") })
		}
	}
	const [early, late] = counts
	expect(late?.images).toBeLessThanOrEqual((early?.images ?? 0) + 2)
	expect(late?.elements).toBeLessThanOrEqual((early?.elements ?? 0) + 40)
})

// A server function that answers 500 on the playground, then Back and on: every later page renders its data, its
// feedback tally's suspense query included, never only its static shell (plan 21 12.3, BUGS.md 247).
test("after a failed call", async ({ page, docs }, info) => {
	// In dev the 500 opens Vite's overlay over the page, by design (dx/plugin.md), and it takes the next click.
	test.skip(!isProd(info), "the production page")
	await open(page, docs.origin, "/docs/routing")
	await expect(page.locator("#votes-up")).toBeVisible()
	await page.locator('#nav a[href="/playground"]').click()
	await page.locator("#fail-loud").click()
	await expect(page.locator("#echo-error")).not.toHaveText("")
	await page.goBack()
	await expect(page.locator("#doc-title")).toHaveText("Routing")
	await expect(page.locator("#votes-up")).toBeVisible()
	await page.locator('#sidebar a[href="/docs/caching"]').click()
	await expect(page.locator("#doc-title")).toHaveText("Caching")
	await expect(page.locator("#votes-up")).toBeVisible()
	await page.locator('#nav a[href="/api/server/create-server"]').click()
	await expect(page.locator("#api-name")).toBeVisible()
})
