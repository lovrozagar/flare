import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type AppResult, type Harness } from "./hydrate.harness.ts"
import type { AppCase } from "./hydrate.app.ts"

// Back and Forward onto an entry the server answered 404, through the real createServer and createClient (B96):
// the not-found page renders again, never a blank page (plan 21 13.10, BUGS.md 212).

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
const a = api.page.createPage("_root_/a").render(() => "page a")
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

async function away(tab: Page, back: string): Promise<void> {
	const seen: string[] = []
	await tab.evaluate(() => document.getElementById("to-a")?.click())
	seen.push(await shows(tab, "/a"))
	await tab.goBack()
	seen.push(await shows(tab, back))
	await tab.goForward()
	seen.push(await shows(tab, "/a"))
	await tab.goBack()
	seen.push(await shows(tab, back))
	await tab.evaluate((all) => (Reflect.get(window, "__flareRecord") as unknown[]).push(...all), seen)
}

function run(engine: (typeof ENGINES)[number], path: string): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	const visit: Pick<AppCase, "path" | "steps"> = { path, steps: (tab) => away(tab, path) }
	return harness.app(engine, { app: APP, ...visit, client() {} })
}

describe.each(ENGINES)("%s", (engine) => {
	// A document no route matched, then away and back.
	it("unmatched entry", async () => {
		const result = await run(engine, "/missing")
		expect(result.record).toEqual(["page a", "no such page", "page a", "no such page"])
	})

	// A page whose loader threw notFound(), then away and back.
	it("not found entry", async () => {
		const result = await run(engine, "/gone")
		expect(result.record).toEqual(["page a", "no such page", "page a", "no such page"])
	})
})
