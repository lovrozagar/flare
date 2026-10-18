import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type AppResult, type Harness } from "./hydrate.harness.ts"
import type { AppCase } from "./hydrate.app.ts"

// Back and Forward onto an entry the server answered 404, through the real createServer and createClient (B96):
// the not-found page renders again, never a blank page (plan 21 13.10, BUGS.md 212). Back onto a page the client
// cache holds paints it at once (plan 21 16.9, B137).

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

const APP = appFrom(`
const link = (to, id) => api.solid.createComponent(api.link.Link, { to, id, children: id })
const root = api.rootLayout.createRootLayout("_root_")
	.render((props) => api.h("html", "doc", () => [
		api.h("head", "head"),
		api.h("body", "body", () => [link("_root_/a", "to-a"), link("_root_/gone", "to-gone"), api.h("main", "slot", () => props.children)]),
	]))
	.notFoundRender(() => api.h("p", "missing", () => "no such page"))
const a = api.page.createPage("_root_/a").render(() => api.h("h1", "heading-a", () => "page a"))
const gone = api.page.createPage("_root_/gone").loader(() => api.errors.notFound()).render(() => "gone")
const routeTree = [
	{ id: "_root_/a", path: "/a", module: a },
	{ id: "_root_/gone", path: "/gone", module: gone },
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree }) }
`)

// What the page shows once the URL is `path`. A step may load a document, which starts a new record, so each reading
// is kept here and the record is written once at the end.
async function shows(tab: Page, path: string): Promise<string> {
	await tab.waitForFunction((at) => location.pathname === at, path)
	await tab.waitForFunction(() => document.documentElement.hasAttribute("data-flare-hydrated"))
	await new Promise((resolve) => setTimeout(resolve, 300))
	return tab.evaluate(() => document.getElementById("slot")?.textContent ?? "")
}

// Back onto an entry no route matches loads it as a document (navigation/target.ts), which the server answers 404; the
// server here takes half a second to, as a slow one does, so a reading of the old page cannot pass for it.
async function away(tab: Page, back: string, loads: boolean): Promise<void> {
	const seen: string[] = []
	if (loads) {
		await tab.route(
			(url) => url.pathname === back,
			async (route) => {
				await new Promise((resolve) => setTimeout(resolve, 500))
				await route.continue()
			},
		)
	}
	await tab.evaluate(() => document.getElementById("to-a")?.click())
	seen.push(await shows(tab, "/a"))
	seen.push(await backTo(tab, back, loads))
	await tab.goForward()
	seen.push(await shows(tab, "/a"))
	seen.push(await backTo(tab, back, loads))
	await tab.evaluate((all) => (Reflect.get(window, "__flareRecord") as unknown[]).push(...all), seen)
}

// Back, then what the entry shows. Back finishes on the history step; the document an unmatched entry loads comes
// after it, so the reading waits for that document's load event, armed before the step (BUGS.md 376).
async function backTo(tab: Page, path: string, loads: boolean): Promise<string> {
	const loaded = loads ? tab.waitForEvent("load") : undefined
	await tab.goBack()
	await loaded
	return shows(tab, path)
}

// A page whose loader counts the server's runs, at the router's default staleTime, 0: every entry is stale.
const COUNTED = appFrom(`
let runs = 0
const link = (to, id) => api.solid.createComponent(api.link.Link, { to, id, children: id })
const root = api.rootLayout.createRootLayout("_root_")
	.render((props) => api.h("html", "doc", () => [
		api.h("head", "head"),
		api.h("body", "body", () => [link("_root_/a", "to-a"), link("_root_/b", "to-b"), api.h("main", "slot", () => props.children)]),
	]))
const a = api.page.createPage("_root_/a").render(() => "page a")
const b = api.page.createPage("_root_/b")
	.loader(() => ({ run: (runs += 1) }))
	.render((props) => api.h("span", "b", () => "page b " + props.loaderData.run))
const routeTree = [
	{ id: "_root_/a", path: "/a", module: a },
	{ id: "_root_/b", path: "/b", module: b },
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree }) }
`)

