import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type Harness } from "./hydrate.harness.ts"

// An open overlay through the real createServer and createClient (B96): a navigation inside it with `replace` replaces
// the overlay entry, so one Back closes it, however many searches it held (plan 21 13.12, BUGS.md 214).

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

const APP = appFrom(`
const anchor = (to) => api.solid.createComponent(api.web.Dynamic, { component: "a", href: to, id: "to-" + to.slice(1), children: to })
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [
		api.h("main", "slot", () => props.children),
		api.solid.createComponent(api.intercept.InterceptOutlet, {
			children: (state) => api.h("aside", "overlay", () => state.match.render()),
		}),
	]),
]))
const gallery = api.page.createPage("_root_/gallery").render(() => api.h("section", "gallery", () => ["gallery ", anchor("/photo")]))
const photo = api.page.createPage("_root_/photo")
	.intercept({ from: ["_root_/gallery"], render: "modal" })
	.input({ searchParams: (raw) => ({ n: typeof raw.n === "string" ? raw.n : "1" }) })
	.render((props) => {
		const navigate = api.outletNodes.useNavigate()
		const next = () => navigate({ to: "_root_/photo", search: { n: String(Number(props.search.n) + 1) }, replace: true })
		return api.h("p", "photo", () => ["photo ", props.search.n, " ", api.solid.createComponent(api.web.Dynamic, { component: "button", id: "next", onClick: next, children: "next" })])
	})
const routeTree = [
	{ id: "_root_/gallery", path: "/gallery", module: gallery },
	{ id: "_root_/photo", path: "/photo", module: photo },
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree }) }
`)

async function overlayShows(tab: Page, text: string): Promise<void> {
	await tab.waitForFunction((want) => document.getElementById("overlay")?.textContent?.includes(want) === true, text)
}

// Open, search twice inside, then one Back.
async function steps(tab: Page): Promise<void> {
	await tab.evaluate(() => document.getElementById("to-photo")?.click())
	await overlayShows(tab, "photo 1")
	await tab.evaluate(() => document.getElementById("next")?.click())
	await overlayShows(tab, "photo 2")
	await tab.evaluate(() => document.getElementById("next")?.click())
	await overlayShows(tab, "photo 3")
	await tab.goBack()
	await new Promise((resolve) => setTimeout(resolve, 300))
	await tab.evaluate(() => {
		const shown = { path: location.pathname + location.search, overlay: document.getElementById("overlay") !== null }
		;(Reflect.get(window, "__flareRecord") as unknown[]).push(shown)
	})
}

describe.each(ENGINES)("%s", (engine) => {
	it("replace inside an overlay", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: APP, path: "/gallery", client() {}, steps })
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([{ path: "/gallery", overlay: false }])
	})
})
