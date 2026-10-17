import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type AppResult, type Harness } from "./hydrate.harness.ts"
import type { AppCase } from "./hydrate.app.ts"

// What a page shows of the URL once it hydrates, through the real createServer and createClient (B96). The server
// never sees the hash, and a stored render never sees the visitor's search, so the client hydrates on the location
// the server rendered and then shows its own: a binding that reads either is corrected after hydrate (plan 21 13.8,
// 13.9, BUGS.md 211).

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

// A section link active on any path under it, as a header's, and an exact link to the page, as a sidebar's.
const APP = appFrom(`
const section = () => api.solid.createComponent(api.link.Link, { to: "_root_/a", id: "section", isActive: (location) => location.pathname.startsWith("/a"), children: "section" })
const exact = () => api.solid.createComponent(api.link.Link, { to: "_root_/a", id: "exact", children: "exact" })
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [section(), exact(), api.h("main", "slot", () => props.children)]),
]))
const page = api.page.createPage("_root_/a").cache({ isr: true }).render(() => {
	const location = api.outletNodes.useLocation()
	return api.h("p", "hash", () => location.hash)
})
return {
	router: api.router.createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/a", path: "/a", module: page }] }),
	server: { store: api.memory.createMemoryStore() },
}
`)

// The links marked current and the hash the page shows, once the client settled.
async function shown(tab: Page): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 100))
	await tab.evaluate(() => {
		const current = [...document.querySelectorAll('[aria-current="page"]')].map((node) => node.id)
		const hash = document.getElementById("hash")?.textContent
		;(Reflect.get(window, "__flareRecord") as unknown[]).push({ current, hash })
	})
}

function run(engine: (typeof ENGINES)[number], visit: Pick<AppCase, "path" | "prime">): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	return harness.app(engine, { app: APP, ...visit, client() {}, steps: shown })
}

describe.each(ENGINES)("%s", (engine) => {
	// A stored page, rendered for its path alone, opened with a query it does not read: the exact link is not current
	// for that URL, so only the section link is marked (plan 21 13.8).
	it("stored page with a query", async () => {
		const result = await run(engine, { path: "/a?utm=mail", prime: [{ path: "/a" }] })
		expect(result.record).toEqual([{ current: ["section"], hash: "" }])
	})

	// A deep link with a hash: the page reads it after hydrate (plan 21 13.9).
	it("deep link hash", async () => {
		const result = await run(engine, { path: "/a#top" })
		expect(result.record).toEqual([{ current: ["section", "exact"], hash: "#top" }])
	})
})