// To /b and back to /a, then Back to /b with every data answer held a second: 200 ms in, the page shows /b as the
// cache holds it, and the one revalidation then shows the loader's next run.
async function heldBack(tab: Page): Promise<void> {
	const seen: string[] = []
	await tab.evaluate(() => document.getElementById("to-b")?.click())
	seen.push(await shows(tab, "/b"))
	await tab.evaluate(() => document.getElementById("to-a")?.click())
	seen.push(await shows(tab, "/a"))
	await tab.route(/_flare=data/, async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 1000))
		await route.continue()
	})
	await tab.goBack()
	await tab.waitForFunction(() => location.pathname === "/b")
	await new Promise((resolve) => setTimeout(resolve, 200))
	seen.push(await tab.evaluate(() => document.getElementById("slot")?.textContent ?? ""))
	await tab.waitForFunction(() => document.getElementById("slot")?.textContent === "page b 2")
	seen.push(await tab.evaluate(() => document.getElementById("slot")?.textContent ?? ""))
	await tab.evaluate((all) => (Reflect.get(window, "__flareRecord") as unknown[]).push(...all), seen)
}

// A click to another page: what holds focus once it is on screen, and what the live region says.
async function arrival(tab: Page): Promise<void> {
	await tab.evaluate(() => document.getElementById("to-a")?.click())
	await tab.waitForFunction(() => location.pathname === "/a" && document.getElementById("heading-a") !== null)
	const seen = await tab.evaluate(() => [
		document.activeElement?.id ?? "",
		document.getElementById("flare-announcer")?.textContent ?? "",
		document.getElementById("flare-announcer")?.getAttribute("aria-live") ?? "",
	])
	await tab.evaluate((all) => (Reflect.get(window, "__flareRecord") as unknown[]).push(...all), seen)
}

// A page with a Link to its own `#one`; the steps add the tall sections the hashes name.
const TALL = appFrom(`
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [api.solid.createComponent(api.link.Link, { to: "_root_/t", hash: "one", id: "to-one", children: "one" }), props.children]),
]))
const t = api.page.createPage("_root_/t").render(() => "page t")
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/t", path: "/t", module: t }] }) }
`)

// Flare's hash move to #one, then a hash the visitor types, an entry the browser writes, then Back: where the page is
// at #one, after typing, and after Back.
async function typedHash(tab: Page): Promise<void> {
	await tab.waitForFunction(() => document.documentElement.hasAttribute("data-flare-hydrated"))
	await tab.evaluate(() => {
		for (const id of ["one", "typed", "end"]) {
			const section = document.createElement("div")
			section.id = id
			section.style.cssText = "margin-top: 3000px; height: 10px"
			document.body.append(section)
		}
	})
	await tab.evaluate(() => document.getElementById("to-one")?.click())
	await tab.waitForFunction(() => location.hash === "#one" && scrollY > 1000)
	// A visitor reads a while: frames run, and their scroll events with them.
	await new Promise((resolve) => setTimeout(resolve, 300))
	const one = await tab.evaluate(() => scrollY)
	await tab.evaluate(() => (location.hash = "typed"))
	await tab.waitForFunction((from) => scrollY > from + 1000, one)
	await tab.evaluate(() => history.back())
	await tab.waitForFunction(() => location.hash === "#one")
	await new Promise((resolve) => setTimeout(resolve, 500))
	const back = await tab.evaluate(() => scrollY)
	await tab.evaluate((seen) => (Reflect.get(window, "__flareRecord") as unknown[]).push(seen), back === one)
}

function run(engine: (typeof ENGINES)[number], path: string, loads: boolean): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	const visit: Pick<AppCase, "path" | "steps"> = { path, steps: (tab) => away(tab, path, loads) }
	return harness.app(engine, { app: APP, ...visit, client() {} })
}

describe.each(ENGINES)("%s", (engine) => {
	// A document no route matched, then away and back.
	it("unmatched entry", async () => {
		const result = await run(engine, "/missing", true)
		expect(result.record).toEqual(["page a", "no such page", "page a", "no such page"])
	})

	// A page whose loader threw notFound(), then away and back.
	it("not found entry", async () => {
		const result = await run(engine, "/gone", false)
		expect(result.record).toEqual(["page a", "no such page", "page a", "no such page"])
	})

	// A client navigation to another page moves focus to its heading and announces it politely (plan 21 4.1, B141).
	it("arrival focus", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: APP, path: "/gone", steps: arrival, client() {} })
		expect(result.record).toEqual(["heading-a", "page a", "polite"])
	})

	// Back from a hash the visitor typed restores where the page was at the entry before it (BUGS.md 318).
	it("back from a typed hash", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: TALL, path: "/t", steps: typedHash, client() {} })
		expect([result.problems, result.record]).toEqual([[], [true]])
	})

	// Back paints the held page before any request lands, then revalidates it once (plan 21 16.9).
	it("back paints held", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: COUNTED, path: "/a", steps: heldBack, client() {} })
		expect(result.record).toEqual(["page b 1", "page a", "page b 1", "page b 2"])
		expect(result.requests.filter((url) => url.startsWith("/b?"))).toHaveLength(2)
	})
})
