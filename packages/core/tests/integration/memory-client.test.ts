import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { startHarness, type Harness } from "./hydrate.harness.ts"

// A long session through the real createServer and createClient (B96): a page left behind is collected, so the image
// elements alive after many client navigations are the ones on screen, not one more set per page left (plan 21 12.6,
// BUGS.md 246). Chromium alone lets a test force a collection and count live objects, through CDP.

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

// Two pages of four lazy images each, and links between them.
const GALLERY = appFrom(`
const link = (to, id) => api.solid.createComponent(api.link.Link, { to, id, children: id })
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [link("_root_/a", "to-a"), link("_root_/b", "to-b"), api.h("main", "slot", () => props.children)]),
]))
const binding = (name, n) => ({ src: PIXEL + "#" + name + n, width: 1200, height: 675, variants: [{ width: 640, src: PIXEL + "#640" + name + n }, { width: 1200, src: PIXEL + "#1200" + name + n }] })
const images = (name) => [1, 2, 3, 4].map((n) =>
	api.solid.createComponent(api.image.Image, { src: binding(name, n), alt: name + n, width: 640, height: 360, fixed: true, priority: n === 1 }))
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
const head = (name) => () => ({ title: "page " + name, meta: [{ name: "description", content: "about " + name }] })
const a = api.page.createPage("_root_/a").head(head("a")).render(() => api.h("section", "page-a", () => images("a")))
const b = api.page.createPage("_root_/b").head(head("b")).render(() => api.h("section", "page-b", () => images("b")))
const routeTree = [
	{ id: "_root_/a", path: "/a", module: a },
	{ id: "_root_/b", path: "/b", module: b },
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree }) }
`)

// Every HTMLImageElement the page's heap holds after a forced collection, on screen or detached.
async function live(tab: Page, kind = "HTMLImageElement"): Promise<number> {
	const cdp = await tab.context().newCDPSession(tab)
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

// Forty steps between the two pages: the live elements after the second and the last, then the live images.
async function steps(tab: Page): Promise<void> {
	const counts: number[] = []
	for (let step = 0; step < 40; step += 1) {
		const to = step % 2 === 0 ? "b" : "a"
		await tab.evaluate((id) => document.getElementById(id)?.click(), `to-${to}`)
		await tab.waitForFunction((id) => document.getElementById(id) !== null, `page-${to}`)
		if (step === 1 || step === 39) counts.push(await live(tab, "HTMLElement"))
	}
	await new Promise((resolve) => setTimeout(resolve, 200))
	counts.push(await live(tab))
	await tab.evaluate((all) => (Reflect.get(window, "__flareRecord") as unknown[]).push(...all), counts)
}

it("left pages are collected", async () => {
	if (harness === undefined) throw new Error("the harness did not start")
	const result = await harness.app("chromium", { app: GALLERY, path: "/a", steps, client() {} })
	expect(result.problems.filter((problem) => !problem.includes("404"))).toEqual([])
	// A page left behind and kept would add its elements on each of the 38 steps between the two counts, and its images.
	const [early, late, images] = result.record.map(Number)
	expect(Number(late) - Number(early)).toBeLessThanOrEqual(10)
	expect(images).toBeLessThanOrEqual(8)
})

// The listeners on the window and the document, which a navigation that adds one and never removes it would grow.
async function listeners(tab: Page): Promise<number> {
	const cdp = await tab.context().newCDPSession(tab)
	let total = 0
	for (const expression of ["window", "document"]) {
		const target = await cdp.send("Runtime.evaluate", { expression })
		const found = await cdp.send("DOMDebugger.getEventListeners", { objectId: target.result.objectId ?? "" })
		total += found.listeners.length
	}
	await cdp.detach()
	return total
}

// Two hundred steps between the two pages: the `<head>`'s elements, the live elements, and the window's and the
// document's listeners at the tenth step and the last.
async function longRun(tab: Page): Promise<void> {
	const at: Array<{ head: number; elements: number; listeners: number }> = []
	for (let step = 1; step <= 200; step += 1) {
		const to = step % 2 === 0 ? "a" : "b"
		await tab.evaluate((id) => document.getElementById(id)?.click(), `to-${to}`)
		await tab.waitForFunction((id) => document.getElementById(id) !== null, `page-${to}`)
		if (step === 10 || step === 200) {
			const head = await tab.evaluate(() => document.head.childElementCount)
			at.push({ head, elements: await live(tab, "HTMLElement"), listeners: await listeners(tab) })
		}
	}
	await tab.evaluate((all) => (Reflect.get(window, "__flareRecord") as unknown[]).push(...all), at)
}

// A session of 200 client navigations ends with the `<head>`, the live elements, and the window's and the document's
// listeners where the tenth step left them (plan 21 5.2).
it("two hundred navigations", async () => {
	if (harness === undefined) throw new Error("the harness did not start")
	const result = await harness.app("chromium", { app: GALLERY, path: "/a", steps: longRun, client() {} })
	expect(result.problems.filter((problem) => !problem.includes("404"))).toEqual([])
	const [early, late] = result.record as Array<{ head: number; elements: number; listeners: number }>
	expect(late?.head).toBe(early?.head)
	expect(late?.listeners).toBe(early?.listeners)
	expect(Number(late?.elements) - Number(early?.elements)).toBeLessThanOrEqual(10)
}, 120_000)
